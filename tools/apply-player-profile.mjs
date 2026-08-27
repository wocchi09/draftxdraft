/**
 * data/_raw/player-intros.json の冒頭文から投打と守備位置を読み取り、
 * data/players.json の throws / bats / pitcherRoles / fieldingPositions を埋める。
 *
 * 日本語版の野球選手記事は冒頭に「右投右打」「左投げ左打ち」と書く慣習がある。
 * 記事によっては冒頭に無く（テンプレートの選手情報にしか無い）、その場合は
 * 埋めずに null のままにする。推測はしない。
 *
 * 手で調査したレコード（idが wp_ で始まらない）は上書きしない。
 */
import { readFile, writeFile } from "node:fs/promises";

const THROWS_BATS = /(右|左|両)投(?:げ)?(右|左|両|スイッチ|スィッチ)打(?:ち)?/;
const SIDE = { 右: "R", 左: "L", 両: "S", スイッチ: "S", スィッチ: "S" };

/**
 * 冒頭の「プロ野球選手（投手）」「（内野手、外野手）」から守備位置を拾う。
 * 記事が内訳まで書いていない「内野手」「外野手」は、内訳不明のワイルドカード
 * （IF / OF）として持たせる。断定はしない。
 */
const POSITION_WORDS = [
  ["一塁手", "1B"], ["二塁手", "2B"], ["三塁手", "3B"], ["遊撃手", "SS"],
  ["左翼手", "LF"], ["中堅手", "CF"], ["右翼手", "RF"],
  ["捕手", "C"], ["内野手", "IF"], ["外野手", "OF"],
];
const POSITION_PAREN = /（[^）]*(?:投手|捕手|内野手|外野手|一塁手|二塁手|三塁手|遊撃手|左翼手|中堅手|右翼手|指名打者)[^）]*）/;
/** 括弧を使わず「元プロ野球投手」のように書いてある場合 */
const POSITION_INLINE = /(?:元)?(?:プロ)?野球(?:元)?(投手|捕手|内野手|外野手)/;
/** 投手と野手を「兼ねた」とはっきり書いてある場合だけ二刀流とみなす */
const TWO_WAY = /兼|二刀流/;

function readPositions(intro) {
  const paren = POSITION_PAREN.exec(intro);
  const inline = POSITION_INLINE.exec(intro);
  const text = (paren ? paren[0] : "") + (inline ? inline[1] : "");
  if (!text) return null;

  const fielding = [];
  for (const [word, code] of POSITION_WORDS) {
    if (!text.includes(word)) continue;
    // 「一塁手」を拾ったあとに「塁手」で重複しないよう、コード単位で持つ
    if (!fielding.includes(code)) fielding.push(code);
  }
  const isPitcher = text.includes("投手");
  return {
    pitcherRoles: isPitcher ? ["P"] : [],
    fieldingPositions: fielding,
    // 投手と野手の両方が書かれていて、かつ「兼」「二刀流」とある場合のみ
    isTwoWay: isPitcher && fielding.length > 0 && TWO_WAY.test(text),
  };
}

const intros = JSON.parse(await readFile("data/_raw/player-intros.json", "utf8"));
const titles = JSON.parse(await readFile("data/_raw/wiki-titles.json", "utf8"));
const players = JSON.parse(await readFile("data/players.json", "utf8"));

let filled = 0;
let noSource = 0;
let kept = 0;
let positions = 0;
let twoWay = 0;

for (const p of players) {
  if (!p.id.startsWith("wp_")) {
    kept++;
    continue;
  }
  const intro = intros[titles[p.id]]?.intro || "";
  const pos = readPositions(intro);
  p.pitcherRoles = pos ? pos.pitcherRoles : [];
  p.fieldingPositions = pos ? pos.fieldingPositions : [];
  p.isTwoWay = Boolean(pos && pos.isTwoWay);
  if (pos) positions++;
  if (p.isTwoWay) twoWay++;

  const m = THROWS_BATS.exec(intro);
  if (!m) {
    p.throws = null;
    p.bats = null;
    noSource++;
    continue;
  }
  // 投げる方に「両」は無いので、そこはRとLだけを採る
  p.throws = SIDE[m[1]] === "S" ? null : SIDE[m[1]];
  p.bats = SIDE[m[2]] || null;
  filled++;
}

await writeFile("data/players.json", JSON.stringify(players, null, 2) + "\n", "utf8");
console.log(`投打を反映: ${filled}人 / 冒頭に記載が無く不明のまま: ${noSource}人`);
console.log(`守備位置を反映: ${positions}人 / うち二刀流と明記: ${twoWay}人`);
console.log(`調査済みのため据え置き: ${kept}人`);
