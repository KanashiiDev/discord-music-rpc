import "./libs/browser-polyfill.js";
import "./libs/pako.js";

const state = {
  activeTabMap: new Map(),
  cleanupQueue: new Set(),
  serverStatus: { lastCheck: 0, isHealthy: false },
  pendingUpdates: new Map(),
  historyTimers: new Map(),
  lastLoopTime: 0,
  parserList: [],
  parserListLoaded: false,
  parserListLoading: null,
  parserMap: {},
};

const getEnabledParsers = () => state.parserList.filter((p) => p.isEnabled);

function scheduleHistoryAdd(tabId, songData, delay = 10000) {
  if (!tabId || !songData?.title || !songData?.artist) return;

  clearTimeout(state.historyTimers.get(tabId));

  const timer = setTimeout(() => {
    addToHistory(songData).catch(logError);
    state.historyTimers.delete(tabId);
  }, delay);

  state.historyTimers.set(tabId, timer);
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

    logInfo(`Total ${state.parserList.length} parsers loaded`);
  } catch (error) {
    logError("Parser list loading failed:", error);
    state.parserList = [];
    state.parserMap = {};
    state.parserListLoaded = true;
    throw error;
  }
}

const loadParserListOnce = async () => {
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
};

const parserReady = loadParserListOnce();

const findMatchingParsersForUrl = (url, list) => {
  const host = normalizeHost(url);
  return list.filter(({ domain }) => {
    const d = normalize(domain);
    return d && (host === d || host.endsWith(`.${d}`));
  });
};

const fetchWithTimeout = async (url, options = {}, timeout = 1000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const clearRpcForTab = async (tabId) => {
  if (!state.activeTabMap.has(tabId)) return;
  clearTimeout(state.pendingUpdates.get(tabId)?.timeout);
  state.pendingUpdates.delete(tabId);
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
    logError(`Clear RPC failed [${tabId}]`, e);
  }
  state.activeTabMap.delete(tabId);
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
        } else {
          const partialMatch = state.parserList.find((parser) => {
            const domain = normalize(parser.domain);
            const normHost = normalize(hostname);
            return domain && (normHost === domain || normHost.endsWith(`.${domain}`));
          });

          if (partialMatch) {
            parserId = partialMatch.id;
            logInfo(`Found partial parser match: ${hostname} -> ${parserId}`);
          }
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

  for (let retries = CONFIG.maxRetries; retries-- >= 0; ) {
    try {
      const res = await fetchWithTimeout(
        `http://localhost:${CONFIG.serverPort}/update-rpc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        CONFIG.requestTimeout
      );

      if (res.ok) return logInfo(`tab ${tabId} updated`, data);
    } catch (e) {
      logError(`Tab ${tabId} update failed`, e);
    }
    await delay(1000);
  }
  throw new Error("updateRpc Failed");
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
    const tabId = sender.tab?.id;
    if (!tabId) return;

    try {
      await parserReady;
      if (req.type === "UPDATE_RPC") {
        logInfo("UPDATE_RPC", getCurrentTime());
        const tab = await browser.tabs.get(tabId);
        if (!tab.audible) return clearRpcForTab(tabId);

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
            logInfo(`Using exact parser match: ${hostname} -> ${parserId}`);
          } else {
            const partialMatch = state.parserList.find((parser) => {
              const domain = normalize(parser.domain);
              const normHost = normalize(hostname);
              return domain && (normHost === domain || normHost.endsWith(`.${domain}`));
            });

            if (partialMatch) {
              parserId = partialMatch.id;
              logInfo(`Using partial parser match: ${hostname} -> ${parserId}`);
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

        logInfo("Set parser ID in activeTabMap:", parserId);

        scheduleRpcUpdate(req.data, tabId);

        scheduleHistoryAdd(tabId, {
          image: req.data.image,
          title: req.data.title,
          artist: req.data.artist,
          source: req.data.source || (sender?.tab?.url ? new URL(sender.tab.url).hostname.replace(/^www\./, "") : "unknown"),
          songUrl: req.data.songUrl || "",
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
    if (area === "local" && Object.keys(changes).some((k) => k.startsWith("settings_") || k.startsWith("enable_"))) {
      logInfo("Parser settings changed, reloading parserMap...");
      state.parserListLoaded = false;
      state.parserListLoading = null;
      loadParserListOnce().catch(logError);
    }
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

      const { [`enable_${parser.id}`]: enabled } = await browser.storage.local.get(`enable_${parser.id}`);
      if (enabled !== false) {
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
    const matched = findMatchingParsersForUrl(tab.url, enabled);
    if (matched.length > 0) {
      tab._matchedParsers = matched;
      return true;
    }
    return false;
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

    const tabs = await browser.tabs.query({ audible: true, status: "complete" });
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
