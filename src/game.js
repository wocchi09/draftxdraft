import { getMode } from "./modes.js";
import { drawDraftCombo, getCandidates } from "./draft.js";
import {
  ROSTER_SLOTS,
  getSlotDef,
  placePlayer,
  isRosterComplete,
  getOpenEligibleSlotIds,
  anyPlaceablePlayer,
} from "./roster.js";
import { createHistoryEntry } from "./history.js";
import { comboKey, BATTING_ORDER_SIZE, normalizeBattingOrderDraft } from "./state.js";
import { normalizeYearRange } from "./yearRange.js";

const MAX_AUTO_REDRAW = 40;

export class GameError extends Error {}

/**
 * 現在のロスター状態に対して、配置可能な候補が出るまで
 * 年度×球団の抽選をやり直す（スキップ回数は消費しない）。
 * 一定回数試しても見つからない場合は `ok:false` を返し、
 * UI側で「再抽選する」ボタン等の手動導線を出す。
 */
export function drawForState(state) {
  const mode = getMode(state.modeId);
  const excludeIds = new Set(state.pickedPlayerIds);
  // drawnComboKeys は「今の巡で既に出た組み合わせ」。プールを一周したら
  // 下で作り直すので、ゲーム全体の履歴ではない点に注意。
  const drawnKeys = state.drawnComboKeys || [];
  const excludeComboKeys = new Set(drawnKeys);
  const avoidComboKey = drawnKeys.length > 0 ? drawnKeys[drawnKeys.length - 1] : null;
  // 範囲は保存データから復元されることもあるので、毎回整えてから使う
  const yearRange = normalizeYearRange(state.yearRange);

  for (let attempt = 0; attempt < MAX_AUTO_REDRAW; attempt++) {
    const combo = drawDraftCombo(mode, { state, excludeComboKeys, avoidComboKey, yearRange });
    if (!combo) {
      return { ok: false, reason: "pool_empty" };
    }
    let candidates = getCandidates(combo.year, combo.teamId, excludeIds);
    candidates = mode.filterCandidates(candidates, { state });

    if (candidates.length > 0 && anyPlaceablePlayer(candidates, state.roster)) {
      state.currentDraft = combo;
      state.currentCandidates = candidates;
      state.lastAutoRedraws = attempt;
      const key = comboKey(combo.year, combo.teamId);
      // 既に出ている＝プールを一周したということ。この1件を先頭にして次の巡を始める。
      state.drawnComboKeys = drawnKeys.includes(key) ? [key] : [...drawnKeys, key];
      return { ok: true, autoRedraws: attempt };
    }
  }

  state.currentDraft = null;
  state.currentCandidates = [];
  return { ok: false, reason: "no_placeable_after_retry" };
}

export function getEligibleOpenSlotsForCandidate(state, playerId) {
  const player = state.currentCandidates.find((p) => p.id === playerId);
  if (!player) return [];
  return getOpenEligibleSlotIds(player, state.roster);
}

/** 打順ドラフトのうち、まだ誰も入っていない番号（0始まりのindex）を返す */
export function getOpenBattingOrderIndexes(state) {
  const draft = normalizeBattingOrderDraft(state.battingOrderDraft);
  const open = [];
  for (let i = 0; i < BATTING_ORDER_SIZE; i++) {
    if (draft[i] === null) open.push(i);
  }
  return open;
}

/**
 * 選手をロスターの指定枠へ登録する。成功したら次のラウンドへ進める。
 * 野手（DH含む）を配置する場合、`battingOrderIndex`（0始まり）で
 * 1〜9番のうち空いている好きな打順を指定できる。省略時は空いている最も若い番号に入る。
 */
export function pickPlayer(state, playerId, slotId, battingOrderIndex) {
  const player = state.currentCandidates.find((p) => p.id === playerId);
  if (!player) {
    throw new GameError("候補に存在しない選手です");
  }
  if (state.pickedPlayerIds.includes(playerId)) {
    throw new GameError("既に指名済みの選手です");
  }
  const openSlots = getOpenEligibleSlotIds(player, state.roster);
  if (!openSlots.includes(slotId)) {
    throw new GameError("その選手はこの枠には配置できません");
  }

  // 打順は野手枠のときだけ使う。stateを書き換える前に妥当性を検証し、
  // 途中で例外を投げてロスターだけ埋まった中途半端な状態にならないようにする。
  const slotDef = getSlotDef(slotId);
  const isFielder = Boolean(slotDef && slotDef.category === "fielder");
  let nextBattingOrderDraft = null;
  if (isFielder) {
    const draft = normalizeBattingOrderDraft(state.battingOrderDraft);
    const index =
      typeof battingOrderIndex === "number" ? battingOrderIndex : draft.findIndex((v) => v === null);
    if (!Number.isInteger(index) || index < 0 || index >= BATTING_ORDER_SIZE) {
      throw new GameError("その打順は選べません");
    }
    if (draft[index] !== null) {
      throw new GameError("その打順は既に埋まっています");
    }
    draft[index] = playerId;
    nextBattingOrderDraft = draft;
  }

  state.roster = placePlayer(state.roster, slotId, playerId);
  state.pickedPlayerIds = [...state.pickedPlayerIds, playerId];
  if (nextBattingOrderDraft) state.battingOrderDraft = nextBattingOrderDraft;

  state.history = [
    ...state.history,
    createHistoryEntry({
      round: state.round,
      year: state.currentDraft.year,
      teamId: state.currentDraft.teamId,
      action: "PICK",
      playerId,
      slotId,
    }),
  ];
  state.round += 1;
  state.currentDraft = null;
  state.currentCandidates = [];

  if (isRosterComplete(state.roster)) {
    state.status = "complete";
    state.completedAt = Date.now();
    // 指名のたびに選んでもらった打順を採用する。9枠すべて埋まっていない場合
    // （古い保存データを再開した場合など）は既定の並びへフォールバックする。
    const draft = normalizeBattingOrderDraft(state.battingOrderDraft);
    state.battingOrder = draft.every((id) => id !== null)
      ? draft
      : computeDefaultBattingOrder(state.roster);
  }

  return state;
}

export function skip(state) {
  const mode = getMode(state.modeId);
  const remaining = mode.skipLimit - state.skipsUsed;
  if (remaining <= 0) {
    throw new GameError("これ以上スキップできません");
  }
  if (!state.currentDraft) {
    throw new GameError("スキップ対象の抽選がありません");
  }

  state.skipsUsed += 1;
  state.history = [
    ...state.history,
    createHistoryEntry({
      round: state.round,
      year: state.currentDraft.year,
      teamId: state.currentDraft.teamId,
      action: "SKIP",
    }),
  ];
  state.round += 1;
  state.currentDraft = null;
  state.currentCandidates = [];
  return state;
}

/** 野手9枠の既定の打順（打順は後から自由に並び替え可能） */
function computeDefaultBattingOrder(roster) {
  const fielderSlotIds = ROSTER_SLOTS.filter((s) => s.category === "fielder").map((s) => s.id);
  return fielderSlotIds.map((slotId) => roster[slotId]).filter((id) => id !== null);
}

export function isGameComplete(state) {
  return state.status === "complete";
}
