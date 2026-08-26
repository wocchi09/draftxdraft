import { pickRandom } from "../utils/random.js";

export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 年度×球団のルーレット演出。結果は既に確定しており、演出はその見せ方だけ。
 * `onTick`は毎フレーム { year, team, settled } を受け取って描画する。
 * reduced-motion環境では即座に確定値を1回だけ描画する。
 */
export function runRouletteAnimation({
  finalYear,
  finalTeamShortName,
  years,
  teamNames,
  onTick,
  onDone,
  durationMs = 650,
  tickMs = 70,
}) {
  if (prefersReducedMotion()) {
    onTick({ year: finalYear, team: finalTeamShortName, settled: true });
    onDone();
    return () => {};
  }

  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - start;
    if (elapsed >= durationMs) {
      clearInterval(timer);
      onTick({ year: finalYear, team: finalTeamShortName, settled: true });
      onDone();
      return;
    }
    onTick({ year: pickRandom(years), team: pickRandom(teamNames), settled: false });
  }, tickMs);

  return () => clearInterval(timer);
}

export function spawnConfetti(container, count = 36) {
  if (prefersReducedMotion()) return;
  const colors = ["#4f7cff", "#66d9a4", "#f4d35e", "#ef8354", "#a78bfa"];
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const left = Math.random() * 100;
    const duration = 1400 + Math.random() * 900;
    const delay = Math.random() * 250;
    const color = colors[i % colors.length];
    piece.style.left = `${left}%`;
    piece.style.background = color;
    piece.style.animationDuration = `${duration}ms`;
    piece.style.animationDelay = `${delay}ms`;
    layer.appendChild(piece);
  }
  container.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}
