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
