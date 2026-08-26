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
 */
export function drawDraftCombo(mode, ctx = {}) {
  const pool = mode.filterPool(buildDraftPool(), ctx);
  return pickRandom(pool) || null;
}
