/**
 * localStorage永続化。
 * 破損データやJSON解析失敗があってもゲームを止めないよう、
 * 全ての読み込みをtry/catchで包み、失敗時は安全なデフォルトへフォールバックする。
 */

const KEYS = {
  currentGame: "ddxd:currentGame",
  completedTeams: "ddxd:completedTeams",
  lastMode: "ddxd:lastMode",
  favoriteColor: "ddxd:favoriteColor",
  theme: "ddxd:theme",
  yearRange: "ddxd:yearRange",
};

function safeGet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] ${key} の読み込みに失敗したため無視します`, err);
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[storage] ${key} の保存に失敗しました`, err);
    return false;
  }
}

export function saveCurrentGame(state) {
  return safeSet(KEYS.currentGame, state);
}

export function loadCurrentGame() {
  const data = safeGet(KEYS.currentGame);
  if (!data || typeof data !== "object" || !data.roster) return null;
  return data;
}

export function clearCurrentGame() {
  try {
    window.localStorage.removeItem(KEYS.currentGame);
  } catch {
    /* ignore */
  }
}

export function loadCompletedTeams() {
  const data = safeGet(KEYS.completedTeams);
  return Array.isArray(data) ? data : [];
}

export function saveCompletedTeam(snapshot) {
  const list = loadCompletedTeams();
  list.unshift(snapshot);
  return safeSet(KEYS.completedTeams, list);
}

export function overwriteCompletedTeams(list) {
  return safeSet(KEYS.completedTeams, list);
}

export function saveLastMode(modeId) {
  return safeSet(KEYS.lastMode, modeId);
}

export function loadLastMode() {
  const data = safeGet(KEYS.lastMode);
  return typeof data === "string" ? data : null;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function saveFavoriteColor(hex) {
  if (typeof hex !== "string" || !HEX_COLOR_RE.test(hex)) return false;
  return safeSet(KEYS.favoriteColor, hex);
}

export function loadFavoriteColor() {
  const data = safeGet(KEYS.favoriteColor);
  return typeof data === "string" && HEX_COLOR_RE.test(data) ? data : null;
}

/** 表示テーマ: "system"（端末の設定に追従） | "light" | "dark" */
export const THEMES = ["system", "light", "dark"];
export const DEFAULT_THEME = "system";

export function saveTheme(theme) {
  if (!THEMES.includes(theme)) return false;
  return safeSet(KEYS.theme, theme);
}

export function loadTheme() {
  const data = safeGet(KEYS.theme);
  return THEMES.includes(data) ? data : DEFAULT_THEME;
}

/**
 * 抽選する年度の範囲。値の妥当性（収録年度の中に収まっているか等）は
 * yearRange.js 側で整えるので、ここでは形だけを見る。
 */
export function saveYearRange(range) {
  if (!range || !Number.isFinite(range.from) || !Number.isFinite(range.to)) return false;
  return safeSet(KEYS.yearRange, { from: range.from, to: range.to });
}

export function loadYearRange() {
  const data = safeGet(KEYS.yearRange);
  if (!data || typeof data !== "object") return null;
  return { from: Number(data.from), to: Number(data.to) };
}

export function clearFavoriteColor() {
  try {
    window.localStorage.removeItem(KEYS.favoriteColor);
  } catch {
    /* ignore */
  }
}
