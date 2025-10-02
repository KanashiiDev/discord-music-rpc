// Default Parser Options
const DEFAULT_PARSER_OPTIONS = {
  showCover: { label: "Show Cover", type: "checkbox", value: true },
  showSource: { label: "Show Source", type: "checkbox", value: true },
  showTimeLeft: { label: "Show Time Left", type: "checkbox", value: true },
  showButtons: { label: "Show Buttons", type: "checkbox", value: true },
  showFavIcon: { label: "Show Small Site Icon", type: "checkbox", value: false },
  customCover: { label: "Custom Cover", type: "checkbox", value: false },
  customCoverUrl: { label: "Custom Cover URL", type: "text", value: "" },
};

// Logs
const logInfo = (...a) => CONFIG.debugMode && console.info("[DISCORD-MUSIC-RPC - INFO]", ...a);
const logWarn = (...a) => CONFIG.debugMode && console.warn("[DISCORD-MUSIC-RPC - WARN]", ...a);
const logError = (...a) => {
  const safeStringify = (obj) => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  };

  const errorString = a
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name || ""} ${arg.message || ""} ${arg.stack || ""}`;
      } else if (typeof arg === "object" && arg !== null) {
        return safeStringify(arg);
      }
      return arg?.toString?.() || "";
    })
    .join(" ")
    .toLowerCase();

  const ignorePatterns = [
    /extension context invalidated/i,
    /could not establish connection/i,
    /failed to fetch/i,
    /update failed after all retries/i,
    /update failed \(no response\)/i];
  const isIgnorable = ignorePatterns.some((re) => re.test(errorString));

  if (!isIgnorable) {
    console.error("[DISCORD-MUSIC-RPC - ERROR]", ...a);
  }
};

// Delay
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Debounce
function debounce(func, wait = 200) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Throttle
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

// Mutex
function createMutex() {
  let lock = Promise.resolve();
  return async (fn) => {
    const unlock = lock;
    let resolveNext;
    lock = new Promise((r) => (resolveNext = r));
    await unlock;
    try {
      return await fn();
    } finally {
      resolveNext();
    }
  };
}

// Time
const getCurrentTime = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const dateToday = new Date();
const dateYesterday = new Date();
dateYesterday.setDate(dateToday.getDate() - 1);
const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

// Format Label
function formatLabel(name) {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return capitalized.replace(/([A-Z0-9])/g, " $1").trim();
}

// Date formatting
const userLocale = navigator.languages?.[0] || navigator.language || "en-US";

const dateHourMinute = (time) =>
  time.toLocaleTimeString(userLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: undefined,
  });

const dateFull = (time) =>
  time.toLocaleDateString(userLocale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

// Normalize host string
const normalizeHost = (url) => {
  try {
    return new URL(url).hostname.replace(/^https?:\/\/|^www\./g, "").toLowerCase();
  } catch {
    return "";
  }
};

// Normalize URL string
function normalize(str) {
  return str.replace(/^https?:\/\/|^www\./g, "").toLowerCase();
}

// Url Pattern Regex
const parseUrlPattern = (pattern) => {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern === "string") {
    const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
    try {
      return new RegExp(match?.[1] ?? pattern, match?.[2] ?? "");
    } catch (e) {
      logWarn("Invalid regex:", pattern, e);
    }
  }
  return /.^/;
};

// Find matching parsers for URL
const findMatchingParsersForUrl = (url, list) => {
  const host = normalizeHost(url);
  return list.filter(({ domain }) => {
    const d = normalize(domain);
    return d && host === d;
  });
};

// Fetch with timeout
const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      logInfo(`Request timed out after ${timeout / 1000} seconds`);
    } else {
      logError(err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// Keep Alive Tab
let overridesApplied = false;
function applyOverrides() {
  if (overridesApplied) return;
  overridesApplied = true;

  // Property override
  const singleOverrides = [
    () => Object.defineProperty(document, "msHidden", { get: () => false, configurable: true }),
    () => Object.defineProperty(document, "oHidden", { get: () => false, configurable: true }),
    () => Object.defineProperty(document, "hidden", { get: () => false, configurable: true }),
    () => Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true }),

    () => Object.defineProperty(document, "mozHidden", { get: () => false, configurable: true }),
    () => Object.defineProperty(document, "webkitHidden", { get: () => false, configurable: true }),
    () => Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible", configurable: true }),

    // Page Lifecycle API override
    () => {
      if ("lifecycle" in document) {
        Object.defineProperty(document.lifecycle, "state", { get: () => "active", configurable: true });
      }
    },
    () => {
      if ("pageLifecycle" in document) {
        Object.defineProperty(document.pageLifecycle, "state", { get: () => "active", configurable: true });
      }
    },
  ];

  singleOverrides.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      logInfo("applyOverridesOnce error:", e);
    }
  });

  // Event blocking override
  try {
    const originalDocumentAddEventListener = EventTarget.prototype.addEventListener;
    const originalWindowAddEventListener = typeof window !== "undefined" && window.addEventListener;

    if (originalDocumentAddEventListener && originalWindowAddEventListener) {
      const events = ["visibilitychange", "webkitvisibilitychange", "mozvisibilitychange", "blur", "focus"];
      events.forEach((eventName) => {
        originalDocumentAddEventListener.call(document, eventName, (e) => e.stopImmediatePropagation(), true);
        originalWindowAddEventListener.call(window, eventName, (e) => e.stopImmediatePropagation(), true);
      });
    }
  } catch (e) {
    logInfo("Event blocking override error:", e);
  }
  logInfo("RPC Keep Alive Overrides Applied");
}

// Keep Alive Tab - Overrides Loop
function applyOverridesLoop() {
  try {
    // Title override
    Object.defineProperty(document, "title", {
      get: () => "Music Playing",
      set: () => {},
      configurable: true,
    });
  } catch (e) {
    logInfo("Title override loop error:", e);
  }

  try {
    // Focus override
    document.hasFocus = () => true;
  } catch (e) {
    logInfo("hasFocus override loop error:", e);
  }

  // on<Event> null override
  try {
    const events = ["visibilitychange", "webkitvisibilitychange", "mozvisibilitychange", "blur", "focus"];
    events.forEach((event) => {
      try {
        Object.defineProperty(document, "on" + event, {
          get: () => null,
          set: () => {},
          configurable: true,
        });
      } catch (e) {
        logInfo(`document.on${event} override loop error:`, e);
      }
      try {
        Object.defineProperty(window, "on" + event, {
          get: () => null,
          set: () => {},
          configurable: true,
        });
      } catch (e) {
        logInfo(`window.on${event} override loop error:`, e);
      }
    });
  } catch (e) {
    logInfo("on<Event> null override loop error:", e);
  }

  // Page Freeze API event listener override
  try {
    window.addEventListener("freeze", (e) => e.stopImmediatePropagation(), true);
    window.addEventListener("resume", (e) => e.stopImmediatePropagation(), true);
  } catch (e) {
    logInfo("Page Freeze API override loop error:", e);
  }

  // requestIdleCallback override
  try {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback = function (callback) {
        return setTimeout(() => callback({ timeRemaining: () => 50 }), 1);
      };
    }
  } catch (e) {
    logInfo("requestIdleCallback override loop error:", e);
  }

  // requestAnimationFrame override
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);

  // Pointer and Mouse Interaction Simulation
  const x = Math.floor(Math.random() * window.innerWidth);
  const y = Math.floor(Math.random() * window.innerHeight);
  //Movement values ​​randomly between -10 and 10
  const movementX = Math.floor(Math.random() * 21) - 10; // -10..10
  const movementY = Math.floor(Math.random() * 21) - 10;
  const mouseEvent = new MouseEvent("mousemove", { bubbles: true, cancelable: true, clientX: x, clientY: y, movementX: movementX, movementY: movementY });
  document.dispatchEvent(mouseEvent);

  const keyboardEvent = new KeyboardEvent("keydown", { bubbles: true, key: "Shift" });
  document.dispatchEvent(keyboardEvent);

  logInfo("RPC Keep Alive Overrides Loop Applied");
}

// Create SVG
function createSVG(paths, options = {}) {
  const { width = 16, height = 16, stroke = "#ccc", strokeWidth = 2, fill = "none", viewBox = "0 0 24 24" } = options;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", fill);
  svg.setAttribute("stroke", stroke);
  svg.setAttribute("stroke-width", strokeWidth);
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  return svg;
}

const svg_paths = {
  redirectIconPaths: ["M18 3h3v3", "M21 3l-9 9", "M15 3H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9"],
  gearIconPaths: [
    `M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06 a1.65 1.65
     0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09 a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83
     l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4 h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2
     2 0 1 1 2.83-2.83 l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09 a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0
     0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83 l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4 h-.09a1.65 1.65 0 0 0-1.51 1z`,
  ],
  trashIconPaths: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6l-1.5 14h-11L5 6", "M10 11v6", "M14 11v6"],
  historyIconPaths: ["M3 3v5h5", "M3.05 13a9 9 0 1 0 2.13-9.36L3 8", "M12 7v5l3 3"],
  backIconPaths: ["M15 18l-6-6 6-6"],
  filterIconPaths: ["M3 4h18", "M6 12h12", "M10 20h4"],
};

// Get Fresh Parser List
async function getFreshParserList() {
  const { parserList = [] } = await browser.storage.local.get("parserList");
  return Array.isArray(parserList) ? parserList : [];
}

// Helper to split time strings like "5:47 / 6:57".
function extractTimeParts(input) {
  if (typeof input === "string" && input.includes("/")) {
    const [start, end] = input.split("/");
    return [start.trim(), end.trim()];
  }
  return [null, null];
}

// Helper to convert mm:ss to seconds.
function parseTime(timeInput) {
  if (typeof timeInput === "number" && timeInput > 0) {
    // If a positive number comes, we first convert it to a string.
    timeInput = formatTime(timeInput);
  }

  if (typeof timeInput !== "string") return 0;

  // Remove negative sign if any
  timeInput = timeInput.trim().replace(/^-/, "");

  // Split the parts, reverse to handle hh:mm:ss properly
  const parts = timeInput.split(":").reverse();

  return parts.reduce((acc, part, i) => {
    const n = parseInt(part, 10);
    return acc + (isNaN(n) ? 0 : n * Math.pow(60, i));
  }, 0);
}

// Helper to convert seconds to mm:ss format.
function formatTime(seconds) {
  if (typeof seconds === "string") {
    seconds = parseTime(seconds);
  }

  if (!isFinite(seconds) || typeof seconds !== "number" || seconds < 0) return "00:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Helper to get timestamps
function getTimestamps(currentPosition, totalDuration, options = { returnEnd: true }) {
  if (isNaN(currentPosition) || isNaN(totalDuration) || totalDuration <= 0) {
    return {};
  }

  const now = Date.now();

  // Start is "now"
  const startTimestamp = now;

  if (options.returnEnd) {
    // End is "now + remaining time"
    const remaining = totalDuration - currentPosition;
    return {
      startTimestamp,
      endTimestamp: startTimestamp + Math.max(0, remaining) * 1000,
    };
  } else {
    return { startTimestamp };
  }
}

// Parses playback time values and returns detailed playback information.
function processPlaybackInfo(timePassed = "", durationElem = "", progress = 0, duration = 0) {
  if (typeof timePassed === "string" && typeof durationElem === "string") {
    timePassed = timePassed.trim();
    durationElem = durationElem.trim();
    progress = parseTime(timePassed);
    duration = parseTime(durationElem);
  } else {
    progress = Number(timePassed) || 0;
    duration = Number(durationElem) || 0;
  }

  const currentPosition = Math.max(0, progress);
  const totalDuration = Math.max(0, duration);
  const timestamps = getTimestamps(currentPosition, totalDuration);
  const currentProgress = totalDuration ? (currentPosition / totalDuration) * 100 : 0;

  return {
    currentPosition,
    totalDuration,
    currentProgress,
    timestamps,
  };
}

/**
 *Selects the element, takes the desired Attribute (or TextContent), then applies optional operations.
 * @param {string} selector - CSS selector
 * @param {object} options - Optional Parameters
 *    - attr: String, Element Attribute Name (eg "href", "title", "src")
 *    - transform: Function, function that will be processed on the string received
 *    - root: Element or Document, Search Root (default: document)
 * @returns {string} - processed string or empty string
 */
function getText(selector, options = {}) {
  const { attr = null, transform = null, root = document } = options;
  const elem = root.querySelector(selector);
  if (!elem) return "";

  let val = attr ? elem.getAttribute(attr) : elem.textContent;
  if (!val) return "";

  val = val.trim();

  if (typeof transform === "function") {
    try {
      val = transform(val);
      if (!val) return "";
    } catch {
      return "";
    }
  }

  return val;
}

/**
 * Retrieves image URL from element matching selector.
 *
 * @param {string} selector - CSS selector to find the image element.
 * @param {Document|Element} [root=document] - Root element for querySelector.
 * @returns {string|null} Image URL or null if not found.
 */
function getImage(selector) {
  const elem = document.querySelector(selector);
  if (!elem) return null;

  // Priority: element directly <img>
  if (elem.tagName.toLowerCase() === "img" && elem.src) {
    return elem.src;
  }

  // Alternative: background-image
  const bgImage = window.getComputedStyle(elem).backgroundImage;
  if (bgImage && bgImage !== "none") {
    return bgImage.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
  }

  // Alternative: check for <img> inside
  const childImg = elem.querySelector("img");
  if (childImg && childImg.src) {
    return childImg.src;
  }

  return null;
}

// Deep query selector that traverses shadow DOMs
function querySelectorDeep(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) return el;

  const elemsWithShadow = root.querySelectorAll("*");
  for (const el of elemsWithShadow) {
    if (el.shadowRoot) {
      const found = querySelectorDeep(selector, el.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

// Pattern hash creation
function hashFromPatternStrings(patterns) {
  return btoa(patterns.join("|"))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);
}

// Create ID from domain and patterns
function makeIdFromDomainAndPatterns(domain, urlPatterns) {
  const patternStrings = (urlPatterns || []).map((p) => p.toString()).sort();
  return `${domain}_${hashFromPatternStrings(patternStrings)}`;
}

// Show initial setup dialog
function showInitialSetupDialog() {
  const dialog = document.createElement("div");
  dialog.className = "setup-dialog";

  const content = document.createElement("div");
  content.className = "setup-dialog-content";

  const contentHeader = document.createElement("h2");
  contentHeader.textContent = "Installation Required";
  content.appendChild(contentHeader);

  const contentText = document.createElement("p");
  contentText.textContent = "This extension requires a companion windows application to function properly. Please install the required application to continue.";
  content.appendChild(contentText);

  const contentLink = document.createElement("a");
  contentLink.href = "https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-Setup.zip";
  contentLink.textContent = "Download Application";
  contentLink.target = "_blank";
  contentLink.rel = "noopener noreferrer";
  contentLink.classList.add("setup-link");
  content.appendChild(contentLink);

  const contentNote = document.createElement("p");
  contentNote.textContent = "The installer is provided via the latest GitHub release.";
  contentNote.classList.add("setup-note");
  content.appendChild(contentNote);

  const contentNote2 = document.createElement("p");
  const noteText = document.createTextNode("Link not working?");
  const noteLink = document.createElement("a");
  noteLink.href = "https://github.com/KanashiiDev/discord-music-rpc/releases/latest";
  noteLink.target = "_blank";
  noteLink.rel = "noopener noreferrer";
  noteLink.textContent = "GitHub Releases";
  noteLink.classList.add("setup-link");
  noteLink.classList.add("setup-note-link");

  contentNote2.appendChild(noteText);
  contentNote2.appendChild(noteLink);
  content.appendChild(contentNote2);

  const confirmButton = document.createElement("button");
  confirmButton.id = "confirmSetup";
  confirmButton.textContent = "I have installed the application";
  content.appendChild(confirmButton);

  dialog.appendChild(content);
  document.body.appendChild(dialog);
  document.body.classList.add("setup-dialog-open");

  let confirmed = false;
  document.getElementById("confirmSetup").addEventListener("click", async () => {
    if (confirmed) return;
    confirmed = true;
    await browser.storage.local.set({ initialSetupDone: true });
    document.body.removeChild(dialog);
    document.body.classList.remove("setup-dialog-open");
    window.location.reload();
  });
}

function getExistingElementSelector(text) {
  if (typeof text !== "string") return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const el = document.querySelector(trimmed);
    if (el) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function getPlainText(text) {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return null;

   const htmlTags = new Set([
    "html","head","body","div","span","p","a","ul","ol","li","table",
    "tr","td","th","thead","tbody","tfoot","section","article","nav",
    "header","footer","main","aside","form","input","textarea","button",
    "select","option","label","img","canvas","svg","video","audio","source",
    "iframe","script","style","link","meta","h1","h2","h3","h4","h5","h6",
    "pre","code","blockquote","figure","figcaption","strong","em","b","i","u",
    "small","sub","sup","hr","br"
  ]);
  if (/^[.#\[]/.test(trimmed)) return null;
  if (!trimmed.includes(" ") && htmlTags.has(trimmed.toLowerCase())) return null;
  if (/[\s>+~.#:\[\]]/.test(trimmed)) return null;
  return trimmed;
}

function openIndexedDB(DB_NAME, STORE_NAME, DB_VERSION) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getIconAsDataUrl() {
  const iconUrl = browser.runtime.getURL("icons/128x128.png");
  const response = await fetch(iconUrl);
  const blob = await response.blob();

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

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

// Validate URL function
const isValidUrl = (url) => {
  try {
    const parsed = new URL(url, location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_) {
    return false;
  }
};

// Helper function to safely get text content
const getSafeText = (getFn, key, fallback) => {
  try {
    const el = getFn(key);
    return el?.textContent?.trim() || fallback || null;
  } catch (_) {
    return fallback || null;
  }
};

// Helper function to safely get href
const getSafeHref = (getFn, key, fallback) => {
  try {
    const el = getFn(key);
    let raw = el?.getAttribute?.("href") ?? fallback;

    try {
      raw = new URL(raw, location.origin).href;
    } catch (_) {
      // If URL parsing fails, fallback to the original href
    }

    return isValidUrl(raw) ? raw : null;
  } catch (_) {
    try {
      fallback = new URL(fallback, location.origin).href;
    } catch (_) {}
    return isValidUrl(fallback) ? fallback : null;
  }
};

// HistoryEntry template
function createHistoryEntry(entry) {
  const div = document.createElement("div");
  div.className = "history-entry";

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "history-checkbox";
  checkbox.dataset.index = fullHistory.indexOf(entry);

  // Image
  const img = document.createElement("img");
  img.width = 46;
  img.height = 46;
  img.className = "history-image lazyload";
  img.dataset.src = entry.i || browser.runtime.getURL("icons/48x48.png");
  img.onerror = function () {
    this.onerror = null;
    this.src = browser.runtime.getURL("icons/48x48.png");
  };

  // Info
  const info = document.createElement("div");
  info.className = "history-info";

  const strong = document.createElement("strong");
  strong.textContent = entry.t;
  strong.className = "history-title";

  const link = document.createElement("a");
  link.className = "song-link";
  link.title = "Go to The Song";
  link.appendChild(createSVG(svg_paths.redirectIconPaths));
  if (entry.u) link.href = entry.u;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const small = document.createElement("small");
  small.className = "history-source";
  const time = new Date(entry.p);
  small.textContent = `${entry.s}${dateHourMinute(time) ? " • " + dateHourMinute(time) : ""}`;

  info.appendChild(strong);
  const parts = [];
  if (entry.a !== "Radio") {
    const artist = document.createElement("span");
    artist.className = "history-artist";
    artist.textContent = entry.a;
    const br = document.createElement("br");
    parts.push(artist, br);
  }
  parts.push(small);
  info.append(...parts);
  div.append(checkbox, img, info, link);

  return div;
}
