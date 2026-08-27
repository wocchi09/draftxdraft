/**
 * data/_raw/wiki-titles.json の選手について、Wikipedia記事の冒頭文と
 * カテゴリを data/_raw/player-intros.json に保存する。
 *
 * ここでは判定を一切せず、素材を持ち帰るだけにしている。
 * 現役/引退の判定規則は data/_raw/player-intros.json を入力にして
 * tools/classify-status.mjs がローカルで行うので、規則を直すたびに
 * Wikipediaを叩き直さずに済む。
 *
 * RESTのsummaryを1件ずつ叩くとレート制限（429）に阻まれるため、
 * action=query の extracts をまとめ取りする。exlimit は既定が1なので必ず指定する。
 * 開発環境からは ja.wikipedia.org に到達できないため Actions 上で実行する。
 */
import { readFile, writeFile } from "node:fs/promises";

const UA = "draftxdraft-data-fetch/0.2 (https://github.com/wocchi09/draftxdraft)";
const BATCH = 20; // extracts のまとめ取得上限
const PAUSE_MS = 600;
const OUT = "data/_raw/player-intros.json";

const titles = JSON.parse(await readFile("data/_raw/wiki-titles.json", "utf8"));
const allTitles = [...new Set(Object.values(titles))];
console.log(`対象記事: ${allTitles.length} 件`);

// 途中で落ちても続きから再開できるよう、既存の結果は読んで引き継ぐ
let out = {};
try {
  out = JSON.parse(await readFile(OUT, "utf8"));
  console.log(`既に取得済み: ${Object.keys(out).length} 件`);
} catch {
  /* 初回は無くて当然 */
}

async function getJson(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = 2000 * 2 ** attempt;
      console.log(`  HTTP ${res.status} — ${wait}ms待って再試行`);
      await new Promise((r) => setTimeout(r, wait));
      return getJson(url, attempt + 1);
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (attempt >= 5) return null;
    const wait = 2000 * 2 ** attempt;
    console.log(`  通信エラー (${err.message}) — ${wait}ms待って再試行`);
    await new Promise((r) => setTimeout(r, wait));
    return getJson(url, attempt + 1);
  }
}

const todo = allTitles.filter((t) => !out[t]);
console.log(`これから取得: ${todo.length} 件`);

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=extracts|categories&exintro=1&explaintext=1&exlimit=20&cllimit=max&redirects=1" +
    `&titles=${encodeURIComponent(batch.join("|"))}`;

  const json = await getJson(url);
  // リダイレクトで別名に解決された場合、元の記事名でも引けるようにしておく
  const alias = new Map();
  for (const r of json?.query?.redirects || []) alias.set(r.to, r.from);
  for (const n of json?.query?.normalized || []) alias.set(n.to, n.from);

  for (const page of json?.query?.pages || []) {
    if (page.missing) continue;
    const record = {
      intro: (page.extract || "").slice(0, 300),
      alive: (page.categories || []).some((c) => c.title === "Category:存命人物"),
    };
    out[page.title] = record;
    const from = alias.get(page.title);
    if (from) out[from] = record;
  }

  if (i % (BATCH * 20) === 0) {
    await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log(`  ${i + batch.length}/${todo.length} 件`);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
const got = allTitles.filter((t) => out[t]).length;
console.log(`\n冒頭文を取得できた記事: ${got} / ${allTitles.length}`);
