/* ───────────────────────────────────── */
/*      Core Safe Utility Functions      */
/* ───────────────────────────────────── */
function safeQuery(selector) {
  if (typeof selector !== "string" || selector.length > SELECTOR_CONSTANTS.MATCH_LIMITS.MAX_SELECTOR_LENGTH) {
    return [];
  }
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function safeGetComputedStyle(el) {
  try {
    return getComputedStyle(el);
  } catch {
    return null;
  }
}

function safeElementsFromPoint(x, y, root = document) {
  try {
    if (root.elementsFromPoint) {
      return Array.from(root.elementsFromPoint(x, y) || []);
    }

    // Fallback: start with elementFromPoint and add the parents
    const element = root.elementFromPoint?.(x, y) || document.elementFromPoint(x, y);
    if (!element) return [];

    const elements = [element];
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      elements.push(parent);
      parent = parent.parentElement;
    }
    return elements;
  } catch {
    return [];
  }
}

function safeClosest(element, selector) {
  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

function safeGetAttributes(element) {
  try {
    return Array.from(element.attributes || []);
  } catch {
    return [];
  }
}

function safeGetClassList(element) {
  try {
    return Array.from(element.classList || []);
  } catch {
    return [];
  }
}

/* ────────────────────────────────── */
/*      Element Finder Utilities      */
/* ────────────────────────────────── */
function findParentElementByCondition(el, conditionFn) {
  let current = el;
  let safety = 0;
  const MAX_SAFE = 2;

  while (current && safety < MAX_SAFE) {
    if (conditionFn(current)) return current;

    if (current === document.body || current === document.documentElement) break;
    if (!current.parentElement) break;

    current = current.parentElement;
    safety++;
  }
  return null;
}

function findImageElement(el) {
  return findParentElementByCondition(el, (currentEl) => {
    const tag = currentEl.tagName?.toLowerCase();
    const style = safeGetComputedStyle(currentEl);
    const bg = style?.backgroundImage;

    // <img> elements
    if (tag === "img" && currentEl.src && currentEl.src !== window.location.href) return true;

    // background-image control
    if (bg && /url\(["']?([^"']+)["']?\)/i.test(bg)) {
      const urlMatch = bg.match(/url\(["']?([^"']+)["']?\)/i);
      if (urlMatch?.[1] && !urlMatch[1].startsWith("data:")) return true;
    }

    // The img elements underneath
    if (currentEl.querySelector(":scope > img[src]")) return true;

    // ::before / ::after check
    try {
      const before = getComputedStyle(currentEl, "::before")?.backgroundImage;
      const after = getComputedStyle(currentEl, "::after")?.backgroundImage;
      return (before && /url\(["']?([^"']+)["']?\)/i.test(before)) || (after && /url\(["']?([^"']+)["']?\)/i.test(after));
    } catch {
      return false;
    }
  });
}

function findLinkElement(el) {
  return findParentElementByCondition(el, (currentEl) => {
    const tag = currentEl.tagName?.toLowerCase();
    const role = currentEl.getAttribute("role");
    const href = currentEl.getAttribute("href");
    const xlinkHref = currentEl.getAttribute("xlink:href");

    const hasValidHref = href && href !== "#" && href !== "" && !href.startsWith("javascript:");
    const hasValidXlink = xlinkHref && xlinkHref !== "#" && xlinkHref !== "";

    return (tag === "a" && (hasValidHref || hasValidXlink)) || role === "link" || (tag !== "a" && hasValidXlink);
  });
}

function findTextElement(el, options = {}) {
  const { minLength = 1, maxLength = 500, excludeHidden = true, excludeScriptStyle = true } = options;

  return findParentElementByCondition(el, (currentEl) => {
    if (excludeHidden && !isElementVisible(currentEl)) return false;

    if (excludeScriptStyle) {
      const tag = currentEl.tagName.toLowerCase();
      if (["script", "style", "noscript"].includes(tag)) return false;
    }

    const text = currentEl.textContent?.trim();
    if (!text || text.length < minLength || text.length > maxLength || !/\S/.test(text)) {
      return false;
    }

    return true;
  });
}

// Visibility Utilities
function isElementVisible(el) {
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && el.offsetWidth > 0 && el.offsetHeight > 0;
}

/* ──────────────────────────── */
/*      Element Validation      */
/* ──────────────────────────── */
function isValidElement(el) {
  if (!el || SELECTOR_CONSTANTS.BLOCKED_IDS.includes(el.id)) return false;
  if (el === document || el === window || el.nodeType !== 1) return false;

  try {
    const style = safeGetComputedStyle(el);
    if (!style) return false;

    const hidden = style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0 || style.pointerEvents === "none";

    if (hidden) return false;

    return hasVisibleContent(el) || hasInteractiveRole(el);
  } catch {
    return false;
  }
}

function hasVisibleContent(el) {
  const tag = el.tagName?.toLowerCase();
  const isNavbar = !!safeClosest(el, "header, nav, .navbar, .header, .nav, [role='navigation']");

  const hasContent =
    el.textContent?.trim().length > 0 ||
    el.innerHTML?.trim().length > 5 ||
    el.hasAttribute("src") ||
    el.hasAttribute("href") ||
    el.querySelector("img, svg, i, span, canvas, video, iframe");

  const hasSize = el.offsetWidth > 0 || el.offsetHeight > 0;
  const hasClientRect = el.getClientRects().length > 0;

  if (isNavbar) return hasSize || hasContent;
  return hasContent || hasSize || hasClientRect;
}

function hasInteractiveRole(el) {
  const interactiveTags = ["a", "button", "input", "select", "textarea", "label", "summary", "menuitem", "option", "li"];
  return interactiveTags.includes(el.tagName?.toLowerCase());
}

/* ─────────────────────────── */
/*      Element Detection      */
/* ─────────────────────────── */
function isElementAtPoint(el, x, y) {
  try {
    return safeElementsFromPoint(x, y).includes(el);
  } catch {
    try {
      const rect = el.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    } catch {
      return false;
    }
  }
}

function isElementVisibleAndAtPoint(el, x, y) {
  return isValidElement(el) && isElementAtPoint(el, x, y);
}

function isFullScreenOverlay(el) {
  if (!el || el === document.body || el === document.documentElement) return false;

  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);

  const coversViewport = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
  const isPositioned = style.position === "fixed" || style.position === "absolute";
  const hasNoContent = el.children.length === 0 && el.textContent.trim().length === 0;
  const isTransparent = style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent";
  return coversViewport && isPositioned && (hasNoContent || isTransparent);
}

function deepElementsFromPoint(x, y, root = document) {
  return safeElementsFromPoint(x, y, root);
}

function deepElementFromPoint(x, y) {
  const hidden = [];

  let el = document.elementFromPoint(x, y);

  while (el && isFullScreenOverlay(el)) {
    hidden.push(el);
    el.style.pointerEvents = "none";
    el = document.elementFromPoint(x, y);
  }

  hidden.forEach((e) => (e.style.pointerEvents = ""));

  return el;
}

function findDeepestValidElementInTree(root, x, y, depth = 0) {
  if (depth > SELECTOR_CONSTANTS.MATCH_LIMITS.MAX_DEPTH_SAFETY) return root;

  let deepest = root;
  for (const child of root.children || []) {
    if (!isElementVisibleAndAtPoint(child, x, y)) continue;
    if (isValidElement(child)) {
      const deeper = findDeepestValidElementInTree(child, x, y, depth + 1);
      if (deeper && isValidElement(deeper)) deepest = deeper;
    }
  }
  return deepest;
}

/* ──────────────────────────────── */
/*      Blocked Element Checks      */
/* ──────────────────────────────── */
function isIframeElement(el) {
  if (!el) return false;
  if (el.tagName?.toLowerCase() === "iframe") return true;

  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    if (parent.tagName?.toLowerCase() === "iframe") return true;
    parent = parent.parentElement;
  }
  return false;
}

function isPointOnBlockedElement(x, y) {
  const deepEl = deepElementFromPoint(x, y);
  if (deepEl && (SELECTOR_CONSTANTS.BLOCKED_IDS.includes(deepEl.id) || safeClosest(deepEl, SELECTOR_CONSTANTS.BLOCKED_SELECTORS[0]) || isIframeElement(deepEl))) {
    return true;
  }
  return safeElementsFromPoint(x, y).some(isIframeElement);
}

/* ───────────────────────── */
/*      Class Utilities      */
/* ───────────────────────── */
function isGenericClass(cls) {
  if (!cls || cls.length < 2) return true;
  return CLASS_BLOCKLIST_PATTERNS.some((p) => p.test(cls));
}

function filterNonGenericClasses(classes) {
  return Array.from(classes || []).filter((cls) => !isGenericClass(cls));
}
/* ─────────────────────────────────────── */
/*      Partial-Class Query Utilities      */
/* ─────────────────────────────────────── */

/**
 * Selector where class tokens are treated as prefix matches.
 * Supports: space, >, +, ~ combinators.
 */
function queryWithPartialClass(selector, root = document) {
  const tokenRe = /([>~+]|\s+)/;
  const allParts = selector
    .split(tokenRe)
    .map((s) => s.trim())
    .filter(Boolean);

  const segmentList = [];
  const combinatorList = [];

  for (const part of allParts) {
    if (/^[>~+]$/.test(part) || part === "") combinatorList.push(part || " ");
    else segmentList.push(part);
  }

  while (combinatorList.length < segmentList.length - 1) combinatorList.push(" ");

  function matchesSegment(el, segment) {
    if (!el || el.nodeType !== 1) return false;

    const tagMatch = segment.match(/^([a-zA-Z][a-zA-Z0-9]*)?/);
    const tag = tagMatch?.[1];

    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;

    const classTokens = [...segment.matchAll(/\.([^\s.#[>~+:]+)/g)].map((m) => m[1]);

    // Must contain at least tag or class
    if (!tag && classTokens.length === 0) return false;

    if (classTokens.length === 0) return true;

    const elClasses = el.classList ? [...el.classList] : [];
    return classTokens.every((p) => elClasses.some((c) => c.startsWith(p)));
  }

  function initialQueryFor(segment) {
    const tag = segment.match(/^([a-zA-Z][a-zA-Z0-9]*)/)?.[1];
    if (tag) return tag;
    if (segment.includes(".")) return "[class]";
    return null;
  }

  const MAX_CANDIDATES = 500;

  function resolve(contextEls, segIndex) {
    if (segIndex >= segmentList.length) return contextEls;

    const seg = segmentList[segIndex];
    const combinator = segIndex === 0 ? " " : combinatorList[segIndex - 1] || " ";

    const initialQ = initialQueryFor(seg);
    if (!initialQ) return [];

    const candidates = [];

    for (const ctx of contextEls) {
      if (!ctx?.querySelectorAll) continue;

      try {
        if (segIndex === 0 || combinator === " ") {
          candidates.push(...ctx.querySelectorAll(initialQ));
        } else if (combinator === ">") {
          candidates.push(...(ctx.children || []));
        } else if (combinator === "+") {
          if (ctx.nextElementSibling) candidates.push(ctx.nextElementSibling);
        } else if (combinator === "~") {
          let sib = ctx.nextElementSibling;
          while (sib) {
            candidates.push(sib);
            sib = sib.nextElementSibling;
          }
        }
      } catch {}

      if (candidates.length >= MAX_CANDIDATES) break;
    }

    const matched = candidates.slice(0, MAX_CANDIDATES).filter((el) => matchesSegment(el, seg));

    return resolve(matched, segIndex + 1);
  }

  return resolve([root], 0);
}

function safeQueryPartial(selector) {
  if (typeof selector !== "string") return [];
  try {
    return queryWithPartialClass(selector, document);
  } catch {
    return [];
  }
}

function getPartialClassPrefix(cls) {
  const cssModulesRe = /^(.*?[_-])([a-zA-Z0-9]{4,16})(?:_\d+)?$/;
  const m = cls.match(cssModulesRe);
  if (!m) return null;

  const prefix = m[1];
  const hashSeg = m[2];

  const isMixed = /[a-zA-Z]/.test(hashSeg) && /\d/.test(hashSeg);
  if (!isMixed) return null;

  if (prefix.replace(/[_-]/g, "").length < 2) return null;

  return prefix;
}
