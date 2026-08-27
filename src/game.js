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
import { comboKey } from "./state.js";
import { insertAt } from "./battingOrder.js";

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
  const excludeComboKeys = new Set(state.drawnComboKeys || []);

  for (let attempt = 0; attempt < MAX_AUTO_REDRAW; attempt++) {
    const combo = drawDraftCombo(mode, { state, excludeComboKeys });
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
      const drawnKeys = state.drawnComboKeys || [];
      if (!drawnKeys.includes(key)) {
        state.drawnComboKeys = [...drawnKeys, key];
      }
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

/**
 * 選手をロスターの指定枠へ登録する。成功したら次のラウンドへ進める。
 * 野手（DH含む）を配置する場合、`battingOrderIndex`（0始まり）で
 * その場で打順の挿入位置を指定できる。省略時は末尾に追加する。
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

  state.roster = placePlayer(state.roster, slotId, playerId);
  state.pickedPlayerIds = [...state.pickedPlayerIds, playerId];

  const slotDef = getSlotDef(slotId);
  if (slotDef && slotDef.category === "fielder") {
    const draft = state.battingOrderDraft || [];
    const index = typeof battingOrderIndex === "number" ? battingOrderIndex : draft.length;
    state.battingOrderDraft = insertAt(draft, index, playerId);
  }

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
    // 指名のたびに組み上げた打順を採用する。9人分揃っていない場合
    // （古い保存データを再開した場合など）は既定の並びへフォールバックする。
    state.battingOrder =
      state.battingOrderDraft && state.battingOrderDraft.length === 9
        ? state.battingOrderDraft
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
