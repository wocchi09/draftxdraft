/**
 * data/_raw/player-status.json（Wikipediaの記事冒頭から判定した現役/引退）を
 * data/players.json に反映する。
 *
 * 既に調査済みで active/retired が入っているレコードは上書きしない。
 * 判定できなかった選手は unknown のまま残す。
 */
import { readFile, writeFile } from "node:fs/promises";

const status = JSON.parse(await readFile("data/_raw/player-status.json", "utf8"));
const players = JSON.parse(await readFile("data/players.json", "utf8"));

let applied = 0;
let keptExisting = 0;
let stillUnknown = 0;

for (const p of players) {
  const verdict = status[p.id];
  if (p.activeStatus !== "unknown") {
    keptExisting++;
    continue;
  }
  if (verdict === "active" || verdict === "retired") {
    p.activeStatus = verdict;
    applied++;
  } else {
    stillUnknown++;
  }
}

await writeFile("data/players.json", JSON.stringify(players, null, 2) + "\n", "utf8");
console.log(`反映: ${applied}人 / 調査済みのため据え置き: ${keptExisting}人 / 判別できず unknown のまま: ${stillUnknown}人`);
