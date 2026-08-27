import { createInitialState, getSkipsRemaining, getFilledCount } from "./state.js";
import { DEFAULT_MODE_ID } from "./modes.js";
import { drawForState, pickPlayer, skip, getEligibleOpenSlotsForCandidate, GameError } from "./game.js";
import { getAvailableYears } from "./draft.js";
import { getSlotDef } from "./roster.js";
import { getAllTeamShortNames, getTeamShortName, getTeamName, getTeamAccentColor } from "./teams.js";
import { moveUp, moveDown } from "./battingOrder.js";
import { runRouletteAnimation, prefersReducedMotion } from "./ui/animations.js";
import { renderTopScreen } from "./ui/topScreen.js";
import { renderGameScreen } from "./ui/gameScreen.js";
import { renderResultScreen } from "./ui/resultScreen.js";
import { renderMyTeamsScreen } from "./ui/myTeamsScreen.js";
import { announce } from "./utils/dom.js";
import { hexToRgba, lighten, DEFAULT_ACCENT } from "./utils/color.js";
import { loadGameData } from "./dataStore.js";
import * as storage from "./storage.js";

function defaultUiState() {
  return {
    rouletteAnimating: false,
    expandedCandidateId: null,
    slotPickerPlayerId: null,
    slotPickerStep: null,
    slotPickerChosenSlotId: null,
    historyOpen: false,
    noCandidatesStuck: false,
    autoRedrawNotice: null,
    pendingConfetti: false,
  };
}

function buildSnapshot(game) {
  return {
    modeId: game.modeId,
    roster: game.roster,
    battingOrder: game.battingOrder,
    history: game.history,
    completedAt: game.completedAt,
    skipsUsed: game.skipsUsed,
  };
}

class App {
  constructor(root) {
    this.root = root;
    this.screen = "TOP";
    this.selectedModeId = storage.loadLastMode() || DEFAULT_MODE_ID;
    this.favoriteColor = storage.loadFavoriteColor() || DEFAULT_ACCENT;
    this.game = null;
    this.viewingTeam = null;
    this.viewingTeamIndex = null;
    this.ui = defaultUiState();
    this._stopRoulette = null;
    this.init();
  }

  init() {
    let saved = null;
    try {
      saved = storage.loadCurrentGame();
    } catch (err) {
      console.warn("[app] 保存データの復元に失敗しました", err);
    }

    if (saved && saved.status === "playing") {
      this.game = saved;
      this.selectedModeId = saved.modeId;
      this.screen = "GAME";
      if (!this.game.currentDraft) {
        const result = drawForState(this.game);
        this.ui.noCandidatesStuck = !result.ok;
        storage.saveCurrentGame(this.game);
      }
    }
    this.render();
  }

  setScreen(screen) {
    if (this._stopRoulette) {
      this._stopRoulette();
      this._stopRoulette = null;
    }
    this.screen = screen;
    this.render();
  }

  /**
   * プレイ中のロスターを破棄してTOPへ戻る。
   * ページ再読み込み時は進行中のゲームを自動再開する仕様のため、
   * 「同じ抽選結果からやり直したい」場合はここで明示的に保存データを消す必要がある。
   */
  abandonGame() {
    if (this._stopRoulette) {
      this._stopRoulette();
      this._stopRoulette = null;
    }
    storage.clearCurrentGame();
    this.game = null;
    this.ui = defaultUiState();
    this.screen = "TOP";
    this.render();
  }

  startNewGame(modeId) {
    if (this._stopRoulette) {
      this._stopRoulette();
      this._stopRoulette = null;
    }
    this.selectedModeId = modeId;
    storage.saveLastMode(modeId);
    this.game = createInitialState(modeId);
    this.viewingTeam = null;
    this.viewingTeamIndex = null;
    this.ui = defaultUiState();
    this.screen = "GAME";

    const result = drawForState(this.game);
    storage.saveCurrentGame(this.game);
    if (result.ok) {
      this.runRoulette();
    } else {
      this.ui.noCandidatesStuck = true;
      this.render();
    }
  }

  runRoulette() {
    const combo = this.game.currentDraft;
    if (!combo) {
      this.render();
      return;
    }
    this.ui.rouletteAnimating = true;
    this.ui.autoRedrawNotice =
      this.game.lastAutoRedraws > 0
        ? `配置可能な選手がいなかったため自動で再抽選しました（${this.game.lastAutoRedraws}回）`
        : null;
    this.render();

    const years = getAvailableYears();
    const teamNames = getAllTeamShortNames();
    const finalTeamShortName = getTeamShortName(combo.teamId);

    this._stopRoulette = runRouletteAnimation({
      finalYear: combo.year,
      finalTeamShortName,
      years,
      teamNames,
      onTick: ({ year, team }) => {
        const yearEl = this.root.querySelector("#roulette-year");
        const teamEl = this.root.querySelector("#roulette-team");
        if (yearEl) yearEl.textContent = year;
        if (teamEl) teamEl.textContent = team;
      },
      onDone: () => {
        this._stopRoulette = null;
        this.ui.rouletteAnimating = false;
        this.render();
        announce(`${combo.year}年 ${getTeamName(combo.teamId, combo.year)} の指名候補が表示されました`);
      },
    });
  }

  selectCandidate(playerId) {
    if (this.ui.rouletteAnimating) return;
    const openSlots = getEligibleOpenSlotsForCandidate(this.game, playerId);
    if (openSlots.length === 0) return;

    const cardEl = this.root.querySelector(`.candidate-card[data-player-id="${cssEscape(playerId)}"]`);
    if (cardEl) cardEl.classList.add("selected");

    const proceed = () => {
      if (openSlots.length === 1) {
        this.chooseRosterSlot(playerId, openSlots[0]);
      } else {
        this.ui.slotPickerPlayerId = playerId;
        this.ui.slotPickerStep = "slot";
        this.ui.slotPickerChosenSlotId = null;
        this.render();
      }
    };

    if (prefersReducedMotion()) {
      proceed();
    } else {
      setTimeout(proceed, 200);
    }
  }

  /**
   * ロスター枠を選んだ後の分岐。野手（DH含む）枠なら打順を選ぶステップへ、
   * 投手枠ならそのまま確定する。打順の挿入位置が1択しかない場合
   * （まだ誰も野手を登録していない最初の1人目など）もそのまま確定する。
   */
  chooseRosterSlot(playerId, slotId) {
    this.ui.slotPickerPlayerId = playerId;
    const slotDef = getSlotDef(slotId);
    if (slotDef && slotDef.category === "fielder") {
      const draftLen = (this.game.battingOrderDraft || []).length;
      if (draftLen === 0) {
        this.confirmPick(playerId, slotId, 0);
        return;
      }
      this.ui.slotPickerChosenSlotId = slotId;
      this.ui.slotPickerStep = "battingOrder";
      this.render();
      return;
    }
    this.confirmPick(playerId, slotId);
  }

  confirmPick(playerId, slotId, battingOrderIndex) {
    try {
      pickPlayer(this.game, playerId, slotId, battingOrderIndex);
    } catch (err) {
      if (err instanceof GameError) {
        announce(err.message);
      } else {
        console.error(err);
      }
      this.render();
      return;
    }

    this.ui.slotPickerPlayerId = null;
    this.ui.slotPickerStep = null;
    this.ui.slotPickerChosenSlotId = null;
    this.ui.expandedCandidateId = null;
    this.ui.autoRedrawNotice = null;

    if (this.game.status === "complete") {
      const snapshot = buildSnapshot(this.game);
      storage.clearCurrentGame();
      storage.saveCompletedTeam(snapshot);
      this.viewingTeam = snapshot;
      this.viewingTeamIndex = 0;
      this.ui.pendingConfetti = true;
      this.game = null;
      applyAccent(this.favoriteColor);
      this.screen = "RESULT";
      this.render();
      return;
    }

    const result = drawForState(this.game);
    storage.saveCurrentGame(this.game);
    if (result.ok) {
      this.runRoulette();
    } else {
      this.ui.noCandidatesStuck = true;
      this.render();
    }
  }

  closeSlotPicker() {
    this.ui.slotPickerPlayerId = null;
    this.ui.slotPickerStep = null;
    this.ui.slotPickerChosenSlotId = null;
    this.render();
  }

  doSkip() {
    try {
      skip(this.game);
    } catch (err) {
      if (err instanceof GameError) announce(err.message);
      else console.error(err);
      return;
    }
    this.ui.autoRedrawNotice = null;
    const result = drawForState(this.game);
    storage.saveCurrentGame(this.game);
    if (result.ok) {
      this.runRoulette();
    } else {
      this.ui.noCandidatesStuck = true;
      this.render();
    }
  }

  manualRedraw() {
    this.ui.noCandidatesStuck = false;
    const result = drawForState(this.game);
    storage.saveCurrentGame(this.game);
    if (result.ok) {
      this.runRoulette();
    } else {
      this.ui.noCandidatesStuck = true;
      this.render();
    }
  }

  toggleCandidateDetail(playerId) {
    this.ui.expandedCandidateId = this.ui.expandedCandidateId === playerId ? null : playerId;
    this.render();
  }

  toggleHistory() {
    this.ui.historyOpen = !this.ui.historyOpen;
    this.render();
  }

  setFavoriteColor(hex) {
    this.favoriteColor = hex;
    storage.saveFavoriteColor(hex);
    if (this.screen !== "GAME" || !this.game || !this.game.currentDraft) {
      applyAccent(hex);
    }
  }

  viewCompletedTeam(snapshot, index) {
    if (!snapshot) return;
    this.viewingTeam = snapshot;
    this.viewingTeamIndex = index;
    this.screen = "RESULT";
    this.render();
  }

  moveBattingOrder(index, direction) {
    if (!this.viewingTeam) return;
    const order =
      direction === "up" ? moveUp(this.viewingTeam.battingOrder, index) : moveDown(this.viewingTeam.battingOrder, index);
    this.setBattingOrder(order);
  }

  setBattingOrder(newOrder) {
    if (!this.viewingTeam) return;
    this.viewingTeam.battingOrder = newOrder;
    this.persistViewingTeam();
    this.render();
  }

  persistViewingTeam() {
    if (this.viewingTeamIndex === null || this.viewingTeamIndex === undefined) return;
    const list = storage.loadCompletedTeams();
    if (list[this.viewingTeamIndex]) {
      list[this.viewingTeamIndex] = this.viewingTeam;
      storage.overwriteCompletedTeams(list);
    }
  }

  render() {
    this.root.innerHTML = "";
    switch (this.screen) {
      case "TOP":
        applyAccent(this.favoriteColor);
        renderTopScreen(this.root, this);
        break;
      case "GAME": {
        const draftTeamId = this.game && this.game.currentDraft ? this.game.currentDraft.teamId : null;
        applyAccent((draftTeamId && getTeamAccentColor(draftTeamId)) || this.favoriteColor);
        renderGameScreen(this.root, this);
        break;
      }
      case "RESULT":
        applyAccent(this.favoriteColor);
        renderResultScreen(this.root, this);
        break;
      case "MY_TEAMS":
        applyAccent(this.favoriteColor);
        renderMyTeamsScreen(this.root, this);
        break;
      default:
        renderTopScreen(this.root, this);
    }
  }
}

function cssEscape(value) {
  if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

/** 常に具体的な16進カラーを受け取り、アクセント関連のCSS変数一式に反映する。 */
function applyAccent(color) {
  const root = document.documentElement;
  const hex = color || DEFAULT_ACCENT;
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-strong", lighten(hex, 0.25));
  root.style.setProperty("--accent-soft", hexToRgba(hex, 0.16));
  root.style.setProperty("--accent-text", lighten(hex, 0.55));
}

function renderLoading(root) {
  root.innerHTML = `
    <div class="screen top-screen">
      <div class="top-logo">
        <span class="mark">BASEBALL DRAFT ROSTER GAME</span>
        <h1>DRAFT × DRAFT</h1>
        <p class="copy">データを読み込んでいます…</p>
      </div>
    </div>`;
}

function renderLoadError(root, message, onRetry) {
  root.innerHTML = `
    <div class="screen top-screen">
      <div class="top-logo">
        <span class="mark">BASEBALL DRAFT ROSTER GAME</span>
        <h1>DRAFT × DRAFT</h1>
        <p class="copy">選手データの読み込みに失敗しました。<br />${message}</p>
      </div>
      <button type="button" class="btn btn-primary" id="retry-load-btn">もう一度読み込む</button>
    </div>`;
  const btn = root.querySelector("#retry-load-btn");
  if (btn) btn.addEventListener("click", onRetry);
}

function bootstrap() {
  const rootEl = document.getElementById("app");
  renderLoading(rootEl);
  loadGameData()
    .then(() => {
      new App(rootEl);
    })
    .catch((err) => {
      console.error("[app] ゲームデータの読み込みに失敗しました", err);
      renderLoadError(rootEl, err.message || "", bootstrap);
    });
}

bootstrap();
