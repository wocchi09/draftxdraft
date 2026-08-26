import { getGameData } from "./dataStore.js";

function teamsData() {
  return getGameData().teams;
}

export function getAllTeams() {
  return teamsData();
}

export function getTeam(teamId) {
  return teamsData().find((t) => t.id === teamId) || null;
}

/**
 * 球団史を考慮し、指定年度時点での正式名称を解決する。
 * 一致するエントリが無い場合は最後の名称にフォールバックする。
 */
export function getTeamName(teamId, year) {
  const team = getTeam(teamId);
  if (!team) return teamId;
  const entry = team.nameHistory.find((h) => {
    const fromOk = h.from === null || year >= h.from;
    const toOk = h.to === null || year <= h.to;
    return fromOk && toOk;
  });
  return (entry || team.nameHistory[team.nameHistory.length - 1]).name;
}

export function getTeamShortName(teamId) {
  const team = getTeam(teamId);
  return team ? team.shortName : teamId;
}

export function getTeamAccentColor(teamId) {
  const team = getTeam(teamId);
  return team && team.colorAccent ? team.colorAccent : null;
}

/** 抽選演出用: 全球団の表示名一覧 */
export function getAllTeamShortNames() {
  return teamsData().map((t) => t.shortName);
}
