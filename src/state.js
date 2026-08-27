import { createEmptyRoster } from "./roster.js";
import { getMode, DEFAULT_MODE_ID } from "./modes.js";

/**
 * ゲーム状態のファクトリ。UIやロジックはこのシェイプに従う。
 *
 * @typedef GameState
 * @property {string} status - 'idle' | 'playing' | 'complete'
 * @property {string} modeId
 * @property {object} roster - slotId -> playerId | null
 * @property {string[]} pickedPlayerIds - 重複禁止のためのグローバル選手ID一覧
 * @property {number} skipsUsed
 * @property {number} round - 現在の巡目（1始まり）
 * @property {{year:number, teamId:string}|null} currentDraft
 * @property {object[]} currentCandidates - 現在提示中の候補選手（配置可否計算済み）
 * @property {object[]} history
 * @property {string[]|null} battingOrder - 野手9人のplayerId配列（打順1〜9番、完成後に確定）
 * @property {(string|null)[]} battingOrderDraft - 打順1〜9番の枠（長さ9固定、未定は null）。
 *   指名のたびに空いている番号へ選手を入れていき、完成時に battingOrder へ確定する。
 * @property {string[]} drawnComboKeys - このゲームで一度でも抽選に出た「年度×球団」の組み合わせ（重複抽選を避けるため）
 * @property {number|null} completedAt
 */

/** 打順の枠数（野手9人） */
export const BATTING_ORDER_SIZE = 9;

/**
 * 打順ドラフトを長さ9の配列に正規化する。
 * 旧仕様（可変長の配列）で保存されたゲームを再開しても壊れないよう、
 * 既存の並びは前から順に維持したまま9枠へ詰め直す。
 */
export function normalizeBattingOrderDraft(draft) {
  const slots = new Array(BATTING_ORDER_SIZE).fill(null);
  if (!Array.isArray(draft)) return slots;
  for (let i = 0; i < Math.min(draft.length, BATTING_ORDER_SIZE); i++) {
    slots[i] = draft[i] || null;
  }
  return slots;
}

export function createInitialState(modeId = DEFAULT_MODE_ID) {
  return {
    status: "playing",
    modeId,
    roster: createEmptyRoster(),
    pickedPlayerIds: [],
    skipsUsed: 0,
    round: 1,
    currentDraft: null,
    currentCandidates: [],
    history: [],
    battingOrder: null,
    battingOrderDraft: normalizeBattingOrderDraft(null),
    drawnComboKeys: [],
    completedAt: null,
    createdAt: Date.now(),
  };
}

export function comboKey(year, teamId) {
  return `${year}-${teamId}`;
}

export function getSkipsRemaining(state) {
  const mode = getMode(state.modeId);
  return Math.max(0, mode.skipLimit - state.skipsUsed);
}

export function getFilledCount(state) {
  return Object.values(state.roster).filter((v) => v !== null).length;
}
