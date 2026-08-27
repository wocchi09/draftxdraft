/**
 * data/_raw/wiki-titles.json の選手について、Wikipedia記事の冒頭文から
 * 現役か引退かを判定して data/_raw/player-status.json に書き出す。
 *
 * 日本語版の野球選手記事は冒頭が定型で、
 *   「〜は、…のプロ野球選手」        → 現役
 *   「〜は、…の元プロ野球選手」      → 引退
 * と書き分けられている。これを利用する。判別できないものは status に入れない
 * （＝ unknown のまま据え置き）ので、推測でデータを埋めることはない。
 *
 * action=query&prop=extracts はまとめ取得だと exlimit の既定が1で
 * 1件しか本文が返らないため、REST の summary エンドポイントを1件ずつ叩く。
 * 開発環境からは ja.wikipedia.org に到達できないため Actions 上で実行する。
 */
import { readFile, writeFile } from "node:fs/promises";

const UA = "draftxdraft-data-fetch/0.1 (https://github.com/wocchi09/draftxdraft)";
const CONCURRENCY = 6;

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
  if (/プロ野球選手/.test(head)) return "active";
  return null;
}

async function lookup(title) {
  const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return { title, verdict: null, note: `HTTP ${res.status}` };
    const json = await res.json();
    return { title, verdict: classify(json.extract), note: null };
  } catch (err) {
    return { title, verdict: null, note: String(err.message || err) };
  }
}

const status = {};
let active = 0;
let retired = 0;
let unclear = 0;
const notes = new Map();

let cursor = 0;
async function worker() {
  while (cursor < allTitles.length) {
    const i = cursor++;
    const { title, verdict, note } = await lookup(allTitles[i]);
    const ids = byTitle.get(title) ?? [];
    if (verdict) {
      for (const id of ids) status[id] = verdict;
      if (verdict === "active") active += ids.length;
      else retired += ids.length;
    } else {
      unclear += ids.length;
      if (note) notes.set(note, (notes.get(note) ?? 0) + 1);
    }
    if (i % 200 === 0) console.log(`  ${i}/${allTitles.length} 件`);
    await new Promise((r) => setTimeout(r, 120));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

await writeFile("data/_raw/player-status.json", JSON.stringify(status, null, 2) + "\n", "utf8");
console.log(`\n現役: ${active} / 引退: ${retired} / 判別できず: ${unclear}`);
if (notes.size > 0) console.log("判別できなかった理由:", Object.fromEntries(notes));
