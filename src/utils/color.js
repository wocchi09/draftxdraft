/**
 * 抽選された球団カラーを「アクセント程度」にだけ使うための最小限の色計算。
 */

/** ユーザーが未設定のときのデフォルトアクセントカラー */
export const DEFAULT_ACCENT = "#4f7cff";

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
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
