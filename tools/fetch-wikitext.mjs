/**
 * Wikipediaから「YYYY年度新人選手選択会議 (日本プロ野球)」のwikitextを取得し、
 * data/_raw/YYYY.wikitext に保存する。
 *
 * 開発環境からは ja.wikipedia.org へ到達できないため、これは
 * GitHub Actions のランナー上で実行し、結果をリポジトリへコミットして持ち帰る。
 * 生のwikitextを取ってきてしまえば、パーサの開発はローカルで完結できる。
 *
 *   node tools/fetch-wikitext.mjs 2024 2023 2022
 */
import { mkdir, writeFile } from "node:fs/promises";

const years = process.argv.slice(2);
if (years.length === 0) {
  console.error("年度を1つ以上指定してください");
  process.exit(1);
}

await mkdir("data/_raw", { recursive: true });

for (const year of years) {
  const title = `${year}年度新人選手選択会議 (日本プロ野球)`;
  const url =
    "https://ja.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2" +
    `&prop=wikitext&page=${encodeURIComponent(title)}`;

  const res = await fetch(url, { headers: { "User-Agent": "draftxdraft-data-fetch/0.1" } });
  if (!res.ok) {
    console.error(`${year}: HTTP ${res.status}`);
    continue;
  }
  const json = await res.json();
  if (json.error) {
    console.error(`${year}: ${json.error.code} — ${json.error.info}`);
    continue;
  }
  const path = `data/_raw/${year}.wikitext`;
  await writeFile(path, json.parse.wikitext, "utf8");
  console.log(`${year}: ${json.parse.wikitext.length} 文字 -> ${path}`);

  // Wikipedia への負荷を抑えるため少し待つ
  await new Promise((r) => setTimeout(r, 500));
}
