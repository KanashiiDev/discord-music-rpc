const state = {
  updateTimer: null,
  lastUpdateTime: 0,
  isUpdating: false,
  lastSongInfo: null,
  errorCount: 0,
  maxErrorCount: 5,
  activeTab: false,
  rpcKeepAliveIntervalId: null,
  initStarted: false,
  messageListenerRegistered: false,
};

const CONSTANTS = {
  ACTIVE_INTERVAL: CONFIG.activeInterval ?? 5000,
  IDLE_INTERVAL: CONFIG?.idleInterval ?? 10000,
};

// Start watching tab activity and song changes
function startWatching() {
  if (state.updateTimer) return;
  logInfo("Started watching.");
  state.activeTab = true;
  // ensure no leftover intervals
  if (state.rpcKeepAliveIntervalId) {
    clearInterval(state.rpcKeepAliveIntervalId);
    state.rpcKeepAliveIntervalId = null;
  }
  mainLoop();
}

// Stop watching tab activity and song changes
function stopWatching() {
  logInfo("Stopped watching.");
  clearTimeout(state.updateTimer);
  state.updateTimer = null;
  state.isUpdating = false;
  state.activeTab = false;
  rpcState.reset();
  // clear keepalive interval
  if (state.rpcKeepAliveIntervalId) {
    clearInterval(state.rpcKeepAliveIntervalId);
    state.rpcKeepAliveIntervalId = null;
    window._rpcKeepActiveInjected = false;
  }
}

// Schedule the next update based on activity
function scheduleNextUpdate(interval = CONSTANTS.ACTIVE_INTERVAL) {
  if (!state.activeTab) return;

  if (state.updateTimer) {
    clearTimeout(state.updateTimer);
    state.updateTimer = null;
  }

  logInfo(`Next Update Scheduled: ${interval / 1000} seconds later.`);
  state.updateTimer = setTimeout(() => {
    if (state.activeTab) mainLoop();
  }, interval);
}

// Main loop to check for song changes and update RPC
async function mainLoop() {
  if (state.isUpdating) {
    if (state.updateTimer) {
      clearTimeout(state.updateTimer);
      state.updateTimer = null;
    }
    scheduleNextUpdate();
    return;
  }

  state.isUpdating = true;

  try {
    const song = await safeGetSongInfo();

    if (!song?.title || !song?.artist) {
      if (rpcState.lastActivity?.lastUpdated && !rpcState.cleared) {
        await handleNoSong();
      }
      scheduleNextUpdate();
      return;
    }

    // Validate song data
    const isChanged = rpcState.isSongChanged(song);
    const isSeeking = rpcState.isSeekDetected(song.position, song.duration);
    const hasValidDuration = typeof song.duration === "number" && song.duration > 0;
    const hasValidPosition = typeof song.position === "number" && song.position >= 0;
    const progress = hasValidDuration && hasValidPosition ? Math.min(100, (song.position / song.duration) * 100) : 0;
    const positionStable = typeof rpcState.lastPosition === "number" && Math.abs(song.position - rpcState.lastPosition) < 3;
    const stuckAtZero = typeof rpcState.lastPosition === "number" && song.position === 0 && rpcState.lastPosition === 0 && song.duration === 0;
    const isIdle = rpcState.lastActivity?.lastUpdated ? Date.now() - rpcState.lastActivity.lastUpdated >= CONSTANTS.IDLE_INTERVAL : true;

    logInfo(`Idle: ${isIdle} | Stable: ${positionStable} | Changed: ${isChanged} | Seeking: ${isSeeking}`);
    logInfo(`Current: ${song.title} - ${song.artist} | Pos: ${song.position} / ${song.duration}`);

    const shouldSkipUpdate = !rpcState.hasOnlyDuration && positionStable && !isChanged && !isSeeking && !stuckAtZero && !isIdle;

    if (shouldSkipUpdate) {
      logInfo("Skipping update: no change detected.");
      scheduleNextUpdate();
      return;
    }

    if (isChanged || isSeeking || isIdle) {
      logInfo(`RPC Update triggered by: ${isChanged ? "Song Change" : isSeeking ? "Seek" : "Idle"}`);
      let updatedProgress = progress;
      const didUpdate = await processRPCUpdate(song, updatedProgress);
      if (didUpdate) {
        rpcState.lastPosition = song.position;
        state.lastUpdateTime = Date.now();
        scheduleNextUpdate();
        return;
      }
    }

    // Fallback: Pass to the next update with normal flow
    rpcState.lastPosition = song.position;
    state.lastUpdateTime = Date.now();
    scheduleNextUpdate();
  } catch (e) {
    logError("mainLoop error:", e);
    scheduleNextUpdate();
  } finally {
    state.isUpdating = false;
  }
}

// Process the RPC update and handle connection
async function processRPCUpdate(song, progress) {
  const rpcOk = await isRpcConnected();
  if (!rpcOk) {
    logInfo("RPC not connected.");
    scheduleNextUpdate();
    return false;
  }

  logInfo(`RPC Updating...`);
  let result = null;
  try {
    result = await browser.runtime.sendMessage({
      type: "UPDATE_RPC",
      data: { ...song, progress, lastUpdated: Date.now() },
    });
  } catch (e) {
    logError("RPC update failed:", e);
    return false;
  }

  if (result) {
    if (!window._rpcKeepActiveInjected) rtcKeepAliveTab();
    else window._rpcKeepAliveActive?.();
    rpcState.clearError();
    rpcState.updateLastActivity(song, progress);
    logInfo(`RPC Updated!`);
    return true;
  }

  return false;
}

// Check if RPC is connected
async function isRpcConnected() {
  try {
    const res = await browser.runtime.sendMessage({ type: "IS_RPC_CONNECTED" });
    return !!res?.ok;
  } catch {
    return false;
  }
}

// Check if the current hostname matches
async function isHostnameMatch() {
  try {
    return await browser.runtime.sendMessage({ type: "IS_HOSTNAME_MATCH" });
  } catch {
    return false;
  }
}

// Handle scenario when no song is playing
async function handleNoSong() {
  if (!rpcState.lastActivity) return;
  logInfo(`No song played. RPC is being cleaned ...`);
  await browser.runtime.sendMessage({ type: "CLEAR_RPC" }).catch(logError);
  rpcState.reset();
}

// Safely get song info with error handling and caching
async function safeGetSongInfo() {
  if (typeof window.getSongInfo !== "function") return null;

  try {
    const song = await window.getSongInfo();
    if (song && song.title && song.artist) {
      state.lastSongInfo = song;
      state.errorCount = 0;
      return song;
    }
    return null;
  } catch (error) {
    logError("Song info error:", error);

    if (state.errorCount < state.maxErrorCount && state.lastSongInfo) {
      state.errorCount++;
      logInfo(`Using cached song info (attempt ${state.errorCount}/${state.maxErrorCount})`);
      return state.lastSongInfo;
    }
    return null;
  }
}

// Initialize the extension
function init() {
  if (state.initStarted) return;
  state.initStarted = true;

  const start = async () => {
    // polling for getSongInfo to be available
    let tries = 0;
    const maxTries = 30;
    while (typeof window.getSongInfo !== "function" && tries < maxTries) {
      await delay(2000);
      tries++;
    }

    if (typeof window.getSongInfo !== "function") {
      logWarn("getSongInfo not available after retries, abort init.");
      return;
    }

    const hostMatch = await isHostnameMatch();

    if (!hostMatch.ok) {
      logInfo("Hostname not allowed, not starting watcher.");
      return;
    }

    // register message listener
    registerRuntimeMessageListener();
    startWatching();
  };

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.addEventListener("beforeunload", () => {
    stopWatching();
  });
}

// Listen for messages from the background script
function registerRuntimeMessageListener() {
  if (state.messageListenerRegistered) return;
  state.messageListenerRegistered = true;

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PING_FOR_DATA") {
      safeGetSongInfo().then((info) => {
        sendResponse(info?.title && info?.artist ? info : null);
      });
      return true;
    }
    if (message.action === "reloadPage") {
      location.reload();
    }
  });
}

// Apply overrides to keep the tab active
function rtcKeepAliveTab() {
  try {
    applyOverrides();
  } catch (e) {
    logError("applyOverrides failed:", e);
  }

  // clear any existing interval first
  if (state.rpcKeepAliveIntervalId) {
    clearInterval(state.rpcKeepAliveIntervalId);
  }

  // Apply again every 5 seconds
  state.rpcKeepAliveIntervalId = setInterval(() => {
    try {
      applyOverridesLoop();
    } catch (e) {
      logError("applyOverridesLoop error:", e);
    }
  }, 5000);

  window._rpcKeepActiveInjected = true;
}

init();
