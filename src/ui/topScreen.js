import { getAllModes } from "../modes.js";
import { escapeHtml } from "../utils/dom.js";
import { DEFAULT_ACCENT } from "../utils/color.js";

const PRESET_COLORS = [
  DEFAULT_ACCENT,
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

const THEME_OPTIONS = [
  { id: "system", label: "端末に合わせる", icon: "🖥" },
  { id: "light", label: "ライト", icon: "☀️" },
  { id: "dark", label: "ダーク", icon: "🌙" },
];

export function renderTopScreen(root, app) {
  const modes = getAllModes();
  const currentTheme = app.theme || "system";
  const currentColor = app.favoriteColor || DEFAULT_ACCENT;
  const isPresetColor = PRESET_COLORS.some((c) => c.toLowerCase() === currentColor.toLowerCase());

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

    <div class="color-select">
      <span class="color-select-label">アクセントカラー（お好きな色を選べます）</span>
      <div class="color-swatches" role="group" aria-label="アクセントカラーを選択">
        ${PRESET_COLORS.map(
          (c) => `
          <button type="button" class="color-swatch${c.toLowerCase() === currentColor.toLowerCase() ? " is-selected" : ""}" data-color="${c}" style="background:${c}" aria-pressed="${c.toLowerCase() === currentColor.toLowerCase()}" aria-label="アクセントカラー ${c}"></button>`
        ).join("")}
        <label class="color-swatch color-swatch-custom${!isPresetColor ? " is-selected" : ""}" style="${!isPresetColor ? `background:${currentColor}` : ""}" aria-label="カスタムカラーを選択">
          <input type="color" id="custom-color-input" value="${currentColor}" aria-label="カスタムアクセントカラー" />
          <span aria-hidden="true">${isPresetColor ? "+" : ""}</span>
        </label>
      </div>
    </div>

    <div class="theme-select">
      <span class="color-select-label">表示テーマ</span>
      <div class="theme-options" role="radiogroup" aria-label="表示テーマを選択">
        ${THEME_OPTIONS.map(
          (t) => `
          <button type="button" class="theme-option${t.id === currentTheme ? " is-selected" : ""}" role="radio" aria-checked="${t.id === currentTheme}" data-theme-id="${t.id}">
            <span aria-hidden="true">${t.icon}</span>${escapeHtml(t.label)}
          </button>`
        ).join("")}
      </div>
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

  wrap.querySelectorAll("[data-theme-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.setTheme(btn.dataset.themeId);
    });
  });

  wrap.querySelectorAll("[data-color]").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.setFavoriteColor(btn.dataset.color);
      app.render();
    });
  });

  const customInput = wrap.querySelector("#custom-color-input");
  customInput.addEventListener("input", (e) => {
    app.setFavoriteColor(e.target.value);
  });
  customInput.addEventListener("change", () => {
    app.render();
  });

  wrap.querySelector("#start-game-btn").addEventListener("click", () => {
    app.startNewGame(app.selectedModeId);
  });

  wrap.querySelector("#my-teams-link").addEventListener("click", () => {
    app.setScreen("MY_TEAMS");
  });

  root.appendChild(wrap);
}
