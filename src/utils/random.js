/**
 * 乱数関連の小さなユーティリティ。
 * ゲームロジック側からはこの関数群だけを通して乱数を扱う。
 */

export function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

export function pickRandom(list) {
  if (!list || list.length === 0) return undefined;
  return list[randomInt(list.length)];
}

export function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
