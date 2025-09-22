function deepElementFromPoint(x, y) {
  const elements = document.elementsFromPoint(x, y);

  function isValid(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") return false;
    if (["userRpc-selectorOverlay", "userRpc-selectorHighlight"].includes(el.id)) return false;
    const z = parseInt(style.zIndex || 0);
    if (z > 10000) return false;
    return true;
  }

  let el = null;

  for (const candidate of elements) {
    let deepest = candidate;
    while (deepest?.shadowRoot) {
      const inner = deepest.shadowRoot.elementsFromPoint(x, y).find(isValid);
      if (!inner || inner === deepest) break;
      deepest = inner;
    }
    if (isValid(deepest)) {
      el = deepest;
      break;
    }
  }

  return el;
}

function isPointOnBlockedElement(x, y, shadowDoc) {
  const elements = document.elementsFromPoint(x, y);
  const deepElement = deepElementFromPoint(x, y);
  return elements.some((el) => el.tagName?.toLowerCase() === "iframe" || ["userRpc-selectorOverlay", "userRpc-selectorHighlight"].includes(el.id)) || shadowDoc.contains(deepElement);
}

function isIdUnique(id) {
  return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
}

function isAttrUnique(name, value) {
  return document.querySelectorAll(`[${name}="${value}"]`).length === 1;
}

function getDataAttrSelectorVariants(el) {
  return Array.from(el.attributes)
    .filter((a) => {
      const name = a.name;
      const value = a.value;

      if (!name.startsWith("data-")) return false;
      if (/^data-v-\w+$/i.test(name)) return false; // Vue scoped
      if (!value) return false;
      if (!isAttrUnique(name, value)) return false;

      return true;
    })
    .map((a) => `[${a.name}="${a.value}"]`);
}

function getClassSelectorVariants(el) {
  if (!el.classList.length) return [];
  const safe = [...el.classList].filter((c) => !isGenericClass(c));
  return safe.map((cls) => `.${CSS.escape(cls)}`).filter((sel) => document.querySelectorAll(sel).length < 15);
}

function isGenericClass(cls) {
  const generic = ["container", "content", "row", "col", "flex", "wrapper", "item", "box", "inner"];
  return generic.includes(cls.toLowerCase()) || /^css-[a-z0-9]{5,}$/i.test(cls) || /^_[a-z0-9]+_[a-z0-9]+$/i.test(cls) || /^[a-z0-9]{6,}$/i.test(cls);
}

function getDomPathWithNth(el) {
  const path = [];
  while (el && el !== document.body) {
    const tag = el.tagName.toLowerCase();
    const siblings = Array.from(el.parentNode.children).filter((e) => e.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;

    let part = `${tag}${idx > 1 ? `:nth-of-type(${idx})` : ""}`;

    if (el.id && isIdUnique(el.id)) {
      part += `#${CSS.escape(el.id)}`;
    } else {
      const safeClasses = [...el.classList].filter((c) => !isGenericClass(c));
      const uniqueClass = safeClasses.find((cls) => {
        const sel = `.${CSS.escape(cls)}`;
        return document.querySelectorAll(sel).length === 1;
      });
      if (uniqueClass) {
        part += `.${CSS.escape(uniqueClass)}`;
      }
    }

    path.unshift(part);
    el = el.parentElement;
  }
  return path.join(" > ");
}

function detectSemanticRole(el) {
  const tag = el.tagName?.toLowerCase();
  const style = getComputedStyle(el);
  if (tag === "a" || el.getAttribute("role") === "link" || el.hasAttribute("href") || el.hasAttribute("data-href") || (typeof el.onclick === "function" && style.cursor === "pointer")) return "link";
  if (tag === "img" || el.getAttribute("role") === "image" || el.getAttribute("data-src") || style.backgroundImage !== "none") return "image";
  return null;
}

function findImageElement(el) {
  while (el && el !== document.body) {
    if (el.tagName?.toLowerCase() === "img" && el.src) return el;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== "none") return el;
    el = el.parentElement;
  }
  return null;
}

function findLinkElement(el) {
  while (el && el !== document.body) {
    if (el.tagName?.toLowerCase() === "a" && el.href) return el;
    if (el.getAttribute("data-href")) return el;
    el = el.parentElement;
  }
  return null;
}

function generateSmartSelector(el) {
  if (!el || el === document || el.closest("#userRpc-selectorRoot")) return null;
  if (el.id && isIdUnique(el.id)) return `#${CSS.escape(el.id)}`;

  const dataVariants = getDataAttrSelectorVariants(el);
  if (dataVariants.length) return dataVariants[0];

  const clsVariants = getClassSelectorVariants(el);
  if (clsVariants.length) return clsVariants[0];

  return getDomPathWithNth(el);
}

function generateSelectorOptions(el) {
  const options = new Set();

  // 1. unique ID
  if (el.id && isIdUnique(el.id)) {
    options.add(`#${CSS.escape(el.id)}`);
  }

  // 2. Unique Data-*Attributes of the Element
  getDataAttrSelectorVariants(el).forEach((sel) => options.add(sel));

  // 3. Unique Classes of the Element
  getClassSelectorVariants(el).forEach((sel) => options.add(sel));

  // 4. Parent > Child Combinations (Max 4)
  let currentParent = el.parentElement;
  const maxDepth = 5;
  let depth = 0;

  while (currentParent && currentParent !== document.body && depth < maxDepth) {
    const parentDataAttrs = getDataAttrSelectorVariants(currentParent).filter((sel) => /\[data-(testid|test|rpc|role|element)/i.test(sel));
    const parentIds = currentParent.id && isIdUnique(currentParent.id) ? [`#${CSS.escape(currentParent.id)}`] : [];
    const parentClasses = getClassSelectorVariants(currentParent);
    const parentSelectors = parentDataAttrs.length ? parentDataAttrs : [...parentIds, ...parentClasses];

    if (parentSelectors.length) {
      const childSelectors = new Set();
      if (el.id && isIdUnique(el.id)) childSelectors.add(`#${CSS.escape(el.id)}`);
      getClassSelectorVariants(el).forEach((sel) => childSelectors.add(sel));
      childSelectors.add(el.tagName.toLowerCase());

      parentSelectors.forEach((pSel) => {
        childSelectors.forEach((cSel) => {
          // Descendant selector
          const descendant = `${pSel} ${cSel}`;
          if (document.querySelectorAll(descendant).length === 1) {
            options.add(descendant);
          }
        });
      });
    }

    currentParent = currentParent.parentElement;
    depth++;
  }

  // 5. Last Restort: full dom path
  options.add(getDomPathWithNth(el));

  return Array.from(options);
}

function isUniqueSelector(selector) {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function scoreSelector(selector) {
  let score = 0;
  const unique = isUniqueSelector(selector);

  if (!unique) {
    score -= 30;
  }

  if (/^#[\w-]+$/.test(selector)) score += 100;

  if (/\[data-(testid|rpc|role|element)[^\]=]*=['"][^'"]+['"]\]/i.test(selector)) {
    score += 90;
  } else if (/\[data-[^\]=]+=['"][^'"]+['"]\]/.test(selector)) {
    score += 70;
  }

  if (/\.[\w-]+/.test(selector)) score += 70;

  if (/>/.test(selector)) score += 50;

  if (/:nth-of-type\(\d+\)/.test(selector)) score += 40;

  if (/\.container|\.row|\.col|\.box/.test(selector)) score -= 20;

  if ((selector.match(/>/g) || []).length > 3) score -= 25;

  if (/\b[a-z0-9]{6,}\b/.test(selector)) score -= 15;

  if (/data-v-/.test(selector)) score -= 20;

  if (/\._?[a-z0-9]+_[a-z0-9]+/.test(selector)) score -= 25;

  return Math.max(0, Math.min(score, 100));
}
