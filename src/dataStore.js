/**
 * ゲームデータ（teams / players / drafts / achievements）の読み込み。
 *
 * ビルドツールに依存させず、どんな静的ホスティングでもそのまま動くように
 * `fetch` でJSONを読み込む。失敗してもアプリ全体を落とさず、
 * 呼び出し側（main.js）でエラー画面を出せるよう例外を投げる。
 */

const DATA_BASE = new URL("../data/", import.meta.url);

let cache = null;
let loadingPromise = null;

async function fetchJson(fileName) {
  const url = new URL(fileName, DATA_BASE);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`${fileName} の読み込みに失敗しました（ネットワークエラー）`);
  }
  if (!res.ok) {
    throw new Error(`${fileName} の読み込みに失敗しました（HTTP ${res.status}）`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`${fileName} の解析に失敗しました（JSON不正）`);
  }
}

/** アプリ起動時に一度だけ呼ぶ。2回目以降はキャッシュを返す。 */
export function loadGameData() {
  if (cache) return Promise.resolve(cache);
  if (loadingPromise) return loadingPromise;

  loadingPromise = Promise.all([
    fetchJson("teams.json"),
    fetchJson("players.json"),
    fetchJson("drafts.json"),
    fetchJson("achievements.json"),
  ])
    .then(([teams, players, drafts, achievements]) => {
      cache = { teams, players, drafts, achievements };
      return cache;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export function getGameData() {
  if (!cache) {
    throw new Error("ゲームデータがまだ読み込まれていません");
  }
  return cache;
}

export function isDataLoaded() {
  return cache !== null;
}
