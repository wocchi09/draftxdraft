import { getGameData } from "./dataStore.js";
import { pickRandom } from "./utils/random.js";

function draftsData() {
  return getGameData().drafts;
}

function playersData() {
  return getGameData().players;
}

/** 年度をコード内に固定せず、実データから動的に取得する */
export function getAvailableYears() {
  return [...new Set(draftsData().map((d) => d.year))].sort((a, b) => a - b);
}

export function getAvailableTeamIds() {
  return [...new Set(draftsData().map((d) => d.teamId))];
}

/** 一意な {year, teamId} の抽選プールを構築する */
export function buildDraftPool() {
  return draftsData().map((d) => ({ year: d.year, teamId: d.teamId }));
}

export function getPlayer(playerId) {
  return playersData().find((p) => p.id === playerId) || null;
}

export function getAllPlayers() {
  return playersData();
}

function findDraftEntry(year, teamId) {
  return draftsData().find((d) => d.year === year && d.teamId === teamId) || null;
}

/**
 * 指定の年度×球団について、その年に実際に指名された選手一覧を返す。
 * 既に自チームで指名済み（重複禁止）の選手は除外する。
 */
export function getCandidates(year, teamId, excludePlayerIds = new Set()) {
  const entry = findDraftEntry(year, teamId);
  if (!entry) return [];
  return entry.picks
    .map((pick) => {
      const player = getPlayer(pick.playerId);
      if (!player) return null;
      return { ...player, pickRound: pick.round, pickType: pick.type };
    })
    .filter((p) => p !== null && !excludePlayerIds.has(p.id));
}

/**
 * モードに応じてフィルタ済みのプールから1件、年度×球団をランダム抽選する。
 * プールが空の場合はnullを返す（呼び出し側で例外処理する）。
 *
 * 抽選は「シャッフルバッグ」方式。`ctx.excludeComboKeys`（この巡で既に出た
 * `"year-teamId"` のSet）にある組み合わせは除外され、
 * まだ出ていないものから一様ランダムに選ぶ。つまり一巡する間は絶対に重複しない。
 *
 * プールを出し尽くしたら次の巡に入る。その最初の1件だけは
 * `ctx.avoidComboKey`（直前に出た組み合わせ）を候補から外し、
 * 巡の境目で同じ組み合わせが2連続で出ないようにする。
 */
export function drawDraftCombo(mode, ctx = {}) {
  const pool = mode.filterPool(buildDraftPool(), ctx);
  if (pool.length === 0) return null;

  const keyOf = (c) => `${c.year}-${c.teamId}`;
  const exclude = ctx.excludeComboKeys;

  if (exclude && exclude.size > 0) {
    const unseen = pool.filter((c) => !exclude.has(keyOf(c)));
    if (unseen.length > 0) return pickRandom(unseen);
    // ここに来たら一巡し終えた。次の巡へ移る。
    const fresh = pool.filter((c) => keyOf(c) !== ctx.avoidComboKey);
    return pickRandom(fresh.length > 0 ? fresh : pool);
  }

  return pickRandom(pool);
}
