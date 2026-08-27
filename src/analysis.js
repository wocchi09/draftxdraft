import { ROSTER_SLOTS } from "./roster.js";
import { getPlayer } from "./draft.js";
import { classifyRound } from "./draftRound.js";

/**
 * 完成ロスターの客観的事実分析。
 * ここでは一切「強い/弱い」を判定せず、集計値のみを返す。
 * UI側もこの数字をそのまま表示し、評価はユーザーに委ねる。
 */

function classifyDraftRound(player) {
  return classifyRound(player.draftRound, player.draftType);
}

export function getRosterPlayers(roster) {
  return ROSTER_SLOTS
    .map((slot) => {
      const playerId = roster[slot.id];
      if (!playerId) return null;
      const player = getPlayer(playerId);
      return player ? { ...player, slotId: slot.id } : null;
    })
    .filter((p) => p !== null);
}

export function computeAnalysis(roster) {
  const players = getRosterPlayers(roster);

  const throwsCount = { R: 0, L: 0, unknown: 0 };
  const batsCount = { R: 0, L: 0, S: 0, unknown: 0 };
  const roundCount = { "1位": 0, "2位": 0, "3位": 0, "4位以下": 0, 育成: 0 };
  const originCount = { 高校: 0, 大学: 0, 社会人: 0, 独立リーグ: 0, 不明: 0 };
  let multiPositionCount = 0;
  let twoWayCount = 0;
  let activeCount = 0;
  let retiredCount = 0;
  let unknownStatusCount = 0;
  let titleHolderCount = 0;
  let awardHolderCount = 0;

  for (const p of players) {
    throwsCount[p.throws || "unknown"] = (throwsCount[p.throws || "unknown"] || 0) + 1;
    batsCount[p.bats || "unknown"] = (batsCount[p.bats || "unknown"] || 0) + 1;

    roundCount[classifyDraftRound(p)] += 1;

    const origin = p.originType || "不明";
    originCount[origin] = (originCount[origin] || 0) + 1;

    const posCount = (p.fieldingPositions || []).length + (p.pitcherRoles || []).length;
    if (posCount > 1) multiPositionCount += 1;

    if (p.isTwoWay) twoWayCount += 1;

    if (p.activeStatus === "active") activeCount += 1;
    else if (p.activeStatus === "retired") retiredCount += 1;
    else unknownStatusCount += 1;

    if ((p.titles || []).length > 0) titleHolderCount += 1;
    if ((p.awards || []).length > 0) awardHolderCount += 1;
  }

  return {
    playerCount: players.length,
    throwsCount,
    batsCount,
    roundCount,
    originCount,
    multiPositionCount,
    twoWayCount,
    activeCount,
    retiredCount,
    unknownStatusCount,
    titleHolderCount,
    awardHolderCount,
    players,
  };
}

/**
 * 事実データの閾値からのみタグを生成する。主観的な強さの語彙は使用しない。
 */
export function computeTags(analysis) {
  const tags = [];
  const n = analysis.playerCount || 12;

  if (analysis.roundCount["1位"] >= 4) tags.push("ドラフト1位多数");
  if (analysis.roundCount["4位以下"] + analysis.roundCount["育成"] >= 6) tags.push("下位指名中心");
  if (analysis.originCount["高校"] > n / 2) tags.push("高卒中心");
  if (analysis.originCount["大学"] > n / 2) tags.push("大卒中心");
  if (analysis.batsCount.L >= 5) tags.push("左打者多数");
  if (analysis.batsCount.R >= 7) tags.push("右打者多数");
  if (analysis.multiPositionCount >= 3) tags.push("複数ポジション経験者多数");
  if (analysis.twoWayCount >= 1) tags.push("二刀流選手あり");
  if (analysis.titleHolderCount >= 2) tags.push("タイトルホルダー複数");
  if (analysis.roundCount["育成"] >= 1) tags.push("育成出身あり");
  if (analysis.activeCount > analysis.retiredCount) tags.push("現役中心");
  if (analysis.retiredCount > analysis.activeCount) tags.push("引退選手中心");

  return tags;
}

/** 選手個人に付与する客観バッジ（実績＋二刀流） */
export function getPlayerBadges(player) {
  const badges = [];
  if (player.isTwoWay) badges.push("TWO-WAY");
  for (const t of player.titles || []) badges.push(t);
  for (const a of player.awards || []) badges.push(a);
  return badges;
}
