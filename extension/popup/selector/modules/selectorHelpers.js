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

function createRootElement() {
  const root = document.createElement("div");
  root.id = "userRpc-selectorRoot";
  return root;
}

function createTitleElements(root, editMode) {
  const heading = document.createElement("h3");
  heading.className = "userRpc-h3";
  heading.textContent = "Discord Music RPC";
  root.appendChild(heading);

  const editTitle = document.createElement("h4");
  editTitle.className = "userRpc-h4";
  editTitle.textContent = editMode ? `Edit Current Music Site` : "Add New Music Site";
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
  statusDiv.id = "selectorStatus";
  statusDiv.style.marginTop = "10px";
  statusDiv.style.color = "green";
  root.appendChild(statusDiv);
}

// Make the selector draggable
function setupDragFunctionality(root) {
  let isDragging = false;
  let hasMoved = false;
  let offsetX = 0;
  let offsetY = 0;

  root.addEventListener("mousedown", function (e) {
    if (e.target !== root) return;
    isDragging = true;
    offsetX = e.clientX - root.offsetLeft;
    offsetY = e.clientY - root.offsetTop;
  });

  document.addEventListener("mousemove", function (e) {
    if (isDragging) {
      hasMoved = true;
      moveWithinBounds(e.clientX - offsetX, e.clientY - offsetY);
    }
  });

  document.addEventListener("mouseup", function () {
    isDragging = false;
  });

  window.addEventListener("resize", function () {
    if (hasMoved) {
      keepInsideViewport();
    } else {
      // If no movement has been made, stay on the right side.
      const rect = root.getBoundingClientRect();
      root.style.left = window.innerWidth - rect.width - 15 + "px";
      root.style.top = "15px";
    }
  });

  function moveWithinBounds(left, top) {
    const maxLeft = window.innerWidth - root.offsetWidth;
    const maxTop = window.innerHeight - root.offsetHeight;

    const newLeft = Math.max(0, Math.min(left, maxLeft));
    const newTop = Math.max(0, Math.min(top, maxTop));

    root.style.left = newLeft + "px";
    root.style.top = newTop + "px";
  }

  function keepInsideViewport() {
    const currentLeft = parseInt(root.style.left || 0);
    const currentTop = parseInt(root.style.top || 0);

    moveWithinBounds(currentLeft, currentTop);
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
      const statusDiv = shadow.getElementById("selectorStatus");
      statusDiv.style.color = "red";
      statusDiv.textContent = "Please fill in both the 'title' and 'artist' fields.";
      return;
    }

    // Check Selector Fields
    const checkFields = ["title", "artist", "timePassed", "duration"];
    let invalidFields = [];

    checkFields.forEach((f) => {
      if (selectors[f] && !getExistingElementSelector(selectors[f])) {
        invalidFields.push(formatLabel(f));
      }
    });

    if (invalidFields.length > 0) {
      const statusDiv = shadow.getElementById("selectorStatus");
      statusDiv.style.color = "red";

      statusDiv.textContent = "Invalid or not found selector(s):";

      const ul = document.createElement("ul");
      invalidFields.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = f;
        ul.appendChild(li);
      });

      statusDiv.appendChild(document.createElement("br"));
      statusDiv.appendChild(ul);

      return;
    }

    const statusDiv = shadow.getElementById("selectorStatus");
    statusDiv.style.color = "green";

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
    let parserArray = Array.isArray(settings.userParserSelectors) ? settings.userParserSelectors : [];

    const existingIndex = parserArray.findIndex((p) => p.id === id);
    if (existingIndex !== -1) {
      parserArray[existingIndex] = newEntry;
    } else {
      parserArray.push(newEntry);
    }

    await browser.storage.local.set({ userParserSelectors: parserArray });

    shadow.getElementById("selectorStatus").textContent = "Saved! Please refresh the page.";
  });

  // Close User Add RPC
  shadow.getElementById("closeSelectorUI").addEventListener("click", () => {
    clearInterval(window.previewInterval);
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
      pointerEvents: "none",
    });
  } else if (id === "userRpc-selectorHighlight") {
    Object.assign(el.style, {
      position: "absolute",
      outline: "2px solid red",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
  }

  return el;
}

// Selector Element Highlight Box
function updateHighlight(e, overlay, highlight) {
  const el = deepElementFromPoint(e.clientX, e.clientY);
  if (!el || [overlay, document.body, highlight].includes(el) || el.closest("#userRpc-selectorRoot")) return;

  const rect = el.getBoundingClientRect();
  Object.assign(highlight.style, {
    position: "absolute",
    border: "2px solid red",
    pointerEvents: "none",
    top: `${rect.top + window.scrollY}px`,
    left: `${rect.left + window.scrollX}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: 999999,
  });
}

// Handle Selector Element Click
function handleElementClick(e, field, shadowDoc, cleanup, statusEl) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const el = deepElementFromPoint(e.clientX, e.clientY);
  if (!el) {
    showTempStatus(statusEl, "You did not select a valid element. Please try again.");
    return;
  }

  if (isPointOnBlockedElement(e.clientX, e.clientY, shadowDoc)) {
    showTempStatus(statusEl, "This area cannot be selected. Please click a valid element.");
    return;
  }

  const semantic = detectSemanticRole(el);
  let targetEl = el;
  if (field && semantic && semantic !== field) {
    targetEl = semantic === "image" ? findImageElement(el) || el : semantic === "link" ? findLinkElement(el) || el : el;
  }

  const rawOptions = generateSelectorOptions(targetEl);
  const options = [...new Set(rawOptions)];
  const scored = options
    .filter((sel) => sel && sel.trim())
    .map((sel) => ({ sel, score: scoreSelector(sel) }))
    .sort((a, b) => b.score - a.score);

  if (options.length) {
    showSelectorChooser(scored, field, shadowDoc);
  } else {
    const selector = generateSmartSelector(targetEl);
    if (selector) {
      const input = shadowDoc.getElementById(`${field}Selector`);
      if (input) input.value = selector;
    }
  }

  cleanup();
}

// Selector ESC Exit
function handleEscapeKey(e, cleanup, statusEl) {
  if (e.key === "Escape") {
    cleanup();
    statusEl.textContent = "";
  }
}

// Selector Temp Status Message
function showTempStatus(statusEl, msg) {
  statusEl.textContent = msg;
  setTimeout(() => {
    if (statusEl.textContent.length > 1) statusEl.textContent = "Please click the element on the page with the mouse! (Press 'ESC' to leave)";
  }, 3000);
}
