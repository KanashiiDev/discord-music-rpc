// Global parser storage
window.parsers = window.parsers || {};
window.parserMeta = window.parserMeta || [];
const rpcState = new window.RPCStateManager();

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

      const safeFormat = (val) => {
        if (typeof val === "number") return formatTime(val);
        if (typeof val === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(val.trim())) return val.trim();
        return null;
      };

      const [tp, dur] = extractTimeParts(timePassed);
      if (tp && dur) {
        timePassed = tp;
        durationElem = dur;
      } else {
        const [tp2, dur2] = extractTimeParts(durationElem);
        if (tp2 && dur2) {
          timePassed = tp2;
          durationElem = dur2;
        }
      }

      let effectiveTimePassed = safeFormat(timePassed);
      let effectiveDuration = safeFormat(durationElem);

      // Has only duration Mode
      if (!effectiveTimePassed && effectiveDuration) {
        if (!rpcState.hasOnlyDuration || rpcState.isSongChanged(rest)) {
          rpcState.hasOnlyDuration = true;
          rpcState.startDurationTimer();
        }
      } else {
        if (rpcState.hasOnlyDuration) {
          rpcState.hasOnlyDuration = false;
          rpcState.resetDurationTimer();
        }
      }

      if (rpcState.hasOnlyDuration) {
        effectiveTimePassed = rpcState.getDurationTimer();
      }

      // Remaining Duration Mode
      const lastAct = rpcState.lastActivity;
      const lastDurationSec = parseTime(lastAct?.duration || "");
      const effectiveDurationSec = parseTime(effectiveDuration);

      const remainingMode = lastAct && lastAct.title === rest.title && lastAct.artist === rest.artist && effectiveDurationSec !== lastDurationSec;

      if (remainingMode) {
        const durationInSeconds = parseTime(effectiveTimePassed) + effectiveDurationSec;
        effectiveDuration = formatTime(durationInSeconds);
      }

      const { currentPosition, totalDuration, currentProgress, timestamps } = processPlaybackInfo(effectiveTimePassed, effectiveDuration);

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
      if (validList.length > 0 && browser?.storage?.local) {
        await browser.storage.local.set({ parserList: validList });
      }
    } catch (error) {
      logError("Error saving parser list:", error);
    }
  }, 300);
}

// Get current song info based on location and parser list
window.getSongInfo = async function () {
  try {
    const settings = await browser.storage.local.get();
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
    logError("getSongInfo error:", err);
    return null;
  }
};

// querySelector
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

(async function loadAllSavedUserParsers() {
  const settings = await browser.storage.local.get("userParserSelectors");
  const parserArray = settings.userParserSelectors;

  if (!Array.isArray(parserArray)) return;

  for (const data of parserArray) {
    if (!data.selectors || !data.domain) continue;

    const get = (key) => {
      const sel = data.selectors[key];
      return sel ? querySelectorDeep(sel) : null;
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
          logError(`User parser error (${hostname}):`, e);
          return null;
        }
      },
    });
  }
})();
