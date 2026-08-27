/**
 * シェアカードをPNG画像として描き出す。
 *
 * 画面上のカードをそのまま画像化するライブラリ（html2canvas等）は使わず、
 * Canvas 2D で同じ絵を描き直している。ビルド工程も外部依存も増やさずに済み、
 * SNSに載せられる解像度（1080×1350）で出せるため。
 * 配色は表示中のテーマから読むので、ライト/ダークとアクセント色がそのまま反映される。
 */

/** 出力サイズ。4:5 はX・Instagramのフィードで切られずに出る縦長比率 */
const W = 1080;
const H = 1350;
const PAD_X = 76;
const PAD_Y = 84;

const FONT = '"Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif';

/** 表示中のテーマからカードの配色を読む */
function readPalette() {
  const s = getComputedStyle(document.documentElement);
  const get = (name, fallback) => (s.getPropertyValue(name) || "").trim() || fallback;
  return {
    bg0: get("--bg-0", "#0b0e14"),
    bg1: get("--bg-1", "#12161f"),
    bg3: get("--bg-3", "#222939"),
    text0: get("--text-0", "#f4f6fb"),
    text1: get("--text-1", "#c9d0de"),
    text2: get("--text-2", "#8c95a8"),
    text3: get("--text-3", "#5c6478"),
    border1: get("--border-1", "#2a3244"),
    border2: get("--border-2", "#3a4460"),
    accent: get("--accent", "#5b7cfa"),
    accentSoft: get("--accent-soft", "rgba(91,124,250,0.16)"),
    accentText: get("--accent-text", "#a9bcff"),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 幅に収まらない文字列を末尾省略する */
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** 字間を空けて描く（canvasのletterSpacingは対応していない環境がある） */
function drawTracked(ctx, text, x, y, tracking) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}

/**
 * シェアカードを描いてPNGのBlobを返す。
 * @param {{summary:object, tags:string[], modeLabel:string}} card
 */
export async function renderShareCardImage({ summary, tags, modeLabel }) {
  // Webフォントの読み込みを待たないと、初回だけ代替フォントで描かれてしまう
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch {
    /* フォントが使えなくても代替フォントで描く */
  }

  const p = readPalette();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 背景（画面上のカードと同じ斜めのグラデーション）
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, p.bg1);
  bg.addColorStop(1, p.bg0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 左上のアクセントの光
  const glow = ctx.createRadialGradient(W * 0.2, -H * 0.05, 0, W * 0.2, -H * 0.05, W * 0.85);
  glow.addColorStop(0, p.accentSoft);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  let y = PAD_Y;
  const innerW = W - PAD_X * 2;

  // ブランド
  ctx.fillStyle = p.text2;
  ctx.font = `800 26px ${FONT}`;
  y += 26;
  drawTracked(ctx, "DRAFT × DRAFT", PAD_X, y, 4.5);

  // 見出し
  ctx.fillStyle = p.text0;
  ctx.font = `800 64px ${FONT}`;
  y += 78;
  ctx.fillText("MY TEAM", PAD_X, y);

  // モードと年代
  ctx.fillStyle = p.text2;
  ctx.font = `700 28px ${FONT}`;
  y += 44;
  ctx.fillText(fitText(ctx, [modeLabel, summary.decade].filter(Boolean).join(" ・ "), innerW), PAD_X, y);

  // 投手陣（3枠）
  y += 34;
  const boxGap = 16;
  const boxW = (innerW - boxGap * 2) / 3;
  const boxH = 104;
  summary.pitcherSlots.forEach((slot, i) => {
    const x = PAD_X + (boxW + boxGap) * i;
    ctx.fillStyle = p.bg3;
    roundRect(ctx, x, y, boxW, boxH, 14);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = p.text2;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(fitText(ctx, slot.slotLabel, boxW - 20), x + boxW / 2, y + 40);
    ctx.fillStyle = p.text0;
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(fitText(ctx, slot.name, boxW - 20), x + boxW / 2, y + 78);
    ctx.textAlign = "left";
  });
  y += boxH + 36;

  // 打順とタグは、投手陣の下から締めの一文までを使い切るように配る。
  // 画面上のカード（タグを下端に寄せている）と同じ見え方にするため。
  const footerY = H - PAD_Y - 12;
  const ruleY = footerY - 34;
  const tagsH = tags.length > 0 ? 46 + 22 : 0;
  const listBottom = ruleY - 26 - tagsH;
  const rowH = Math.min(78, Math.max(54, (listBottom - y) / summary.battingOrder.length));

  summary.battingOrder.forEach((o, i) => {
    const baseline = y + rowH / 2 + 11;
    ctx.fillStyle = p.text1;
    ctx.font = `700 27px ${FONT}`;
    const label = `${o.order}. ${o.posLabel}`;
    ctx.fillText(label, PAD_X, baseline);
    const labelW = ctx.measureText(label).width;

    ctx.fillStyle = p.text0;
    ctx.font = `800 31px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(fitText(ctx, o.name, innerW - labelW - 40), W - PAD_X, baseline);
    ctx.textAlign = "left";

    // 行の区切り（最終行の下には引かない）
    if (i < summary.battingOrder.length - 1) {
      ctx.strokeStyle = p.border1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_X, Math.round(y + rowH) + 0.5);
      ctx.lineTo(W - PAD_X, Math.round(y + rowH) + 0.5);
      ctx.stroke();
    }
    y += rowH;
  });

  // 特徴タグ（締めの一文のすぐ上に置く）
  if (tags.length > 0) {
    let x = PAD_X;
    const tagY = ruleY - 26 - 46;
    ctx.font = `800 24px ${FONT}`;
    for (const tag of tags) {
      const tw = ctx.measureText(tag).width + 34;
      if (x + tw > W - PAD_X) break;
      ctx.fillStyle = p.accentSoft;
      roundRect(ctx, x, tagY, tw, 46, 23);
      ctx.fill();
      ctx.fillStyle = p.accentText;
      ctx.fillText(tag, x + 17, tagY + 31);
      x += tw + 10;
    }
  }

  // 締めの一文
  ctx.strokeStyle = p.border1;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD_X, ruleY);
  ctx.lineTo(W - PAD_X, ruleY);
  ctx.stroke();
  ctx.fillStyle = p.text3;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText("あなたならこのチーム、どう見る？", PAD_X, footerY);
  ctx.textAlign = "right";
  ctx.fillText("DRAFT × DRAFT", W - PAD_X, footerY);
  ctx.textAlign = "left";

  // 外枠
  ctx.strokeStyle = p.border2;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, W - 2, H - 2, 28);
  ctx.stroke();

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
