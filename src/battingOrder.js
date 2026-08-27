/**
 * 打順（野手9人）の並び替えロジック。
 * ドラッグ&ドロップと上下ボタンの両方から同じ関数を呼べるようにする。
 */

export function moveUp(order, index) {
  if (index <= 0 || index >= order.length) return order;
  const next = order.slice();
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return next;
}

export function moveDown(order, index) {
  if (index < 0 || index >= order.length - 1) return order;
  const next = order.slice();
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return next;
}

/**
 * 指名時に打順を選んだ際に使う: indexの位置に新しい要素を挿入する。
 * 既にその位置以降にいた要素は1つずつ後ろへずれる。
 */
export function insertAt(order, index, value) {
  const next = order.slice();
  const clamped = Math.max(0, Math.min(index, next.length));
  next.splice(clamped, 0, value);
  return next;
}

/** ドラッグ&ドロップ用: fromIndexの要素をtoIndexへ移動する */
export function moveTo(order, fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length
  ) {
    return order;
  }
  const next = order.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
