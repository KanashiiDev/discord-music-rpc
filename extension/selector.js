async function getIconAsDataUrl() {
  const iconUrl = chrome.runtime.getURL("icons/128x128.png");
  const response = await fetch(iconUrl);
  const blob = await response.blob();

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

// User Add RPC - Load All Saved User Parsers
function parseRegexArray(input) {
  try {
    const trimmed = input.trim();
    const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1).trim() : trimmed;

    if (!inner) return [/.*/];

    const parts = inner
      .split(/,(?![^\[]*\])/g)
      .map((s) => s.trim())
      .filter(Boolean);

    const regexes = parts.map((str) => {
      const m = str.match(/^\/(.+)\/([gimsuy]*)$/);
      try {
        return m ? new RegExp(m[1], m[2]) : new RegExp(str);
      } catch {
        return /.*/;
      }
    });

    return regexes.length ? regexes : [/.*/];
  } catch {
    return [/.*/];
  }
}

// User Add RPC - Add Selector UI to the page
browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "startSelectorUI") {
    injectSelectorUI();
  }
});

let previewInterval = null;

async function injectSelectorUI() {
  const hostname = location.hostname.replace(/^https?:\/\/|^www\./g, "");
  if (document.getElementById("userRpc-selectorContainer")) return;

  // Shadow DOM container
  const container = document.createElement("div");
  container.id = "userRpc-selectorContainer";
  document.body.appendChild(container);

  // Attach shadow root
  const shadow = container.attachShadow({ mode: "open" });
  container.style.all = "initial"; // All heritage style is reset
  container.style.position = "relative"; // Layout Correction
  container.style.cssText = `
    all: initial !important;
    position: relative !important;
    z-index: 2147483647 !important;
    isolation: isolate !important;
  `;

  // User Add RPC - CSS
  const selectorCSS = `
    :host {
      all: initial;
      position: relative;
      z-index: 2147483647;
    }

    #userRpc-selectorRoot {
      position: fixed;
      top: 15px;
      right: 15px;
      width: 350px !important;
      height: auto;
      -webkit-box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
      z-index: 999999;
      max-height: 90vh !important;
      font-family: "Segoe UI", sans-serif;
      margin: 0;
      padding: 16px;
      background-color: #1e1e1e;
      color: #e0e0e0;
      border-radius: 6px;
      border: 1px solid #3c3c3c;
    }
  
    #userRpc-selectorChooser-container {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      -webkit-box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
      z-index: 999999;
      max-width: 90%;
      font-family: "Segoe UI", sans-serif;
      margin: 0;
      padding: 16px;
      background-color: #1e1e1e;
      color: #e0e0e0;
      border-radius: 6px;
      border: 1px solid #3c3c3c
    }

    .userRpc-h3 {
      font-size: 18px !important;
      margin-bottom: 12px !important;
      text-align: center !important;
      color: #e1e1e1 !important;
    }

    .userRpc-listItems {
      display: -ms-grid;
      display: grid;
      -ms-grid-columns: auto auto auto 0;
      grid-template-columns: auto auto auto 0;
      align-items: center;
    }

    .userRpc-listItemOptions {
      display: -ms-grid;
      display: grid;
      -ms-grid-columns: 1fr 1fr;
      grid-template-columns: 1fr 1fr;
      margin-top: 10px;
    }

    .userRpc-selectBtn,
    .userRpc-optionButtons {
      padding: 8px !important;
      -webkit-border-radius: 8px !important;
      border-radius: 8px !important;
      background-color: #2c2c2c;
      -webkit-box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      cursor: pointer;
      -webkit-transition: background 0.2s;
      transition: background 0.2s;
      color: #fff;
      text-decoration: none;
      text-align: center;
      margin: 5px !important;
      border: 1px solid #3c3c3c;
    }

    .userRpc-selectBtn {
      align-content: center;
      padding: 4px !important;
      border-radius: 4px !important;
      -webkit-border-radius: 4px !important;
      height: 30px !important;
      padding: 2px !important;
    }

    .userRpc-selectBtn.hidden {
      pointer-events:none;
      visibility:hidden;
      width:0;
      height:0
    }

    .userRpc-regexStatus {
     text-align: center;
     width: auto
    }

    .userRpc-select {
      height: 30px !important;
      padding: 4px !important;
      color: #e1e1e1 !important;
      outline: none !important;
      border: 1px solid #3c3c3c !important;
      background: #393939 !important;
      border-radius: 4px !important;
      -webkit-border-radius: 4px !important;
    }

    #regexSelector.userRpc-select {
      margin-top: 4px
    }

    .userRpc-select:focus-visible {
      outline: 1px solid #6d6d6d !important;
    }

    .userRpc-selectBtn:hover,
    .userRpc-optionButtons:hover {
      background-color: #3a3a3a !important;
    }

    #userRpc-selectorRoot,
    #userRpc-selectorChooser-container-list {
      overflow-y: auto;
      max-height: 80vh;
    }

    #userRpc-selectorRoot::-webkit-scrollbar-thumb,
    #userRpc-selectorRoot::-webkit-scrollbar,
    #userRpc-selectorChooser-container-list::-webkit-scrollbar-thumb,
    #userRpc-selectorChooser-container-list::-webkit-scrollbar {
      background: var(--color-background);
      -webkit-border-radius: 4px;
      border-radius: 4px
    }

    #userRpc-selectorRoot::-webkit-scrollbar-corner,
    #userRpc-selectorRoot::-webkit-scrollbar-track,
    #userRpc-selectorChooser-container-list::-webkit-scrollbar-corner,
    #userRpc-selectorChooser-container-list::-webkit-scrollbar-track {
      background: #fff0
    }

    #userRpc-selectorRoot::-webkit-scrollbar-thumb,
    #userRpc-selectorChooser-container-list::-webkit-scrollbar-thumb {
      background: #2a2a2a;
    }

    #userRpc-selectorChooser-button {
      display: block;
      border: 1px solid rgb(85, 85, 85);
      cursor: pointer;
      width: calc(100% - 10px)!important;
      text-align: left;
    }

    #userRpc-selectorChooser-cancel {
      display:block;
      margin-top: 15px !important;
    }

    .rpc-preview .card {
      background-color: #2a2a2a;
      border-radius: 8px;
      width: 350px;
      color: #dbdee1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
    }

    .rpc-preview .header {
      font-size: 12px;
      font-weight: 500;
      color: #b5bac1;
      padding: 12px 16px 0 16px;
    }

    .rpc-preview .body {
      display: flex;
      padding: 12px 16px 16px 16px;
    }

    .rpc-preview .imageContainer img {
      width: 60px;
      height: 60px;
      border-radius: 4px;
    }

    .rpc-preview .details {
      margin-left: 12px;
      flex: 1;
    }

    .rpc-preview .details h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    }

    .rpc-preview .details .artist,
    .rpc-preview .details .source {
      font-size: 12px;
      color: #b5bac1;
    }

    .rpc-preview .progress-container {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .rpc-preview .progress-container .time {
      font-size: 11px;
      color: #b5bac1;
    }

    .rpc-preview .progress-bar {
      position: relative;
      background-color: #404249;
      height: 4px;
      border-radius: 2px;
      flex-grow: 1;
    }

    .rpc-preview .progress-bar .progress {
      background-color: #ffffff;
      height: 100%;
      width: 55.49%;
      border-radius: 2px;
    }

    .rpc-preview .link-container {
      margin-top: 12px;
    }

    .rpc-preview .link {
      background-color: #494a52;
      border: none;
      color: white;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
      width: 222px;
      transition: background-color 0.2s;
      display: block;
      text-align: center;
      text-decoration: none;
    }

    .rpc-preview .link:hover {
      background-color: #50515a;
    }
  `;
  const style = document.createElement("style");
  style.textContent = selectorCSS;
  style.id = "userRpc-CSS";

  // User Add RPC - Document CSS
  const documentCSS = `
    #userRpc-selectorOverlay {
    position: fixed!important;
    top: 0!important;
    left: 0!important;
    width: 100vw!important;
    height: 100vh!important;
    background: rgba(0, 0, 0, 0.1)!important;
    cursor: crosshair!important;
    z-index: 2147483646!important;
    pointer-events: none!important;
  }

  #userRpc-selectorHighlight {
    position: absolute!important;
    outline: 2px solid red!important;
    z-index: 2147483647!important;
    pointer-events: none!important;
  }
`;
  const documentStyle = document.createElement("style");
  documentStyle.textContent = documentCSS;
  documentStyle.id = "userRpc-documentCSS";
  document.head.appendChild(documentStyle);

  // User Add RPC - Main
  function formatLabel(name) {
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    return capitalized.replace(/([A-Z])/g, " $1").trim();
  }

  const root = document.createElement("div");
  root.id = "userRpc-selectorRoot";
  root.innerHTML = `
    <h3 class="userRpc-h3">Discord Music RPC - User Add</h3>
    <div class="userRpc-listItems">
      ${["name", "title", "artist", "timePassed", "duration", "image", "link", "source", "regex"]
        .map(
          (f) => `
      <label>${formatLabel(f)}</label>
      <input type="text" id="${f}Selector" class="userRpc-select" placeholder="${((p) => p[f] || p.default)({
            name: "text (" + hostname + ")",
            regex: "regex.* or [/regex.*/]",
            source: "text or selector (#class, .class)",
            link: "url or selector (#class, .class)",
            image: "url or selector (#class, .class)",
            default: "selector (#class, .class)",
          })}"/>
      <a data-field="${f}" class="userRpc-selectBtn ${f === "name" ? "hidden" : f === "regex" ? "hidden" : ""}" title="Select with mouse click">+</a><br>`
        )
        .join("")}
    </div>
    <div class="userRpc-listItemOptions">
      <a class="userRpc-optionButtons" id="saveSelectors">Save</a>
      <a class="userRpc-optionButtons" id="closeSelectorUI">Exit</a>
    </div>
    <div id="selectorStatus" style="margin-top: 10px; color: green"></div>
    <div class="rpc-preview">
      <h3>Preview</h3>
      <div class="card">
        <div class="header">Listening to</div>
        <div class="body">
          <div class="imageContainer">
            <img src="${chrome.runtime.getURL("icons/128x128.png")}" alt="Image" />
          </div>
          <div class="details">
            <h2 class="title">Title</h2>
            <div class="artist">Artist</div>
            <div class="source">Source</div>
            <div class="progress-container">
              <span class="timePassed">00:00</span>
              <div class="progress-bar">
                <div class="progress"></div>
              </div>
              <span class="duration">00:00</span>
            </div>
            <div class="link-container">
              <a class="link">Open on Source</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;

  shadow.appendChild(style);
  shadow.appendChild(root);
  const shadowDoc = shadow;

  // User Add RPC - Make Draggable
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  root.addEventListener("mousedown", function (e) {
    if (e.target !== root) return;
    isDragging = true;
    offsetX = e.clientX - root.offsetLeft;
    offsetY = e.clientY - root.offsetTop;
    root.style.zIndex = 1000;
  });

  document.addEventListener("mousemove", function (e) {
    if (isDragging) {
      root.style.left = e.clientX - offsetX + "px";
      root.style.top = e.clientY - offsetY + "px";
    }
  });

  document.addEventListener("mouseup", function () {
    isDragging = false;
  });

  const pathname = location.pathname;

  // Get all user-added parsers for the current hostname
  const userParsers = (window.parsers?.[hostname] || []).filter((p) => p.userAdd);

  // Find a parser that matches the current page
  const matchedParser = userParsers.find((parser) => parser.patterns?.some((regex) => regex.test(pathname)));

  if (matchedParser) {
    const settings = await browser.storage.sync.get("userParserSelectors");
    const parserArray = Array.isArray(settings.userParserSelectors) ? settings.userParserSelectors : [];

    const current = parserArray.find((p) => p.id === matchedParser.id);

    if (current?.selectors) {
      for (const [key, val] of Object.entries(current.selectors)) {
        const input = shadowDoc.getElementById(`${key}Selector`);
        if (input) input.value = val;
      }
    }
  }

  // Add startSectoMode to the selection buttons.
  shadowDoc.querySelectorAll(".userRpc-selectBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      startSelectorMode(field, shadowDoc);
    });
  });

  // Prevent page shortcuts from breaking the inputs.
  const inputs = shadowDoc.querySelectorAll("input");
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
  shadowDoc.getElementById("saveSelectors").addEventListener("click", async () => {
    const fields = ["name", "title", "artist", "timePassed", "duration", "image", "link", "source", "regex"];
    const selectors = {};
    fields.forEach((f) => {
      const val = shadowDoc.getElementById(`${f}Selector`).value.trim();
      if (val) selectors[f] = val;
    });

    const hostname = location.hostname.replace(/^https?:\/\/|^www\./g, "");
    const rawPattern = selectors["regex"] || ".*";
    const patternStrings = Array.isArray(rawPattern) ? rawPattern.map((p) => p.toString()) : [rawPattern.toString()];

    // If the hashFromPatternStrings function exists globally, use it directly.
    const id = `${hostname}_${hashFromPatternStrings(patternStrings)}`;

    const newEntry = {
      id,
      domain: hostname,
      title: selectors["name"] || hostname,
      userAdd: true,
      urlPatterns: patternStrings,
      selectors,
    };

    const settings = await browser.storage.sync.get("userParserSelectors");
    let parserArray = Array.isArray(settings.userParserSelectors) ? settings.userParserSelectors : [];

    const existingIndex = parserArray.findIndex((p) => p.id === id);
    if (existingIndex !== -1) {
      parserArray[existingIndex] = newEntry;
    } else {
      parserArray.push(newEntry);
    }

    await browser.storage.sync.set({ userParserSelectors: parserArray });

    shadowDoc.getElementById("selectorStatus").textContent = "Saved! Please refresh the page.";
  });

  // Close User Add RPC
  shadowDoc.getElementById("closeSelectorUI").addEventListener("click", () => {
    clearInterval(previewInterval);
    container.remove();
    document.getElementById("userRpc-documentCSS").remove();
  });

  function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
  }

  function secondToTime(seconds) {
    if (!isFinite(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  // User Add RPC - Update Preview
  function updatePreview() {
    const getValue = (id) => shadowDoc.getElementById(id)?.value?.trim();
    const getElement = (selector) => {
      if (!selector) return null;
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    };
    const getImageSrc = (el) => {
      if (!el) return null;
      if (el.src) return el.src;
      const bgImage = window.getComputedStyle(el).backgroundImage;
      const match = bgImage?.match(/url\(["']?(.*?)["']?\)/);
      return match?.[1] || null;
    };

    const isValidUrl = (url) => {
      const pattern = /^(https?:\/\/)?(([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}|((\d{1,3}\.){3}\d{1,3})(:\d+)?(\/[-a-z\d%_.~+]*)*(\?[;&a-z\d%_.~+=-]*)?(#[-a-z\d_]*)?$/i;
      return pattern.test(url);
    };

    const cleanStr = (str) => {
      const pattern = /[\[(]\s*(free\s+(download|song|now)|download\s+(free|now))\s*[\])]/gi;
      return str?.replace(pattern, "").trim();
    };

    function cleanTitle(song, artist) {
      const escapedArtist = artist.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`^\\s*${escapedArtist}\\s*[-–:|]?\\s*`, "i");
      return song.replace(regex, "").trim();
    }

    // Get selectors
    const selectors = {
      name: getValue("nameSelector"),
      image: getValue("imageSelector"),
      title: getValue("titleSelector"),
      artist: getValue("artistSelector"),
      timePassed: getValue("timePassedSelector"),
      duration: getValue("durationSelector"),
      link: getValue("linkSelector"),
      source: getValue("sourceSelector"),
      regex: getValue("regexSelector"),
    };

    // Get elements
    const elements = {
      name: getElement(selectors.name),
      image: getElement(selectors.image),
      title: getElement(selectors.title),
      artist: getElement(selectors.artist),
      timePassed: getElement(selectors.timePassed),
      duration: getElement(selectors.duration),
      link: getElement(selectors.link),
      source: getElement(selectors.source),
    };

    let texts = {
      name: elements.name?.textContent || selectors.name || location.hostname,
      title: elements.title?.textContent || selectors.title || "title",
      artist: elements.artist?.textContent || selectors.artist || "artist",
      source: elements.source?.textContent || selectors.source || "source",
      timePassed: elements.timePassed?.textContent,
      duration: elements.duration?.textContent,
    };

    // Trim texts
    texts = Object.fromEntries(Object.entries(texts).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));

    // Clean Title
    if (texts.title) {
      cleanStr(texts.title);
    }

    // If artist name contains title, clean it
    if (texts.title && texts.artist) {
      texts.title = cleanTitle(texts.title, texts.artist);
    }

    // If "5:47 /6:57" style string is found, split into both
    if (texts.timePassed?.includes("/") && texts.duration?.includes("/")) {
      const [tp, dur] = texts.timePassed.split("/");
      texts.timePassed = tp?.trim();
      texts.duration = dur?.trim();
    }

    const previewRoot = shadowDoc.querySelector(".rpc-preview");
    if (!previewRoot) return;

    const details = previewRoot.querySelector(".details");

    const setText = (selector, value) => {
      const el = details.querySelector(selector);
      if (el && el.textContent !== value) {
        el.textContent = value;
      }
    };

    const setImage = () => {
      const img = previewRoot.querySelector(".imageContainer img");
      const imageSrc = getImageSrc(elements.image) || chrome.runtime.getURL("icons/128x128.png");
      const prevImg = img.getAttribute("data-prev-image");

      if (imageSrc !== prevImg) {
        img.setAttribute("data-prev-image", imageSrc);
        if (img) img.src = imageSrc;
      }
    };

    const setLink = () => {
      const el = details.querySelector(".link");
      const href = elements.link?.href || (isValidUrl(selectors.link) ? selectors.link : location.origin);
      const linkText = `open on ${texts.source}`;
      if (el) {
        if (el.href !== href) el.href = href;
        if (el.textContent !== linkText) el.textContent = linkText;
      }
    };
    const regexSelector = shadowDoc.getElementById("regexSelector");
    const regexMark = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13L9 17L19 7" stroke="green" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const regexCross = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6L18 18M6 18L18 6" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    // If the next element is a remove <a>
    if (regexSelector.nextElementSibling && regexSelector.nextElementSibling.tagName === "A") {
      regexSelector.nextElementSibling.remove();
    }

    // If the next element is not a <p>, add <p id = "regexStatus">
    if (!regexSelector.nextElementSibling || regexSelector.nextElementSibling.tagName !== "SPAN") {
      const regexStatus = document.createElement("span");
      regexStatus.id = "regexStatus";
      regexStatus.className = "userRpc-regexStatus";
      regexSelector.insertAdjacentElement("afterend", regexStatus);
    }

    const regexStatus = shadowDoc.getElementById("regexStatus");
    const currentInput = regexSelector.value.trim();
    const prevInput = regexSelector.getAttribute("data-prev-regex");

    // If the input value is the same as before, do nothing
    if (currentInput !== prevInput) {
      // Save the new value as ATTR
      regexSelector.setAttribute("data-prev-regex", currentInput);

      // Continue if the process is to be done
      if (regexStatus && currentInput.length) {
        const regexArray = parseRegexArray(currentInput);
        const isMatch = regexArray.some((rx) => rx.test(location.href));

        const prevMatch = regexStatus.getAttribute("data-prev-match");
        const matchStr = String(isMatch);

        // If same, don't update
        if (matchStr !== prevMatch) {
          regexStatus.setAttribute("data-prev-match", matchStr);
          regexStatus.innerHTML = isMatch ? regexMark : regexCross;
        }
      } else {
        regexStatus.textContent = "";
        regexSelector.removeAttribute("data-prev-regex");
        regexStatus.removeAttribute("data-prev-match");
      }
    }

    const updateProgress = () => {
      const timeEl = details.querySelector(".timePassed");
      const durEl = details.querySelector(".duration");
      const bar = details.querySelector(".progress-bar");
      const progress = details.querySelector(".progress");

      if (!texts.timePassed) {
        // show +1s workaround
        if (!timeEl.getAttribute("reset")) {
          timeEl.textContent = "00:00";
          timeEl.setAttribute("reset", 1);
        }
        const sec = timeToSeconds(timeEl.textContent) + 1;
        timeEl.textContent = secondToTime(sec);
      } else {
        timeEl.removeAttribute("reset");
        timeEl.textContent = texts.timePassed;
      }
      if (texts.duration) {
        durEl.style.opacity = "1";
        bar.style.opacity = "1";
        durEl.textContent = texts.duration;
        const tpSec = texts.timePassed ? timeToSeconds(texts.timePassed) : timeToSeconds(timeEl.textContent);
        const durSec = timeToSeconds(texts.duration);
        const percent = durSec > 0 && tpSec <= durSec ? (tpSec / durSec) * 100 : 0;
        if (progress) progress.style.width = `${percent}%`;
      } else {
        durEl.style.opacity = "0";
        bar.style.opacity = "0";
      }
    };

    // Apply updates
    setText(".source", texts.source);
    setText(".title", texts.title);
    setText(".artist", texts.artist);
    setImage();
    setLink();
    updateProgress();
  }

  // User Add RPC - Preview Loop
  previewInterval = setInterval(() => {
    updatePreview();
  }, 1000);
}

// User Add RPC - Element Selector
function startSelectorMode(field, shadowDoc) {
  const statusEl = shadowDoc.getElementById("selectorStatus");
  statusEl.textContent = "Please click the element on the page with the mouse! (Press 'ESC' to leave)";

  ["userRpc-selectorChooser-container", "userRpc-selectorOverlay", "userRpc-selectorHighlight"].forEach((id) => {
    shadowDoc.getElementById(id)?.remove();
    document.getElementById(id)?.remove();
  });

  const overlay = createOverlay("userRpc-selectorOverlay");
  const highlight = createOverlay("userRpc-selectorHighlight");
  document.body.append(overlay, highlight);

  const cleanup = () => {
    overlay.remove();
    highlight.remove();
    shadowDoc.getElementById("selectorStatus").textContent = "";
    document.removeEventListener("mousemove", moveHighlight);
    document.removeEventListener("click", clickHandler, true);
    document.removeEventListener("keydown", escHandler);
  };

  const moveHighlight = (e) => {
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
  };

  const clickHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPointOnBlockedElement(e.clientX, e.clientY)) {
      statusEl.textContent = "This area cannot be selected. Please click a valid element.";
      setTimeout(() => {
        if (statusEl.textContent.length) statusEl.textContent = "Please click the element on the page with the mouse! (Press 'ESC' to leave)";
      }, 3000);
      return;
    }

    let el = deepElementFromPoint(e.clientX, e.clientY);

    const semantic = detectSemanticRole(el);
    if (field && semantic && semantic !== field) {
      el = semantic === "image" ? findImageElement(el) || el : semantic === "link" ? findLinkElement(el) || el : el;
    }

    const rawOptions = generateSelectorOptions(el);
    const options = [...new Set(rawOptions)];

    const scored = options.map((sel) => ({ sel, score: scoreSelector(sel) })).sort((a, b) => b.score - a.score);
    if (options.length) {
      showSelectorChooser(scored, field, shadowDoc);
      cleanup();
      return;
    }

    const selector = generateSmartSelector(el);
    if (selector) {
      const input = shadowDoc.getElementById(`${field}Selector`);
      if (input) input.value = selector;
    }

    statusEl.textContent = "";
    cleanup();
  };

  const escHandler = (e) => e.key === "Escape" && (cleanup(), (statusEl.textContent = ""));

  function throttle(fn, wait) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= wait) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  document.addEventListener("mousemove", throttle(moveHighlight, 50));
  document.addEventListener("click", clickHandler, true);
  document.addEventListener("keydown", escHandler);

  function createOverlay(id) {
    const el = document.createElement("div");
    el.id = id;
    Object.assign(el.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: 999998,
    });
    return el;
  }

  // User Add RPC - Element Selector Helpers - Start
  function deepElementFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el?.shadowRoot) {
      const deeper = el.shadowRoot.elementFromPoint(x, y);
      if (!deeper || deeper === el) break;
      el = deeper;
    }
    return el;
  }

  function isPointOnBlockedElement(x, y) {
    const elements = document.elementsFromPoint(x, y);
    const deepElement = deepElementFromPoint(x, y);
    return elements.some((el) => el.tagName?.toLowerCase() === "iframe") || shadowDoc.contains(deepElement);
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

  // User Add RPC - Element Selector Helpers - End

  // User Add RPC - show Selector Chooser
  function showSelectorChooser(scoredOptions, field, shadowDoc) {
    const root = shadowDoc.getElementById("userRpc-selectorRoot");
    const container = document.createElement("div");
    container.id = "userRpc-selectorChooser-container";
    container.innerHTML = `<div style="margin-bottom: 6px;">Choose the most stable selector:</div>`;

    const containerList = document.createElement("div");
    containerList.id = "userRpc-selectorChooser-container-list";

    // Sort the options and show
    scoredOptions.forEach(({ sel, score }) => {
      const btn = document.createElement("button");
      btn.id = "userRpc-selectorChooser-button";
      btn.className = "userRpc-optionButtons";

      // Color Coding
      const color = score >= 80 ? "#4CAF50" : score >= 50 ? "#FFC107" : "#F44336";

      btn.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="word-break: break-all;">${sel}</span>
        <span style="margin-left: 8px; font-size: 12px; color: ${color};">(${score})</span>
      </div>
    `;

      btn.onclick = () => {
        const input = shadowDoc.getElementById(`${field}Selector`);
        if (input) input.value = sel;
        container.remove();
      };

      containerList.appendChild(btn);
    });

    // Cancel button
    const cancel = document.createElement("a");
    cancel.id = "userRpc-selectorChooser-cancel";
    cancel.className = "userRpc-optionButtons";
    cancel.textContent = "Cancel";
    cancel.onclick = () => container.remove();

    container.append(containerList, cancel);
    root.appendChild(container);
  }
}
