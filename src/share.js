import { getTeamName } from "./teams.js";
import { getPlayer } from "./draft.js";
import { ROSTER_SLOTS, getSlotDef } from "./roster.js";

/**
 * 完成チームのシェア用テキストを生成する。
 * 強さを断定する表現は使わず、「事実＋問いかけ」の形にする。
 */
export function buildShareText(state, tags) {
  const lines = ["DRAFT × DRAFTで自分だけのロスターを作った。"];
  if (tags.length > 0) {
    lines.push(tags.slice(0, 3).join(" / "));
  }
  lines.push("あなたならこのチーム、どう見る？");
  return lines.join("\n");
}

export function buildShareSummary(state) {
  const battingOrder = (state.battingOrder || []).map((playerId, idx) => {
    const player = getPlayer(playerId);
    const slotId = Object.keys(state.roster).find((s) => state.roster[s] === playerId);
    const slot = getSlotDef(slotId);
    return { order: idx + 1, name: player ? player.name : "-", posLabel: slot ? slot.shortLabel : "" };
  });

  const pitcherSlots = ROSTER_SLOTS.filter((s) => s.category === "pitcher").map((slot) => {
    const playerId = state.roster[slot.id];
    const player = playerId ? getPlayer(playerId) : null;
    return { slotLabel: slot.shortLabel, name: player ? player.name : "未選択" };
  });

  const drawnTeams = [...new Set(state.history.filter((h) => h.action === "PICK").map((h) => h.teamId))];
  const yearsSpan = state.history
    .filter((h) => h.action === "PICK")
    .map((h) => h.year);
  const decade =
    yearsSpan.length > 0 ? `${Math.min(...yearsSpan)}〜${Math.max(...yearsSpan)}年` : "";

  return {
    battingOrder,
    pitcherSlots,
    decade,
    teamCount: drawnTeams.length,
    completedAt: state.completedAt,
  };
}

/**
 * Web Share APIが使える環境ではネイティブ共有シートを開く。
 * 使えない環境ではfalseを返し、呼び出し側でスクリーンショット導線を案内する。
 */
export async function shareTeam(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch (err) {
      if (err && err.name === "AbortError") return false;
      console.warn("[share] Web Share APIでの共有に失敗しました", err);
      return false;
    }
  }
  return false;
}

export function buildSnsIntentUrls(text) {
  const encoded = encodeURIComponent(text);
  return {
    x: `https://twitter.com/intent/tweet?text=${encoded}`,
    line: `https://social-plugins.line.me/lineit/share?text=${encoded}`,
  };
}
