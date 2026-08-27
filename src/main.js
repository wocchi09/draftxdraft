import {
  createInitialState,
  getSkipsRemaining,
  getFilledCount,
  normalizeBattingOrderDraft,
} from "./state.js";
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
import { hexToRgba, lighten, darken, readableTextOn, DEFAULT_ACCENT } from "./utils/color.js";
import { loadGameData } from "./dataStore.js";
import * as storage from "./storage.js";
import { normalizeYearRange } from "./yearRange.js";

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
    this.theme = storage.loadTheme();
    this.yearRange = storage.loadYearRange();
    applyTheme(this.theme);
    this.game = null;
    this.viewingTeam = null;
    this.viewingTeamIndex = null;
    this.ui = defaultUiState();
    this._stopRoulette = null;
    this.watchSystemTheme();
    this.init();
  }

  /**
   * テーマが "system" のとき、端末側の設定変更に追従して
   * アクセント色（明暗が反転する）を計算し直す。
   */
  watchSystemTheme() {
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      if (this.theme !== "system") return;
      applyAccent(this.favoriteColor);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /** TOP画面で選んだ、抽選する年度の範囲を覚えておく */
  setYearRange(range) {
    this.yearRange = normalizeYearRange(range);
    storage.saveYearRange(this.yearRange);
    this.render();
  }

  setTheme(theme) {
    this.theme = theme;
    storage.saveTheme(theme);
    applyTheme(theme);
    // テーマによって --accent-text 等の明暗が変わるので必ず計算し直す
    applyAccent(this.favoriteColor);
    this.render();
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
      // 旧仕様（可変長の打順配列）で保存されたゲームも9枠形式へ揃えてから再開する
      this.game.battingOrderDraft = normalizeBattingOrderDraft(this.game.battingOrderDraft);
      this.selectedModeId = saved.modeId;
      // 範囲を持たない古い保存データは全期間として再開する
      this.game.yearRange = normalizeYearRange(this.game.yearRange);
      this.yearRange = this.game.yearRange;
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
    this.game = createInitialState(modeId, this.yearRange);
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

    // ルーレットに流す年度は、選んだ範囲の中だけにする
    const range = normalizeYearRange(this.game.yearRange);
    const years = getAvailableYears().filter((y) => y >= range.from && y <= range.to);
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
   * ロスター枠を選んだ後の分岐。野手（DH含む）枠なら続けて打順を選ぶ
   * ステップへ進む（1人目でも「1番」を明示的に選んでもらう）。
   * 投手枠は打順に関係ないためそのまま確定する。
   */
  chooseRosterSlot(playerId, slotId) {
    this.ui.slotPickerPlayerId = playerId;
    const slotDef = getSlotDef(slotId);
    if (slotDef && slotDef.category === "fielder") {
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
/**
 * 表示テーマを html 要素へ反映する。
 * "system" のときは data-theme を外し、CSS側の prefers-color-scheme に委ねる。
 */
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

/** 現在描画されているテーマが実際にダークかどうか */
function isDarkTheme() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

/**
 * アクセントカラーを反映する。
 * --accent-text はアクセントを薄く敷いた面の上に載る文字色なので、
 * ダークでは明るく、ライトでは暗くふる必要がある。
 */
function applyAccent(color) {
  const root = document.documentElement;
  const hex = color || DEFAULT_ACCENT;
  const dark = isDarkTheme();
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-strong", dark ? lighten(hex, 0.25) : darken(hex, 0.18));
  root.style.setProperty("--accent-soft", hexToRgba(hex, dark ? 0.16 : 0.12));
  root.style.setProperty("--accent-text", dark ? lighten(hex, 0.55) : darken(hex, 0.35));
  // アクセント面（PRIMARYボタン）に載る文字色。アクセントはユーザーが自由に
  // 選べるため、固定色ではなく背景の輝度から都度決める。
  root.style.setProperty("--accent-on", readableTextOn(hex, dark ? 0 : 0.18));
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
