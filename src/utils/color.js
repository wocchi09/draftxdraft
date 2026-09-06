/**
 * 抽選された球団カラーを「アクセント程度」にだけ使うための最小限の色計算。
 */

/** ユーザーが未設定のときのデフォルトアクセントカラー */
export const DEFAULT_ACCENT = "#4f7cff";

/**
 * "#abc" / "#aabbcc" / "rgb(1, 2, 3)" のどれでも受け取れるようにする。
 * lighten()/darken() が rgb() 形式を返すので、その結果を再び渡せる必要がある。
 */
function hexToRgb(color) {
  if (typeof color !== "string") return { r: 0, g: 0, b: 0 };
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  const clean = color.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }) {
  const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lighten(hex, amount = 0.4) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function darken(hex, amount = 0.4) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.round(c * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** WCAGの相対輝度（0〜1）。文字色を白/黒どちらにするかの判定に使う。 */
function relativeLuminance({ r, g, b }) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/**
 * 指定した背景色の上に置く文字色を、明るい/暗いから読みやすい方で返す。
 * アクセントカラーはユーザーが自由に選べるうえ、テーマによっても明暗が
 * 変わるため、固定色ではなく毎回ここで判定する。
 */
export function readableTextOn(hex, amount = 0) {
  const { r, g, b } = hexToRgb(hex);
  const shifted =
    amount === 0
      ? { r, g, b }
      : { r: Math.round(r * (1 - amount)), g: Math.round(g * (1 - amount)), b: Math.round(b * (1 - amount)) };
  const bg = relativeLuminance(shifted);
  const contrast = (fg) => (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
  const DARK_INK = { hex: "#06090f", lum: relativeLuminance(hexToRgb("#06090f")) };
  const LIGHT_INK = { hex: "#ffffff", lum: 1 };
  return contrast(DARK_INK.lum) >= contrast(LIGHT_INK.lum) ? DARK_INK.hex : LIGHT_INK.hex;
}

/** 2色のコントラスト比（WCAG） */
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexToRgb(hexA));
  const b = relativeLuminance(hexToRgb(hexB));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * 背景に対して見える明るさまで色をずらす。
 *
 * 球団カラーには濃紺（中日・オリックス・日本ハム・西武）や黒（ロッテ）があり、
 * ダークテーマの上ではそのまま置くと背景に沈んで見えなくなる。
 * 色味は保ったまま、必要なぶんだけ明るく（明るい背景なら暗く）する。
 */
export function ensureContrast(color, bgColor, min = 3) {
  if (!color || !bgColor) return color;
  const bg = hexToRgb(bgColor);
  const bgIsDark = relativeLuminance(bg) < 0.5;
  let rgb = hexToRgb(color);
  for (let i = 0; i < 16; i++) {
    if (contrastRatio(rgbToHex(rgb), bgColor) >= min) break;
    rgb = bgIsDark
      ? { r: rgb.r + (255 - rgb.r) * 0.14, g: rgb.g + (255 - rgb.g) * 0.14, b: rgb.b + (255 - rgb.b) * 0.14 }
      : { r: rgb.r * 0.86, g: rgb.g * 0.86, b: rgb.b * 0.86 };
  }
  return rgbToHex(rgb);
}
