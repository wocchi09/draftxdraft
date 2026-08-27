/**
 * 指定した記事の冒頭文とカテゴリを data/_raw/debug-intros.json に書き出す。
 * 在籍状況の判定がなぜ外れたのかを、実際の本文を見て確かめるための道具。
 *
 *   node tools/dump-intros.mjs "星野仙一" "門田博光"
 *
 * 引数を省略すると data/_raw/debug-titles.json（記事名の配列）を読む。
 */
import { readFile, writeFile } from "node:fs/promises";

const UA = "draftxdraft-data-fetch/0.2 (https://github.com/wocchi09/draftxdraft)";
let titles = process.argv.slice(2);
if (titles.length === 0) {
  titles = JSON.parse(await readFile("data/_raw/debug-titles.json", "utf8"));
}

const out = {};
for (let i = 0; i < titles.length; i += 20) {
  const batch = titles.slice(i, i + 20);
  const url =
    "https://ja.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
    "&prop=extracts|categories&exintro=1&explaintext=1&exlimit=20&cllimit=max&redirects=1" +
    `&titles=${encodeURIComponent(batch.join("|"))}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const json = await res.json();
  for (const page of json?.query?.pages || []) {
    out[page.title] = {
      intro: (page.extract || "").slice(0, 200),
      categories: (page.categories || []).map((c) => c.title),
    };
  }
  await new Promise((r) => setTimeout(r, 700));
}

await writeFile("data/_raw/debug-intros.json", JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${Object.keys(out).length} 件を書き出した`);
