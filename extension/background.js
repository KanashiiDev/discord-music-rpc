import "./libs/browser-polyfill.js";
import "./libs/pako.js";

const state = {
  serverPort: CONFIG.serverPort,
  isLoopRunning: false,
  activeTabMap: new Map(),
  tabUrlMap: new Map(),
  audibleTimers: new Map(),
  cleanupQueue: new Set(),
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

// Retrieves the 'enable_' data from the local storage.
async function loadParserEnabledCache(parserEnabledCache, parserList) {
  parserEnabledCache.clear();
  const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
  parserList.forEach((p) => {
    const enableKey = `enable_${p.id}`;
    parserEnabledCache.set(p.id, parserEnabledState[enableKey] !== false);
  });
}

const historyMutex = createMutex();
async function scheduleHistoryAdd(tabId, songData) {
  if (!tabId || !Number.isInteger(tabId)) return;
  if (!songData?.title || !songData?.artist) return;

  if (!state.historyCounters) state.historyCounters = new Map();
  const key = `${songData.title}::${songData.artist}::${songData.source}::${songData.image}`;
  const tracker = state.historyCounters.get(tabId);
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
        const sameAsLast = last && last.t === songData.title && last.a === songData.artist && last.s === songData.source;

        if (!sameAsLast) {
          // Add to History
          await addToHistory({
            image: songData.image,
            title: songData.title,
            artist: songData.artist,
            source: songData.source,
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

    // Get Enable settings from storage and apply them to the parsers
    const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");

    state.parserList = allParsers.map((p) => ({
      ...p,
      isEnabled: parserEnabledState[`enable_${p.id}`] !== false,
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

  const { parserSettings = {} } = await browser.storage.local.get("parserSettings");
  const parserKey = `settings_${parserId}`;
  const rawSettings = parserSettings[parserKey] || {};
  const parsedSettings = Object.fromEntries(Object.entries(rawSettings).map(([key, obj]) => [key, obj.value]));

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

const activeTabMutex = createMutex();
// RPC and Tab Cleaning operations
const clearRpcForTab = async (tabId, reason = "Tab closed") => {
  return activeTabMutex(async () => {
    // If a clear is already in-progress, skip
    if (!state.activeTabMap.has(tabId) && !state.pendingClear.has(tabId)) {
      return;
    }

    if (state.pendingClear.has(tabId)) {
      logInfo(`Clear already pending for tab ${tabId}, skipping`);
      return;
    }

    const wasActive = state.activeTabMap.has(tabId);
    state.pendingClear.add(tabId);

    try {
      // Clear pending update timeouts
      const pending = state.pendingUpdates.get(tabId);
      if (pending?.timeout) clearTimeout(pending.timeout);
      state.pendingUpdates.delete(tabId);

      // if there is an audible timer, cancel it
      if (state.audibleTimers?.has(tabId)) {
        clearTimeout(state.audibleTimers.get(tabId));
        state.audibleTimers.delete(tabId);
      }

      // Abort the pending fetch
      const controller = state.pendingFetches.get(tabId);
      if (controller) {
        controller.abort();
      }

      if (wasActive) {
        let tab;
        try {
          tab = await browser.tabs.get(tabId);
        } catch (err) {
          if (err.message.includes("No tab with id")) {
            logInfo(`Tab ${tabId} is already closed, RPC cleanup skipped.`);
          }
        }

        const title = tab?.title || "";
        const url = tab?.url || "";
        const domain = url ? new URL(url).host : "";
        const stored = await browser.storage.local.get("debugMode");
        const debugMode = stored.debugMode === 1 ? true : CONFIG.debugMode;
        if (debugMode && state.lastUpdateStatus !== "skipped") {
          console.groupCollapsed(
            `%c[DISCORD-MUSIC-RPC - INFO] Clearing RPC for tab ${tabId}%c ${url ? "| " + url : ""}`,
            "color: ddd; background-color: #2a4645ff; padding: 2px 4px; border-radius: 3px;",
            "color: #5bc0de; font-weight: bold;"
          );
          if (tab) {
            console.log(`Title: %c${title}`, "color: #f0ad4e; font-weight: bold;");
            console.log(`Domain: %c${domain}`, "color: #5cb85c; text-decoration: underline;");
          }
          console.log(`Reason: %c${reason}`, "color: #0275d8; font-weight: bold;");
          console.groupEnd();
        }
        try {
          await fetchWithTimeout(
            `http://localhost:${state.serverPort}/clear-rpc`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientId: `tab_${tabId}` }),
            },
            CONFIG.requestTimeout
          );
          logInfo(`✅ Cleared RPC for tab ${tabId}`);
        } catch (err) {
          logError(`❌ RPC clear failed for tab ${tabId}:`, err.message);
        }
      }
    } catch (e) {
      logError(`Clear RPC failed tab ${tabId}`, e);
    } finally {
      state.activeTabMap.delete(tabId);
      state.pendingClear.delete(tabId);
      state.pendingFetches.delete(tabId);
      state.cleanupQueue.delete(tabId);
      state.historyCounters.delete(tabId);

      if (state.activeTabMap.size === 0) {
        if (state.mainLoopTimer) clearTimeout(state.mainLoopTimer);
        setTimeout(mainLoop, 0);
      }
    }
  });
};

// Tab Cleaning Helper Functions
const deferredCleanup = async () => {
  if (!state.cleanupQueue.size) return;

  const tabsToClean = [...state.cleanupQueue];
  state.cleanupQueue.clear();
  for (const tabId of tabsToClean) {
    await clearRpcForTab(tabId, "deferred Cleanup");
  }
};

const markOtherTabsForCleanup = (activeId) => {
  state.activeTabMap.forEach((_, id) => {
    if (id !== activeId) state.cleanupQueue.add(id);
  });
};

// Finds the Active Tab that matches with the Parser.
const updateActiveTabMap = async (state, tabs) => {
  return activeTabMutex(async () => {
    const enabled = getEnabledParsers();
    const matchedTabsMap = new Map();

    // 1️) Match the tabs with the parser
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

    // 2) If there is an active tab in activeTabMap
    if (state.activeTabMap.size > 0) {
      const firstWinnerId = state.activeTabMap.keys().next().value;
      const winnerTab = tabs.find((t) => t.id === firstWinnerId);

      if (winnerTab) {
        // If the active tab is still open, send the others to cleanup
        markOtherTabsForCleanup(firstWinnerId);
        return winnerTab;
      } else {
        // The active tab has been closed or released with clear-rpc
        state.activeTabMap.clear();
      }
    }

    // 3️) Choose a new active tab
    const mainTab = matchedTabs.find((t) => t.active) || matchedTabs[0];
    const matchedData = matchedTabsMap.get(mainTab.id);

    state.activeTabMap.set(mainTab.id, {
      lastUpdated: Date.now(),
      lastKey: "",
      isAudioPlaying: mainTab.audible ?? false,
      parserId: matchedData?.matched[0]?.id ?? null,
    });

    // Send the other tabs to cleanup
    markOtherTabsForCleanup(mainTab.id);

    return mainTab;
  });
};

// RPC Update
const updateRpc = async (data, tabId) => {
  const existing = state.pendingFetches.get(tabId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
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
      `http://localhost:${state.serverPort}/update-rpc`,
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
    if (state.pendingFetches.get(tabId) === controller) {
      state.pendingFetches.delete(tabId);
    }
  }
};

// Schedule RPC Update - It is used on the backgroundListeners.js SetupListeners side.
const scheduleRpcUpdate = (data, tabId) => {
  const current = state.pendingUpdates.get(tabId);

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
  // If being processed for the first time, wait a bit for the content script to load
  if (!tabData.lastUpdated) {
    state.activeTabMap.set(tabId, {
      ...tabData,
      lastUpdated: 0,
    });
    return;
  }
  if (now - tabData.lastUpdated < CONFIG.activeInterval) return;

  const res = await safePingTab(tabId);

  if (!res || typeof res !== "object") {
    if (!tabData.lastUpdated || now - tabData.lastUpdated > CONFIG.stuckThreshold) {
      logInfo(`Tab ${tabId} did not respond, clearing RPC`);
      await clearRpcForTab(tabId, "tab did not respond").catch(logError);
    }
    return;
  }

  if (!res.title || !res.artist) return;

  // Radio / stream check (duration = 0)
  if (res.duration <= 0) {
    if (now - tabData.lastUpdated >= CONFIG.activeInterval) {
      state.activeTabMap.set(tabId, {
        ...res,
        lastUpdated: now,
        isAudioPlaying: true,
      });
    }
    return;
  }

  // Normal update
  state.activeTabMap.set(tabId, {
    ...res,
    lastUpdated: now,
    isAudioPlaying: true,
    progress: res.progress,
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
  await browser.storage.local.get("serverPort").then((result) => {
    if (result.serverPort !== undefined) {
      state.serverPort = result.serverPort;
    }
  });
  setupListeners();
  await parserReady();
  scriptManager.registerAllScripts();
  await mainLoop();
};

init();
