function getCleanHostname() {
  return location.hostname.replace(/^https?:\/\/|^www\./g, "");
}

function createContainer() {
  const container = document.createElement("div");
  container.id = "userRpc-selectorContainer";
  document.body.appendChild(container);
  return container;
}

function attachShadowDOM(container) {
  return container.attachShadow({ mode: "open" });
}

function setupContainerStyles(container) {
  container.style.cssText = `
    all: initial !important;
    position: relative !important;
    z-index: 2147483647 !important;
    isolation: isolate !important;
  `;
}

function createPlaceholderMap(hostname) {
  return {
    name: "text (" + hostname + ")",
    regex: "regex.* or [/regex.*/]",
    source: "text or selector (#class, .class)",
    link: "url or selector (#class, .class)",
    image: "url or selector (#class, .class)",
    default: "selector (#class, .class)",
    buttonLink: "url or selector (#class, .class)",
    buttonText: "text or selector (#class, .class)",
    buttonText2: "text or selector (#class, .class)",
    buttonLink2: "url or selector (#class, .class)",
  };
}

function getFieldList() {
  return ["name", "title", "artist", "timePassed", "duration", "image", "link", "source", "buttonText", "buttonLink", "buttonText2", "buttonLink2", "regex"];
}

function createRootElement(theme, style = {}) {
  const root = document.createElement("div");
  root.id = "userRpc-selectorRoot";
  root.dataset.theme = theme || "dark";

  const contentLayer = document.createElement("div");
  contentLayer.className = "content";

  for (const [key, value] of Object.entries(style)) {
    if (key === "backdrop-filter") {
      contentLayer.style.setProperty(key, value);
    } else {
      root.style.setProperty(key, value);
    }
  }

  root.appendChild(contentLayer);
  root._contentLayer = contentLayer;

  return root;
}

function createTitleElements(root, editMode) {
  const heading = document.createElement("h3");
  heading.className = "userRpc-h3";
  heading.textContent = "Discord Music RPC";
  root.appendChild(heading);

  const editTitle = document.createElement("h4");
  editTitle.className = "userRpc-h4";
  editTitle.textContent = editMode ? "" : "Add New Music Site";
  root.appendChild(editTitle);
}

function createFieldInputs(shadow, fields, placeholderMap) {
  const listItems = document.createElement("div");
  listItems.className = "userRpc-listItems";

  fields.forEach((f) => {
    const label = document.createElement("label");
    label.className = "userRpc-label";
    label.id = `${f}Label`;
    label.textContent = formatLabel(f);

    const input = document.createElement("input");
    input.type = "text";
    input.id = `${f}Selector`;
    input.className = "userRpc-select";
    input.autocomplete = "off";
    input.placeholder = placeholderMap[f] || placeholderMap.default;

    const button = document.createElement("a");
    button.setAttribute("data-field", f);
    button.className = `userRpc-selectBtn ${f === "name" || f === "regex" ? "hidden" : ""}`;
    button.title = "Select with mouse click";
    button.id = `${f}Button`;
    button.textContent = "+";

    const br = document.createElement("br");
    br.id = `${f}Br`;

    listItems.appendChild(label);
    listItems.appendChild(input);
    listItems.appendChild(button);
    listItems.appendChild(br);
  });

  return listItems;
}

function createActionButtons(root, shadow) {
  const optionsDiv = document.createElement("div");
  optionsDiv.className = "userRpc-listItemOptions";

  const saveBtn = document.createElement("a");
  saveBtn.className = "userRpc-optionButtons";
  saveBtn.id = "saveSelectors";
  saveBtn.textContent = "Save";

  const exitBtn = document.createElement("a");
  exitBtn.className = "userRpc-optionButtons";
  exitBtn.id = "closeSelectorUI";
  exitBtn.textContent = "Exit";

  const addButtonsToggle = document.createElement("a");
  addButtonsToggle.className = "userRpc-optionButtons addButtonsToggle";
  addButtonsToggle.textContent = "Add Buttons";
  addButtonsToggle.addEventListener("click", () => {
    shadow.querySelectorAll('[id*="buttonText"], [id*="buttonLink"]').forEach((el) => {
      if (el.tagName === "BR") {
        el.style.display = "inline";
      } else if (el.tagName === "INPUT") {
        el.style.display = "inline-block";
      } else {
        el.style.display = "block";
      }
    });
    addButtonsToggle.remove();
  });

  optionsDiv.appendChild(addButtonsToggle);
  optionsDiv.appendChild(saveBtn);
  optionsDiv.appendChild(exitBtn);
  root.appendChild(optionsDiv);
}

function createStatusElement(root) {
  const statusDiv = document.createElement("div");
  statusDiv.id = "userRpc-selectorStatus";
  root.appendChild(statusDiv);
}

// Make the selector draggable
function setupDragFunctionality(root) {
  const content = root._contentLayer;

  let isDragging = false;
  let hasMoved = false;
  let offsetX = 0;
  let offsetY = 0;

  content.addEventListener("mousedown", (e) => {
    if (e.target !== e.currentTarget) return;

    isDragging = true;

    const rect = root.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    hasMoved = true;

    const newLeft = e.clientX - offsetX;
    const newTop = e.clientY - offsetY;

    moveWithinBounds(newLeft, newTop);
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  window.addEventListener("resize", () => {
    if (hasMoved) {
      keepInsideViewport();
    } else {
      const rect = root.getBoundingClientRect();
      root.style.left = window.innerWidth - rect.width - 15 + "px";
      root.style.top = "15px";
    }
  });

  function moveWithinBounds(left, top) {
    const maxLeft = window.innerWidth - root.offsetWidth;
    const maxTop = window.innerHeight - root.offsetHeight;

    root.style.left = Math.max(0, Math.min(left, maxLeft)) + "px";
    root.style.top = Math.max(0, Math.min(top, maxTop)) + "px";
  }

  function keepInsideViewport() {
    const rect = root.getBoundingClientRect();
    moveWithinBounds(rect.left, rect.top);
  }
}

// Inject Selector CSS
async function injectStyles(shadowRoot) {
  const response = await fetch(browser.runtime.getURL("popup/selector/selector.css"));
  const css = await response.text();

  try {
    const sheet = new CSSStyleSheet();
    await sheet.replace(css);

    if ("adoptedStyleSheets" in shadowRoot) {
      shadowRoot.adoptedStyleSheets = [...(shadowRoot.adoptedStyleSheets || []), sheet];
      return;
    }
  } catch (e) {}
  const style = document.createElement("style");
  style.textContent = css;
  shadowRoot.appendChild(style);
}

// Set the position of the Selector
function positionElement(root) {
  const rect = root.getBoundingClientRect();
  root.style.left = window.innerWidth - rect.width - 25 + "px";
  root.style.top = "15px";
  root.style.right = "";
}

// Fill Selector Fields
async function populateExistingData(shadow, hostname) {
  const pathname = location.pathname;

  // Get all user-added parsers for the current hostname
  const userParsers = (window.parsers?.[hostname] || []).filter((p) => p.userAdd);

  // Find a parser that matches the current page
  const matchedParser = userParsers.find((parser) => parser.patterns?.some((regex) => regex.test(pathname)));

  if (matchedParser) {
    const settings = await browser.storage.local.get("userParserSelectors");
    const parserArray = Array.isArray(settings.userParserSelectors) ? settings.userParserSelectors : [];

    const current = parserArray.find((p) => p.id === matchedParser.id);

    if (current?.selectors) {
      for (const [key, val] of Object.entries(current.selectors)) {
        const input = shadow.getElementById(`${key}Selector`);
        if (input) input.value = val;
      }
    }
  }
}

// Setup Selector Event Listeners
function setupEventListeners(shadow) {
  // Add startSelectorMode to the selection buttons.
  shadow.querySelectorAll(".userRpc-selectBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      startSelectorMode(field, shadow);
    });
  });

  // Prevent page shortcuts from breaking the inputs.
  const inputs = shadow.querySelectorAll("input");
  inputs.forEach((input) => {
    ["keydown", "keyup", "keypress"].forEach((eventType) => {
      input.addEventListener(
        eventType,
        (e) => {
          e.stopPropagation();
        },
        true
      );
    });
  });

  // Save User Add RPC
  shadow.getElementById("saveSelectors").addEventListener("click", async () => {
    const fields = ["name", "title", "artist", "timePassed", "duration", "image", "link", "source", "buttonText", "buttonLink", "buttonText2", "buttonLink2", "regex"];
    const selectors = {};
    fields.forEach((f) => {
      const val = shadow.getElementById(`${f}Selector`).value.trim();
      if (val) selectors[f] = val;
    });

    // Mandatory Fields
    if (!selectors.title || !selectors.artist) {
      showStatusMsg("Please fill in both the 'title' and 'artist' fields.", 1, 0, shadow);
      return;
    }

    // Check Selector Fields
    const checkFields = ["title", "artist", "timePassed", "duration"];
    const invalidFields = [];

    checkFields.forEach((f) => {
      if (selectors[f] && !getExistingElementSelector(selectors[f])) {
        invalidFields.push(formatLabel(f));
      }
    });

    if (invalidFields.length > 0) {
      showStatusMsg("Invalid or not found selector(s):", 1, 0, shadow);
      const ul = document.createElement("ul");
      invalidFields.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = f;
        ul.appendChild(li);
      });

      const statusDiv = shadow.getElementById("userRpc-selectorStatus");
      statusDiv.append(document.createElement("br"), ul);

      return;
    }

    const hostname = getCleanHostname();
    const rawPattern = selectors["regex"] || ".*";
    const patternStrings = Array.isArray(rawPattern) ? rawPattern.map((p) => p.toString()) : [rawPattern.toString()];
    const id = `${hostname}_${hashFromPatternStrings(patternStrings)}`;

    const newEntry = {
      id,
      domain: hostname,
      title: selectors["name"] || hostname,
      userAdd: true,
      urlPatterns: patternStrings,
      selectors,
    };

    const settings = await browser.storage.local.get("userParserSelectors");
    const parserArray = Array.isArray(settings.userParserSelectors) ? settings.userParserSelectors : [];

    const existingIndex = parserArray.findIndex((p) => p.id === id);
    if (existingIndex !== -1) {
      parserArray[existingIndex] = newEntry;
    } else {
      parserArray.push(newEntry);
    }

    await browser.storage.local.set({ userParserSelectors: parserArray });

    showStatusMsg("Saved! Please refresh the page.", 0, 0, shadow);
  });

  // Close User Add RPC
  shadow.getElementById("closeSelectorUI").addEventListener("click", () => {
    clearInterval(previewInterval);
    shadow.host.remove();
  });
}

// Clean Selector Elements
function cleanupOldSelectorElements(shadowDoc) {
  ["userRpc-selectorChooser-container", "userRpc-selectorOverlay", "userRpc-selectorHighlight"].forEach((id) => {
    shadowDoc.getElementById(id)?.remove();
    document.getElementById(id)?.remove();
  });
}

// Selector Overlay
function createOverlay(id) {
  const el = document.createElement("div");
  el.id = id;

  if (id === "userRpc-selectorOverlay") {
    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      background: "rgba(0, 0, 0, 0.1)",
      cursor: "crosshair",
      zIndex: "2147483646",
      pointerEvents: "auto",
    });
  } else if (id === "userRpc-selectorHighlight") {
    Object.assign(el.style, {
      position: "absolute",
      zIndex: "2147483647",
      pointerEvents: "auto",
    });
  }

  return el;
}

let lastHighlightedElement = null;
// Selector Element Highlight Box
function updateHighlight(e, overlay, highlight, shadowDoc) {
  const el = deepElementFromPoint(e.clientX, e.clientY);
  const isBlocked = isPointOnBlockedElement(e.clientX, e.clientY, shadowDoc);

  // Check the overlay and highlight
  if (!el || el === overlay || el === highlight || el === document.body || el === document.documentElement) {
    highlight.style.display = "none";
    lastHighlightedElement = null;
    return;
  }
  if (el.closest("#userRpc-selectorRoot")) {
    highlight.style.display = "none";
    lastHighlightedElement = null;
    return;
  }

  if (el !== lastHighlightedElement) {
    lastHighlightedElement = el;
    const rect = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block",
      position: "absolute",
      background: isBlocked
        ? `repeating-linear-gradient(135deg, rgba(255, 0, 0, 0.3) 0px, rgba(255, 0, 0, 0.3) 10px, rgba(255, 0, 0, 0.1) 10px, rgba(255, 0, 0, 0.1) 20px)`
        : "rgba(59, 130, 246, 0.1)",
      border: isBlocked ? "4px solid #ef4444" : "4px solid #3b82f6",
      pointerEvents: "none",
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + window.scrollX}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      contain: "layout style paint",
      zIndex: "2147483647",
    });
  }
}

// Handle Selector Element Click
function handleElementClick(e, field, shadowDoc, cleanup) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const el = deepElementFromPoint(e.clientX, e.clientY);
  const isBlocked = isPointOnBlockedElement(e.clientX, e.clientY, shadowDoc);

  if (isBlocked || !el) {
    showStatusMsg("This area cannot be selected. Please click a valid element.", 1, 1, shadowDoc);
    return;
  }

  let targetEl = el;
  if (targetEl.id && targetEl.id === "userRpc-selectorContainer") {
    cleanup();
    showStatusMsg("", 0, 0, shadowDoc);
    return;
  }
  if (!isValidElement(targetEl)) {
    showStatusMsg("Selected element is not valid or visible.\n Please choose another element.", 1, 1, shadowDoc);
    return;
  } else if (field === "image") {
    targetEl = findImageElement(el);
    if (!targetEl) {
      showStatusMsg("No image element found. Please click on an image.", 1, 1, shadowDoc);
      return;
    }
  } else if (field === "link") {
    targetEl = findLinkElement(el);
    if (!targetEl) {
      showStatusMsg("No link element found. Please click on a link.", 1, 1, shadowDoc);
      return;
    }
  } else {
    targetEl = findTextElement(el);
    if (!targetEl) {
      showStatusMsg("No text element found. Please click on a text.", 1, 1, shadowDoc);
      return;
    }
  }

  try {
    const selectors = generateSelectorOptions(targetEl);
    showSelectorChooser(selectors, field, shadowDoc);
  } catch (error) {
    showStatusMsg("Error generating selectors. Please try again.", 1, 1, shadowDoc);
  } finally {
    cleanup();
  }
}

// Selector ESC Exit
function handleEscapeKey(e, cleanup, shadowDoc) {
  if (e.key === "Escape") {
    cleanup();
    showStatusMsg("", 0, 0, shadowDoc);
  }
}

// Selector Status Message
let statusTimeoutId = null;
function showStatusMsg(msg, isAlert = false, isTemp = false, shadowDoc) {
  const statusEl = shadowDoc.getElementById("userRpc-selectorStatus");
  if (!statusEl) {
    console.warn("Element with ID 'userRpc-selectorStatus' not found");
    return;
  }

  // Clear the previous timeout
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }

  // Set the message
  statusEl.textContent = msg;

  if (!msg) {
    statusEl.classList.remove("open", "alert");
    return;
  }

  statusEl.classList.add("open");

  // Warning mode
  if (isAlert) {
    statusEl.classList.add("alert");

    if (isTemp) {
      statusTimeoutId = setTimeout(() => {
        // Reset
        if (statusEl.textContent === msg) {
          statusEl.textContent = "Please click the element on the page with the mouse! \n(Press 'ESC' or click here to leave)";
        }
        statusEl.classList.remove("alert");
        statusTimeoutId = null;
      }, 3000);
    }
  } else {
    statusEl.classList.remove("alert");
  }
}
