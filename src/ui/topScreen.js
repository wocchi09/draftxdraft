import { getAllModes } from "../modes.js";
import { escapeHtml } from "../utils/dom.js";
import { DEFAULT_ACCENT, readableTextOn, hexToRgba } from "../utils/color.js";
import { getAvailableYears } from "../draft.js";
import {
  getYearPresets,
  matchPresetId,
  normalizeYearRange,
} from "../yearRange.js";
import {
  getSelectableTeams,
  allTeamIds,
  normalizeTeamIds,
  isAllTeams,
  summarizePool,
} from "../teamFilter.js";

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

/**
 * TOP画面。
 *
 * 遊ぶ前に決めることは「モード」と「年度」だけなので、
 * この2つとSTARTがスクロールせずに収まるようにしている。
 * 球団の絞り込みは使う人だけが開けばよいので、1行のボタンに畳んである。
 * 見た目の好み（アクセントカラー・表示テーマ）は毎回いじるものではないため、
 * STARTの下の「表示設定」に畳んである。
 */
export function renderTopScreen(root, app) {
  const modes = getAllModes();
  const selectedMode = modes.find((m) => m.id === app.selectedModeId) || modes[0];
  const appearanceOpen = Boolean(app.appearanceOpen);
  const currentTheme = app.theme || "system";
  const currentColor = app.favoriteColor || DEFAULT_ACCENT;
  const isPresetColor = PRESET_COLORS.some((c) => c.toLowerCase() === currentColor.toLowerCase());

  const years = getAvailableYears();
  const range = normalizeYearRange(app.yearRange);
  const activePresetId = matchPresetId(range);
  const teamIds = normalizeTeamIds(app.teamIds);
  const teams = getSelectableTeams();
  const allTeamsSelected = isAllTeams(teamIds);
  const teamOpen = Boolean(app.teamPanelOpen);
  const teamSummary = allTeamsSelected
    ? "全球団"
    : teamIds.length <= 3
      ? teams.filter((t) => teamIds.includes(t.id)).map((t) => t.shortName).join("・")
      : `${teamIds.length}球団`;

  const { comboCount, playerCount } = summarizePool(range, teamIds);
  // 12人そろえるので、12通り未満だと一巡しきって同じ組み合わせが再び出る
  const tooNarrow = comboCount < 12;
  // 重複指名はできないので、延べ12人に満たないプールではロスターを埋めきれない
  const tooSmall = playerCount < 12;

  const yearOptions = (selected) =>
    years.map((y) => `<option value="${y}"${y === selected ? " selected" : ""}>${y}年</option>`).join("");

  const wrap = document.createElement("div");
  wrap.className = "screen top-screen";
  wrap.innerHTML = `
    <div class="top-logo">
      <span class="mark">BASEBALL DRAFT ROSTER GAME</span>
      <h1>DRAFT × DRAFT</h1>
      <p class="copy">運命のドラフトから、自分だけのチームを作れ。</p>
    </div>

    <div class="top-field">
      <span class="top-field-label">ゲームモード</span>
      <div class="mode-select" role="radiogroup" aria-label="ゲームモード選択">
        ${modes
          .map(
            (m) => `
          <button type="button" class="mode-option" role="radio" aria-checked="${m.id === app.selectedModeId}" data-mode-id="${m.id}">${escapeHtml(m.label)}</button>`
          )
          .join("")}
      </div>
      <p class="top-field-note">${escapeHtml(selectedMode.description)}</p>
    </div>

    <div class="top-field year-select">
      <span class="top-field-label">出題する年度</span>
      <div class="year-presets" role="radiogroup" aria-label="年度の範囲を選択">
        ${getYearPresets()
          .map(
            (p) => `
          <button type="button" class="year-preset${p.id === activePresetId ? " is-selected" : ""}" role="radio" aria-checked="${p.id === activePresetId}" data-year-preset="${p.id}">
            <span class="year-preset-name">${escapeHtml(p.label)}</span>
            <span class="year-preset-years">${p.from}〜${p.to}</span>
          </button>`
          )
          .join("")}
      </div>
      <div class="year-custom">
        <select id="year-from-select" aria-label="開始年">${yearOptions(range.from)}</select>
        <span class="year-custom-sep" aria-hidden="true">〜</span>
        <select id="year-to-select" aria-label="終了年">${yearOptions(range.to)}</select>
      </div>
    </div>

    <div class="top-field team-select">
      <button type="button" class="team-disclosure" id="team-toggle" aria-expanded="${teamOpen}" aria-controls="team-panel">
        <span class="top-field-label">出題する球団</span>
        <span class="team-summary">${escapeHtml(teamSummary)}</span>
        <span class="team-caret" aria-hidden="true">${teamOpen ? "▲" : "▼"}</span>
      </button>
      <div class="team-panel" id="team-panel"${teamOpen ? "" : " hidden"}>
        <button type="button" class="team-chip team-chip-all${allTeamsSelected ? " is-selected" : ""}" id="team-all-btn" aria-pressed="${allTeamsSelected}">全球団</button>
        <div class="team-chips" role="group" aria-label="出題する球団を選択">
          ${teams
            .map((t) => {
              const on = !allTeamsSelected && teamIds.includes(t.id);
              const color = t.colorAccent || DEFAULT_ACCENT;
              const style = on
                ? `background:${color};color:${readableTextOn(color)};border-color:${color}`
                : `border-color:${hexToRgba(color, 0.5)}`;
              return `
            <button type="button" class="team-chip${on ? " is-selected" : ""}" data-team-id="${escapeHtml(t.id)}" aria-pressed="${on}" style="${style}">${escapeHtml(t.shortName)}</button>`;
            })
            .join("")}
        </div>
      </div>
      <p class="top-field-note top-pool-note${tooNarrow || tooSmall ? " is-warning" : ""}">
        <strong>${comboCount}</strong> 通り（${playerCount}人）から出題${
          tooSmall
            ? "／12人に届かないため、この条件では始められません"
            : tooNarrow
              ? "／12通りを下回るため同じ年度×球団が再び出ます"
              : ""
        }
      </p>
    </div>

    <div class="top-actions">
      <button type="button" class="btn btn-primary btn-block" id="start-game-btn"${tooSmall ? " disabled" : ""}>START</button>
      <div class="top-sub-actions">
        <button type="button" class="top-disclosure" id="appearance-toggle" aria-expanded="${appearanceOpen}" aria-controls="appearance-panel">
          表示設定 <span aria-hidden="true">${appearanceOpen ? "▲" : "▼"}</span>
        </button>
        <button type="button" class="top-footer-link" id="my-teams-link">MY TEAMS</button>
      </div>
    </div>

    <footer class="top-footer">
      <a href="./terms.html">利用規約</a>
      <span aria-hidden="true">・</span>
      <a href="./privacy.html">プライバシーポリシー</a>
      <p class="top-credit">
        NPBドラフトの史実データを使った非公式のファンツールです。<br />
        「日ハムファンが語る。」さんの企画に着想を得て制作しました。
      </p>
    </footer>

    <div class="appearance-panel" id="appearance-panel"${appearanceOpen ? "" : " hidden"}>
      <div class="top-field">
        <span class="top-field-label">アクセントカラー</span>
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

      <div class="top-field">
        <span class="top-field-label">表示テーマ</span>
        <div class="theme-options" role="radiogroup" aria-label="表示テーマを選択">
          ${THEME_OPTIONS.map(
            (t) => `
            <button type="button" class="theme-option${t.id === currentTheme ? " is-selected" : ""}" role="radio" aria-checked="${t.id === currentTheme}" data-theme-id="${t.id}">
              <span aria-hidden="true">${t.icon}</span>${escapeHtml(t.label)}
            </button>`
          ).join("")}
        </div>
      </div>
    </div>
  `;

  wrap.querySelectorAll("[data-mode-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      app.selectedModeId = btn.dataset.modeId;
      app.render();
    });
  });

  wrap.querySelectorAll("[data-year-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = getYearPresets().find((p) => p.id === btn.dataset.yearPreset);
      if (preset) app.setYearRange({ from: preset.from, to: preset.to });
    });
  });

  const fromSelect = wrap.querySelector("#year-from-select");
  const toSelect = wrap.querySelector("#year-to-select");
  const onYearChange = (e) => {
    // 開始が終了を追い越したら、逆転しないよう「いま動かした側」に相手を合わせる
    let from = Number(fromSelect.value);
    let to = Number(toSelect.value);
    if (from > to) {
      if (e.target === fromSelect) to = from;
      else from = to;
    }
    app.setYearRange({ from, to });
  };
  fromSelect.addEventListener("change", onYearChange);
  toSelect.addEventListener("change", onYearChange);

  wrap.querySelector("#team-toggle").addEventListener("click", () => {
    app.teamPanelOpen = !app.teamPanelOpen;
    app.render();
  });

  wrap.querySelector("#team-all-btn").addEventListener("click", () => {
    app.setTeamIds(allTeamIds());
  });

  wrap.querySelectorAll("[data-team-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.teamId;
      // 「全球団」の状態から1球団を押したときは、その球団だけに絞る。
      // 逆に最後の1球団を外したときは「全球団」へ戻す（normalizeTeamIdsが空を全球団に倒す）。
      if (allTeamsSelected) {
        app.setTeamIds([id]);
        return;
      }
      const next = teamIds.includes(id) ? teamIds.filter((t) => t !== id) : [...teamIds, id];
      app.setTeamIds(next);
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

  wrap.querySelector("#appearance-toggle").addEventListener("click", () => {
    app.appearanceOpen = !app.appearanceOpen;
    app.render();
  });

  const startBtn = wrap.querySelector("#start-game-btn");
  startBtn.addEventListener("click", () => {
    if (startBtn.disabled) return;
    app.startNewGame(app.selectedModeId);
  });

  wrap.querySelector("#my-teams-link").addEventListener("click", () => {
    app.setScreen("MY_TEAMS");
  });

  root.appendChild(wrap);
}
