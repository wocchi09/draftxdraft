/**
 * data/_raw/player-status.json（記事の冒頭文から判定した現役/引退）を
 * data/players.json に反映する。
 *
 * Wikipediaから機械的に作ったレコード（idが wp_ で始まる）は、判定規則を
 * 直したときに必ず新しい結果へ入れ替わるよう、毎回上書きする。
 * 手で調査したレコードは調査結果を優先し、判定と食い違った場合だけ報告する。
 */
import { readFile, writeFile } from "node:fs/promises";

/**
 * Wikipediaに記事が無い（赤リンク）選手は、冒頭文が無いので判定材料が無い。
 * ただし年代によっては、現役であり得ないことが年齢から確定する。
 * NPBの最年長出場記録は山本昌の50歳（2015年）。高校生でも指名時に18歳なので、
 * 「指名年 + 18 + (今年 - 指名年) > 50」すなわち指名年が (今年 - 50 + 18) 年より
 * 前なら、現役でいられる年齢を超えている。これは推測ではなく年齢の帰結なので、
 * 判定材料が無い場合に限り引退として扱う。
 */
const NOW = new Date().getFullYear();
const OLDEST_ACTIVE_AGE = 50; // 山本昌（2015年、50歳）
const YOUNGEST_DRAFT_AGE = 18; // 高校生指名
const CERTAINLY_RETIRED_BEFORE = NOW - OLDEST_ACTIVE_AGE + YOUNGEST_DRAFT_AGE;

const status = JSON.parse(await readFile("data/_raw/player-status.json", "utf8"));
const players = JSON.parse(await readFile("data/players.json", "utf8"));

let applied = 0;
let keptExisting = 0;
let stillUnknown = 0;
let byAge = 0;
const conflicts = [];

for (const p of players) {
  const verdict = status[p.id] === "active" || status[p.id] === "retired" ? status[p.id] : null;
  const isGenerated = p.id.startsWith("wp_");

  if (!isGenerated && p.activeStatus !== "unknown") {
    keptExisting++;
    if (verdict && verdict !== p.activeStatus) conflicts.push([p.name, p.activeStatus, verdict]);
    continue;
  }
  if (verdict) {
    p.activeStatus = verdict;
    applied++;
  } else if (p.draftYear < CERTAINLY_RETIRED_BEFORE) {
    p.activeStatus = "retired";
    byAge++;
  } else {
    p.activeStatus = "unknown";
    stillUnknown++;
  }
}

await writeFile("data/players.json", JSON.stringify(players, null, 2) + "\n", "utf8");
console.log(`反映: ${applied}人 / 調査済みのため据え置き: ${keptExisting}人`);
console.log(`記事が無いが年齢から現役ではあり得ないため引退: ${byAge}人（${CERTAINLY_RETIRED_BEFORE}年より前の指名）`);
console.log(`判別できず unknown: ${stillUnknown}人`);
if (conflicts.length > 0) {
  console.log(`\n調査済みの値と判定が食い違ったもの: ${conflicts.length}人（調査済みを優先した）`);
  for (const [name, kept, verdict] of conflicts) console.log(`  ${name}: 調査=${kept} / 判定=${verdict}`);
}
