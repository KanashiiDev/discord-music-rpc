// Global parser storage
window.parsers = window.parsers || {};
window.parserMeta = window.parserMeta || [];
const rpcState = new window.RPCStateManager();

// Helper to convert mm:ss to seconds.
function parseTime(timeStr) {
  if (!timeStr) return NaN;
  const parts = timeStr.split(":").reverse();
  return parts.reduce((acc, part, i) => acc + (parseFloat(part) || 0) * Math.pow(60, i), 0);
}

// Helper to convert seconds to mm:ss format.
function formatTime(seconds) {
  if (!isFinite(seconds)) return "00:00";
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
  const baseTimestamp = now - currentPosition * 1000;

  if (options.returnEnd) {
    return {
      startTimestamp: baseTimestamp,
      endTimestamp: baseTimestamp + totalDuration * 1000,
    };
  } else {
    return {
      startTimestamp: baseTimestamp,
    };
  }
}

/**
 * Parses playback time strings and returns detailed playback info.
 *
 * @param {string} timePassed - Current playback time (e.g., "1:23" or "1:23 / 3:45").
 * @param {string} durationStr - Total duration time (e.g., "3:45" or "1:23 / 3:45").
 * @returns {Object} Playback information including:
 *  - currentPosition {number} Seconds elapsed.
 *  - totalDuration {number} Total seconds.
 *  - currentProgress {number} Playback progress in percent (0-100).
 *  - timestamps {object} Optional startTimestamp and endTimestamp in ms.
 */
function processPlaybackInfo(timePassed = "", durationElem = "", progress = 0, duration = 0) {
  if (typeof timePassed !== "number" && typeof durationElem !== "number") {
    // If it came united (for example "5:47 /6:57")
    if (durationElem.includes("/") && timePassed === durationElem) {
      const parts = timePassed.split("/");
      timePassed = parts[0]?.trim() || "";
      durationElem = parts[1]?.trim() || "";
    }

    timePassed = timePassed.trim();
    durationElem = durationElem.trim();

    progress = parseTime(timePassed);
    duration = parseTime(durationElem);
  } else {
    progress = timePassed;
    duration = durationElem;
  }

  const currentPosition = isNaN(progress) ? 0 : progress;
  const totalDuration = isNaN(duration) ? 0 : duration;

  const timestamps = getTimestamps(currentPosition, totalDuration);
  const currentProgress = timestamps && totalDuration ? (currentPosition / totalDuration) * 100 : 0;

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

  // Priority: <img src = "...">
  if (elem.tagName.toLowerCase() === "img" && elem.src) {
    return elem.src;
  }

  // Alternative: background-image
  const bgImage = window.getComputedStyle(elem).backgroundImage;
  if (bgImage && bgImage !== "none") {
    return bgImage.replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
  }

  return null;
}

// Utility: Pattern hash creation
function hashFromPatternStrings(patterns) {
  return btoa(patterns.join("|"))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);
}

function parseUrlPattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern === "string") {
    const match = pattern.match(/^\/(.*)\/([gimsuy]*)$/);
    if (match) return new RegExp(match[1], match[2]);
    return new RegExp(pattern);
  }
  return /.^/;
}

// Register a new parser
window.registerParser = function ({ title, domain, urlPatterns, fn, userAdd = false }) {
  if (!domain || typeof fn !== "function") return;

  const patternStrings = (urlPatterns || []).map((p) => p.toString());
  const id = `${domain}_${hashFromPatternStrings(patternStrings)}`;
  const patternRegexes = (urlPatterns || []).map(parseUrlPattern);

  if (!window.parsers[domain]) window.parsers[domain] = [];

  window.parsers[domain].push({
    id,
    patterns: patternRegexes,
    parse: async () => {
      const rawData = await fn();
      if (!rawData) return null;

      let { timePassed = "", duration: durationElem = "", ...rest } = rawData;

      let effectiveTimePassed = timePassed;
      if (timePassed?.trim().length < 1 && durationElem) {
        rpcState.hasOnlyDuration = true;
        effectiveTimePassed = rpcState.getDurationTimer();
      } else {
        if (rpcState.hasOnlyDuration) {
          rpcState.hasOnlyDuration = false;
          rpcState.resetDurationTimer();
        }
      }

      const { currentPosition, totalDuration, currentProgress, timestamps } = processPlaybackInfo(effectiveTimePassed, durationElem);

      return {
        ...rest,
        timePassed: currentPosition,
        position: currentPosition,
        duration: totalDuration,
        progress: currentProgress,
        ...timestamps,
      };
    },
    userAdd,
  });

  // Metadata Registration
  window.parserMeta.push({ id, title, domain, urlPatterns: patternStrings, userAdd });
  window.parserMeta.sort((a, b) => (a.title || a.domain).toLowerCase().localeCompare((b.title || b.domain).toLowerCase()));

  scheduleParserListSave();
};

// Save parser metadata to storage
let parserListSaveTimeout;
function scheduleParserListSave() {
  clearTimeout(parserListSaveTimeout);
  parserListSaveTimeout = setTimeout(async () => {
    try {
      const validList = (window.parserMeta || []).filter((p) => p.domain && p.title && p.urlPatterns);
      if (validList.length > 0 && browser?.storage?.sync) {
        await browser.storage.sync.set({ parserList: validList });
      }
    } catch (error) {
      console.error("Error saving parser list:", error);
    }
  }, 300);
}

// Get current song info based on location and parser list
window.getSongInfo = async function () {
  try {
    const settings = await browser.storage.sync.get();
    const hostname = location.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = location.pathname;

    const domainParsers = window.parsers?.[hostname];
    if (!domainParsers) return null;

    for (const parser of domainParsers) {
      const isEnabled = settings[`enable_${parser.id}`] !== false;
      const matches = parser.patterns?.some((re) => re.test(pathname));
      if (isEnabled && matches) return await parser.parse();
    }

    return null;
  } catch (err) {
    console.error("getSongInfo error:", err);
    return null;
  }
};

(async function loadAllSavedUserParsers() {
  const settings = await browser.storage.sync.get("userParserSelectors");
  const parserArray = settings.userParserSelectors;

  if (!Array.isArray(parserArray)) return;

  for (const data of parserArray) {
    if (!data.selectors || !data.domain) continue;

    const get = (key) => {
      const sel = data.selectors[key];
      return sel ? document.querySelector(sel) : null;
    };

    const hostname = data.domain;
    const locHostname = location.hostname.replace(/^https?:\/\/|^www\./g, "");

    window.registerParser?.({
      domain: hostname,
      title: data.title || hostname,
      urlPatterns: data.urlPatterns,
      userAdd: true,
      fn: async function () {
        if (locHostname !== hostname) return null;

        try {
          const title = get("title")?.textContent?.trim() ?? "";
          const artist = get("artist")?.textContent?.trim() ?? "";
          const timePassed = get("timePassed")?.textContent ?? "";
          const duration = get("duration")?.textContent ?? "";
          const imageElement = get("image");
          let image = null;

          if (imageElement) {
            if (imageElement.src) {
              image = imageElement.src;
            } else {
              const backgroundImage = window.getComputedStyle(imageElement).backgroundImage;
              if (backgroundImage && backgroundImage !== "none") {
                const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                image = match ? match[1] : null;
              }
            }
          }

          const link = get("link")?.href ?? "";

          const { currentPosition, totalDuration, currentProgress, timestamps } = window.processPlaybackInfo?.(timePassed, duration) ?? {};

          return {
            title,
            artist,
            image,
            source: data.title || document.title,
            songUrl: link || location.href,
            position: currentPosition,
            duration: totalDuration,
            progress: currentProgress,
            ...timestamps,
          };
        } catch (e) {
          console.error(`User parser error (${hostname}):`, e);
          return null;
        }
      },
    });
  }
})();
