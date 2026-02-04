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

function deepElementsFromPoint(x, y, root = document) {
  return safeElementsFromPoint(x, y, root);
}

function deepElementFromPoint(x, y) {
  const elements = deepElementsFromPoint(x, y);
  for (const candidate of elements) {
    if (isValidElement(candidate)) {
      const deep = findDeepestValidElementInTree(candidate, x, y);
      return deep && isValidElement(deep) ? deep : candidate;
    }
  }
  return null;
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
