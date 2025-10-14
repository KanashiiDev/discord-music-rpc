/* ─────────────────── */
/*      Constants      */
/* ─────────────────── */
const SELECTOR_CONSTANTS = {
  MAX_COMBINATION_DEPTH: 6,
  MAX_COMBINATION_DEPTH_LIMIT: 12,
  MAX_PARENT_DEPTH: 5,
  MAX_RESULTS: 15,
  BLOCKED_IDS: ["userRpc-selectorOverlay", "userRpc-selectorHighlight"],
  BLOCKED_SELECTORS: ["#userRpc-selectorRoot"],

  SCORE_THRESHOLDS: {
    MIN_SELECTOR_SCORE: 5,
    BASIC_VARIANT: 10,
    PARENT_COMBO: 15,
    SMART_CHAIN: 25,
    CLASS_CHAIN: 30,
  },

  MATCH_LIMITS: {
    MAX_CLASS_MATCHES: 100,
    MAX_SELECTOR_LENGTH: 500,
    MAX_DEPTH_SAFETY: 8,
  },
};

// User Add RPC - Add Selector UI to the page
browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "startSelectorUI") {
    injectSelectorUI(msg.editMode);
  }
});

// Main function
async function injectSelectorUI(editMode = false) {
  const hostname = getCleanHostname();
  if (document.getElementById("userRpc-selectorContainer")) return;

  const container = createContainer();
  const shadow = attachShadowDOM(container);
  setupContainerStyles(container);

  const placeholderMap = createPlaceholderMap(hostname);
  const fields = getFieldList();
  const root = createRootElement();
  createTitleElements(root, editMode);

  const listItems = createFieldInputs(shadow, fields, placeholderMap);
  root.appendChild(listItems);

  createActionButtons(root, shadow);
  createStatusElement(root);
  createPreviewSection(root);

  shadow.appendChild(root);
  await injectStyles(shadow);

  setupDragFunctionality(root);
  positionElement(root);

  await populateExistingData(shadow, hostname);

  setupEventListeners(shadow);
  startPreviewLoop(shadow, editMode);
}

// User Add RPC - Element Selector
function startSelectorMode(field, shadowDoc) {
  showStatusMsg("Please click the element on the page with the mouse! \n(Press 'ESC' or click here to leave)", 0, 0, shadowDoc);

  // Clear old overlays/choosers
  cleanupOldSelectorElements(shadowDoc);

  // Add overlay and highlight
  const overlay = createOverlay("userRpc-selectorOverlay");
  const highlight = createOverlay("userRpc-selectorHighlight");
  document.body.append(overlay, highlight);

  // Cleanup
  const cleanup = () => {
    overlay.remove();
    highlight.remove();
    lastHighlightedElement = null;
    showStatusMsg("", 0, 0, shadowDoc);
    document.removeEventListener("mousemove", moveHighlightThrottled);
    document.removeEventListener("click", clickHandler, true);
    document.removeEventListener("keydown", escHandler);
  };

  // Event handler references
  const moveHighlightThrottled = throttle((e) => {
    if (e.clientX === moveHighlightThrottled.lastX && e.clientY === moveHighlightThrottled.lastY) {
      return;
    }
    moveHighlightThrottled.lastX = e.clientX;
    moveHighlightThrottled.lastY = e.clientY;

    updateHighlight(e, overlay, highlight, shadowDoc);
  }, 25);
  const clickHandler = (e) => handleElementClick(e, field, shadowDoc, cleanup);
  const escHandler = (e) => handleEscapeKey(e, cleanup, shadowDoc);

  // Event binding
  document.addEventListener("mousemove", moveHighlightThrottled);
  document.addEventListener("click", clickHandler, true);
  document.addEventListener("keydown", escHandler);
}
