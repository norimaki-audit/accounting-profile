// 最小限の DOM ヘルパー。フレームワークは使わず、画面単位で組み立てる。

/**
 * h("div.card", { onClick, "aria-pressed": "true" }, child, ...)
 * タグ名は "tag.class1.class2" 形式でクラスを併記できる。
 */
export function h(spec, props, ...children) {
  const [tag, ...classes] = String(spec).split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") {
      el.className = el.className ? `${el.className} ${value}` : value;
    } else if (key === "style") {
      if (typeof value === "string") el.setAttribute("style", value);
      else Object.assign(el.style, value);
    } else if (key === "text") {
      el.textContent = value;
    } else if (key === "html") {
      el.innerHTML = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "disabled" || key === "hidden") {
      if (value) el.setAttribute(key, "");
    } else {
      el.setAttribute(key, value);
    }
  }

  appendAll(el, children);
  return el;
}

function appendAll(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) appendAll(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** ボタン。type="button" を既定にして form 誤送信を防ぐ。 */
export function btn(spec, props, ...children) {
  return h(spec, { type: "button", ...props }, ...children);
}

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function scrollTop() {
  window.scrollTo({ top: 0 });
}
