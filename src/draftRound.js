/**
 * ドラフト順位の表記を扱うヘルパ。
 *
 * 61年ぶんのデータには、同じ年に複数のドラフトが行われた年がある
 * （1966年の第1次/第2次、2005〜2007年の高校生/大学生・社会人）。
 * その年は「1位」が重複してしまうため、データ側では区分名を冠して
 * 「高校1巡目」「第2次3位」のように保持している。
 * 表示や集計のときは、ここで区分と順位に分けて扱う。
 */

/** 区分の略称 → 正式名称 */
export const DRAFT_KINDS = {
  育成: "育成ドラフト",
  高校: "高校生ドラフト",
  大社: "大学生・社会人ドラフト",
  第1次: "第1次ドラフト",
  第2次: "第2次ドラフト",
};

/** 44pxのバッジに収めるための表示上の短縮形（データ側は正式表記のまま） */
const RANK_SHORT = {
  希望入団枠: "希望枠",
  自由獲得枠: "自由枠",
};

const KIND_PATTERN = /^(育成|高校|大社|第\d次)/;

/**
 * 「高校1巡目」→ { kind: "高校", rank: "1巡目", number: 1 }
 * 「自由獲得枠」→ { kind: "", rank: "自由獲得枠", number: null }
 */
export function parseDraftRound(round) {
  const text = round || "";
  const m = KIND_PATTERN.exec(text);
  const kind = m ? m[1] : "";
  const rank = m ? text.slice(kind.length) : text;
  const num = /(\d+)\s*(?:位|巡目)/.exec(rank);
  return { kind, rank, number: num ? Number(num[1]) : null, shortRank: RANK_SHORT[rank] || rank };
}

/** 区分の正式名称（区分が無い通常のドラフトなら null） */
export function draftKindLabel(round) {
  return DRAFT_KINDS[parseDraftRound(round).kind] || null;
}

/**
 * 集計用の区分。1位相当の指名枠（自由獲得枠・希望入団枠・逆指名）は
 * 実際に1位指名の扱いなので「1位」に寄せる。
 */
export function classifyRound(round, draftType) {
  if (draftType === "育成") return "育成";
  const { rank, number } = parseDraftRound(round);
  if (/自由獲得枠|希望入団枠|逆指名/.test(rank)) return "1位";
  if (number === 1) return "1位";
  if (number === 2) return "2位";
  if (number === 3) return "3位";
  return "4位以下";
}

/** 下位指名（4位以下・育成）かどうか。バッジの色分けに使う */
export function isLowRound(round, draftType) {
  const kind = classifyRound(round, draftType);
  return kind === "4位以下" || kind === "育成";
}
