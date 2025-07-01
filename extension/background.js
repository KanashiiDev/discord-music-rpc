import "./libs/browser-polyfill.js";

const state = {
  activeTabMap: new Map(),
  cleanupQueue: new Set(),
  serverStatus: { lastCheck: 0, isHealthy: false },
  pendingUpdates: new Map(),
  lastLoopTime: 0,
  parserList: [],
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const logInfo = (...a) => CONFIG.debugMode && console.info("[DISCORD-MUSIC-RPC - INFO]", ...a);
const logWarn = (...a) => console.warn("[DISCORD-MUSIC-RPC - WARN]", ...a);
const logError = (...a) => console.error("[DISCORD-MUSIC-RPC - ERROR]", ...a);

function getCurrentTime() {
  const now = new Date();
  return [now.getHours().toString().padStart(2, "0"), now.getMinutes().toString().padStart(2, "0"), now.getSeconds().toString().padStart(2, "0")].join(":");
}

async function loadParserList() {
  const stored = await browser.storage.sync.get(["parserList", "userParserSelectors"]);
  const mainList = Array.isArray(stored.parserList) ? stored.parserList : [];
  const userList = Array.isArray(stored.userParserSelectors)
    ? stored.userParserSelectors.map((userParser) => ({
        ...userParser,
        urlPatterns: userParser.urlPatterns || userParser.selectors?.regex || [".*"],
        userAdd: true,
      }))
    : [];

  state.parserList = [...mainList, ...userList];
}


async function getEnabledParsers(parserList) {
  const parsersWithId = parserList.filter((p) => p.id);
  const keys = parsersWithId.map((p) => `enable_${p.id}`);
  const result = await browser.storage.sync.get(keys);

  return parsersWithId.filter((p) => result[`enable_${p.id}`] !== false);
}

function normalizeHost(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch (e) {
    logInfo("normalizeHost error: " + e);
    return "";
  }
}

function findMatchingParsersForUrl(url, parserList) {
  const host = normalizeHost(url);
  return parserList.filter((parser) => {
    const parserHost = parser.domain?.replace(/^www\./, "").toLowerCase();
    return parserHost && (host === parserHost || host.endsWith("." + parserHost));
  });
}

const fetchWithTimeout = async (url, options = {}, timeout = 1000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
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
    logError(`RPC clear error [${tabId}]`, e);
  }
  state.activeTabMap.delete(tabId);
};

const updateRpc = async (data, tabId) => {
  let retries = CONFIG.maxRetries;
  const body = {
    data: { ...data, status: data.playStatus ?? state.activeTabMap.get(tabId)?.isAudioPlaying ?? false },
    clientId: `tab_${tabId}`,
    timestamp: Date.now(),
  };

  while (retries-- >= 0) {
    try {
      const res = await fetchWithTimeout(
      `http://localhost:${CONFIG.serverPort}/update-rpc`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        CONFIG.requestTimeout
      );
      if (res.ok) return logInfo(`tab ${tabId} updated`, data);
    } catch (e) {
      logError(`tab ${tabId} update failed`, e);
    }
    await delay(1000);
  }
  throw new Error("updateRpc failed");
};

const isSameData = (a, b) => {
  if (!a || !b) return false;
  return a.title === b.title && a.artist === b.artist && Math.floor(a.progress / 10) === Math.floor(b.progress / 10) && a.duration === b.duration;
};

const scheduleRpcUpdate = (data, tabId) => {
  const existing = state.pendingUpdates.get(tabId);
  if (existing && isSameData(existing.data, data)) return;

  clearTimeout(existing?.timeout);
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
    const res = await fetchWithTimeout(`http://localhost:${CONFIG.serverPort}/health`, {}, 500);
    state.serverStatus.isHealthy = res.ok && (await res.json()).rpcConnected;
  } catch {
    state.serverStatus.isHealthy = false;
  }
  state.serverStatus.lastCheck = now;
  return state.serverStatus.isHealthy;
};

const safePingTab = async (tabId) => {
  try {
    return await Promise.race([browser.tabs.sendMessage(tabId, { type: "PING_FOR_DATA" }), delay(CONFIG.requestTimeout).then(() => null)]);
  } catch {
    return null;
  }
};

const processTab = async (tabId, tabData) => {
  if (!state.activeTabMap.has(tabId)) return;
  const now = Date.now();
  if (now - tabData.lastUpdated < CONFIG.activeInterval) return;

  const res = await safePingTab(tabId);
  if (!res) return now - tabData.lastUpdated > CONFIG.stuckThreshold && state.cleanupQueue.add(tabId);

  const newKey = `${res.title}|${res.artist}|${tabData.isAudioPlaying}|${Math.floor(res.progress / 10)}|${res.duration}`;
  if (res.duration > 0 && tabData.lastKey === newKey) return;
  if (res.duration <= 0 && now - tabData.lastUpdated < CONFIG.activeInterval) return;

  state.activeTabMap.set(tabId, { ...res, isAudioPlaying: true, lastKey: newKey, lastUpdated: now });
};

const deferredCleanup = async () => {
  if (state.cleanupQueue.size) {
    await Promise.all([...state.cleanupQueue].map(clearRpcForTab));
    state.cleanupQueue.clear();
  }
};

const setupListeners = () => {
  const cleanupAll = () => state.activeTabMap.forEach((_, id) => state.cleanupQueue.add(id));

  browser.tabs.onRemoved.addListener(cleanupAll);
  browser.windows.onRemoved.addListener(cleanupAll);
  browser.runtime.onSuspend?.addListener(cleanupAll);

  browser.tabs.onUpdated.addListener(async (tabId, info) => {
    if (!state.activeTabMap.has(tabId)) return;

    if (info.audible === false) {
      state.cleanupQueue.add(tabId);
      return deferredCleanup();
    } else {
      for (const [id] of state.activeTabMap) if (id !== tabId) state.cleanupQueue.add(id);
      await deferredCleanup();
      state.activeTabMap.set(tabId, { ...state.activeTabMap.get(tabId), isAudioPlaying: true, lastUpdated: Date.now() });
    }

    const pending = state.pendingUpdates.get(tabId);
    if (pending) {
      clearTimeout(pending.timeout);
      state.pendingUpdates.delete(tabId);
      updateRpc(pending.data, tabId).catch(logError);
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.parserList) {
      state.parserList = changes.parserList.newValue || [];
    }
  });

  browser.runtime.onMessage.addListener(async (req, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    try {
      if (req.type === "UPDATE_RPC") {
        logInfo(`REQUEST TYPE: UPDATE_RPC - TIME: ${getCurrentTime()}`);
        Date.now();
        const tab = await browser.tabs.get(tabId);
        if (!tab.audible) {
          logInfo(`UPDATE_RPC - There is no sound on the tab. Not Updating.`);
          return clearRpcForTab(tabId);
        }

        const now = Date.now();
        const { title, artist, progress, duration } = req.data;
        const key = `${title}|${artist}|true|${Math.floor(progress / 10)}|${duration}`;
        const tabData = state.activeTabMap.get(tabId) || {};

        if (tabData.lastKey === key && now - tabData.lastUpdated < CONFIG.activeInterval && key.duration > 0 && key.progress > 0) {
          logInfo(`UPDATE_RPC - Same data detected. Not Updating.`);
          return true;
        }
        logInfo(`UPDATE_RPC - Data Updated.`);
        for (const [id] of state.activeTabMap) if (id !== tabId) state.cleanupQueue.add(id);
        await deferredCleanup();

        state.activeTabMap.set(tabId, { ...req.data, isAudioPlaying: true, lastKey: key, lastUpdated: now });
        scheduleRpcUpdate(req.data, tabId);
        return true;
      } else if (req.type === "CLEAR_RPC") {
        logInfo(`REQUEST TYPE: CLEAR_RPC - TIME: ${getCurrentTime()}`);
        await clearRpcForTab(tabId);
      } else if (req.type === "IS_RPC_CONNECTED") {
        logInfo(`REQUEST TYPE: IS_RPC_CONNECTED - TIME: ${getCurrentTime()}`);
        return checkServerHealth();
      } else if (req.type === "IS_HOSTNAME_MATCH") {
        logInfo(`REQUEST TYPE: IS_HOSTNAME_MATCH - TIME: ${getCurrentTime()}`);
        const tab = await browser.tabs.get(tabId);
        const urlObj = new URL(tab.url);
        return isAllowedDomain(urlObj.hostname, urlObj.pathname);
      }
    } catch (e) {
      logError("Message handling error", e);
    }
  });
};

function parseUrlPattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern === "string") {
    const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
    if (match) {
      try {
        return new RegExp(match[1], match[2]);
      } catch (e) {
        console.warn("Invalid regex pattern:", pattern, e);
        return /.^/;
      }
    }
    return new RegExp(pattern);
  }
  return /.^/;
}

async function isAllowedDomain(hostname, pathname) {
  try {
    await loadParserList();

    const normalized = hostname.replace(/^https?:\/\/|^www\./g, "").toLowerCase();

    for (const parser of state.parserList) {
      const parserDomain = parser.domain?.replace(/^https?:\/\/|^www\./g, "").toLowerCase();
      if (!parserDomain) continue;

      const isSameDomain = normalized === parserDomain || normalized.endsWith("." + parserDomain);
      if (!isSameDomain) continue;

      const patterns = (parser.urlPatterns || []).map(parseUrlPattern);
      const isMatch = patterns.some((regex) => regex.test(pathname));
      if (!isMatch) continue;

      const key = `enable_${parser.id}`;
      const result = await browser.storage.sync.get(key);
      const isEnabled = result[key];

      if (isEnabled !== false) {
        logInfo(`Regex & domain match: ${hostname}${pathname} (parser: ${parser.title || parser.id})`);
        return true;
      }
    }

    logInfo(`No enabled regex-matching parser found for: ${hostname}${pathname}`);
    return false;
  } catch (err) {
    logError("isAllowedDomain error", err);
    return false;
  }
}

async function updateActiveTabMap(state, tabs) {
  await loadParserList();
  const enabledParsers = await getEnabledParsers(state.parserList);

  const matchedTabs = tabs.filter((tab) => {
    const matched = findMatchingParsersForUrl(tab.url, enabledParsers);
    return matched.length > 0;
  });

  if (!matchedTabs.length) return;

  const mainTab = matchedTabs.find((t) => t.active) || matchedTabs[0];

  for (const [id] of state.activeTabMap) {
    if (id !== mainTab.id) {
      state.cleanupQueue.add(id);
    }
  }

  if (!state.activeTabMap.has(mainTab.id)) {
    state.activeTabMap.set(mainTab.id, {
      lastUpdated: 0,
      lastKey: "",
      isAudioPlaying: mainTab.audible ?? false,
    });
  }

  return mainTab;
}

const mainLoop = async () => {
  const now = Date.now();
  if (now - state.lastLoopTime < CONFIG.activeInterval) return;

  try {
    const tabs = await browser.tabs.query({ audible: true, status: "complete" });
    if (!tabs.length) return;

    const matchedTab = await updateActiveTabMap(state, tabs);

    if (matchedTab) await processTab(matchedTab.id, state.activeTabMap.get(matchedTab.id));
    const currentTabIds = tabs.map((t) => t.id);
    for (const tabId of state.activeTabMap.keys()) {
      if (!currentTabIds.includes(tabId)) {
        state.cleanupQueue.add(tabId);
      }
    }
  } catch (e) {
    logError("Main loop error", e);
  } finally {
    state.lastLoopTime = Date.now();
  }
};

const init = async () => {
  setupListeners();
  const loop = () => mainLoop().finally(() => setTimeout(loop, CONFIG.activeInterval));
  loop();
};

init();
