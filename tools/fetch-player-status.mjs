/**
 * data/_raw/wiki-titles.json の選手について、Wikipedia記事の冒頭文から
 * 現役か引退かを判定して data/_raw/player-status.json に書き出す。
 *
 * 日本語版の野球選手記事は冒頭が定型で、
 *   「〜は、…のプロ野球選手」        → 現役
 *   「〜は、…の元プロ野球選手」      → 引退
 * と書き分けられている。これを利用する。判別できないものは触らない。
 *
 * 開発環境からは ja.wikipedia.org に到達できないため Actions 上で実行する。
 */
import { readFile, writeFile } from "node:fs/promises";

const titles = JSON.parse(await readFile("data/_raw/wiki-titles.json", "utf8"));
const byTitle = new Map();
for (const [playerId, title] of Object.entries(titles)) {
  if (!byTitle.has(title)) byTitle.set(title, []);
  byTitle.get(title).push(playerId);
}
const allTitles = [...byTitle.keys()];
console.log(`対象記事: ${allTitles.length} 件`);

const status = {};
let active = 0;
let retired = 0;
let unclear = 0;

// extracts API はまとめて最大20件まで取れる
const BATCH = 20;
for (let i = 0; i < allTitles.length; i += BATCH) {
  const batch = allTitles.slice(i, i + BATCH);
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=extracts&exintro=1&explaintext=1&redirects=1" +
    `&titles=${encodeURIComponent(batch.join("|"))}`;

  const res = await fetch(url, { headers: { "User-Agent": "draftxdraft-data-fetch/0.1" } });
  if (!res.ok) {
    console.error(`HTTP ${res.status} (batch ${i})`);
    continue;
  }
  const json = await res.json();

  // リダイレクトされた場合は元のタイトルへ戻す
  const alias = new Map();
  for (const r of json.query?.redirects ?? []) alias.set(r.to, r.from);
  for (const n of json.query?.normalized ?? []) alias.set(n.to, n.from);

  for (const page of json.query?.pages ?? []) {
    const original = alias.get(page.title) ?? page.title;
    const ids = byTitle.get(original) ?? byTitle.get(page.title);
    if (!ids || page.missing) { unclear += ids?.length ?? 0; continue; }

    const intro = (page.extract || "").slice(0, 400);
    let verdict = null;
    if (/元プロ野球選手/.test(intro)) verdict = "retired";
    else if (/プロ野球選手/.test(intro)) verdict = "active";

    for (const id of ids) {
      if (verdict) {
        status[id] = verdict;
        if (verdict === "active") active++;
        else retired++;
      } else {
        unclear++;
      }
    }
  }
  await new Promise((r) => setTimeout(r, 300));
  if ((i / BATCH) % 10 === 0) console.log(`  ${i + batch.length}/${allTitles.length} 件処理`);
}

await writeFile("data/_raw/player-status.json", JSON.stringify(status, null, 2) + "\n", "utf8");
console.log(`\n現役: ${active} / 引退: ${retired} / 判別不能: ${unclear}`);
