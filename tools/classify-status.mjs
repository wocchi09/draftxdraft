/**
 * data/_raw/player-intros.json（Wikipediaの冒頭文とカテゴリ）から
 * 現役/引退を判定し、data/_raw/player-status.json に書き出す。
 *
 * 日本語版の野球選手記事には、判定に使える書き分けがいくつかある。
 *
 *   「〜は、…の元プロ野球選手」                    → 引退
 *   Category:存命人物 が付いていない（＝物故者）    → 引退
 *   「〜に所属したプロ野球選手」「所属していた」    → 引退（過去形）
 *   「野球解説者」「コーチ」「審判員」などの後職     → 引退
 *   「…のプロ野球選手。◯◯所属。」                 → 現役（現在の所属球団がある）
 *
 * 物故者の記事に「元」が付かないのは日本語版の慣習で、これを見落とすと
 * 1960年代の指名選手が「現役」になってしまう。
 *
 * どの規則にも当てはまらないものは判定せず、unknown のまま残す。
 * 推測でデータを埋めないための方針なので、規則を緩めて埋めにいかないこと。
 */
import { readFile, writeFile } from "node:fs/promises";

/**
 * 引退を示す語。「元」の付き方は記事ごとに揺れる
 * （元プロ野球選手 / 元プロ野球投手 / プロ野球元投手 / 元野球選手 / 元選手）ので、
 * ポジション名まで含めて拾う。過去形の在籍表現と、現役と両立しない後職も引退の印。
 */
const RETIRED_MARKERS = new RegExp(
  [
    "元(?:・)?(?:日本の?)?(?:プロ)?野球(?:選手|投手|捕手|内野手|外野手)",
    "(?:プロ)?野球元(?:選手|投手|捕手|内野手|外野手)",
    "は、[^。]{0,40}元選手",
    "所属した|所属していた|在籍した|現役を引退|引退した",
    "野球解説者|野球評論家|野球指導者|審判員|プロ野球監督",
    "元[^。]{0,8}(?:監督|コーチ)",
  ].join("|"),
);

/**
 * 現役を示す語。現在の所属先が書かれていること。
 * 過去形の在籍表現（所属した／していた）は先に引退として弾いてあるので、
 * ここまで残った「所属」は現在の所属を指す。「所属事務所」は所属先ではない。
 */
const ACTIVE_MARKERS = /所属(?!事務所)/;

export function classify(record) {
  if (!record) return null;
  const intro = record.intro || "";
  if (!intro) return null;
  // 引退の印を先に見る。現役の判定材料（所属）は引退した選手の記事にも
  // 「〜に所属した」「引退後は〜のコーチとして所属」の形で出てくるため。
  if (RETIRED_MARKERS.test(intro)) return "retired";
  if (record.alive === false) return "retired"; // 物故者
  if (ACTIVE_MARKERS.test(intro)) return "active";
  return null; // 手がかりが無いので埋めない
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const intros = JSON.parse(await readFile("data/_raw/player-intros.json", "utf8"));
  const titles = JSON.parse(await readFile("data/_raw/wiki-titles.json", "utf8"));

  const status = {};
  const counts = { active: 0, retired: 0, unknown: 0 };
  for (const [playerId, title] of Object.entries(titles)) {
    const verdict = classify(intros[title]);
    if (verdict) {
      status[playerId] = verdict;
      counts[verdict]++;
    } else {
      counts.unknown++;
    }
  }

  await writeFile("data/_raw/player-status.json", JSON.stringify(status, null, 2) + "\n", "utf8");
  console.log(`現役: ${counts.active} / 引退: ${counts.retired} / 判別できず: ${counts.unknown}`);
}
