// Selector Evaluation
function evaluateSelector(selector, targetEl = null) {
  const nodes = safeQuery(selector);

  // Uniqueness check
  let isUnique = false;
  if (nodes.length === 1) isUnique = true;
  else if (targetEl && nodes[0] === targetEl) {
    const hasId = selector.includes("#");
    const hasClass = selector.includes(".");
    const hasDataAttr = STABLE_DATA_ATTRS.some((p) => p.test(selector));
    const isTagOnly = /^[a-zA-Z]+$/.test(selector.trim());
    if ((hasId || hasClass || hasDataAttr) && !isTagOnly) isUnique = true;
  }

  if (!isUnique) return { score: 0, isUnique: false, isClassChain: false, isSmartChain: false };

  let score = 50;
  const parts = selector.split(" > ");
  const testAttrFlag = isTestAttribute(selector);

  const bonus = getSelectorBonus(selector, parts, testAttrFlag);
  const penalty = getSelectorPenalty(selector, parts, testAttrFlag);

  score += bonus.score;
  score -= penalty;

  score = Math.max(SELECTOR_CONSTANTS.SCORE_THRESHOLDS.MIN_SELECTOR_SCORE, Math.min(score, 100));

  return {
    score,
    isUnique,
    isClassChain: bonus.isClassChain,
    isSmartChain: selector.includes(":nth-child(") || bonus.isClassChain,
    isTestAttribute: testAttrFlag,
  };
}

function getSelectorBonus(selector, parts, testAttrFlag) {
  let score = 0;

  // Test attribute bonus
  if (testAttrFlag) score += 40;

  // ID bonus
  if (/^#[\w-]+$/.test(selector)) score += 35;
  else if (selector.includes("#") && !testAttrFlag) score += 25;

  // Stable data attribute bonus
  if (STABLE_DATA_ATTRS.some((p) => p.test(selector)) && !testAttrFlag) score += 20;

  // Class chain bonus
  const classPartsCount = parts.filter((p) => p.startsWith(".")).length;
  const isClassChain = classPartsCount >= Math.floor(parts.length * 0.6);
  if (isClassChain) score += Math.min(classPartsCount * 5, 20);

  // Semantic BEM bonus
  const bemDoubleUnderscore = (selector.match(/__/g) || []).length;
  const bemDoubleDash = (selector.match(/--/g) || []).length;
  score += Math.min(bemDoubleUnderscore * 5, 15);
  score += Math.min(bemDoubleDash * 4, 12);

  // Simple selector and length bonus
  if (SIMPLE_PATTERNS.some((p) => p.test(selector))) score += 15;
  if (selector.length < 40) score += 12;
  if (!selector.includes(":nth-")) score += 10;

  return { score, isClassChain };
}

function getSelectorPenalty(selector, parts, testAttrFlag) {
  let penalty = 0;

  if (selector.length > 100) penalty += 10;
  if ((selector.match(/>/g) || []).length > 5) penalty += 7;

  if (!testAttrFlag && (selector.includes(":nth-of-type") || selector.includes(":nth-child"))) penalty += 5;

  if (/^\w+\s*>\s*\w+$/.test(selector)) penalty += 20;

  const chainLength = parts.length;
  if (chainLength > 3) {
    penalty += isTestAttribute(selector) ? Math.min((chainLength - 3) * 3, 15) : Math.min((chainLength - 3) * 5, 25);
  }

  return penalty;
}

// Selector Filtering and Sorting
function normalizeSelectorStructure(selector) {
  return selector
    .replace(/#[\w-]+/g, "#id")
    .replace(/\.[\w-]+/g, ".class")
    .replace(/:nth-[^ >]+/g, ":nth")
    .replace(/\[data-[^\]]+\]/g, "[data]");
}

function isTestAttribute(selector) {
  return STABLE_DATA_ATTRS.some((attr) => attr.test(selector));
}

function isSimilarSelector(selA, selB, threshold = 70) {
  const nodesA = new Set(safeQuery(selA));
  const nodesB = new Set(safeQuery(selB));

  const intersection = [...nodesA].filter((x) => nodesB.has(x));
  const union = new Set([...nodesA, ...nodesB]);
  const domOverlapScore = (intersection.length / union.size) * 100;
  if (domOverlapScore === 100) return true;

  const partsA = selA.split(/ > |\s+/);
  const partsB = selB.split(/ > |\s+/);

  let score = 0;
  for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
    const a = partsA[i],
      b = partsB[i];

    const idA = (a.match(/#([\w-]+)/) || [])[1];
    const idB = (b.match(/#([\w-]+)/) || [])[1];
    if (idA && idB) score += idA === idB ? 50 : -20;

    const classesA = a.match(/\.[\w-]+/g) || [];
    const classesB = b.match(/\.[\w-]+/g) || [];
    score += classesA.filter((c) => classesB.includes(c)).length * 10;

    const tagA = a.replace(/[#.].*$/, "");
    const tagB = b.replace(/[#.].*$/, "");
    if (tagA && tagB) score += tagA === tagB ? 10 : -5;

    if (a.includes(">") !== b.includes(">")) score -= 5;
  }

  score = Math.min(100, Math.max(0, score));
  return score >= threshold;
}

function filterAndSortSelectors(selectors, targetElement, maxResults = SELECTOR_CONSTANTS.MAX_RESULTS) {
  const evaluated = selectors
    .map((selector) => ({ selector, ...evaluateSelector(selector, targetElement) }))
    .filter((item) => item.isUnique && item.score > 10)
    .sort((a, b) => b.score - a.score);

  const seenStructures = new Set();
  const results = [];

  for (const item of evaluated) {
    if (results.length >= maxResults) break;

    const structureKey = normalizeSelectorStructure(item.selector);
    const isSimilar = Array.from(seenStructures).some((seen) => isSimilarSelector(structureKey, seen));

    if (!isSimilar || item.score > 60 || item.isSmartChain) {
      if (!isSimilar) seenStructures.add(structureKey);
      results.push({ sel: item.selector, score: item.score });
    }
  }

  return results;
}

// Helper: Evaluate and add selector to Set
function evaluateAndAddSelector(selector, element, selectorSet, minScore = SELECTOR_CONSTANTS.SCORE_THRESHOLDS.BASIC_VARIANT) {
  const evaluation = evaluateSelector(selector, element);
  if (evaluation.isUnique && evaluation.score > minScore) selectorSet.add(selector);
}
