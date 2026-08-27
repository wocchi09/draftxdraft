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

/** シェア画像のファイル名。同じチームなら同じ名前になるようにする */
export function shareImageFileName(state) {
  const at = new Date(state.completedAt || Date.now());
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("");
  return `draftxdraft-${stamp}.png`;
}

/**
 * 画像を添えてネイティブ共有シートを開く。
 *
 * 画像の添付に対応しているかは端末とブラウザ次第なので、戻り値で伝える。
 *   "shared"      共有シートを開いて共有した
 *   "cancelled"   利用者が共有シートを閉じた
 *   "unsupported" 画像付き共有に対応していない（呼び出し側で保存へ回す）
 */
export async function shareTeamImage(text, blob, fileName) {
  if (!blob || !navigator.share || !navigator.canShare) return "unsupported";
  let file;
  try {
    file = new File([blob], fileName, { type: "image/png" });
  } catch {
    return "unsupported";
  }
  if (!navigator.canShare({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ text, files: [file] });
    return "shared";
  } catch (err) {
    if (err && err.name === "AbortError") return "cancelled";
    console.warn("[share] 画像付き共有に失敗しました", err);
    return "unsupported";
  }
}

/** 画像をその場でダウンロードさせる（共有シートが使えない環境向け） */
export function downloadImage(blob, fileName) {
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // すぐ revoke するとダウンロードが始まらない環境があるので少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

export function buildSnsIntentUrls(text) {
  const encoded = encodeURIComponent(text);
  return {
    x: `https://twitter.com/intent/tweet?text=${encoded}`,
    line: `https://social-plugins.line.me/lineit/share?text=${encoded}`,
  };
}
