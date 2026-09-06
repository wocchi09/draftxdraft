/**
 * 抽選する球団の絞り込み。
 *
 * 年度の絞り込み（yearRange.js）と同じく、年度×球団の抽選プールを
 * 減らすだけの仕組み。抽選そのもの（シャッフルバッグ）には手を入れない。
 */
import { getAvailableTeamIds, buildDraftPool } from "./draft.js";
import { getAllTeams } from "./teams.js";
import { filterPoolByYearRange } from "./yearRange.js";

/** データに存在する球団を、teams.json の並び順で返す */
export function getSelectableTeams() {
  const available = new Set(getAvailableTeamIds());
  return getAllTeams().filter((t) => available.has(t.id));
}

export function allTeamIds() {
  return getSelectableTeams().map((t) => t.id);
}

/**
 * 選択状態を正しい形に整える。
 * 壊れた保存データや、収録球団が変わって存在しないIDが残っていても
 * ゲームが止まらないよう、空になったら「全球団」に倒す。
 */
export function normalizeTeamIds(ids) {
  const all = allTeamIds();
  if (!Array.isArray(ids)) return all;
  const valid = all.filter((id) => ids.includes(id));
  return valid.length > 0 ? valid : all;
}

export function isAllTeams(ids) {
  return normalizeTeamIds(ids).length === allTeamIds().length;
}

/** 選ばれた球団の年度×球団だけを残す */
export function filterPoolByTeams(pool, ids) {
  if (!ids) return pool;
  const set = new Set(normalizeTeamIds(ids));
  return pool.filter((c) => set.has(c.teamId));
}

/**
 * 年度と球団の両方で絞ったときの目安（何通り・何人から選ぶことになるか）。
 * TOP画面の注意書きとSTARTの可否判定に使う。
 */
export function summarizePool(range, teamIds) {
  const pool = filterPoolByTeams(filterPoolByYearRange(buildDraftPool(), range), teamIds);
  const players = pool.reduce((sum, c) => sum + c.pickCount, 0);
  return { comboCount: pool.length, playerCount: players };
}
