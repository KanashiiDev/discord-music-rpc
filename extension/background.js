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

async function loadParserEnabledCache(parserEnabledCache, parserList) {
  const keys = parserList.map((p) => `enable_${p.id}`);
  const settings = await browser.storage.local.get(keys);

  parserEnabledCache.clear();
  parserList.forEach((p) => {
    parserEnabledCache.set(p.id, settings[`enable_${p.id}`] !== false);
  });
}

async function scheduleHistoryAdd(tabId, songData) {
  if (!tabId || !Number.isInteger(tabId)) return;
  if (!songData?.title || !songData?.artist) return;

  if (!state.historyCounters) state.historyCounters = new Map();

  // normalize title & artist
  const normalized = normalizeTitleAndArtist(songData.title, songData.artist);
  const normalizedTitle = truncate(normalized.title, 128, { fallback: "Unknown Song" });
  const normalizedArtist = truncate(normalized.artist === normalized.title ? "Radio" : normalized.artist, 128, { fallback: "Unknown Artist" });
  const sourceText = truncate(songData.source, 32, { fallback: "Unknown Source" });

  const key = `${normalizedTitle}::${normalizedArtist}::${sourceText}::${songData.image}`;
  let tracker = state.historyCounters.get(tabId);
  const now = Date.now();

  // If a new song is playing, reset the tracker
  if (!tracker || tracker.lastKey !== key) {
    state.historyCounters.set(tabId, { lastKey: key, startTime: now });
    return;
  }

  // If 15 seconds have passed, add it
  if (now - tracker.startTime >= 15000) {
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

    // Clear tracker
    state.historyCounters.delete(tabId);
  }
}

async function loadParserList() {
  try {
    if (state.parserListLoading) {
      await state.parserListLoading;
    }

    const { parserList = [], userParserSelectors = [], userScriptsList = [] } = await browser.storage.local.get(["parserList", "userParserSelectors", "userScriptsList"]);
    logInfo(`Loaded ${parserList.length} parsers, ${userParserSelectors.length} user parsers and ${userScriptsList.length} user scripts.`);

    const builtInList = parserList.filter((p) => !p.userAdd && !p.userScript);
    
    const userList = userParserSelectors.map((u) => ({
      ...u,
      id: u.id || `${u.domain}_${hashFromPatternStrings(u.urlPatterns || [".*"])}`,
      urlPatterns: u.urlPatterns || u.selectors?.regex || [".*"],
      userAdd: true,
    }));

    const userScriptList = userScriptsList.map((u) => ({
      ...u,
      id: u.id || `${u.domain}_${hashFromPatternStrings(u.urlPatterns || [".*"])}`,
      urlPatterns: u.urlPatterns || [".*"],
      userScript: true,
    }));

    const allParsers = [...builtInList, ...userList, ...userScriptList];

    // Get Enable settings
    const enableKeys = allParsers.map(({ id }) => `enable_${id}`);
    const settings = enableKeys.length > 0 ? await browser.storage.local.get(enableKeys) : {};

    state.parserList = allParsers.map((p) => ({
      ...p,
      isEnabled: settings[`enable_${p.id}`] !== false,
      settings: {},
    }));

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

const clearRpcForTab = async (tabId) => {
  // If a clear is already in-progress, skip
  if (state.pendingClear.has(tabId)) return;

  // Mark pending
  state.pendingClear.add(tabId);

  try {
    // If it was never active, nothing to do
    const wasActive = state.activeTabMap.has(tabId);

    // Cancel queued update timers
    const pending = state.pendingUpdates.get(tabId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    state.pendingUpdates.delete(tabId);
    state.historyCounters.delete(tabId);

    // remove from active structures
    state.cleanupQueue.delete(tabId);
    state.activeTabMap.delete(tabId);

    // Only send clear to backend if we previously sent an RPC for this tab
    if (wasActive) {
      logInfo(`Cleared local state for tab ${tabId}`);

      // notify backend
      const res = await fetchWithTimeout(
        `http://localhost:${CONFIG.serverPort}/clear-rpc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: `tab_${tabId}` }),
        },
        CONFIG.requestTimeout
      );
    }
  } catch (e) {
    logError(`Clear RPC failed [${tabId}]`, e);
  } finally {
    // allow future clears
    state.pendingClear.delete(tabId);
  }
};

const updateRpc = async (data, tabId) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

  state.pendingFetches.set(tabId, controller);

  const base = state.activeTabMap.get(tabId);
  let parserId = base?.parserId;

  if (!parserId) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.url) {
        const url = new URL(tab.url);
        const hostname = url.hostname.replace(/^www\./, "");

        function isDomainMatch(parserDomainRaw, tabHostnameRaw) {
          const parserDomain = normalizeHost(parserDomainRaw);
          const tabDomain = normalizeHost(tabHostnameRaw);

          if (!parserDomain || !tabDomain) return false;

          // Exact match
          if (parserDomain === tabDomain) return true;

          if (parserDomain.startsWith("*.")) {
            const base = parserDomain.slice(2);
            return tabDomain === base || tabDomain.endsWith(`.${base}`);
          }
          if (tabDomain.endsWith(`.${parserDomain}`)) return true;
          return false;
        }

        const exactMatch = state.parserList.find((parser) => {
          try {
            const parserDomain = parser.domain;
            return isDomainMatch(parserDomain, hostname);
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
  clearTimeout(timeoutId);
  state.pendingFetches.delete(tabId);
};

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

async function safePingTab(tabId) {
  try {
    const res = await browser.tabs.sendMessage(tabId, { type: "PING_FOR_DATA" });
    return res?.title && res?.artist ? res : null;
  } catch {
    return null;
  }
}

const processTab = async (tabId, tabData) => {
  if (!state.activeTabMap.has(tabId)) return;
  const now = Date.now();
  if (now - tabData.lastUpdated < CONFIG.activeInterval) return;

  const res = await safePingTab(tabId);
  if (!res) return now - tabData.lastUpdated > CONFIG.stuckThreshold && state.cleanupQueue.add(tabId);

  // Null check ve validation
  if (!res || typeof res !== "object") {
    logError(`Invalid response from tab ${tabId}:`, res);
    return;
  }

  const newKey = `${res.title}|${res.artist}|${tabData.isAudioPlaying}|${Math.floor(res.progress / 10)}|${res.duration}`;
  if ((res.duration > 0 && tabData.lastKey === newKey) || (res.duration <= 0 && now - tabData.lastUpdated < CONFIG.activeInterval)) return;

  state.activeTabMap.set(tabId, {
    ...res,
    isAudioPlaying: true,
    lastKey: newKey,
    lastUpdated: now,
    parserId: tabData.parserId ?? null,
  });
};

const deferredCleanup = async () => {
  if (!state.cleanupQueue.size) return;
  const tabsToClean = [...state.cleanupQueue];
  state.cleanupQueue.clear();
  await Promise.all(tabsToClean.map(clearRpcForTab));
};

const markOtherTabsForCleanup = (activeId) => {
  state.activeTabMap.forEach((_, id) => {
    if (id !== activeId) state.cleanupQueue.add(id);
  });
};

const updateActiveTabMap = async (state, tabs) => {
  const enabled = getEnabledParsers();

  const matchedTabs = tabs.filter((tab) => {
    try {
      if (!tab.url) return false;
      const matched = findMatchingParsersForUrl(tab.url, enabled);
      if (matched.length > 0) {
        // URL pattern check
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
          tab._matchedParsers = matched;
          return true;
        }
      }
      return false;
    } catch (e) {
      logError("Tab URL parsing error:", e);
      return false;
    }
  });

  if (!matchedTabs.length) return;

  const mainTab = matchedTabs.find((t) => t.active) || matchedTabs[0];
  markOtherTabsForCleanup(mainTab.id);

  if (!state.activeTabMap.has(mainTab.id)) {
    const matched = mainTab._matchedParsers || [];
    state.activeTabMap.set(mainTab.id, {
      lastUpdated: 0,
      lastKey: "",
      isAudioPlaying: mainTab.audible ?? false,
      parserId: matched[0]?.id ?? null,
    });
  }

  return mainTab;
};

const mainLoop = async () => {
  if (state.isLoopRunning) return;
  state.isLoopRunning = true;
  const now = Date.now();
  if (now - state.lastLoopTime < CONFIG.activeInterval) return;

  try {
    const tabs = await browser.tabs.query({ audible: true });
    if (!tabs.length) {
      await deferredCleanup();
      return;
    }
    const matched = await updateActiveTabMap(state, tabs);
    if (matched) {
      await processTab(matched.id, state.activeTabMap.get(matched.id));
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
    if (state.mainLoopTimer) clearTimeout(state.mainLoopTimer);
    state.lastLoopTime = Date.now();
    state.isLoopRunning = false;
    state.mainLoopTimer = setTimeout(mainLoop, CONFIG.activeInterval);
  }
};

const init = async () => {
  setupListeners();
  await parserReady();
  scriptManager.registerAllScripts();
  setupListeners();
  await mainLoop();
};

init();
