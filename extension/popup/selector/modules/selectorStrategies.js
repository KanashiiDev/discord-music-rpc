/**
 * Main Selector Production Function.
 * Generates unique selectors with a multi-layered strategy.
 */
function generateSelectorOptions(element) {
  if (!isValidElement(element)) return [];

  const allSelectors = new Set();

  // 1. Basic Variants
  generateSelectorVariants(element).forEach((v) => evaluateAndAddSelector(v, element, allSelectors));

  // 2. Parent Combinations
  generateParentCombinations(element).forEach((c) => evaluateAndAddSelector(c, element, allSelectors));

  // 3. Smart Chain
  const smartChain = buildSmartClassChain(element);
  if (smartChain) evaluateAndAddSelector(smartChain, element, allSelectors);

  // 4. Hybrid Selector
  if (allSelectors.size < 5) {
    const hybrid = generateHybridSelector(element);
    if (hybrid) evaluateAndAddSelector(hybrid, element, allSelectors);
  }

  return filterAndSortSelectors([...allSelectors], element);
}

/* ──────────────────────────────── */
/*         Hybrid Selector          */
/* ──────────────────────────────── */
function generateHybridSelector(element) {
  const path = [];
  let current = element;
  let safety = 0;

  while (current && current !== document.body && safety < SELECTOR_CONSTANTS.MATCH_LIMITS.MAX_DEPTH_SAFETY) {
    let part = current.tagName.toLowerCase();

    // 1. If there is an ID and it is appropriate — use it immediately
    if (current.id && !matchesAny(current.id, ID_BLOCKLIST_PATTERNS)) {
      part += `#${CSS.escape(current.id)}`;
      path.unshift(part);
      const fullPath = path.join(" > ");
      if (isUniqueSelector(fullPath, element)) return fullPath;
      break;
    }

    // 2. Add it if there is an appropriate class
    const goodClass = getGoodClass(current);
    if (goodClass) part += `.${CSS.escape(goodClass)}`;

    path.unshift(part);

    // 3. Is the path unique so far?
    const currentPath = path.join(" > ");
    if (isUniqueSelector(currentPath, element)) return currentPath;

    current = current.parentElement;
    safety++;
  }

  // Fallback: numeric path
  return generateNumericFallbackPath(element);
}

/* ──────────────────────────────── */
/*      Numeric Fallback Path       */
/* ──────────────────────────────── */
function generateNumericFallbackPath(element) {
  const pathWithIndex = [];
  let current = element;

  while (current && current !== document.body) {
    const parent = current.parentElement;
    const index = parent ? [...parent.children].indexOf(current) + 1 : 1;
    pathWithIndex.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }

  const finalPath = pathWithIndex.join(" > ");
  return isUniqueSelector(finalPath, element) ? finalPath : null;
}

/* ──────────────────────────────── */
/*       Parent Combinations        */
/* ──────────────────────────────── */
function generateParentCombinations(element) {
  const combinations = new Set();
  const elementVariants = generateSelectorVariants(element);

  let parent = element.parentElement;
  let depth = 0;

  while (parent && depth < SELECTOR_CONSTANTS.MAX_PARENT_DEPTH) {
    const parentSelector = getOptimizedParentSelector(parent);
    if (!parentSelector) {
      parent = parent.parentElement;
      depth++;
      continue;
    }

    for (const variant of elementVariants) {
      const combo = `${parentSelector} > ${variant}`;
      const evalResult = evaluateSelector(combo, element);

      if (evalResult.isUnique && evalResult.score > SELECTOR_CONSTANTS.SCORE_THRESHOLDS.PARENT_COMBO) {
        combinations.add(combo);
      }
    }

    parent = parent.parentElement;
    depth++;
  }

  return [...combinations];
}

/* ──────────────────────────────── */
/*          Parent Selector         */
/* ──────────────────────────────── */
function getOptimizedParentSelector(parent) {
  if (!parent) return null;

  // 1️. ID
  if (parent.id && !matchesAny(parent.id, ID_BLOCKLIST_PATTERNS)) {
    return `#${CSS.escape(parent.id)}`;
  }

  // 2️. Class
  const goodClasses = filterNonGenericClasses(safeGetClassList(parent));
  if (goodClasses.length > 0) {
    return `${parent.tagName.toLowerCase()}.${CSS.escape(goodClasses[0])}`;
  }

  // 3️. Data attributes
  const dataAttr = safeGetAttributes(parent).find((attr) => attr.name.startsWith("data-") && matchesAny(attr.name, STABLE_DATA_ATTRS) && attr.value?.trim());
  if (dataAttr) {
    return `[${dataAttr.name}="${CSS.escape(dataAttr.value)}"]`;
  }

  // 4️. Tag fallback
  return parent.tagName.toLowerCase();
}

/* ──────────────────────────────── */
/*       Selector Variants          */
/* ──────────────────────────────── */
function generateSelectorVariants(element) {
  const variants = new Set();
  const tag = element.tagName.toLowerCase();
  const attrs = safeGetAttributes(element);
  const nonGenericClasses = filterNonGenericClasses(safeGetClassList(element));

  addIdSelectors(element, tag, variants);
  addDataAttributeSelectors(attrs, variants);
  addOptimizedClassSelectors(element, tag, nonGenericClasses, variants);

  return [...variants];
}

function addIdSelectors(el, tag, set) {
  if (el.id && !matchesAny(el.id, ID_BLOCKLIST_PATTERNS)) {
    set.add(`#${CSS.escape(el.id)}`);
    set.add(`${tag}#${CSS.escape(el.id)}`);
  }
}

function addDataAttributeSelectors(attrs, set) {
  const dataAttrs = attrs
    .filter((attr) => attr.name.startsWith("data-") && !matchesAny(attr.name, DATA_BLOCKLIST_PATTERNS) && attr.value?.trim())
    .sort((a, b) => Number(matchesAny(b.name, STABLE_DATA_ATTRS)) - Number(matchesAny(a.name, STABLE_DATA_ATTRS)));

  dataAttrs.forEach((attr) => set.add(`[${attr.name}="${CSS.escape(attr.value)}"]`));
}

function addOptimizedClassSelectors(el, tag, classes, set) {
  if (classes.length === 0) return;
  const limited = classes.slice(0, 10);

  // Single class selectors
  limited.forEach((cls) => {
    const sel = `.${CSS.escape(cls)}`;
    set.add(sel);
    set.add(`${tag}${sel}`);
  });

  // Combination
  if (classes.length >= 2) {
    const combo = classes.map((c) => `.${CSS.escape(c)}`).join("");
    set.add(combo);
    set.add(`${tag}${combo}`);
  }

  // Parent context
  limited.forEach((cls) => addParentContextSelectors(el, `.${CSS.escape(cls)}`, set));
}

/* ──────────────────────────────── */
/*     Parent Context Selectors     */
/* ──────────────────────────────── */
function addParentContextSelectors(el, clsSelector, set) {
  const tag = el.tagName.toLowerCase();
  let parent = el.parentElement;

  for (let depth = 0; depth < 3 && parent && parent !== document.body; depth++) {
    const parentSelector = getOptimizedParentSelector(parent);
    if (!parentSelector) {
      parent = parent.parentElement;
      continue;
    }

    const parentHasClass = hasNonGenericClass(parent);
    const elHasClass = hasNonGenericClass(el);

    if (parentHasClass || elHasClass) {
      const childCombo = `${parentSelector} > ${tag}`;
      if (isUniqueSelector(childCombo, el)) set.add(childCombo);
    }

    if (parentHasClass && elHasClass) {
      const descCombo = `${parentSelector} ${tag}`;
      if (isUniqueSelector(descCombo, el)) set.add(descCombo);
    }

    parent = parent.parentElement;
  }
}

/* ──────────────────────────────── */
/*        Smart Class Chain         */
/* ──────────────────────────────── */
function buildSmartClassChain(el, depth = SELECTOR_CONSTANTS.MAX_COMBINATION_DEPTH, limit = SELECTOR_CONSTANTS.MAX_COMBINATION_DEPTH_LIMIT) {
  let chain = buildSmartClassChainPass(el, depth);
  while (!chain && depth < limit) chain = buildSmartClassChainPass(el, ++depth);
  return chain;
}

function buildSmartClassChainPass(el, maxDepth) {
  const chain = [];
  let current = el;

  for (let d = 0; d < maxDepth && current && current !== document.body; d++) {
    const best = getSmartSelector(current, d);
    chain.unshift(best);

    const full = chain.join(" > ");
    const evalRes = evaluateSelector(full, el);

    if (evalRes.isUnique && chain.length >= 2 && evalRes.score > SELECTOR_CONSTANTS.SCORE_THRESHOLDS.CLASS_CHAIN) return full;

    current = current.parentElement;
  }

  const final = chain.join(" > ");
  const finalEval = evaluateSelector(final, el);
  return finalEval.isUnique && finalEval.score > SELECTOR_CONSTANTS.SCORE_THRESHOLDS.SMART_CHAIN ? final : null;
}

/* ──────────────────────────────── */
/*         Helper Functions         */
/* ──────────────────────────────── */
function getSmartSelector(el) {
  if (el.id && !matchesAny(el.id, ID_BLOCKLIST_PATTERNS)) {
    const idSel = `#${CSS.escape(el.id)}`;
    if (isUniqueSelector(idSel, el)) return idSel;
  }

  const clsSel = getBestClassSelector(el);
  if (clsSel) return clsSel + (getNumericSuffix(el) || "");

  const dataSel = getBestDataSelector(el);
  if (dataSel) return dataSel;

  return getNumericSelector(el);
}

function getGoodClass(el) {
  return filterNonGenericClasses(safeGetClassList(el)).find((cls) => safeQuery(`.${CSS.escape(cls)}`).length < 15);
}

function hasNonGenericClass(el) {
  return filterNonGenericClasses(safeGetClassList(el)).length > 0;
}

function matchesAny(value, patterns) {
  return patterns.some((re) => re.test(value));
}

function isUniqueSelector(selector, el) {
  return evaluateSelector(selector, el).isUnique;
}

function getBestClassSelector(element) {
  const nonGenericClasses = filterNonGenericClasses(safeGetClassList(element));
  if (nonGenericClasses.length === 0) return null;

  // Check only first 10 classes for performance
  const classesToCheck = nonGenericClasses.slice(0, 10);

  for (const cls of classesToCheck) {
    const selector = `.${CSS.escape(cls)}`;
    const matches = safeQuery(selector);

    // Use if reasonable number of matches
    if (matches.length > 0 && matches.length < SELECTOR_CONSTANTS.MATCH_LIMITS.MAX_CLASS_MATCHES) {
      return selector;
    }
  }

  return null;
}

function getNumericSuffix(element) {
  const parent = element.parentElement;
  if (!parent) return null;

  const siblings = Array.from(parent.children);
  const nonGenericClasses = filterNonGenericClasses(safeGetClassList(element));
  const classSignature = nonGenericClasses.join();

  const sameClassSiblings = siblings.filter((sibling) => sibling !== element && filterNonGenericClasses(safeGetClassList(sibling)).join() === classSignature);

  if (sameClassSiblings.length > 0) {
    const index = siblings.indexOf(element) + 1;
    return `:nth-child(${index})`;
  }

  const sameTagSiblings = siblings.filter((sibling) => sibling !== element && sibling.tagName === element.tagName);
  if (sameTagSiblings.length > 0) {
    const sameTagIndex = siblings.filter((s) => s.tagName === element.tagName).indexOf(element) + 1;
    return `:nth-of-type(${sameTagIndex})`;
  }

  return null;
}

function getBestDataSelector(element) {
  const dataAttrs = safeGetAttributes(element)
    .filter((attr) => attr.name.startsWith("data-") && !DATA_BLOCKLIST_PATTERNS.some((re) => re.test(attr.name)))
    .map((attr) => `[${attr.name}="${CSS.escape(attr.value)}"]`)
    .filter((sel) => evaluateSelector(sel, element).isUnique);

  return dataAttrs.length > 0 ? dataAttrs[0] : null;
}

function getNumericSelector(element) {
  const parent = element.parentElement;
  if (!parent) return element.tagName.toLowerCase();

  const siblings = Array.from(parent.children);
  const index = siblings.indexOf(element) + 1;
  return `${element.tagName.toLowerCase()}:nth-child(${index})`;
}
