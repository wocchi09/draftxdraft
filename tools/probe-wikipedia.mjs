/**
 * Wikipediaのドラフト年度ページを取得して構造を確認するための調査用スクリプト。
 * この開発環境からは ja.wikipedia.org へ到達できないため、
 * GitHub Actions のランナー上で実行してログから中身を確認する。
 */
const YEAR = process.argv[2] || "2024";
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
console.log("ページ:", json.parse.title);
console.log("wikitext 全体の文字数:", text.length);
console.log("=== 先頭 3000 文字 ===");
console.log(text.slice(0, 3000));
console.log("=== 「阪神」を含む行（最大40行）===");
console.log(text.split("\n").filter((l) => l.includes("阪神")).slice(0, 40).join("\n"));
