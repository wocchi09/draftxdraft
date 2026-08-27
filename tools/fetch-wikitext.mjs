/**
 * Wikipediaから各年度のドラフト会議記事のwikitextを取得し、
 * data/_raw/YYYY.wikitext に保存する。
 *
 * 開発環境からは ja.wikipedia.org へ到達できないため、これは
 * GitHub Actions のランナー上で実行し、結果をリポジトリへコミットして持ち帰る。
 * 生のwikitextを取ってきてしまえば、パーサの開発はローカルで完結できる。
 *
 *   node tools/fetch-wikitext.mjs 2024 2023        # 個別指定
 *   node tools/fetch-wikitext.mjs 1965-1980        # 範囲指定
 *
 * 記事名は年度によって揺れる（古い年度ほど別名やリダイレクトがある）ため、
 * 候補をいくつか試し、それでも見つからなければ検索APIで探す。
 * 実際に取れた記事名は data/_raw/source-titles.json に残す。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const API = "https://ja.wikipedia.org/w/api.php";
const UA = "draftxdraft-data-fetch/0.2 (https://github.com/wocchi09/draftxdraft)";

/** "1965-1970" のような範囲表記を展開する */
function expandYears(args) {
  const years = [];
  for (const arg of args) {
    const range = /^(\d{4})-(\d{4})$/.exec(arg);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      for (let y = Math.min(from, to); y <= Math.max(from, to); y++) years.push(String(y));
    } else if (/^\d{4}$/.test(arg)) {
      years.push(arg);
    } else {
      console.error(`年度として解釈できない引数を無視: ${arg}`);
    }
  }
  return [...new Set(years)];
}

/** 一時的な失敗（ネットワーク・5xx・429）は指数バックオフで粘る */
async function getJson(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  let wait = 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        console.error(`  HTTP ${res.status} — ${wait}ms待って再試行`);
      } else {
        return await res.json();
      }
    } catch (err) {
      console.error(`  通信エラー (${err.message}) — ${wait}ms待って再試行`);
    }
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
  return null;
}

function candidateTitles(year) {
  return [
    `${year}年度新人選手選択会議 (日本プロ野球)`,
    `${year}年度新人選手選択会議`,
    `${year}年のプロ野球ドラフト会議`,
    `${year}年度プロ野球ドラフト会議`,
  ];
}

/** 候補の記事名を順に試し、ダメなら検索APIで探す */
async function fetchYear(year) {
  for (const title of candidateTitles(year)) {
    const json = await getJson({ action: "parse", prop: "wikitext", redirects: "1", page: title });
    if (json && !json.error && json.parse) {
      return { title: json.parse.title, wikitext: json.parse.wikitext };
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.error(`  ${year}: 既知の記事名では見つからず、検索にフォールバック`);
  const search = await getJson({
    action: "query",
    list: "search",
    srsearch: `${year}年度 新人選手選択会議 プロ野球`,
    srlimit: "5",
  });
  for (const hit of search?.query?.search || []) {
    if (!hit.title.includes(String(year))) continue;
    const json = await getJson({ action: "parse", prop: "wikitext", redirects: "1", page: hit.title });
    if (json && !json.error && json.parse) {
      console.error(`  ${year}: 検索で "${json.parse.title}" を採用`);
      return { title: json.parse.title, wikitext: json.parse.wikitext };
    }
  }
  return null;
}

// ---- 実行 ----
const years = expandYears(process.argv.slice(2));
if (years.length === 0) {
  console.error("年度を1つ以上指定してください（例: 2024 / 1965-1980）");
  process.exit(1);
}

await mkdir("data/_raw", { recursive: true });

// 取得済みの記事名は消さずに積み増していく
let titles = {};
try {
  titles = JSON.parse(await readFile("data/_raw/source-titles.json", "utf8"));
} catch {
  /* 初回は無くて当然 */
}

const failed = [];
for (const year of years) {
  const result = await fetchYear(year);
  if (!result) {
    console.error(`${year}: 取得できず`);
    failed.push(year);
    continue;
  }
  const path = `data/_raw/${year}.wikitext`;
  await writeFile(path, result.wikitext, "utf8");
  titles[year] = result.title;
  console.log(`${year}: ${result.wikitext.length} 文字 <- ${result.title}`);

  // 途中で落ちても、そこまでの成果は残す
  await writeFile("data/_raw/source-titles.json", JSON.stringify(titles, null, 2) + "\n", "utf8");
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n取得成功: ${years.length - failed.length} 年度 / 失敗: ${failed.length} 年度`);
if (failed.length > 0) console.log(`失敗した年度: ${failed.join(" ")}`);
