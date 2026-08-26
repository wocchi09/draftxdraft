/**
 * DOM生成の小さなヘルパー。フレームワークを使わないため、
 * innerHTML文字列の組み立てとイベント委譲を中心にする。
 */

export function h(tag, attrs = {}, children = "") {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") {
      el.className = value;
    } else if (key === "html") {
      el.innerHTML = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset") {
      for (const [dk, dv] of Object.entries(value)) el.dataset[dk] = dv;
    } else {
      el.setAttribute(key, value);
    }
  }
  if (Array.isArray(children)) {
    children.forEach((c) => {
      if (c === null || c === undefined) return;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
  } else if (children instanceof Node) {
    el.append(children);
  } else if (children !== "" && children !== null && children !== undefined) {
    el.textContent = String(children);
  }
  return el;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function announce(message) {
  const live = document.getElementById("sr-live");
  if (live) {
    live.textContent = "";
    // 同じ文言が連続しても読み上げられるよう一度クリアしてから設定する
    requestAnimationFrame(() => {
      live.textContent = message;
    });
  }
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
