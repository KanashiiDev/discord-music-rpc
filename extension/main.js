const state = {
  updateTimer: null,
  lastUpdateTime: 0,
  isUpdating: false,
  lastSongInfo: null,
  maxErrorCount: 5,
  activeTab: false,
  rpcKeepAliveIntervalId: null,
  messageListenerRegistered: false,
  isConnected: false,
};

const CONSTANTS = {
  ACTIVE_INTERVAL: CONFIG.activeInterval ?? 5000,
  IDLE_INTERVAL: CONFIG?.idleInterval ?? 10000,
};

// Start watching tab activity and song changes
function startWatching() {
  if (state.isUpdating || state.updateTimer) {
    return;
  }
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

  logInfo(`%cNext Update Check Scheduled:%c ${interval / 1000} seconds later.`, "color:#999; font-weight:bold;", "color:#4caf50;");

  state.updateTimer = setTimeout(() => {
    state.updateTimer = null;
    if (state.activeTab) {
      mainLoop();
    }
  }, interval);
}

// Main loop to check for song changes and update RPC
async function mainLoop() {
  if (state.isUpdating) {
    return;
  }

  state.isUpdating = true;
  await Promise.resolve();

  try {
    const song = await safeGetSongInfo();

    if (!song?.title || !song?.artist) {
      if (rpcState.lastActivity?.lastUpdated && !rpcState.cleared) {
        await handleNoSong();
      }
      return;
    }

    // Validate song data
    const isFirstUpdate = !rpcState.lastActivity;
    const isChanged = rpcState.isSongChanged(song);
    const isSeeking = rpcState.isSeekDetected(song.position, song.duration);
    const hasValidDuration = typeof song.duration === "number" && song.duration > 0;
    const hasValidPosition = typeof song.position === "number" && song.position >= 0;
    const progress = hasValidDuration && hasValidPosition ? Math.min(100, (song.position / song.duration) * 100) : 0;
    const positionStable = typeof rpcState.lastPosition === "number" && Math.abs(song.position - rpcState.lastPosition) < 0.5;
    const stuckAtZero = typeof rpcState.lastPosition === "number" && song.position === 0 && rpcState.lastPosition === 0 && song.duration === 0;
    const idleTime = rpcState.lastActivity?.lastUpdated ? Math.floor((Date.now() - rpcState.lastActivity.lastUpdated) / 1000) * 1000 : 0;
    const isIdle = idleTime < 100 || idleTime > CONSTANTS.ACTIVE_INTERVAL;
    const listeningStatus = idleTime <= CONSTANTS.IDLE_INTERVAL && idleTime >= CONSTANTS.ACTIVE_INTERVAL;
    if (state.isConnected) {
      logInfo(
        `%cActive:%c ${listeningStatus}  %c| Paused:%c ${!stuckAtZero && positionStable}  %c| Changed:%c ${isChanged}  %c| Seeking:%c ${isSeeking}`,
        "color:#999",
        listeningStatus ? "color:#2196f3" : "color:#999",
        "color:#999",
        !stuckAtZero && positionStable ? "color:#2196f3" : "color:#999",
        "color:#999",
        isChanged ? "color:#2196f3" : "color:#999",
        "color:#999",
        isSeeking ? "color:#2196f3" : "color:#999"
      );
      logInfo(
        `%cCurrent:%c %c${song.title}%c - %c${song.artist}%c | Pos: %c${song.position} / ${song.duration}`,
        "color:#999; font-weight:bold;",
        "color:#fff;",
        "color:#d8b800ff;",
        "color:#fff;",
        "color:#b99e00ff;",
        "color:#999;",
        "color:#6db9f8ff;"
      );
    }
    const shouldSkipUpdate = !isFirstUpdate && !rpcState.hasOnlyDuration && positionStable && !isChanged && !isSeeking && !stuckAtZero && isIdle;
    if (shouldSkipUpdate) {
      logInfo(`%cSkipping update:%c no change detected.`, "color:#ff9800; font-weight:bold;", "color:#fff;");
      rpcState.lastPosition = song.position;
      return;
    }

    if (isChanged || isSeeking || isIdle) {
      if (state.isConnected && idleTime > 1000 && idleTime < 11000) {
        logInfo(`%cRPC Update triggered by:%c ${isChanged ? "Song Change" : isSeeking ? "Seek" : "Active"}`, "color:#4caf50; font-weight:bold;", "color:#fff;");
      }
      let updatedProgress = progress;
      const didUpdate = await processRPCUpdate(song, updatedProgress);
      if (didUpdate) {
        rpcState.lastPosition = song.position;
        state.lastUpdateTime = Date.now();
        return;
      }
    }

    // Fallback: Pass to the next update with normal flow
    rpcState.lastPosition = song.position;
    state.lastUpdateTime = Date.now();
  } catch (e) {
    logError("mainLoop error:", e);
  } finally {
    state.isUpdating = false;
    scheduleNextUpdate();
  }
}

// Process the RPC update and handle connection
async function processRPCUpdate(song, progress) {
  const rpcOk = await isRpcConnected();
  if (!rpcOk) {
    logInfo("RPC not connected.");
    state.isConnected = false;
    return false;
  }
  state.isConnected = true;
  let res = null;
  try {
    res = await browser.runtime.sendMessage({
      type: "UPDATE_RPC",
      data: { ...song, progress, lastUpdated: Date.now() },
    });
  } catch (e) {
    logError("RPC update failed:", e);
    return false;
  }

  if (!!res?.ok) {
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
async function safeGetSongInfo(retryCount = 0) {
  const MAX_RETRIES = 10;
  const RETRY_DELAY = 500;

  if (typeof window.getSongInfo !== "function") {
    if (retryCount < MAX_RETRIES) {
      logInfo(`getSongInfo not ready, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return safeGetSongInfo(retryCount + 1);
    }

    logError("getSongInfo never loaded!");
    return null;
  }

  try {
    const song = await window.getSongInfo();

    //  Validation
    if (!song) {
      return null;
    }

    if (!song.title || !song.artist) {
      return null;
    }

    // Successful
    state.lastSongInfo = song;
    return song;
  } catch (error) {
    logError("Song info error:", error);
    return null;
  }
}

// Initialize the extension
function init() {
  // Prevent multiple injections (SPA reload, iframes)
  if (window._MUSIC_RPC_LOADED_ || window.top !== window.self) {
    return;
  }
  window._MUSIC_RPC_LOADED_ = true;
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

    // hostname match
    const hostMatch = await isHostnameMatch();
    if (!hostMatch?.ok) {
      logInfo("Hostname not allowed, not starting watcher.");
      return;
    }

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
