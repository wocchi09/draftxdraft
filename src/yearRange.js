/**
 * 抽選する年度の範囲。
 *
 * TOP画面で「全期間 / 昭和 / 平成 / 令和」のプリセット、または開始年と終了年を
 * 自分で選べる。範囲は年度×球団の抽選プールを絞り込むだけで、
 * 抽選の仕組み（シャッフルバッグ）そのものには手を入れていない。
 */
import { getAvailableYears, buildDraftPool } from "./draft.js";

/**
 * 元号のプリセット。ドラフト会議は毎年秋なので、
 * 昭和は1988年まで、平成は2018年まで、令和は2019年からで区切れる。
 * 実データに存在する年度で挟むので、収録年度が増えても自動で追随する。
 */
const PRESETS = [
  { id: "all", label: "全期間", from: null, to: null },
  { id: "showa", label: "昭和", from: null, to: 1988 },
  { id: "heisei", label: "平成", from: 1989, to: 2018 },
  { id: "reiwa", label: "令和", from: 2019, to: null },
];

/** データに存在する年度の下限・上限 */
export function getYearBounds() {
  const years = getAvailableYears();
  return { min: years[0], max: years[years.length - 1] };
}

/** プリセット一覧を、実データの範囲に合わせて解決して返す */
export function getYearPresets() {
  const { min, max } = getYearBounds();
  return PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    from: p.from === null ? min : Math.max(p.from, min),
    to: p.to === null ? max : Math.min(p.to, max),
  })).filter((p) => p.from <= p.to);
}

/** 全期間を表す範囲 */
export function fullYearRange() {
  const { min, max } = getYearBounds();
  return { from: min, to: max };
}

/**
 * 範囲を正しい形に整える。
 * 壊れた保存データや、収録年度が変わって範囲外になった値でもゲームが
 * 止まらないよう、数値でないものは全期間へ、逆転していれば入れ替える。
 */
export function normalizeYearRange(range) {
  const { min, max } = getYearBounds();
  if (!range || typeof range !== "object") return { from: min, to: max };
  let from = Number(range.from);
  let to = Number(range.to);
  if (!Number.isFinite(from)) from = min;
  if (!Number.isFinite(to)) to = max;
  if (from > to) [from, to] = [to, from];
  return { from: Math.max(min, Math.min(from, max)), to: Math.max(min, Math.min(to, max)) };
}

export function isFullYearRange(range) {
  const { min, max } = getYearBounds();
  const r = normalizeYearRange(range);
  return r.from === min && r.to === max;
}

/** 指定の範囲に一致するプリセットのID（無ければ null） */
export function matchPresetId(range) {
  const r = normalizeYearRange(range);
  const preset = getYearPresets().find((p) => p.from === r.from && p.to === r.to);
  return preset ? preset.id : null;
}

/** 範囲内の年度×球団だけを残す */
export function filterPoolByYearRange(pool, range) {
  if (!range) return pool;
  const r = normalizeYearRange(range);
  return pool.filter((c) => c.year >= r.from && c.year <= r.to);
}

/** 範囲を選んだときの目安（何通り・何人から選ぶことになるか） */
export function summarizeYearRange(range) {
  const pool = filterPoolByYearRange(buildDraftPool(), range);
  const players = pool.reduce((sum, c) => sum + c.pickCount, 0);
  return { comboCount: pool.length, playerCount: players };
}
