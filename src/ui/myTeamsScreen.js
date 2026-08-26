import { loadCompletedTeams } from "../storage.js";
import { getMode } from "../modes.js";
import { escapeHtml } from "../utils/dom.js";

function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export function renderMyTeamsScreen(root, app) {
  const teams = loadCompletedTeams();

  const wrap = document.createElement("div");
  wrap.className = "screen";
  wrap.innerHTML = `
    <div class="topbar">
      <button type="button" class="btn btn-icon btn-ghost" id="back-btn" aria-label="戻る">←</button>
      <h2>MY TEAMS</h2>
    </div>
    ${
      teams.length === 0
        ? `<div class="empty-state"><p>完成したチームはまだありません。</p><p>ドラフトを始めて、最初のロスターを作ってみましょう。</p></div>`
        : `<div class="myteams-list">
        ${teams
          .map(
            (t, i) => `
          <button type="button" class="myteam-item" data-index="${i}">
            <span>
              <span class="date">${formatDate(t.completedAt)}</span>
              <span class="meta">${escapeHtml(getMode(t.modeId).label)} ・ ${t.roundsPlayed || t.history.length}手</span>
            </span>
            <span aria-hidden="true">›</span>
          </button>`
          )
          .join("")}
      </div>`
    }
  `;

  wrap.querySelector("#back-btn").addEventListener("click", () => app.setScreen("TOP"));

  wrap.querySelectorAll("[data-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      app.viewCompletedTeam(teams[index], index);
    });
  });

  root.appendChild(wrap);
}
