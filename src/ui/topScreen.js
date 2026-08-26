import { getAllModes } from "../modes.js";
import { escapeHtml } from "../utils/dom.js";

export function renderTopScreen(root, app) {
  const modes = getAllModes();

  const wrap = document.createElement("div");
  wrap.className = "screen top-screen";
  wrap.innerHTML = `
    <div class="top-logo">
      <span class="mark">BASEBALL DRAFT ROSTER GAME</span>
      <h1>DRAFT × DRAFT</h1>
      <p class="copy">運命のドラフトから、自分だけのチームを作れ。</p>
    </div>

    <div class="mode-select" role="radiogroup" aria-label="ゲームモード選択">
      ${modes
        .map(
          (m) => `
        <button type="button" class="mode-option" role="radio" aria-pressed="${m.id === app.selectedModeId}" data-mode-id="${m.id}">
          <span>
            <span class="mode-name">${escapeHtml(m.label)}</span>
            <span class="mode-desc">${escapeHtml(m.description)}</span>
          </span>
          <span class="mode-radio" aria-hidden="true"></span>
        </button>`
        )
        .join("")}
    </div>

    <div class="top-actions">
      <button type="button" class="btn btn-primary btn-block" id="start-game-btn">START</button>
      <button type="button" class="top-footer-link" id="my-teams-link">MY TEAMS を見る</button>
    </div>
  `;

  wrap.querySelectorAll("[data-mode-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.selectedModeId = btn.dataset.modeId;
      app.render();
    });
  });

  wrap.querySelector("#start-game-btn").addEventListener("click", () => {
    app.startNewGame(app.selectedModeId);
  });

  wrap.querySelector("#my-teams-link").addEventListener("click", () => {
    app.setScreen("MY_TEAMS");
  });

  root.appendChild(wrap);
}
