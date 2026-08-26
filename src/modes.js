/**
 * ゲームモード定義。
 *
 * 各モードは { id, label, description, skipLimit, filterPool, filterCandidates } を持つ。
 * - filterPool(pool, ctx): 年度×球団の抽選プールを絞り込む（将来の「パ・リーグ限定」等はここを拡張）
 * - filterCandidates(players, ctx): 候補選手そのものを絞り込む（将来の「高卒限定」等はここを拡張）
 *
 * 新しいモードを追加する場合は、このオブジェクトにエントリを増やすだけでよく、
 * ゲームロジック本体（draft.js / game.js）を変更する必要はない。
 */

function identityPool(pool) {
  return pool;
}

function identityCandidates(players) {
  return players;
}

export const MODES = {
  NORMAL: {
    id: "NORMAL",
    label: "NORMAL",
    description: "スキップ3回まで。標準ルール。",
    skipLimit: 3,
    filterPool: identityPool,
    filterCandidates: identityCandidates,
  },
  NO_SKIP: {
    id: "NO_SKIP",
    label: "NO SKIP",
    description: "スキップ禁止。引いたら必ず指名。",
    skipLimit: 0,
    filterPool: identityPool,
    filterCandidates: identityCandidates,
  },
  HARD: {
    id: "HARD",
    label: "HARD",
    description: "スキップ1回のみ。",
    skipLimit: 1,
    filterPool: identityPool,
    filterCandidates: identityCandidates,
  },
};

export const DEFAULT_MODE_ID = "NORMAL";

export function getMode(modeId) {
  return MODES[modeId] || MODES[DEFAULT_MODE_ID];
}

export function getAllModes() {
  return Object.values(MODES);
}
