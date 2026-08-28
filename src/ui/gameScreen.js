import { getSkipsRemaining, getFilledCount, normalizeBattingOrderDraft } from "../state.js";
import { getMode } from "../modes.js";
import { getTeamName } from "../teams.js";
import { getPlayer } from "../draft.js";
import { getSlotDef, ROSTER_SLOTS, getOpenEligibleSlotIds } from "../roster.js";
import {
  candidateCardHtml,
  fieldDiagramHtml,
  pitcherStripHtml,
  rosterListHtml,
  historyItemHtml,
  skipIndicatorHtml,
} from "./components.js";
import { escapeHtml } from "../utils/dom.js";

/** これを超えたら候補一覧を2列にする（1画面に収めるため） */
const DENSE_LIST_THRESHOLD = 8;

export function renderGameScreen(root, app) {
  const { game, ui } = app;
  const mode = getMode(game.modeId);
  const filled = getFilledCount(game);
  const skipsRemaining = getSkipsRemaining(game);

  const wrap = document.createElement("div");
  wrap.className = "screen";

  const topbarHtml = `
    <div class="topbar">
      <button type="button" class="btn btn-icon btn-ghost" id="game-abandon-btn" aria-label="ゲームを中断してTOPに戻る">←</button>
      <h2>${escapeHtml(mode.label)}</h2>
    </div>`;

  const progressHtml = `
    <div class="progress-block">
      <div class="progress-row">
        <span class="progress-count">${filled} <small>/ 12 PLAYERS</small></span>
        ${skipIndicatorHtml(skipsRemaining, mode.skipLimit)}
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${(filled / 12) * 100}%"></div></div>
    </div>`;

  let draftSectionHtml = "";
  if (ui.noCandidatesStuck) {
    draftSectionHtml = `
      <div class="no-candidates-banner">
        配置可能な選手が見つかりませんでした。<br />
        <button type="button" class="btn btn-secondary" id="manual-redraw-btn" style="margin-top:12px;">再抽選する</button>
      </div>`;
  } else if (ui.rouletteAnimating) {
    draftSectionHtml = `
      <div class="draft-result rolling" id="draft-result-box">
        <span class="label">DRAFT LOTTERY</span>
        <div class="year" id="roulette-year">----</div>
        <div class="team-name" id="roulette-team">-----</div>
      </div>`;
  } else if (game.currentDraft) {
    const { year, teamId } = game.currentDraft;
    const teamName = getTeamName(teamId, year);
    draftSectionHtml = `
      <div class="draft-result settled" id="draft-result-box">
        <div class="year" id="roulette-year">${year}</div>
        <div class="team-name" id="roulette-team">${escapeHtml(teamName)}</div>
      </div>
      ${
        ui.autoRedrawNotice
          ? `<div class="redraw-note">${escapeHtml(ui.autoRedrawNotice)}</div>`
          : ""
      }
      <div class="candidate-list${game.currentCandidates.length > DENSE_LIST_THRESHOLD ? " is-dense" : ""}">
        ${game.currentCandidates
          .map((p) => {
            const openSlots = getOpenEligibleSlotIds(p, game.roster);
            return candidateCardHtml(p, {
              expanded: ui.expandedCandidateId === p.id,
              disabled: openSlots.length === 0,
            });
          })
          .join("")}
      </div>`;
  }

  const myTeamHtml = `
    <div class="myteam-block">
      <span class="section-title">MY TEAM</span>
      ${fieldDiagramHtml(game.roster, getPlayer)}
      ${pitcherStripHtml(game.roster, getPlayer)}
      ${rosterListHtml(game.roster, getPlayer)}
    </div>`;

  const historyEntries = game.history.slice().reverse();
  const historyHtml = `
    <div class="history-panel${ui.historyOpen ? " open" : ""}">
      <button type="button" class="history-toggle" id="history-toggle">
        <span>DRAFT HISTORY（全${game.history.length}件）</span>
        <span class="chevron" aria-hidden="true">▾</span>
      </button>
      <div class="history-items">
        ${historyEntries.map((e) => historyItemHtml(e, getPlayer)).join("") || `<p style="color:var(--text-3);font-size:13px;">まだ履歴はありません。</p>`}
      </div>
    </div>`;

  const actionBarHtml =
    !ui.rouletteAnimating && game.currentDraft && !ui.noCandidatesStuck
      ? `
      <div class="action-bar">
        ${
          mode.skipLimit > 0
            ? `<button type="button" class="btn btn-secondary btn-block" id="skip-btn" ${skipsRemaining <= 0 ? "disabled" : ""}>SKIP（残り${skipsRemaining}）</button>`
            : ""
        }
      </div>`
      : "";

  wrap.innerHTML = `
    ${topbarHtml}
    <div class="game-body">
      ${progressHtml}
      ${draftSectionHtml}
      ${myTeamHtml}
      ${historyHtml}
    </div>
    ${actionBarHtml}
    ${ui.slotPickerPlayerId ? (ui.slotPickerStep === "battingOrder" ? battingOrderPickerHtml(app) : slotPickerHtml(app)) : ""}
  `;

  bindEvents(wrap, app);
  root.appendChild(wrap);
}

function slotPickerHtml(app) {
  const player = app.game.currentCandidates.find((p) => p.id === app.ui.slotPickerPlayerId);
  if (!player) return "";
  const openSlots = getOpenEligibleSlotIds(player, app.game.roster);
  return `
  <div class="slot-picker-overlay" id="slot-picker-overlay">
    <div class="slot-picker-sheet" role="dialog" aria-modal="true" aria-label="配置先を選択">
      <h3><span class="player-name">${escapeHtml(player.name)}</span> の配置先を選択</h3>
      <div class="slot-options">
        ${openSlots
          .map((slotId) => {
            const slot = getSlotDef(slotId);
            return `<button type="button" class="slot-option-btn" data-slot-id="${slotId}">${escapeHtml(slot.label)}<small>${slotId}</small></button>`;
          })
          .join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-block" id="slot-picker-cancel">キャンセル</button>
    </div>
  </div>`;
}

/**
 * 野手（DH含む）を配置する際、指名と同時に打順を選ぶシート。
 * 1〜9番すべてを常に表示し、既に埋まっている番号は誰が入っているかを
 * 見せたうえで選べないようにする。
 */
function battingOrderPickerHtml(app) {
  const player = app.game.currentCandidates.find((p) => p.id === app.ui.slotPickerPlayerId);
  if (!player) return "";
  const slotId = app.ui.slotPickerChosenSlotId;
  const slot = getSlotDef(slotId);
  const draft = normalizeBattingOrderDraft(app.game.battingOrderDraft);
  return `
  <div class="slot-picker-overlay" id="slot-picker-overlay">
    <div class="slot-picker-sheet" role="dialog" aria-modal="true" aria-label="打順を選択">
      <h3><span class="player-name">${escapeHtml(player.name)}</span>（${escapeHtml(slot ? slot.label : "")}）の打順を選択</h3>
      <div class="slot-options">
        ${draft
          .map((occupantId, idx) => {
            const occupant = occupantId ? getPlayer(occupantId) : null;
            const taken = Boolean(occupantId);
            return `<button type="button" class="slot-option-btn" data-order-index="${idx}" ${
              taken ? "disabled" : ""
            }>${idx + 1}番<small>${occupant ? escapeHtml(occupant.name) : "空き"}</small></button>`;
          })
          .join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-block" id="slot-picker-cancel">キャンセル</button>
    </div>
  </div>`;
}

function bindEvents(wrap, app) {
  const abandonBtn = wrap.querySelector("#game-abandon-btn");
  if (abandonBtn) {
    abandonBtn.addEventListener("click", () => {
      if (window.confirm("ここまでのロスターは失われます。中断してTOPに戻りますか？")) {
        app.abandonGame();
      }
    });
  }

  const manualRedraw = wrap.querySelector("#manual-redraw-btn");
  if (manualRedraw) manualRedraw.addEventListener("click", () => app.manualRedraw());

  const skipBtn = wrap.querySelector("#skip-btn");
  if (skipBtn) skipBtn.addEventListener("click", () => app.doSkip());

  const historyToggle = wrap.querySelector("#history-toggle");
  if (historyToggle) historyToggle.addEventListener("click", () => app.toggleHistory());

  wrap.querySelectorAll("[data-toggle-detail]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      app.toggleCandidateDetail(btn.dataset.toggleDetail);
    });
  });

  wrap.querySelectorAll(".candidate-card").forEach((card) => {
    if (card.classList.contains("disabled")) return;
    const activate = () => app.selectCandidate(card.dataset.playerId);
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });

  const overlay = wrap.querySelector("#slot-picker-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) app.closeSlotPicker();
    });
  }
  const cancelBtn = wrap.querySelector("#slot-picker-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", () => app.closeSlotPicker());

  wrap.querySelectorAll("[data-slot-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.chooseRosterSlot(app.ui.slotPickerPlayerId, btn.dataset.slotId);
    });
  });

  wrap.querySelectorAll("[data-order-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      app.confirmPick(app.ui.slotPickerPlayerId, app.ui.slotPickerChosenSlotId, Number(btn.dataset.orderIndex));
    });
  });
}
