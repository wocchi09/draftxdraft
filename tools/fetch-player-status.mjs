/**
 * data/_raw/wiki-titles.json の選手について、Wikipedia記事の冒頭文から
 * 現役か引退かを判定して data/_raw/player-status.json に書き出す。
 *
 * 日本語版の野球選手記事は冒頭が定型で、
 *   「〜は、…のプロ野球選手」        → 現役
 *   「〜は、…の元プロ野球選手」      → 引退
 * と書き分けられている。これを利用する。判別できないものは出力に含めないので、
 * 該当選手は unknown のまま据え置かれ、推測でデータが埋まることはない。
 *
 * RESTのsummaryを1件ずつ叩くとレート制限（429）に阻まれるため、
 * action=query の extracts をまとめ取りする。exlimit は既定が1なので必ず指定する。
 * 開発環境からは ja.wikipedia.org に到達できないため Actions 上で実行する。
 */
import { readFile, writeFile } from "node:fs/promises";

const UA = "draftxdraft-data-fetch/0.1 (https://github.com/wocchi09/draftxdraft)";
const BATCH = 20; // extracts のまとめ取得上限
const PAUSE_MS = 700;

const titles = JSON.parse(await readFile("data/_raw/wiki-titles.json", "utf8"));
const byTitle = new Map();
for (const [playerId, title] of Object.entries(titles)) {
  if (!byTitle.has(title)) byTitle.set(title, []);
  byTitle.get(title).push(playerId);
}
const allTitles = [...byTitle.keys()];
console.log(`対象記事: ${allTitles.length} 件`);

/** 記事の冒頭文から現役/引退を判定する。判別できなければ null。 */
function classify(intro) {
  if (!intro) return null;
  const head = intro.slice(0, 400);
  if (/元プロ野球選手/.test(head)) return "retired";
  // 物故者は「（1940年1月1日 - 2005年5月5日）」のように没年月日が入る。
  // 稀に「元」が付かない記事があるため、生没年の形からも引退と判定する。
  if (/\d{4}年\d{1,2}月\d{1,2}日\s*[-–—]\s*\d{4}年\d{1,2}月\d{1,2}日/.test(head)) return "retired";
  if (/プロ野球選手/.test(head)) return "active";
  return null;
}

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 && attempt < 5) {
    const wait = 2000 * 2 ** attempt;
    console.log(`  429を受けたので ${wait}ms 待って再試行`);
    await new Promise((r) => setTimeout(r, wait));
    return getJson(url, attempt + 1);
  }
  if (!res.ok) return { __httpError: res.status };
  return res.json();
}

const status = {};
let active = 0;
let retired = 0;
let unclear = 0;
const notes = new Map();

for (let i = 0; i < allTitles.length; i += BATCH) {
  const batch = allTitles.slice(i, i + BATCH);
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
    `&prop=extracts&exintro=1&explaintext=1&exlimit=${BATCH}&redirects=1` +
    `&titles=${encodeURIComponent(batch.join("|"))}`;

  const json = await getJson(url);
  if (json.__httpError) {
    notes.set(`HTTP ${json.__httpError}`, (notes.get(`HTTP ${json.__httpError}`) ?? 0) + batch.length);
    unclear += batch.reduce((s, t) => s + (byTitle.get(t)?.length ?? 0), 0);
    continue;
  }

  // リダイレクト・正規化された場合は元のタイトルへ戻す
  const alias = new Map();
  for (const n of json.query?.normalized ?? []) alias.set(n.to, n.from);
  for (const r of json.query?.redirects ?? []) alias.set(r.to, r.from);

  for (const page of json.query?.pages ?? []) {
    const original = alias.get(page.title) ?? page.title;
    const ids = byTitle.get(original) ?? byTitle.get(page.title) ?? [];
    const verdict = page.missing ? null : classify(page.extract);
    if (verdict) {
      for (const id of ids) status[id] = verdict;
      if (verdict === "active") active += ids.length;
      else retired += ids.length;
    } else {
      unclear += ids.length;
      if (page.missing) notes.set("記事なし", (notes.get("記事なし") ?? 0) + ids.length);
      else notes.set("冒頭文から判別不能", (notes.get("冒頭文から判別不能") ?? 0) + ids.length);
    }
  }

  if ((i / BATCH) % 10 === 0) console.log(`  ${i + batch.length}/${allTitles.length} 件`);
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

await writeFile("data/_raw/player-status.json", JSON.stringify(status, null, 2) + "\n", "utf8");
console.log(`\n現役: ${active} / 引退: ${retired} / 判別できず: ${unclear}`);
if (notes.size > 0) console.log("判別できなかった内訳:", Object.fromEntries(notes));
