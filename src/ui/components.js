import { escapeHtml } from "../utils/dom.js";
import { ROSTER_SLOTS, getSlotDef } from "../roster.js";
import { getTeamName, getTeamShortName, getTeamAccentColor } from "../teams.js";
import { readableTextOn } from "../utils/color.js";
import { parseDraftRound, draftKindLabel, isLowRound } from "../draftRound.js";

export function twoWayBadgeHtml(pulse = false) {
  return `<span class="badge-twoway${pulse ? " pulse" : ""}" title="投手・野手の両方として実際にプレーした選手">⚡ TWO-WAY</span>`;
}

function originLine(player) {
  const parts = [];
  if (player.amateurTeam) parts.push(escapeHtml(player.amateurTeam));
  if (player.originType) parts.push(escapeHtml(player.originType));
  return parts.join(" / ");
}

function typeLabel(player) {
  return player.pickType === "development" || player.draftType === "育成" ? "育成" : "支配下";
}

export function candidateCardHtml(player, { expanded = false, disabled = false } = {}) {
  const round = player.pickRound || player.draftRound || "-";
  // 「高校1巡目」のような区分名付きの順位は、バッジ内で2行に分けて表示する
  const { kind, shortRank } = parseDraftRound(round);
  const kindLabel = draftKindLabel(round);
  const lowRound = isLowRound(round, player.draftType);
  const throwsBats =
    player.throws || player.bats
      ? `投打 ${player.throws || "-"} / ${player.bats || "-"}`
      : "投打 不明";
  const statusLabel =
    player.activeStatus === "active" ? "現役" : player.activeStatus === "retired" ? "引退" : "在籍状況不明";

  const detail = expanded
    ? `
    <div class="candidate-detail">
      <div><div class="field-label">${throwsBats}</div></div>
      <div><div class="field-label">当時の所属</div><div class="field-value">${originLine(player) || "不明"}</div></div>
      <div><div class="field-label">ドラフト時ポジション</div><div class="field-value">${escapeHtml(player.draftPosition || "不明")}</div></div>
      ${kindLabel ? `<div><div class="field-label">指名区分</div><div class="field-value">${escapeHtml(kindLabel)}</div></div>` : ""}
      <div><div class="field-label">在籍状況</div><div class="field-value">${statusLabel}</div></div>
      ${
        (player.titles || []).length + (player.awards || []).length > 0
          ? `<div style="grid-column:1/-1"><div class="field-label">主な実績</div><div class="field-value">${[...(player.titles || []), ...(player.awards || [])].map(escapeHtml).join("、")}</div></div>`
          : ""
      }
    </div>`
    : "";

  return `
  <div class="candidate-card${disabled ? " disabled" : ""}" data-player-id="${escapeHtml(player.id)}" role="button" tabindex="0" aria-disabled="${disabled}">
    <div class="candidate-top">
      <div class="candidate-round-badge${lowRound ? " low-round" : ""}" title="${escapeHtml(kindLabel ? `${kindLabel} ${shortRank}` : round)}">
        ${kind ? `<span class="round-kind">${escapeHtml(kind)}</span>` : ""}
        <span class="round-rank">${escapeHtml(shortRank)}</span>
      </div>
      <div class="candidate-name-block">
        <div class="candidate-name">${escapeHtml(player.name)}${player.isTwoWay ? " " + twoWayBadgeHtml(true) : ""}</div>
        <div class="candidate-sub">
          <span>${typeLabel(player)}</span>
          <span>${escapeHtml(player.draftPosition || "ポジション不明")}</span>
        </div>
      </div>
      <button type="button" class="candidate-toggle" data-toggle-detail="${escapeHtml(player.id)}" aria-expanded="${expanded}" aria-label="${escapeHtml(player.name)}の詳細を${expanded ? "閉じる" : "見る"}">${expanded ? "▲" : "▼"}</button>
    </div>
    ${detail}
  </div>`;
}

export function fieldDiagramHtml(roster, playerLookup) {
  const positions = ["CF", "LF", "RF", "SS", "2B", "3B", "1B", "C", "DH"];
  const slotsHtml = positions
    .map((slotId) => {
      const slot = getSlotDef(slotId);
      const playerId = roster[slotId];
      const player = playerId ? playerLookup(playerId) : null;
      return `
      <div class="field-slot pos-${slotId.toLowerCase()}${player ? "" : " empty"}">
        <span class="fs-pos">${escapeHtml(slot.label)}</span>
        <span class="fs-name">${player ? escapeHtml(player.name) : "未選択"}</span>
      </div>`;
    })
    .join("");
  return `<div class="field-diagram">${slotsHtml}</div>`;
}

export function pitcherStripHtml(roster, playerLookup) {
  return `<div class="pitcher-strip">${["SP", "RP", "CL"]
    .map((slotId) => {
      const slot = getSlotDef(slotId);
      const playerId = roster[slotId];
      const player = playerId ? playerLookup(playerId) : null;
      return `
      <div class="p-slot${player ? "" : " empty"}">
        <span class="p-label">PITCHER / ${escapeHtml(slot.shortLabel)}</span>
        <span class="p-name">${player ? escapeHtml(player.name) : "未選択"}</span>
      </div>`;
    })
    .join("")}</div>`;
}

export function rosterListHtml(roster, playerLookup) {
  return `<div class="roster-list">${ROSTER_SLOTS.map((slot) => {
    const playerId = roster[slot.id];
    const player = playerId ? playerLookup(playerId) : null;
    return `
    <div class="roster-list-row${player ? "" : " empty"}">
      <span class="rl-pos">${escapeHtml(slot.label)}</span>
      <span class="rl-name">${player ? escapeHtml(player.name) + (player.isTwoWay ? " " + twoWayBadgeHtml() : "") : "未選択"}</span>
    </div>`;
  }).join("")}</div>`;
}

/**
 * 球団名を、その球団のカラーで塗ったバッジにする。
 * アクセントの明るさは球団ごとにばらばら（阪神の黄色からロッテの黒まで）なので、
 * 載せる文字色はコントラスト比から都度決める。
 */
function teamBadgeHtml(teamId, year) {
  const label = getTeamShortName(teamId);
  const color = getTeamAccentColor(teamId);
  if (!color) return `<span class="h-team">${escapeHtml(label)}</span>`;
  const ink = readableTextOn(color);
  return `<span class="h-team" style="background:${color};color:${ink}" title="${escapeHtml(getTeamName(teamId, year))}">${escapeHtml(label)}</span>`;
}

export function historyItemHtml(entry, playerLookup) {
  const badge = teamBadgeHtml(entry.teamId, entry.year);
  if (entry.action === "SKIP") {
    return `
    <div class="history-item is-skip">
      <span class="h-round">${entry.round}巡</span>
      ${badge}
      <span class="h-meta">${entry.year}年</span>
      <span class="h-name">SKIP</span>
    </div>`;
  }
  const player = entry.playerId ? playerLookup(entry.playerId) : null;
  // 「ソフトバンク 2019年5位 柳町達」の形で読めるようにする
  const round = player ? (() => {
    const { kind, shortRank } = parseDraftRound(player.draftRound);
    return `${kind}${shortRank}`;
  })() : "";
  return `
  <div class="history-item">
    <span class="h-round">${entry.round}巡</span>
    ${badge}
    <span class="h-meta">${entry.year}年${escapeHtml(round)}</span>
    <strong class="h-name">${escapeHtml(player ? player.name : "?")}</strong>
  </div>`;
}

export function skipIndicatorHtml(remaining, limit) {
  if (limit === 0) {
    return `<div class="skip-indicator"><span>NO SKIP モード</span></div>`;
  }
  const dots = Array.from({ length: limit })
    .map((_, i) => `<span class="dot${i < remaining ? " filled" : ""}"></span>`)
    .join("");
  return `<div class="skip-indicator"><span>残りスキップ：${remaining}</span><span class="dots">${dots}</span></div>`;
}
