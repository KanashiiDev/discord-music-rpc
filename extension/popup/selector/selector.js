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
  const statusEl = shadowDoc.getElementById("selectorStatus");
  statusEl.textContent = "Please click the element on the page with the mouse! (Press 'ESC' to leave)";

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
    shadowDoc.getElementById("selectorStatus").textContent = "";
    document.removeEventListener("mousemove", moveHighlightThrottled);
    document.removeEventListener("click", clickHandler, true);
    document.removeEventListener("keydown", escHandler);
  };

  // Event handler references
  const moveHighlightThrottled = throttle((e) => updateHighlight(e, overlay, highlight), 25);
  const clickHandler = (e) => handleElementClick(e, field, shadowDoc, cleanup, statusEl);
  const escHandler = (e) => handleEscapeKey(e, cleanup, statusEl);

  // Event binding
  document.addEventListener("mousemove", moveHighlightThrottled);
  document.addEventListener("click", clickHandler, true);
  document.addEventListener("keydown", escHandler);
}
