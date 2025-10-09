import "./libs/browser-polyfill.js";
import "./libs/pako.js";

const state = {
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
};

const getEnabledParsers = () => state.parserList.filter((p) => p.isEnabled);

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
      const history = await loadHistory();

      // Control with normalized values
      const exists = history.some((e) => e.t === normalizedTitle && e.a === normalizedArtist && e.s === sourceText);

      if (!exists) {
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

    const { parserList = [], userParserSelectors = [] } = await browser.storage.local.get(["parserList", "userParserSelectors"]);

    logInfo(`Loaded ${parserList.length} parsers and ${userParserSelectors.length} user parsers`);

    const userList = userParserSelectors.map((u, index) => ({
      ...u,
      id: u.id,
      urlPatterns: u.urlPatterns || u.selectors?.regex || [".*"],
      userAdd: true,
    }));

    const fullList = [...parserList, ...userList];
    const keys = fullList.flatMap(({ id }) => [`enable_${id}`, `settings_${id}`]);
    const settings = await browser.storage.local.get(keys);

    state.parserList = fullList.map((p) => {
      const fallbackId = Object.keys(settings).find((k) => k.startsWith("settings_") && k === `settings_${p.domain}`);
      const parserSettings = settings[`settings_${p.id}`] || settings[fallbackId] || {};
      const parsedSettings = Object.fromEntries(Object.entries(parserSettings).map(([key, obj]) => [key, obj.value]));
      return {
        ...p,
        isEnabled: settings[`enable_${p.id}`] !== false,
        settings: parsedSettings,
      };
    });

    state.parserMap = Object.fromEntries(state.parserList.map((p) => [p.id, p]));
    state.parserListLoaded = true;
    await loadParserEnabledCache(state.parserEnabledCache, state.parserList);
  } catch (error) {
    logError("Parser list loading failed:", error);
    state.parserList = [];
    state.parserMap = {};
    state.parserListLoaded = true;
    throw error;
  }
}
const parserListMutex = createMutex();
const loadParserListOnce = async () => {
  return parserListMutex(async () => {
    if (state.parserListLoaded && state.parserList.length > 0) return;

    if (state.parserListLoading) {
      return state.parserListLoading;
    }

    state.parserListLoading = (async () => {
      try {
        await loadParserList();
        return true;
      } catch (error) {
        logError("Critical: Parser list loading failed completely", error);
        return false;
      } finally {
        state.parserListLoading = null;
      }
    })();

    return state.parserListLoading;
  });
};

const parserReady = loadParserListOnce();

// track tabs that were sent to backend so we only clear when needed
const clientSentToServer = new Set();

const clearRpcForTab = async (tabId) => {
  // If a clear is already in-progress, skip
  if (state.pendingClear.has(tabId)) return;

  // Mark pending
  state.pendingClear.add(tabId);

  try {
    // If it was never active and never sent to server, nothing to do
    const wasActive = state.activeTabMap.has(tabId);
    const wasSent = clientSentToServer.has(tabId);

    // Cancel queued update timers
    const pending = state.pendingUpdates.get(tabId);
    if (pending?.timeout) clearTimeout(pending.timeout);
    state.pendingUpdates.delete(tabId);
    state.historyCounters.delete(tabId);

    // remove from active structures
    state.cleanupQueue.delete(tabId);
    state.activeTabMap.delete(tabId);

    // Only send clear to backend if we previously sent an RPC for this tab
    if (wasActive || wasSent) {
      logInfo(`Cleared local state for tab ${tabId}`);

      // notify backend
      try {
        await fetchWithTimeout(
          `http://localhost:${CONFIG.serverPort}/clear-rpc`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId: `tab_${tabId}` }),
          },
          CONFIG.requestTimeout
        );
      } catch (e) {
        logError(`Clear RPC notify failed [${tabId}]`, e);
      }
    }

    clientSentToServer.delete(tabId);
  } catch (e) {
    logError(`Clear RPC failed [${tabId}]`, e);
  } finally {
    // allow future clears
    state.pendingClear.delete(tabId);
  }
};

const updateRpc = async (data, tabId) => {
  await parserReady;
  await loadParserListOnce();
  if (!state.parserMap || Object.keys(state.parserMap).length === 0) {
    state.parserListLoaded = false;
    state.parserListLoading = null;
    await loadParserListOnce();
  }
  const base = state.activeTabMap.get(tabId);
  let parserId = base?.parserId;

  if (!parserId || !state.parserMap[parserId]?.settings || Object.keys(state.parserMap[parserId].settings).length === 0) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.url) {
        const url = new URL(tab.url);
        const hostname = url.hostname.replace(/^www\./, "");

        const exactMatch = state.parserList.find((parser) => {
          const domain = normalize(parser.domain);
          const normHost = normalize(hostname);
          return domain === normHost;
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
  const parserSettings = state.parserMap?.[parserId]?.settings || {};

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
    },
    CONFIG.requestTimeout
  );
};

const isSameData = (a, b) => a && b && a.title === b.title && a.artist === b.artist && Math.floor(a.progress / 10) === Math.floor(b.progress / 10) && a.duration === b.duration;

const scheduleRpcUpdate = (data, tabId) => {
  const current = state.pendingUpdates.get(tabId);
  if (current && isSameData(current.data, data)) return;

  clearTimeout(current?.timeout);
  const timeout = setTimeout(() => {
    state.pendingUpdates.delete(tabId);
    updateRpc(data, tabId).catch(logError);
  }, 500);

  state.pendingUpdates.set(tabId, { timeout, data });
};

const checkServerHealth = async () => {
  const now = Date.now();
  if (now - state.serverStatus.lastCheck < CONFIG.serverCacheTime) return state.serverStatus.isHealthy;

  try {
    const res = await fetchWithTimeout(`http://localhost:${CONFIG.serverPort}/health`, {}, CONFIG.requestTimeout);
    state.serverStatus.isHealthy = res.ok && (await res.json()).rpcConnected;
  } catch {
    state.serverStatus.isHealthy = false;
  }

  state.serverStatus.lastCheck = now;
  return state.serverStatus.isHealthy;
};

const safePingTab = (tabId) => Promise.race([browser.tabs.sendMessage(tabId, { type: "PING_FOR_DATA" }), delay(CONFIG.requestTimeout).then(() => null)]);

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
  await Promise.all([...state.cleanupQueue].map(clearRpcForTab));
  state.cleanupQueue.clear();
};

const markOtherTabsForCleanup = (activeId) => {
  state.activeTabMap.forEach((_, id) => {
    if (id !== activeId) state.cleanupQueue.add(id);
  });
};

const setupListeners = () => {
  browser.runtime.onMessage.addListener(async (req, sender) => {
    const tab = await getSenderTab(sender);
    if (!tab) {
      logWarn("No tab info from sender, skipping:", req);
      return;
    }

    const tabId = tab.id;

    try {
      await parserReady;
      if (req.type === "UPDATE_RPC") {
        const tab = await browser.tabs.get(tabId);
        if (!tab.audible) {
          const cur = state.activeTabMap.get(tabId);
          if (!cur || cur.isAudioPlaying === false) return true;
          return clearRpcForTab(tabId);
        }

        const now = Date.now();
        const { title, artist, progress, duration } = req.data;
        const key = `${title}|${artist}|true|${Math.floor(progress / 10)}|${duration}`;
        const current = state.activeTabMap.get(tabId) || {};

        if (current.lastKey === key && now - current.lastUpdated < CONFIG.activeInterval && duration > 0 && progress > 0) return true;

        markOtherTabsForCleanup(tabId);
        await deferredCleanup();

        let parserId = current.parserId;
        if (tab.url) {
          const url = new URL(tab.url);
          const hostname = url.hostname.replace(/^www\./, "");

          const exactMatch = state.parserList.find((parser) => {
            const domain = normalize(parser.domain);
            const normHost = normalize(hostname);
            return domain === normHost;
          });

          if (exactMatch) {
            parserId = exactMatch.id;
            if (parserId !== current.parserId) {
              logInfo(`Using exact parser match: ${hostname} -> ${parserId}`);
            }
          }
        }

        state.activeTabMap.set(tabId, {
          ...req.data,
          isAudioPlaying: true,
          lastKey: key,
          lastUpdated: now,
          parserId: parserId,
        });

        scheduleRpcUpdate(req.data, tabId);
        scheduleHistoryAdd(tabId, {
          image: req.data.image,
          title: req.data.title,
          artist: req.data.artist,
          source: req.data?.source || (tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "unknown"),
          songUrl: req.data?.songUrl || "",
        });

        return true;
      }

      if (req.type === "CLEAR_RPC") return clearRpcForTab(tabId);
      if (req.type === "IS_RPC_CONNECTED") return checkServerHealth();
      if (req.type === "IS_HOSTNAME_MATCH") {
        const tab = await browser.tabs.get(tabId);
        const url = new URL(tab.url);
        return isAllowedDomain(url.hostname, url.pathname);
      }
    } catch (e) {
      logError("Browser Message Error", e);
    }
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    for (const [key, { newValue }] of Object.entries(changes)) {
      // enable_ updates the cache with changes
      if (key.startsWith("enable_")) {
        const parserId = key.replace("enable_", "");
        state.parserEnabledCache.set(parserId, newValue !== false);
      }

      // If the parser list or settings have changed, reload
      if (key === "parserList" || key === "userParserSelectors" || key.startsWith("settings_")) {
        loadParserListOnce().catch(logError);
      }
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    clearRpcForTab(tabId);
  });
};

const isAllowedDomain = async (hostname, pathname) => {
  try {
    await loadParserListOnce();
    const normHost = normalize(hostname);

    for (const parser of state.parserList) {
      const domain = normalize(parser.domain);
      if (!domain || !(normHost === domain || normHost.endsWith(`.${domain}`))) continue;

      const match = (parser.urlPatterns || []).map(parseUrlPattern).some((re) => re.test(pathname));
      if (!match) continue;

      const cached = state.parserEnabledCache.has(parser.id) ? state.parserEnabledCache.get(parser.id) : parser.isEnabled !== false;
      if (cached) {
        logInfo(`Match: ${hostname}${pathname} (parser: ${parser.title || parser.id})`);
        return true;
      }
    }
    return false;
  } catch (err) {
    logError("Domain Match Error", err);
    state.parserList = [];
    return false;
  }
};

const updateActiveTabMap = async (state, tabs) => {
  await loadParserListOnce();
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
  const now = Date.now();
  if (now - state.lastLoopTime < CONFIG.activeInterval) return;

  try {
    await loadParserListOnce();

    const tabs = await browser.tabs.query({ audible: true });
    if (!tabs.length) {
      if (state.activeTabMap.size > 0) {
        await deferredCleanup();
      }
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
    state.lastLoopTime = Date.now();
  }
};

const init = async () => {
  await parserReady;
  setupListeners();
  (function loop() {
    mainLoop().finally(() => setTimeout(loop, CONFIG.activeInterval));
  })();
};

init();
