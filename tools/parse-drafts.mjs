/**
 * data/_raw/YYYY.wikitext を解析して data/drafts.json / data/players.json を更新する。
 *
 * Wikipediaの「YYYY年度新人選手選択会議」ページは球団ごとの表を持つが、
 * 61年ぶんもあると書式が一様ではない。実データで確認できた揺れは以下の通り。
 *
 *   - 見出しの深さが === と ==== の両方ある（後者はリーグ見出しの下にぶら下がる）
 *   - 順位が別行（!1位 → |[[名前]]||…）の年と、行頭セル（|1位||[[名前]]||…）の年がある
 *   - 表の区分行（!colspan="5"|新人選手選択会議）が無い年がある（＝全部支配下）
 *   - 区分名が年代で変わる: 新人選手選択会議 / 支配下選手 / 第1次ドラフト /
 *     大学生・社会人ドラフト / 高校生ドラフト / 育成選手選択会議 …
 *   - セルに style="…"| などの属性が付く（指名重複などの色分け）
 *   - 列数が5とは限らない（1965年はMVP列がある）
 *   - 「（選択権なし）」の行や、入団に至らなかった行が混ざる
 *
 * 既存の選手レコード（調査済みの activeStatus / titles などを持つ）は
 * 名前・年度・球団が一致すれば温存し、上書きしない。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

/**
 * 球団名 → ID。球団名は年代で変わるので、実際に記事へ出てくる表記を全て並べる。
 * 阪急ブレーブスはオリックスの前身なので orix に寄せるが、
 * 近鉄バファローズは2004年限りで消滅した別球団なので独立させる。
 */
const TEAM_IDS = {
  読売ジャイアンツ: "giants",
  阪神タイガース: "tigers",
  中日ドラゴンズ: "dragons",
  広島カープ: "carp",
  広島東洋カープ: "carp",
  サンケイスワローズ: "swallows",
  サンケイアトムズ: "swallows",
  アトムズ: "swallows",
  ヤクルトアトムズ: "swallows",
  ヤクルトスワローズ: "swallows",
  東京ヤクルトスワローズ: "swallows",
  大洋ホエールズ: "baystars",
  横浜大洋ホエールズ: "baystars",
  横浜ベイスターズ: "baystars",
  横浜DeNAベイスターズ: "baystars",
  西鉄ライオンズ: "seibu",
  太平洋クラブライオンズ: "seibu",
  クラウンライターライオンズ: "seibu",
  西武ライオンズ: "seibu",
  埼玉西武ライオンズ: "seibu",
  南海ホークス: "hawks",
  福岡ダイエーホークス: "hawks",
  福岡ソフトバンクホークス: "hawks",
  東映フライヤーズ: "fighters",
  日拓ホームフライヤーズ: "fighters",
  日本ハムファイターズ: "fighters",
  北海道日本ハムファイターズ: "fighters",
  東京オリオンズ: "marines",
  ロッテオリオンズ: "marines",
  千葉ロッテマリーンズ: "marines",
  阪急ブレーブス: "orix",
  "オリックス・ブレーブス": "orix",
  "オリックス・ブルーウェーブ": "orix",
  "オリックス・バファローズ": "orix",
  近鉄バファローズ: "kintetsu",
  大阪近鉄バファローズ: "kintetsu",
  東北楽天ゴールデンイーグルス: "rakuten",
};

/**
 * 表の区分見出し → { type, prefix }。
 * 同じ年に複数のドラフトがあった年（1966年の第1次/第2次、2005〜2007年の
 * 高校生/大学生・社会人）は「1位」が重複するので、順位に区分名を冠する。
 * 冠する語は src/draftRound.js の DRAFT_KINDS と対応させること。
 */
const SECTION_KINDS = [
  { match: /^育成/, type: "development", prefix: "育成" },
  { match: /^大学生・社会人/, type: "regular", prefix: "大社" },
  { match: /^高校生/, type: "regular", prefix: "高校" },
  { match: /^第(\d)次/, type: "regular", prefix: (m) => `第${m[1]}次` },
  { match: /^(新人選手選択会議|支配下選手)/, type: "regular", prefix: "" },
];

/** 所属先が独立リーグかどうかの判定に使う語 */
const INDEPENDENT_LEAGUE = [
  "インディゴソックス", "ファイティングドッグス", "ミリオンスターズ", "サンダーバーズ",
  "ヒートベアーズ", "ハヤテベンチャーズ", "アルビレックス", "グランセローズ",
  "ダイヤモンドペガサス", "ミラクルエレファンツ", "ブレイバーズ", "マンダリンパイレーツ",
  "オリーブガイナーズ", "ホープス", "ゴールデンブレーブス", "アストロプラネッツ",
  "フューチャードリームス", "サラマンダーズ", "B-リングス", "ウイングス",
  "レッドウォーリアーズ", "サムライブレイヴス", "クルーズ", "ブルーサンダース",
];

/**
 * 記事によっては旧字体・異体字で書かれる（將/将、﨑/崎、惠/恵 など）。
 * 表示名はWikipediaの表記をそのまま使いつつ、既存レコードとの突き合わせだけは
 * 正規化した名前で行い、同じ選手が二重に登録されるのを防ぐ。
 */
const NAME_VARIANTS = {
  "將": "将", "﨑": "崎", "惠": "恵", "髙": "高", "濵": "浜", "邊": "辺", "邉": "辺",
  "澤": "沢", "齋": "斎", "齊": "斉", "眞": "真", "德": "徳", "曻": "昇", "槇": "槙",
  "祐": "祐", "琢": "琢", "凛": "凜", "冨": "富", "嶋": "島", "萬": "万", "廣": "広",
  "瀨": "瀬", "圡": "土", "隆": "隆", "神": "神", "礼": "礼", "頴": "穎",
};

function normalizeName(name) {
  return name
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[\u4e00-\u9fff\uf900-\ufaff]/g, (c) => NAME_VARIANTS[c] || c);
}

const LINK_PIPED = /\[\[([^\]|]+)\|([^\]]+)\]\]/;
/** セル先頭の style="…" や align="…" といった属性を落とすためのパターン */
const CELL_ATTRS = /^\s*(?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s|]+)\s*)+\|(?!\|)/;
/** 順位セルとして認められる表記（末尾の →← は指名順の向きを示す装飾） */
const RANK = /^(\d+位|\d+巡目|希望入団枠|自由獲得枠|逆指名|分離ドラフト)[→←]?$/;

/** リンクや装飾を落として素のテキストにする */
function plain(wiki) {
  return wiki
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** セル先頭の属性指定を落とす */
function cell(raw) {
  return raw.replace(CELL_ATTRS, "");
}

/**
 * 名前セルから「表示名」と「Wikipedia記事名」を取り出す。
 * 記事名は後段で在籍状況を引くのに使うので、表示名とは別に持っておく。
 */
function nameAndTitle(raw) {
  const stripped = cell(raw).replace(/'''?/g, "").trim();
  const piped = LINK_PIPED.exec(stripped);
  if (piped) return { name: plain(piped[2]), title: piped[1].trim() };
  const bare = /\[\[([^\]]+)\]\]/.exec(stripped);
  if (bare) return { name: plain(bare[1]), title: bare[1].trim() };
  return { name: plain(stripped), title: null };
}

function originTypeOf(school) {
  if (/高等学校|高校|高$|学園高|実業高|商業高|工業高|農業高/.test(school)) return "高校";
  if (/大学|大$|短大/.test(school)) return "大学";
  if (INDEPENDENT_LEAGUE.some((w) => school.includes(w))) return "独立リーグ";
  return "社会人";
}

/** 実際に入団した行かどうか（拒否・交渉権放棄などを落とす） */
function joined(result) {
  if (!result) return true; // 結果列が無い年は入団扱い
  if (result.startsWith("拒否")) return false;
  return result.includes("入団");
}

function sectionKind(label) {
  for (const kind of SECTION_KINDS) {
    const m = kind.match.exec(label);
    if (m) {
      return {
        type: kind.type,
        prefix: typeof kind.prefix === "function" ? kind.prefix(m) : kind.prefix,
      };
    }
  }
  return null;
}

/** 1球団ぶんのセクション本文から指名を取り出す */
function parseTeamSection(body) {
  const picks = [];
  // 区分行が無い年は全部が支配下ドラフト。最初からその前提で始める。
  let kind = { type: "regular", prefix: "" };
  let pendingRank = null;

  for (const raw of body.split("\n")) {
    const line = raw.trim();

    // 表が変わったら区分の状態はリセットする
    if (line.startsWith("{|")) {
      kind = { type: "regular", prefix: "" };
      pendingRank = null;
      continue;
    }

    // 区分行（例: !colspan="5"|育成選手選択会議）
    const colspan = /^!\s*colspan\s*=\s*"?\d+"?\s*\|(.*)$/.exec(line);
    if (colspan) {
      const found = sectionKind(plain(colspan[1]));
      if (found) kind = found;
      pendingRank = null;
      continue;
    }
    // ヘッダ行（例: !順位!!選手名!!守備!!所属!!結果）
    if (line.startsWith("!") && line.includes("!!")) {
      pendingRank = null;
      continue;
    }
    // 順位が独立した行になっている書式（例: !1位）
    if (line.startsWith("!")) {
      const value = plain(line.slice(1));
      pendingRank = RANK.test(value) ? value.replace(/[→←]$/, "") : null;
      continue;
    }
    if (!line.startsWith("|") || !line.includes("||")) continue;

    const cells = line.slice(1).split("||").map(cell);
    let rank = pendingRank;
    let offset = 0;
    if (!rank) {
      // 順位が行頭セルに入っている書式（例: |1位||[[名前]]||…）
      const head = plain(cells[0] || "");
      if (!RANK.test(head)) continue;
      rank = head.replace(/[→←]$/, "");
      offset = 1;
    }
    pendingRank = null;

    const { name, title } = nameAndTitle(cells[offset] || "");
    const position = plain(cells[offset + 1] || "");
    const school = plain(cells[offset + 2] || "");
    const result = plain(cells[offset + 3] || "");

    if (!name || !position) continue;
    if (name.includes("選択権") || position.includes("選択権")) continue;
    if (!joined(result)) continue;

    picks.push({
      name,
      wikiTitle: title,
      round: `${kind.prefix}${rank}`,
      type: kind.type,
      position,
      school,
    });
  }
  return picks;
}

function parseYear(year, text) {
  const entries = [];
  for (const [teamName, teamId] of Object.entries(TEAM_IDS)) {
    const escaped = teamName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`^(={3,4})\\s*${escaped}\\s*\\1\\s*$`, "m").exec(text);
    if (!m) continue;
    const depth = m[1].length;
    const bodyStart = m.index + m[0].length;
    // 同じ深さ以上の見出しが来たらそこまで
    const rel = text.slice(bodyStart).search(new RegExp(`^={2,${depth}}[^=]`, "m"));
    const body = text.slice(bodyStart, rel < 0 ? undefined : bodyStart + rel);
    const picks = parseTeamSection(body);
    if (picks.length > 0) entries.push({ year: Number(year), teamId, teamName, picks });
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
  console.log(`${year}: ${String(entries.length).padStart(2)}球団 / ${String(n).padStart(3)}人`);
}

const players = JSON.parse(await readFile("data/players.json", "utf8"));
const drafts = JSON.parse(await readFile("data/drafts.json", "utf8"));

// 既存レコードは「名前+年度+球団」で引く（調査済みの値を温存するため）
const keyOf = (name, year, teamId) => `${normalizeName(name)}|${year}|${teamId}`;
const byKey = new Map(players.map((p) => [keyOf(p.name, p.draftYear, p.draftTeamId), p]));
const usedIds = new Set(players.map((p) => p.id));

let reused = 0;
let created = 0;
const wikiTitles = {};
const newDraftEntries = [];

const replacedKeys = new Set(parsed.map((e) => `${e.year}|${e.teamId}`));

for (const entry of parsed) {
  const picks = [];
  const seen = new Set();
  for (const pick of entry.picks) {
    // 同じ球団の表に同じ選手が二度出ることは無いはずだが、
    // 記事の書式ゆれで拾い過ぎた場合に備えて弾いておく
    if (seen.has(normalizeName(pick.name))) continue;
    seen.add(normalizeName(pick.name));

    const key = keyOf(pick.name, entry.year, entry.teamId);
    let player = byKey.get(key);
    if (player) {
      player.draftRound = pick.round;
      player.draftType = pick.type === "development" ? "育成" : "支配下";
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

// 生成済みレコードのうち、パースし直した結果どこからも参照されなくなったものは捨てる。
// （記事側の修正でパース結果が変わっても、再実行するだけで整合が取れるようにする）
const referenced = new Set(newDraftEntries.flatMap((e) => e.picks.map((pk) => pk.playerId)));
for (const e of drafts) {
  if (!replacedKeys.has(`${e.year}|${e.teamId}`)) for (const pk of e.picks) referenced.add(pk.playerId);
}
const kept = players.filter((p) => referenced.has(p.id) || !p.id.startsWith("wp_"));
const dropped = players.length - kept.length;
const orphans = kept.filter((p) => !referenced.has(p.id));

// パースできた年度×球団は差し替え、それ以外の既存エントリは残す
const merged = drafts.filter((e) => !replacedKeys.has(`${e.year}|${e.teamId}`)).concat(newDraftEntries);
merged.sort((a, b) => a.year - b.year || a.teamId.localeCompare(b.teamId));

await writeFile("data/drafts.json", JSON.stringify(merged, null, 2) + "\n", "utf8");
await writeFile("data/players.json", JSON.stringify(kept, null, 2) + "\n", "utf8");
// 在籍状況を引くための「選手ID → Wikipedia記事名」対応表
await writeFile("data/_raw/wiki-titles.json", JSON.stringify(wikiTitles, null, 2) + "\n", "utf8");

console.log(`\n既存レコードを再利用: ${reused}人 / 新規作成: ${created}人 / 不要になり削除: ${dropped}人`);
console.log(`抽選プール: ${merged.length} 通り / 総選手数: ${kept.length}`);
if (orphans.length > 0) {
  console.log(`\nどの指名からも参照されない調査済みレコード: ${orphans.length}人`);
  for (const p of orphans) console.log(`  ${p.id} ${p.name} ${p.draftYear} ${p.draftTeamId}`);
}
console.log(`Wikipedia記事名が取れた選手: ${Object.keys(wikiTitles).length}人`);
