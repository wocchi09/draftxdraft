/**
 * localStorage永続化。
 * 破損データやJSON解析失敗があってもゲームを止めないよう、
 * 全ての読み込みをtry/catchで包み、失敗時は安全なデフォルトへフォールバックする。
 */

const KEYS = {
  currentGame: "ddxd:currentGame",
  completedTeams: "ddxd:completedTeams",
  lastMode: "ddxd:lastMode",
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
