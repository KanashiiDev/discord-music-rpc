// mainParser.js - Controls all parser operations.

window.parsers = {};
window.parserMeta = [];
window.latestUserScriptData = window.latestUserScriptData || {};
const rpcState = new window.RPCStateManager();
const processedScripts = new Set();
const settingsCache = {};
const loadingPromises = {};
const saveTimers = {};
let initLoadPromise = null;

// Save settings
function scheduleSave(settingKey) {
  if (saveTimers[settingKey]) clearTimeout(saveTimers[settingKey]);
  saveTimers[settingKey] = setTimeout(async () => {
    try {
      // Snapshot
      const snapshot = { ...settingsCache[settingKey] };

      if (!snapshot || Object.keys(snapshot).length === 0) {
        return;
      }

      // Read from storage
      const stored = await browser.storage.local.get(settingKey);
      const current = stored?.[settingKey] || {};

      // Merge
      const merged = { ...current, ...snapshot };

      // Save
      await browser.storage.local.set({ [settingKey]: merged });
    } catch (err) {
      logError(`[settings] save error for ${settingKey}:`, err);
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
      const value = stored?.[settingKey];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        settingsCache[settingKey] = value;
      } else {
        settingsCache[settingKey] = {};
      }
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
/**
 * Manages custom settings for a custom user parser.
 * @async
 * @param {string} id - The identifier for the settings group
 * @param {string} key - The specific setting key within the group
 * @param {string} label - Display label for the setting
 * @param {string} [type="text"] - Type of the setting ("text" or "select")
 * @param {string|Array} [defaultValue=""] - Default value for the setting. For "select" type, should be an array of options
 * @param {*} [newValue] - New value to set (optional)
 * @throws {Error} Will throw an error if id or key is not provided
 * @returns {Promise<*>} The current value of the setting
 */
async function useSetting(id, key, label, type = "text", defaultValue = "", newValue) {
  if (!key) throw new Error("useSetting requires (id, key, ...)");
  const settingKey = `settings_${id}`;

  // Ensure cache loaded
  const opts = await loadSettingsForId(id);
  let current = opts[key];
  let shouldSave = false;

  // Initialize if not existing
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
  } else {
    //  Check if label/type/defaultValue changed
    if (current.label !== label) {
      current.label = label;
      shouldSave = true;
    }
    if (current.type !== type) {
      current.type = type;
      shouldSave = true;
    }

    // Default value check (update only if the value has not changed)
    if (type !== "select" && current.value === undefined && current.defaultValue !== defaultValue) {
      current.defaultValue = defaultValue;
      shouldSave = true;
    }
  }

  // Apply new value if provided and different
  if (newValue !== undefined) {
    if (type === "select" && Array.isArray(current.value)) {
      const currentSelected = current.value.find((o) => o.selected)?.value;
      if (currentSelected !== newValue) {
        current.value = current.value.map((opt) => ({
          ...opt,
          selected: opt.value === newValue,
        }));
        shouldSave = true;
      }
    } else if (current.value !== newValue) {
      current.value = newValue;
      shouldSave = true;
    }
  }

  // Persist changes
  if (shouldSave) {
    opts[key] = current;
    settingsCache[settingKey] = opts;
    scheduleSave(settingKey);
  }

  return current.value;
}

// Initialize all parser settings
async function initializeAllParserSettings() {
  const { userScriptsList: storedUserScriptsList = [] } = await browser.storage.local.get("userScriptsList");
  const userScriptsList = Array.isArray(storedUserScriptsList) ? storedUserScriptsList : [];

  // All available storage
  const allStored = await browser.storage.local.get(null);

  // initialSettings is located in global
  const initial = window.initialSettings || {};

  // Synchronize settingsCache with the current storage
  for (const key of Object.keys(allStored)) {
    if (key.startsWith("settings_")) {
      settingsCache[key] = allStored[key] || {};
    }
  }

  // Create defaults for initialSettings
  for (const [domain, data] of Object.entries(initial)) {
    if (!data || !data.urlPatterns) continue;

    const id = makeIdFromDomainAndPatterns(domain, data.urlPatterns);
    const settingKey = `settings_${id}`;

    // If there is no settingsCache for this parser, get it from storage
    if (!settingsCache[settingKey]) {
      settingsCache[settingKey] = allStored[settingKey] || {};
    }

    // Process all the settings in the parser
    if (Array.isArray(data.settings)) {
      for (const s of data.settings) {
        await useSetting(id, s.key, s.label, s.type, s.defaultValue);
      }
    }
  }

  // initialize the user script settings in userScriptsList
  for (const script of userScriptsList) {
    if (!script || !script.id) continue;

    const settingKey = `settings_${script.id}`;

    // otherwise, create
    if (!settingsCache[settingKey]) {
      settingsCache[settingKey] = allStored[settingKey] || {};
    }

    if (Array.isArray(script.settings)) {
      for (const setting of script.settings) {
        await useSetting(script.id, setting.key, setting.label, setting.type, setting.defaultValue);
      }
    }
  }
}

// registerParser - Used to process all built-in parsers.
window.registerParser = async function ({ title, domain, urlPatterns, authors, homepage, fn, userAdd = false, userScript = false, initOnly = false, ...rest }) {
  if (!domain || typeof fn !== "function") return;

  // wait initialSettings ready
  while (!window.initialSettings) {
    await new Promise((r) => setTimeout(r, 50));
  }

  if (!initLoadPromise) {
    initLoadPromise = (async () => {
      await loadAllSavedUserParsers();
      await initializeAllParserSettings();
      await cleanupOrphanSettingsAndEnables();
    })();
  }
  await initLoadPromise;

  const patternStrings = (urlPatterns || [])
    .map((p) => {
      if (typeof p === "string") return p;
      if (p instanceof RegExp) return p.source;
      return p.toString();
    })
    .sort();

  const id = makeIdFromDomainAndPatterns(domain, urlPatterns);

  const existingUserScript = window.parsers[domain]?.find((p) => p.id === id && p.userScript === userScript);

  if (existingUserScript) {
    existingUserScript.parse = fn;
    Object.assign(existingUserScript, rest);
    return existingUserScript.id;
  }

  if (!window.parsers[domain]) window.parsers[domain] = [];
  if (window.parsers[domain].some((p) => p.id === id)) return;

  // bind the id
  const boundUseSetting = (key, label, type = "text", defaultValue = "", newValue) => useSetting(id, key, label, type, defaultValue, newValue);
  const patternRegexes = (urlPatterns || []).map(parseUrlPattern);
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
        if (typeof val === "string" && /^-?\d{1,2}:\d{2}(:\d{2})?$/.test(val.trim())) return val.trim();
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
      const tpSec = parseTime(effectiveTimePassed);
      const durSec = parseTime(effectiveDuration);

      const isRemaining = durSec < 0;
      let totalDurationSec = Math.abs(durSec);

      if (isRemaining) {
        totalDurationSec = tpSec + Math.abs(durSec);
        effectiveDuration = formatTime(totalDurationSec);
      }

      const lastAct = rpcState.lastActivity;
      const lastDurationSec = parseTime(lastAct?.duration || "");
      const sameTrack = lastAct && lastAct.title === rest.title && lastAct.artist === rest.artist;
      const remainingMode = sameTrack && !isRemaining && durSec !== lastDurationSec;

      if (remainingMode) {
        const durationInSeconds = tpSec + durSec;
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

  if (!userScript) {
    // Metadata Registration
    if (!window.parserMeta.some((m) => m.id === id)) {
      window.parserMeta.push({
        id,
        title,
        domain,
        urlPatterns: patternStrings,
        authors,
        homepage,
        userAdd,
        userScript,
      });
      window.parserMeta.sort((a, b) => (a.title || a.domain).toLowerCase().localeCompare((b.title || b.domain).toLowerCase()));
    }

    scheduleParserListSaveOnce();
  }
};

// Save parser metadata to storage
let scheduleSaveTimeout = null;

// It is used after RegisterParser operations to save to local storage once.
function scheduleParserListSaveOnce(delay = 1000) {
  if (scheduleSaveTimeout) clearTimeout(scheduleSaveTimeout);

  scheduleSaveTimeout = setTimeout(() => {
    scheduleParserListSave();
  }, delay);
}

async function scheduleParserListSave() {
  try {
    const meta = (window.parserMeta || []).filter((p) => p.id && p.domain && p.title && p.urlPatterns);
    let parserList = [];
    let { userScriptsList = [] } = await browser.storage.local.get(["userScriptsList"]);

    if (userScriptsList.length) {
      userScriptsList = userScriptsList.map((u) => ({
        ...u,
        id: u.id,
        urlPatterns: u.urlPatterns || [".*"],
        userScript: true,
      }));
    }

    const mergedList = [...new Map([...parserList, ...meta, ...userScriptsList].map((item) => [`${item.id}|${item.domain}|${item.title}`, item])).values()].sort((a, b) =>
      (a.title || a.domain).toLowerCase().localeCompare((b.title || b.domain).toLowerCase())
    );

    await browser.storage.local.set({ parserList: mergedList });

    // Apply UserScript Settings
    if (userScriptsList.length) {
      const allScripts = userScriptsList;
      for (const script of allScripts) {
        if (!script?.id || processedScripts.has(script.id)) continue;
        processedScripts.add(script.id);

        const settings = script.settings || [];
        for (const setting of settings) {
          await useSetting(script.id, setting.key, setting.label, setting.type, setting.defaultValue);
        }
      }
    }
  } catch (error) {
    logError("Error saving parser list:", error);
  }
}

// Get current song info based on website and parser list
window.getSongInfo = async function () {
  try {
    const settings = await browser.storage.local.get();
    const hostname = location.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = location.pathname;

    const domainParsers = window.parsers?.[hostname];
    if (!domainParsers) return null;

    for (const parser of domainParsers) {
      try {
        const isEnabled = settings[`enable_${parser.id}`] !== false;
        const matches = parser.patterns?.some((re) => re.test(pathname));

        if (isEnabled && matches) {
          const result = await parser.parse();
          if (result) return result;
        }
      } catch (err) {
        logError(`Parser ${parser.id} failed:`, err);
        continue;
      }
    }

    return null;
  } catch (err) {
    logError("getSongInfo error:", err);
    return null;
  }
};

// userScript Manager Listener
const lastUseScriptRequest = Object.create(null);
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const msg = event.data;

  if (msg?.type === "USER_SCRIPT_USE_SETTING_REQUEST") {
    const { id, key, label, inputType, defaultValue, requestId } = msg;

    try {
      const result = await useSetting(id, key, label, inputType, defaultValue === "" ? undefined : defaultValue);
      // Send back the result
      window.postMessage(
        {
          type: "USER_SCRIPT_USE_SETTING_RESPONSE",
          requestId,
          value: result,
        },
        "*"
      );
    } catch (err) {
      window.postMessage(
        {
          type: "USER_SCRIPT_USE_SETTING_RESPONSE",
          requestId,
          error: err.message,
        },
        "*"
      );
    }
  } else if (msg?.type === "USER_SCRIPT_TRACK_DATA") {
    // Handle User Script Track Data
    const now = Date.now();
    if (Date.now() - (lastUseScriptRequest[msg.data.domain] || 0) < 1000) return;
    lastUseScriptRequest[msg.data.domain] = now;

    window.latestUserScriptData[msg.data.domain] = msg.data.song;

    if (typeof window.registerParser === "function") {
      window.registerParser?.({
        domain: msg.data.domain,
        authors: msg.data.authors,
        title: msg.data.title,
        urlPatterns: msg.data.urlPatterns,
        userAdd: false,
        userScript: true,
        fn: async function () {
          try {
            const song = window.latestUserScriptData[msg.data.domain];
            if (!song) return null;

            const { currentPosition, totalDuration, currentProgress, timestamps } = window.processPlaybackInfo?.(song.timePassed, song.duration) ?? {};

            return {
              title: song.title,
              artist: song.artist,
              image: song.image,
              source: song.source,
              songUrl: song.songUrl,
              position: currentPosition,
              duration: totalDuration,
              progress: currentProgress,
              ...timestamps,
            };
          } catch (err) {
            logError("User script parser error:", err);
            return null;
          }
        },
      });
    }
  }
});

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

// Cleanup Orphan Settings And Enables
async function cleanupOrphanSettingsAndEnables() {
  try {
    const all = await browser.storage.local.get(null);
    const parserList = (await browser.storage.local.get("parserList")).parserList || [];
    const validIds = new Set(parserList.map((p) => p.id));

    if (!parserList.length) return;

    for (const key of Object.keys(all)) {
      // settings_ clean
      if (key.startsWith("settings_")) {
        const id = key.replace("settings_", "");

        if (!validIds.has(id)) {
          logInfo(`Deleted Orphan Setting: ${key}`);
          await browser.storage.local.remove(key);
          delete settingsCache[key];
        }
      }

      // enable_ clean
      if (key.startsWith("enable_")) {
        const id = key.replace("enable_", "");

        if (!validIds.has(id)) {
          logInfo(`Deleted Orphan Enable: ${key}`);
          await browser.storage.local.remove(key);
        }
      }
    }
  } catch (e) {
    logError("cleanupOrphanSettingsAndEnables error:", e);
  }
}

// Global unhandled promise rejection handler
window.addEventListener("unhandledrejection", (event) => {
  if (errorFilter.shouldIgnore(event.reason)) {
    event.preventDefault();
  }
});

// Global error handler
window.addEventListener("error", (event) => {
  if (errorFilter.shouldIgnore(event.error || event.message)) {
    event.preventDefault();
  }
});
