/**
 * Wikipediaのドラフト年度ページを取得して構造を確認するための調査用スクリプト。
 * この開発環境からは ja.wikipedia.org へ到達できないため、
 * GitHub Actions のランナー上で実行してログから中身を確認する。
 */
const YEAR = process.argv[2] || "2024";
const TEAM = process.argv[3] || "阪神タイガース";

const title = `${YEAR}年度新人選手選択会議 (日本プロ野球)`;
const url =
  "https://ja.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2" +
  `&prop=wikitext&page=${encodeURIComponent(title)}`;

const res = await fetch(url, { headers: { "User-Agent": "draftxdraft-data-fetch/0.1" } });
console.log("HTTP", res.status);
const json = await res.json();
if (json.error) {
  console.log("APIエラー:", JSON.stringify(json.error));
  process.exit(1);
}
const text = json.parse.wikitext;
console.log("ページ:", json.parse.title, "/ 文字数:", text.length);

// 球団ごとの見出しを列挙
const headings = [...text.matchAll(/^===\s*(.+?)\s*===$/gm)].map((m) => m[1]);
console.log("=== 見出し（===レベル） ===");
console.log(headings.join(" | "));

// 指定球団のセクションを丸ごと出す（ここが指名テーブルの実体）
const start = text.indexOf(`=== ${TEAM} ===`);
if (start < 0) {
  console.log(`セクション「${TEAM}」が見つからない`);
} else {
  const rest = text.slice(start + 1);
  const nextIdx = rest.search(/^==/m);
  const section = text.slice(start, nextIdx < 0 ? undefined : start + 1 + nextIdx);
  console.log(`=== 「${TEAM}」セクション全文（${section.length}文字） ===`);
  console.log(section);
}
