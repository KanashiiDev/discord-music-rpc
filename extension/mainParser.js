window.parsers = window.parsers || {};
window.parserMeta = window.parserMeta || [];
const rpcState = new window.RPCStateManager();
const settingsCache = {};
const loadingPromises = {};
const saveTimers = {};
let initLoadPromise = null;

// Save settings
function scheduleSave(settingKey) {
  if (saveTimers[settingKey]) clearTimeout(saveTimers[settingKey]);
  saveTimers[settingKey] = setTimeout(async () => {
    try {
      await browser.storage.local.set({ [settingKey]: settingsCache[settingKey] });
    } catch (err) {
      logError(`[settings] save error for ${settingKey}:`, err);
    } finally {
      clearTimeout(saveTimers[settingKey]);
      delete saveTimers[settingKey];
    }
  }, 120);
}

// Load settings
async function loadSettingsForId(id) {
  const settingKey = `settings_${id}`;
  if (settingsCache[settingKey]) return settingsCache[settingKey];
  if (loadingPromises[settingKey]) return loadingPromises[settingKey];

  loadingPromises[settingKey] = (async () => {
    try {
      const stored = await browser.storage.local.get(settingKey);
      settingsCache[settingKey] = stored[settingKey] || {};
      return settingsCache[settingKey];
    } catch (err) {
      settingsCache[settingKey] = {};
      return settingsCache[settingKey];
    } finally {
      delete loadingPromises[settingKey];
    }
  })();

  return loadingPromises[settingKey];
}

// useSettings
async function useSetting(id, key, label, type = "text", defaultValue = "", newValue) {
  if (!key) throw new Error("useSetting requires (id, key, ...)");
  const settingKey = `settings_${id}`;

  // Ensure cache loaded
  const opts = await loadSettingsForId(id);

  let current = opts[key];
  let shouldSave = false;

  // Initialize default if absent
  if (current === undefined) {
    if (type === "select" && Array.isArray(defaultValue)) {
      current = {
        label,
        type: "select",
        value: defaultValue.map((opt, i) => ({
          ...opt,
          selected: opt.hasOwnProperty("selected") ? opt.selected : i === 0,
        })),
      };
    } else {
      current = { label, type, value: defaultValue };
    }
    shouldSave = true;
  }

  // Apply new value if provided and different
  if (newValue !== undefined) {
    if (type === "select" && Array.isArray(current.value)) {
      const currentSelected = current.value.find((o) => o.selected)?.value;
      if (currentSelected !== newValue) {
        current.value = current.value.map((opt) => ({ ...opt, selected: opt.value === newValue }));
        shouldSave = true;
      }
    } else if (current.value !== newValue) {
      current.value = newValue;
      shouldSave = true;
    }
  }

  if (shouldSave) {
    opts[key] = current;
    settingsCache[settingKey] = opts;
    scheduleSave(settingKey);
  }

  return current;
}

// Initialize all parser settings
async function initializeAllParserSettings() {
  if (!window.initialSettings) return;

  const allStored = await browser.storage.local.get(null);
  const validIds = new Set();
  for (const [domain, data] of Object.entries(window.initialSettings)) {
    const id = makeIdFromDomainAndPatterns(domain, data.urlPatterns);
    validIds.add(`settings_${id}`);
  }

  // Clean up unnecessary old keys
  for (const key of Object.keys(allStored)) {
    if (key.startsWith("settings_") && !validIds.has(key)) {
      const opts = allStored[key] || {};
      // Delete everything except for DEFAULT_PARSER_OPTIONS
      const cleaned = {};
      for (const optKey of Object.keys(opts)) {
        if (DEFAULT_PARSER_OPTIONS.hasOwnProperty(optKey)) {
          cleaned[optKey] = opts[optKey];
        }
      }

      if (Object.keys(cleaned).length > 0) {
        await browser.storage.local.set({ [key]: cleaned });
        settingsCache[key] = cleaned;
      } else {
        await browser.storage.local.remove(key);
        delete settingsCache[key];
      }
    }
  }

  // Prepare defaults for initialSettings
  for (const [domain, data] of Object.entries(window.initialSettings)) {
    const id = makeIdFromDomainAndPatterns(domain, data.urlPatterns);
    const settingKey = `settings_${id}`;
    settingsCache[settingKey] = allStored[settingKey] || settingsCache[settingKey] || {};

    for (const s of data.settings) {
      await useSetting(id, s.key, s.label, s.type, s.defaultValue);
    }
  }
}

// registerParser
window.registerParser = async function ({ title, domain, urlPatterns, authors, homepage, fn, userAdd = false, initOnly = false }) {
  if (!domain || typeof fn !== "function") return;

  // wait initialSettings ready
  while (!window.initialSettings) {
    await new Promise((r) => setTimeout(r, 50));
  }

  if (!initLoadPromise) {
    initLoadPromise = (async () => {
      await initializeAllParserSettings();
      await loadAllSavedUserParsers();
    })();
  }
  await initLoadPromise;

  const patternStrings = (urlPatterns || []).map((p) => p.toString()).sort();
  const id = `${domain}_${hashFromPatternStrings(patternStrings)}`;
  const patternRegexes = (urlPatterns || []).map(parseUrlPattern);

  if (window.parsers[domain]?.some((p) => p.id === id)) return;
  if (!window.parsers[domain]) window.parsers[domain] = [];

  // bind the id
  const boundUseSetting = (key, label, type = "text", defaultValue = "", newValue) => useSetting(id, key, label, type, defaultValue, newValue);

  window.parsers[domain].push({
    id,
    patterns: patternRegexes,
    authors,
    homepage,
    parse: async (...args) => {
      if (initOnly) return null;
      const rawData = await fn({ useSetting: boundUseSetting });
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
        source: rest.artist === rest.source ? title : rest.source,
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
  if (!window.parserMeta.some((m) => m.id === id)) {
    window.parserMeta.push({ id, title, domain, urlPatterns: patternStrings, authors, homepage, userAdd });
    window.parserMeta.sort((a, b) => (a.title || a.domain).toLowerCase().localeCompare((b.title || b.domain).toLowerCase()));
  }

  await scheduleParserListSave();
};

// Save parser metadata to storage
async function scheduleParserListSave() {
  try {
    const validList = (window.parserMeta || []).filter((p) => p.domain && p.title && p.urlPatterns);
    if (validList.length > 0 && browser?.storage?.local) {
      await browser.storage.local.set({ parserList: validList });
    }
  } catch (error) {
    logError("Error saving parser list:", error);
  }
}

// Get current song info based on location and parser list
window.getSongInfo = async function () {
  try {
    const settings = await browser.storage.local.get();
    const hostname = location.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = location.pathname;

    // Get subdomains or exact match domains.
    const domainParsers = Object.entries(window.parsers || {})
      .filter(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`))
      .flatMap(([_, parsers]) => parsers);

    if (!domainParsers.length) return null;

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

// Load User Parsers
async function loadAllSavedUserParsers() {
  const settings = await browser.storage.local.get("userParserSelectors");
  const parserArray = settings.userParserSelectors;

  if (!Array.isArray(parserArray)) return;

  for (const data of parserArray) {
    if (!data.selectors || !data.domain) continue;

    const get = (key) => {
      try {
        const sel = data.selectors[key];
        return sel ? querySelectorDeep(sel) : null;
      } catch (e) {
        logError(`Selector error for key "${key}" in domain "${data.domain}":`, e);
        return null;
      }
    };

    const hostname = data.domain.toLowerCase();
    const locHostname = location.hostname.replace(/^www\./, "").toLowerCase();

    window.registerParser?.({
      domain: hostname,
      title: data.title || hostname,
      urlPatterns: data.urlPatterns,
      userAdd: true,
      fn: async function () {
        if (locHostname !== hostname && !locHostname.endsWith(`.${hostname}`)) return null;

        try {
          const title = get("title")?.textContent?.trim() ?? "";
          const artist = get("artist")?.textContent?.trim() ?? "";
          let source = get("source")?.textContent?.trim() ?? getPlainText(data.selectors["source"]) ?? "";
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

          const link = getSafeHref(get, "link", data.link || location.href);
          const buttonLink = getSafeHref(get, "buttonLink", data.selectors.buttonLink);
          const buttonText = getSafeText(get, "buttonText", data.selectors.buttonText);
          const buttonLink2 = getSafeHref(get, "buttonLink2", data.selectors.buttonLink2);
          const buttonText2 = getSafeText(get, "buttonText2", data.selectors.buttonText2);

          const { currentPosition, totalDuration, currentProgress, timestamps } = window.processPlaybackInfo?.(timePassed, duration) ?? {};
          return {
            title,
            artist,
            image,
            source: artist === source ? data.title : source || location.hostname,
            songUrl: link || location.href,
            position: currentPosition,
            duration: totalDuration,
            progress: currentProgress,
            buttons: [
              buttonLink && buttonText
                ? {
                    link: buttonLink,
                    text: buttonText,
                  }
                : null,
              buttonLink2 && buttonText2
                ? {
                    link: buttonLink2,
                    text: buttonText2,
                  }
                : null,
            ].filter(Boolean),
            ...timestamps,
          };
        } catch (e) {
          logError(`User parser error (${hostname}):`, e);
          return null;
        }
      },
    });
  }
}
