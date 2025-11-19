import "./libs/browser-polyfill.js";
import "./libs/pako.js";

const state = {
  isLoopRunning: false,
  activeTabMap: new Map(),
  cleanupQueue: new Set(),
  serverStatus: { lastCheck: 0, isHealthy: false },
  pendingUpdates: new Map(),
  historyCounters: new Map(),
  lastLoopTime: 0,
  parserList: [],
  parserListLoaded: false,
  parserListLoading: null,
  parserEnabledCache: new Map(),
  parserMap: {},
  pendingClear: new Set(),
  pendingFetches: new Map(),
  mainLoopTimer: null,
  parserReloadDebounce: null,
};

const getEnabledParsers = () => state.parserList.filter((p) => p.isEnabled);
const historyData = () => loadHistory();

// Retrieves the 'enabled_' data from the local storage.
async function loadParserEnabledCache(parserEnabledCache, parserList) {
  const keys = parserList.map((p) => `enable_${p.id}`);
  const settings = await browser.storage.local.get(keys);

  parserEnabledCache.clear();
  parserList.forEach((p) => {
    parserEnabledCache.set(p.id, settings[`enable_${p.id}`] !== false);
  });
}

const historyMutex = createMutex();
async function scheduleHistoryAdd(tabId, songData) {
  if (!tabId || !Number.isInteger(tabId)) return;
  if (!songData?.title || !songData?.artist) return;

  if (!state.historyCounters) state.historyCounters = new Map();

  const normalized = normalizeTitleAndArtist(songData.title, songData.artist);
  const normalizedTitle = truncate(normalized.title, 128, { fallback: "Unknown Song" });
  const normalizedArtist = truncate(normalized.artist === normalized.title ? "Radio" : normalized.artist, 128, { fallback: "Unknown Artist" });
  const sourceText = truncate(songData.source, 32, { fallback: "Unknown Source" });

  const key = `${normalizedTitle}::${normalizedArtist}::${sourceText}::${songData.image}`;
  let tracker = state.historyCounters.get(tabId);
  const now = Date.now();

  if (!tracker || tracker.lastKey !== key) {
    state.historyCounters.set(tabId, { lastKey: key, startTime: now });
    return;
  }

  if (now - tracker.startTime >= 15000) {
    await historyMutex(async () => {
      try {
        const history = await historyData();

        const last = history[0];
        const sameAsLast = last && last.t === normalizedTitle && last.a === normalizedArtist && last.s === sourceText;

        if (!sameAsLast) {
          // Add to History
          await addToHistory({
            image: songData.image,
            title: normalizedTitle,
            artist: normalizedArtist,
            source: sourceText,
            songUrl: songData.songUrl,
          });
        }
      } catch (error) {
        logError("History add error:", error);
      }
    });
    // Clear tracker
    state.historyCounters.delete(tabId);
  }
}

// Load Parser Lists - Processes the saved list
async function loadParserList() {
  try {
    // If it is loading, do not process it again
    if (state.parserListLoading) {
      await state.parserListLoading;
    }

    const { parserList = [], userParserSelectors = [], userScriptsList = [] } = await browser.storage.local.get(["parserList", "userParserSelectors", "userScriptsList"]);
    logInfo(`Loaded ${parserList.length} parsers, ${userParserSelectors.length} user parsers and ${userScriptsList.length} user scripts.`);

    // Get the lists from local storage and process them

    // Default Parsers
    const builtInList = parserList.filter((p) => !p.userAdd && !p.userScript);

    // User Selector Parsers
    const userList = userParserSelectors.map((u) => ({
      ...u,
      id: u.id || `${u.domain}_${hashFromPatternStrings(u.urlPatterns || [".*"])}`,
      urlPatterns: u.urlPatterns || u.selectors?.regex || [".*"],
      userAdd: true,
    }));

    // UserScript Parsers
    const userScriptList = userScriptsList.map((u) => ({
      ...u,
      id: u.id || `${u.domain}_${hashFromPatternStrings(u.urlPatterns || [".*"])}`,
      urlPatterns: u.urlPatterns || [".*"],
      userScript: true,
    }));

    // Merge the lists
    const allParsers = [...builtInList, ...userList, ...userScriptList];

    // Get Enable settings
    const enableKeys = allParsers.map(({ id }) => `enable_${id}`);
    const settings = enableKeys.length > 0 ? await browser.storage.local.get(enableKeys) : {};

    state.parserList = allParsers.map((p) => ({
      ...p,
      isEnabled: settings[`enable_${p.id}`] !== false,
      settings: {},
    }));

    // If there is an 'enable_' setting in the cache, use it.
    state.parserMap = Object.fromEntries(state.parserList.map((p) => [`${p.id}`, p]));
    await loadParserEnabledCache(state.parserEnabledCache, state.parserList);
    state.parserListLoaded = true;
  } catch (error) {
    logError("Parser list loading failed:", error);
    state.parserList = [];
    state.parserMap = {};
    state.parserListLoaded = true;
    throw error;
  }
}

// Retrieves the parser settings from storage.
async function getParserSettings(parserId) {
  if (!parserId) return {};

  const cached = state.parserMap[parserId]?.settings;
  if (cached && Object.keys(cached).length > 0) {
    return cached;
  }

  const settingKey = `settings_${parserId}`;
  const result = await browser.storage.local.get(settingKey);
  const parserSettings = result[settingKey] || {};
  const parsedSettings = Object.fromEntries(Object.entries(parserSettings).map(([key, obj]) => [key, obj.value]));

  if (state.parserMap[parserId]) {
    state.parserMap[parserId].settings = parsedSettings;
  }

  return parsedSettings;
}

// Load the parsers once, return true if they exist.
const parserListMutex = createMutex();
const loadParserListOnce = async () => {
  return parserListMutex(async () => {
    if (state.parserListLoaded) {
      return true;
    }

    if (state.parserListLoading) {
      return state.parserListLoading;
    }

    state.parserListLoading = (async () => {
      try {
        await loadParserList();
        state.parserListLoaded = true;
        return true;
      } catch (e) {
        logError("Critical: Parser load failed", e);
        return false;
      } finally {
        state.parserListLoading = null;
      }
    })();

    return state.parserListLoading;
  });
};

const parserReady = async () => {
  await loadParserListOnce();
};

// RPC and Tab Cleaning operations
const clearRpcForTab = async (tabId) => {
  // If a clear is already in-progress, skip
  if (!state.activeTabMap.has(tabId) && !state.pendingClear.has(tabId)) {
    return;
  }

  if (state.pendingClear.has(tabId)) {
    logInfo(`Clear already pending for tab ${tabId}, skipping`);
    return;
  }

  state.pendingClear.add(tabId);

  try {
    const wasActive = state.activeTabMap.has(tabId);

    // Clear pending update timeouts
    const pending = state.pendingUpdates.get(tabId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    state.pendingUpdates.delete(tabId);

    // Abort the pending fetch
    const controller = state.pendingFetches.get(tabId);
    if (controller) {
      controller.abort();
    }
    state.pendingFetches.delete(tabId);

    // State cleanup
    state.historyCounters.delete(tabId);
    state.cleanupQueue.delete(tabId);
    state.activeTabMap.delete(tabId);

    if (wasActive) {
      logInfo(`Clearing RPC for tab ${tabId}`);

      await fetchWithTimeout(
        `http://localhost:${CONFIG.serverPort}/clear-rpc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: `tab_${tabId}` }),
        },
        CONFIG.requestTimeout
      ).catch((err) => {
        logError(`Backend clear failed for tab ${tabId}:`, err);
      });

      logInfo(`Cleared RPC for tab ${tabId}`);
    }
  } catch (e) {
    logError(`Clear RPC failed [${tabId}]`, e);
  } finally {
    state.pendingClear.delete(tabId);
  }
};

// Tab Cleaning Helper Functions
const deferredCleanup = async () => {
  if (!state.cleanupQueue.size) return;

  const tabsToClean = [...state.cleanupQueue];
  state.cleanupQueue.clear();
  for (const tabId of tabsToClean) {
    await clearRpcForTab(tabId);
  }
};

const markOtherTabsForCleanup = (activeId) => {
  state.activeTabMap.forEach((_, id) => {
    if (id !== activeId) state.cleanupQueue.add(id);
  });
};

// Finds the Active Tab that matches with the Parser.
const updateActiveTabMap = async (state, tabs) => {
  const enabled = getEnabledParsers();

  const matchedTabsMap = new Map();
  tabs.forEach((tab) => {
    try {
      if (!tab.url) return;

      const matched = findMatchingParsersForUrl(tab.url, enabled);
      if (matched.length === 0) return;

      const urlObj = new URL(tab.url);
      const validMatches = matched.filter((parser) => {
        try {
          const patterns = parser.urlPatterns || [];
          return patterns.some((pattern) => {
            const regex = parseUrlPattern(pattern);
            return regex.test(urlObj.pathname);
          });
        } catch (e) {
          logError(`Pattern error for parser ${parser.id}:`, e);
          return false;
        }
      });

      if (validMatches.length > 0) {
        matchedTabsMap.set(tab.id, { tab, matched: validMatches });
      }
    } catch (e) {
      logError("Tab URL parsing error:", e);
    }
  });

  if (matchedTabsMap.size === 0) return;

  const matchedTabs = Array.from(matchedTabsMap.values()).map((v) => v.tab);
  const mainTab = matchedTabs.find((t) => t.active) || matchedTabs[0];

  markOtherTabsForCleanup(mainTab.id);

  if (!state.activeTabMap.has(mainTab.id)) {
    const matchedData = matchedTabsMap.get(mainTab.id);
    state.activeTabMap.set(mainTab.id, {
      lastUpdated: 0,
      lastKey: "",
      isAudioPlaying: mainTab.audible ?? false,
      parserId: matchedData?.matched[0]?.id ?? null,
    });
  }

  return mainTab;
};

// RPC Update
const updateRpc = async (data, tabId) => {
  const existing = state.pendingFetches.get(tabId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);
  state.pendingFetches.set(tabId, controller);

  try {
    const base = state.activeTabMap.get(tabId);
    let parserId = base?.parserId;

    if (!parserId) {
      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.url) {
          const url = new URL(tab.url);
          const hostname = url.hostname.replace(/^www\./, "");
          const exactMatch = state.parserList.find((parser) => {
            try {
              return isDomainMatch(parser.domain, hostname);
            } catch (e) {
              logError("Domain match error:", e);
              return false;
            }
          });

          if (exactMatch) {
            parserId = exactMatch.id;
            logInfo(`Found exact parser match: ${hostname} -> ${parserId}`);
          }
        }
      } catch (e) {
        logError("Error finding correct parser:", e);
      }
    }

    const parserSettings = await getParserSettings(parserId);

    const payload = {
      data: {
        ...data,
        status: data.playStatus ?? base?.isAudioPlaying ?? false,
        settings: parserSettings,
      },
      clientId: `tab_${tabId}`,
      timestamp: Date.now(),
    };

    await fetchWithTimeout(
      `http://localhost:${CONFIG.serverPort}/update-rpc`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
      CONFIG.requestTimeout
    );
  } catch (err) {
    if (err.name !== "AbortError") {
      logError(`Update RPC failed for tab ${tabId}:`, err);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (state.pendingFetches.get(tabId) === controller) {
      state.pendingFetches.delete(tabId);
    }
  }
};

// Schedule RPC Update - It is used on the backgroundListeners.js SetupListeners side.
const scheduleRpcUpdate = (data, tabId) => {
  const isSameData = (a, b) => a && b && a.title === b.title && a.artist === b.artist && Math.floor(a.progress / 10) === Math.floor(b.progress / 10) && a.duration === b.duration;
  const current = state.pendingUpdates.get(tabId);
  if (current && isSameData(current.data, data)) return;

  if (current?.timeout) clearTimeout(current.timeout);
  const timeout = setTimeout(() => {
    state.pendingUpdates.delete(tabId);
    updateRpc(data, tabId).catch(logError);
  }, 500);

  state.pendingUpdates.set(tabId, { timeout, data });
};

// Checks the Active Tab
async function safePingTab(tabId) {
  try {
    const res = await browser.tabs.sendMessage(tabId, { type: "PING_FOR_DATA" });
    return res?.title && res?.artist ? res : null;
  } catch {
    return null;
  }
}

// Processes tab data
const processTab = async (tabId, tabData) => {
  if (!state.activeTabMap.has(tabId)) return;

  const now = Date.now();
  if (now - tabData.lastUpdated < CONFIG.activeInterval) return;

  const res = await safePingTab(tabId);
  if (!res || typeof res !== "object") {
    if (!tabData.lastUpdated || now - tabData.lastUpdated > CONFIG.stuckThreshold) {
      logInfo(`Tab ${tabId} did not respond, clearing RPC`);
      await clearRpcForTab(tabId).catch(logError);
      return;
    }
  }

  // Title/artist validation
  if (!res.title || !res.artist) {
    logError(`Invalid response from tab ${tabId}: missing title/artist`);
    return;
  }

  const newKey = `${res.title}|${res.artist}|${tabData.isAudioPlaying}|${Math.floor(res.progress / 10)}|${res.duration}`;

  // Check for duplicate updates
  if (res.duration > 0 && tabData.lastKey === newKey) {
    return;
  }

  // Radio/stream check (duration = 0)
  if (res.duration <= 0 && now - tabData.lastUpdated < CONFIG.activeInterval) {
    return;
  }

  state.activeTabMap.set(tabId, {
    ...res,
    isAudioPlaying: true,
    lastKey: newKey,
    lastUpdated: now,
    parserId: tabData.parserId ?? null,
  });
};

// Main Loop
const mainLoop = async () => {
  if (state.isLoopRunning) {
    logInfo("Main loop already running, skipping");
    return;
  }

  state.isLoopRunning = true;
  const now = Date.now();

  // Minimum interval check
  if (now - state.lastLoopTime < CONFIG.activeInterval) {
    state.isLoopRunning = false;
    return;
  }

  try {
    const tabs = await browser.tabs.query({ audible: true });

    if (!tabs.length) {
      await deferredCleanup();
      return;
    }

    const matched = await updateActiveTabMap(state, tabs);

    if (matched) {
      const tabData = state.activeTabMap.get(matched.id);
      if (tabData) {
        await processTab(matched.id, tabData);
      }
    }

    const currentIds = tabs.map((t) => t.id);
    for (const id of state.activeTabMap.keys()) {
      if (!currentIds.includes(id)) {
        state.cleanupQueue.add(id);
      }
    }

    await deferredCleanup();
  } catch (e) {
    logError("Main Loop Error", e);
  } finally {
    state.lastLoopTime = Date.now();
    state.isLoopRunning = false;

    if (state.mainLoopTimer) {
      clearTimeout(state.mainLoopTimer);
    }

    state.mainLoopTimer = setTimeout(mainLoop, CONFIG.activeInterval);
  }
};

// Start
const init = async () => {
  setupListeners();
  await parserReady();
  scriptManager.registerAllScripts();
  await mainLoop();
};

init();
