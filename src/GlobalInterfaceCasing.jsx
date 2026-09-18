import { useEffect } from "react";

const LETTER_RE = /\p{L}/u;
const ONLY_Y_RE = /^[^\p{L}]*y[^\p{L}]*$/iu;
const SKIP_TAGS = new Set(["SCRIPT","STYLE","TEXTAREA","CODE","PRE"]);
const ATTRIBUTES = ["placeholder","title","aria-label"];

function formatHashtag(token) {
  const match = token.match(/^(#)([\\p{L}\\p{N}_]+)(.*)$/u);
  if (!match) return null;
  const [, hash, body, suffix] = match;
  if (body.toLocaleLowerCase("es-AR") === "vamoselpoli") return hash + "VamosElPoli" + suffix;
  return null;
}

export function formatInterfaceText(value = "") {
  return String(value).replace(/\\S+/gu, token => {
    const hashtag = formatHashtag(token);
    if (hashtag) return hashtag;
    if (ONLY_Y_RE.test(token)) {
      return token.replace(/y/iu, "y");
    }
    const index = token.search(LETTER_RE);
    if (index < 0) return token;
    return token.slice(0, index) + token[index].toLocaleUpperCase("es-AR") + token.slice(index + 1);
  });
}

function shouldSkip(element) {
  if (!element) return true;
  if (SKIP_TAGS.has(element.tagName)) return true;
  if (element.closest?.("[contenteditable='true'], [data-preserve-case='true']")) return true;
  return false;
}

function normalizeTextNode(node) {
  const parent = node.parentElement;
  if (!parent || shouldSkip(parent)) return;
  const current = node.nodeValue || "";
  const next = formatInterfaceText(current);
  if (next !== current) node.nodeValue = next;
}

function normalizeElement(root) {
  if (!(root instanceof Element) || shouldSkip(root)) return;
  for (const attr of ATTRIBUTES) {
    if (!root.hasAttribute(attr)) continue;
    const current = root.getAttribute(attr) || "";
    const next = formatInterfaceText(current);
    if (next !== current) root.setAttribute(attr, next);
  }
  root.querySelectorAll?.(ATTRIBUTES.map(a => `[${a}]`).join(",")).forEach(el => {
    if (shouldSkip(el)) return;
    for (const attr of ATTRIBUTES) {
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr) || "";
      const next = formatInterfaceText(current);
      if (next !== current) el.setAttribute(attr, next);
    }
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) normalizeTextNode(node);
}

export default function GlobalInterfaceCasing() {
  useEffect(() => {
    let frame = 0;
    const pending = new Set();

    const flush = () => {
      frame = 0;
      const items = Array.from(pending);
      pending.clear();
      for (const item of items) {
        if (item.nodeType === Node.TEXT_NODE) normalizeTextNode(item);
        else if (item instanceof Element) normalizeElement(item);
      }
    };

    const schedule = node => {
      if (!node) return;
      pending.add(node);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    normalizeElement(document.body);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") schedule(record.target);
        else {
          record.addedNodes.forEach(schedule);
          if (record.type === "attributes") schedule(record.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });

    return () => {
      observer.disconnect();
      pending.clear();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
