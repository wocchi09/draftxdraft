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
 * @property {string[]} battingOrderDraft - プレイ中に指名のたびに組み上がっていく打順（完成時にbattingOrderへ確定）
 * @property {string[]} drawnComboKeys - このゲームで一度でも抽選に出た「年度×球団」の組み合わせ（重複抽選を避けるため）
 * @property {number|null} completedAt
 */

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
    battingOrderDraft: [],
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
