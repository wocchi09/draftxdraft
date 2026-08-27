/**
 * data/_raw/YYYY.wikitext を解析して data/drafts.json / data/players.json を更新する。
 *
 * Wikipediaの「YYYY年度新人選手選択会議」ページは球団ごとに
 *   === 球団名 ===
 *   {| class="wikitable"
 *   !colspan="5"|新人選手選択会議      ← 以降は支配下
 *   !順位!!選手名!!守備!!所属!!結果
 *   !1位
 *   |[[選手名]]||投手||[[所属|表示名]]||入団
 *   ...
 *   !colspan="5"|育成選手選択会議      ← 以降は育成
 * という構造を持つ。年度によって colspan の値（5/7）や前後の空白が揺れる。
 *
 * 既存の選手レコード（調査済みの activeStatus / titles などを持つ）は
 * 名前・年度・球団が一致すれば温存し、上書きしない。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

const TEAM_IDS = {
  "読売ジャイアンツ": "giants",
  "阪神タイガース": "tigers",
  "中日ドラゴンズ": "dragons",
  "横浜DeNAベイスターズ": "baystars",
  "広島東洋カープ": "carp",
  "東京ヤクルトスワローズ": "swallows",
  "福岡ソフトバンクホークス": "hawks",
  "北海道日本ハムファイターズ": "fighters",
  "千葉ロッテマリーンズ": "marines",
  "埼玉西武ライオンズ": "seibu",
  "オリックス・バファローズ": "orix",
  "東北楽天ゴールデンイーグルス": "rakuten",
};

/** 所属先が独立リーグかどうかの判定に使う語 */
const INDEPENDENT_LEAGUE = [
  "インディゴソックス", "ファイティングドッグス", "ミリオンスターズ", "サンダーバーズ",
  "ヒートベアーズ", "ハヤテベンチャーズ", "アルビレックス", "グランセローズ",
  "ダイヤモンドペガサス", "ミラクルエレファンツ", "ブレイバーズ", "マンダリンパイレーツ",
  "オリーブガイナーズ", "ホープス", "ゴールデンブレーブス", "アストロプラネッツ",
  "フューチャードリームス", "サラマンダーズ", "B-リングス", "ウイングス",
];

const LINK_PIPED = /\[\[([^\]|]+)\|([^\]]+)\]\]/;
const LINK_BARE = /\[\[([^\]]+)\]\]/;

/** リンクや装飾を落として素のテキストにする */
function plain(wiki) {
  return wiki
    .replace(/'''?/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(LINK_PIPED, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .trim();
}

/**
 * 名前セルから「表示名」と「Wikipedia記事名」を取り出す。
 * 記事名は後段で在籍状況を引くのに使うので、表示名とは別に持っておく。
 */
function nameAndTitle(cell) {
  const stripped = cell.replace(/'''?/g, "").trim();
  const piped = LINK_PIPED.exec(stripped);
  if (piped) return { name: plain(piped[2]), title: piped[1].trim() };
  const bare = LINK_BARE.exec(stripped);
  if (bare) return { name: plain(bare[1]), title: bare[1].trim() };
  return { name: plain(stripped), title: null };
}

function originTypeOf(school) {
  if (/高等学校|高校|高$|学園高|実業高/.test(school)) return "高校";
  if (/大学|大$|短大/.test(school)) return "大学";
  if (INDEPENDENT_LEAGUE.some((w) => school.includes(w))) return "独立リーグ";
  return "社会人";
}

/** 1球団ぶんのセクション本文から指名を取り出す */
function parseTeamSection(body) {
  const picks = [];
  let type = null; // "regular" | "development"
  let rank = null;

  for (const raw of body.split("\n")) {
    const line = raw.trim();

    if (/^!\s*colspan\s*=\s*"\d+"\s*\|/.test(line)) {
      const label = plain(line.replace(/^!\s*colspan\s*=\s*"\d+"\s*\|/, ""));
      if (label.startsWith("新人選手選択会議")) type = "regular";
      else if (label.startsWith("育成選手選択会議")) type = "development";
      else type = null;
      rank = null;
      continue;
    }
    if (/^!\s*順位/.test(line)) continue;

    // 順位の行（例: !1位 / !希望入団枠）
    if (line.startsWith("!") && !line.includes("!!")) {
      rank = plain(line.slice(1));
      continue;
    }
    // データ行（例: |[[名前]]||投手||[[所属]]||入団）
    if (type && rank && line.startsWith("|") && line.includes("||")) {
      const cells = line.slice(1).split("||");
      const { name, title } = nameAndTitle(cells[0] || "");
      const position = plain(cells[1] || "");
      const school = plain(cells[2] || "");
      const result = plain(cells[3] || "");
      rank = null;
      if (!name || !position) continue;
      if (result && result !== "入団") continue; // 拒否などは除く
      picks.push({
        name,
        wikiTitle: title,
        round: type === "development" ? `育成${rank}` : rank,
        type,
        position,
        school,
      });
    }
  }
  return picks;
}

function parseYear(year, text) {
  const entries = [];
  for (const [teamName, teamId] of Object.entries(TEAM_IDS)) {
    const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`^===\\s*${escaped}\\s*===\\s*$`, "m").exec(text);
    if (!m) continue;
    const bodyStart = m.index + m[0].length;
    const rel = text.slice(bodyStart).search(/^={2,}[^=]/m);
    const body = text.slice(bodyStart, rel < 0 ? undefined : bodyStart + rel);
    const picks = parseTeamSection(body);
    if (picks.length > 0) entries.push({ year: Number(year), teamId, picks });
  }
  return entries;
}

// ---- 実行 ----
const files = (await readdir("data/_raw")).filter((f) => /^\d{4}\.wikitext$/.test(f)).sort();
const parsed = [];
for (const f of files) {
  const year = f.replace(".wikitext", "");
  const entries = parseYear(year, await readFile(`data/_raw/${f}`, "utf8"));
  parsed.push(...entries);
  const n = entries.reduce((s, e) => s + e.picks.length, 0);
  console.log(`${year}: ${entries.length}球団 / ${n}人`);
}

const players = JSON.parse(await readFile("data/players.json", "utf8"));
const drafts = JSON.parse(await readFile("data/drafts.json", "utf8"));

// 既存レコードは「名前+年度+球団」で引く（調査済みの値を温存するため）
const byKey = new Map(players.map((p) => [`${p.name}|${p.draftYear}|${p.draftTeamId}`, p]));
const usedIds = new Set(players.map((p) => p.id));

let reused = 0;
let created = 0;
const wikiTitles = {};
const newDraftEntries = [];

for (const entry of parsed) {
  const picks = [];
  for (const pick of entry.picks) {
    const key = `${pick.name}|${entry.year}|${entry.teamId}`;
    let player = byKey.get(key);
    if (player) {
      reused++;
    } else {
      let id = `wp_${entry.year}_${entry.teamId}_${picks.length + 1}`;
      while (usedIds.has(id)) id += "x";
      usedIds.add(id);
      player = {
        id,
        name: pick.name,
        throws: null,
        bats: null,
        draftYear: entry.year,
        draftTeamId: entry.teamId,
        draftRound: pick.round,
        draftType: pick.type === "development" ? "育成" : "支配下",
        amateurTeam: pick.school,
        originType: originTypeOf(pick.school),
        draftPosition: pick.position,
        pitcherRoles: [],
        fieldingPositions: [],
        canDH: pick.position !== "投手",
        isTwoWay: false,
        activeStatus: "unknown",
        titles: [],
        awards: [],
      };
      players.push(player);
      byKey.set(key, player);
      created++;
    }
    if (pick.wikiTitle) wikiTitles[player.id] = pick.wikiTitle;
    picks.push({ playerId: player.id, round: pick.round, type: pick.type });
  }
  newDraftEntries.push({ year: entry.year, teamId: entry.teamId, picks });
}

// パースできた年度×球団は差し替え、それ以外の既存エントリは残す
const replaced = new Set(newDraftEntries.map((e) => `${e.year}|${e.teamId}`));
const merged = drafts.filter((e) => !replaced.has(`${e.year}|${e.teamId}`)).concat(newDraftEntries);

await writeFile("data/drafts.json", JSON.stringify(merged, null, 2) + "\n", "utf8");
await writeFile("data/players.json", JSON.stringify(players, null, 2) + "\n", "utf8");
// 在籍状況を引くための「選手ID → Wikipedia記事名」対応表
await writeFile("data/_raw/wiki-titles.json", JSON.stringify(wikiTitles, null, 2) + "\n", "utf8");

console.log(`\n既存レコードを再利用: ${reused}人 / 新規作成: ${created}人`);
console.log(`抽選プール: ${merged.length} 通り / 総選手数: ${players.length}`);
console.log(`Wikipedia記事名が取れた選手: ${Object.keys(wikiTitles).length}人`);
