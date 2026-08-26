import { getPlayer } from "../draft.js";
import { getTeamName } from "../teams.js";
import { getSlotDef, ROSTER_SLOTS } from "../roster.js";
import { computeAnalysis, computeTags, getPlayerBadges } from "../analysis.js";
import { moveTo } from "../battingOrder.js";
import { buildShareText, buildShareSummary, shareTeam, buildSnsIntentUrls } from "../share.js";
import { getMode } from "../modes.js";
import { spawnConfetti } from "./animations.js";
import { escapeHtml } from "../utils/dom.js";

function slotIdForPlayer(roster, playerId) {
  return ROSTER_SLOTS.find((s) => roster[s.id] === playerId)?.id || null;
}

function analysisCardHtml(title, rows) {
  return `
  <div class="analysis-card">
    <span class="a-title">${escapeHtml(title)}</span>
    ${rows.map(([label, value]) => `<div class="a-row"><span>${escapeHtml(label)}</span><span class="a-value">${escapeHtml(String(value))}</span></div>`).join("")}
  </div>`;
}

export function renderResultScreen(root, app) {
  const record = app.viewingTeam;
  const analysis = computeAnalysis(record.roster);
  const tags = computeTags(analysis);
  const mode = getMode(record.modeId);

  const wrap = document.createElement("div");
  wrap.className = "screen";

  const orderRowsHtml = (record.battingOrder || [])
    .map((playerId, idx) => {
      const player = getPlayer(playerId);
      const slotId = slotIdForPlayer(record.roster, playerId);
      const slot = getSlotDef(slotId);
      return `
      <div class="order-row" draggable="true" data-index="${idx}">
        <span class="order-num">${idx + 1}</span>
        <span class="order-info">
          <span class="order-name">${escapeHtml(player ? player.name : "?")}</span>
          <span class="order-pos">${slot ? escapeHtml(slot.shortLabel) : ""}</span>
        </span>
        <span class="order-controls">
          <button type="button" class="btn btn-icon btn-ghost" data-move-up="${idx}" aria-label="上へ" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="btn btn-icon btn-ghost" data-move-down="${idx}" aria-label="下へ" ${idx === record.battingOrder.length - 1 ? "disabled" : ""}>↓</button>
        </span>
      </div>`;
    })
    .join("");

  const pitcherRowsHtml = ["SP", "RP", "CL"]
    .map((slotId) => {
      const player = getPlayer(record.roster[slotId]);
      const slot = getSlotDef(slotId);
      return `<div class="order-row"><span class="order-info"><span class="order-name">${escapeHtml(player ? player.name : "未選択")}</span><span class="order-pos">PITCHER / ${escapeHtml(slot.shortLabel)}</span></span></div>`;
    })
    .join("");

  const roundRows = Object.entries(analysis.roundCount).map(([k, v]) => [k, `${v}人`]);
  const originRows = Object.entries(analysis.originCount)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => [k, `${v}人`]);

  const badgeCounts = new Map();
  for (const p of analysis.players) {
    for (const b of getPlayerBadges(p)) {
      badgeCounts.set(b, (badgeCounts.get(b) || 0) + 1);
    }
  }

  const shareSummary = buildShareSummary(record);
  const shareText = buildShareText(record, tags);
  const snsUrls = buildSnsIntentUrls(shareText);

  wrap.innerHTML = `
    <div class="topbar">
      <button type="button" class="btn btn-icon btn-ghost" id="back-btn" aria-label="戻る">←</button>
      <h2>RESULT</h2>
    </div>
    <div class="result-body">
      <div class="result-hero" id="confetti-anchor">
        <span class="complete-label">TEAM COMPLETE</span>
        <h1>ロスターが完成しました</h1>
        <p class="result-sub">${escapeHtml(mode.label)} ・ ${record.history.length}手のドラフト</p>
      </div>

      <div class="result-section">
        <span class="section-title">打順（並び替え可能）</span>
        <div class="order-list" id="order-list">${orderRowsHtml}</div>
      </div>

      <div class="result-section">
        <span class="section-title">投手陣</span>
        <div class="order-list">${pitcherRowsHtml}</div>
      </div>

      <div class="result-section">
        <span class="section-title">客観的なチーム構成</span>
        <div class="analysis-grid">
          ${analysisCardHtml("投打", [
            ["右投", `${analysis.throwsCount.R || 0}人`],
            ["左投", `${analysis.throwsCount.L || 0}人`],
            ["右打", `${analysis.batsCount.R || 0}人`],
            ["左打", `${analysis.batsCount.L || 0}人`],
            ["両打", `${analysis.batsCount.S || 0}人`],
          ])}
          ${analysisCardHtml("ドラフト順位", roundRows)}
          ${analysisCardHtml("出身カテゴリ", originRows)}
          ${analysisCardHtml("選手構成", [
            ["複数ポジション経験", `${analysis.multiPositionCount}人`],
            ["投手・野手両方の経験", `${analysis.twoWayCount}人`],
            ["現役", `${analysis.activeCount}人`],
            ["引退", `${analysis.retiredCount}人`],
          ])}
        </div>
      </div>

      ${
        tags.length > 0
          ? `<div class="result-section"><span class="section-title">特徴タグ</span><div class="tag-cloud">${tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div></div>`
          : ""
      }

      ${
        badgeCounts.size > 0
          ? `<div class="result-section"><span class="section-title">実績バッジ</span><div class="award-cloud">${Array.from(badgeCounts.entries())
              .map(([b, c]) => `<span class="award-pill">${escapeHtml(b)}${c > 1 ? `<span class="count">×${c}</span>` : ""}</span>`)
              .join("")}</div></div>`
          : ""
      }

      <div class="result-section">
        <span class="section-title">ドラフト履歴</span>
        <div class="history-panel open">
          <div class="history-items" style="display:flex;">
            ${record.history
              .slice()
              .reverse()
              .map((e) => {
                const teamName = getTeamName(e.teamId, e.year);
                const player = e.playerId ? getPlayer(e.playerId) : null;
                return `<div class="history-item${e.action === "SKIP" ? " is-skip" : ""}"><span class="h-round">${e.round}巡</span><span class="h-body">${e.year}年 ${escapeHtml(teamName)} → <strong>${e.action === "SKIP" ? "SKIP" : escapeHtml(player ? player.name : "?")}</strong></span></div>`;
              })
              .join("")}
          </div>
        </div>
      </div>

      <div class="result-section">
        <span class="section-title">シェアカード</span>
        <div class="share-card-wrap">
          <div class="share-card">
            <span class="sc-brand">DRAFT × DRAFT</span>
            <span class="sc-heading">MY TEAM</span>
            <span class="sc-meta">${escapeHtml(mode.label)}${shareSummary.decade ? ` ・ ${escapeHtml(shareSummary.decade)}` : ""}</span>
            <div class="sc-pitchers">
              ${shareSummary.pitcherSlots.map((p) => `<span>${escapeHtml(p.slotLabel)}<br>${escapeHtml(p.name)}</span>`).join("")}
            </div>
            <div class="sc-order">
              ${shareSummary.battingOrder.map((o) => `<div><span>${o.order}. ${escapeHtml(o.posLabel)}</span><b>${escapeHtml(o.name)}</b></div>`).join("")}
            </div>
            <div class="sc-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>
            <div class="sc-footer">あなたならこのチーム、どう見る？</div>
          </div>
          <p class="share-hint">スクリーンショットしてそのままSNSに投稿できます。</p>
          <div class="share-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="native-share-btn">共有する</button>
            <a class="btn btn-ghost btn-sm" href="${snsUrls.x}" target="_blank" rel="noopener">Xでポスト</a>
            <a class="btn btn-ghost btn-sm" href="${snsUrls.line}" target="_blank" rel="noopener">LINEで送る</a>
          </div>
        </div>
      </div>

      <div class="result-cta-row">
        <button type="button" class="btn btn-primary btn-block" id="play-again-btn">もう一度遊ぶ</button>
        <button type="button" class="btn btn-secondary btn-block" id="my-teams-btn">MY TEAMS</button>
      </div>
    </div>
  `;

  bindEvents(wrap, app, record);

  root.appendChild(wrap);

  if (app.ui.pendingConfetti) {
    app.ui.pendingConfetti = false;
    const anchor = wrap.querySelector("#confetti-anchor");
    if (anchor) spawnConfetti(document.body);
  }
}

function bindEvents(wrap, app, record) {
  wrap.querySelector("#back-btn").addEventListener("click", () => app.setScreen("TOP"));
  wrap.querySelector("#play-again-btn").addEventListener("click", () => app.startNewGame(app.selectedModeId));
  wrap.querySelector("#my-teams-btn").addEventListener("click", () => app.setScreen("MY_TEAMS"));

  const nativeShareBtn = wrap.querySelector("#native-share-btn");
  nativeShareBtn.addEventListener("click", async () => {
    const text = buildShareText(record, computeTags(computeAnalysis(record.roster)));
    const ok = await shareTeam(text);
    if (!ok) {
      nativeShareBtn.textContent = "この端末では共有シートを開けません";
      setTimeout(() => {
        nativeShareBtn.textContent = "共有する";
      }, 2200);
    }
  });

  wrap.querySelectorAll("[data-move-up]").forEach((btn) => {
    btn.addEventListener("click", () => app.moveBattingOrder(Number(btn.dataset.moveUp), "up"));
  });
  wrap.querySelectorAll("[data-move-down]").forEach((btn) => {
    btn.addEventListener("click", () => app.moveBattingOrder(Number(btn.dataset.moveDown), "down"));
  });

  let dragFrom = null;
  wrap.querySelectorAll(".order-row[draggable='true']").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      dragFrom = Number(row.dataset.index);
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const to = Number(row.dataset.index);
      if (dragFrom !== null) {
        app.setBattingOrder(moveTo(record.battingOrder, dragFrom, to));
      }
      dragFrom = null;
    });
  });
}
