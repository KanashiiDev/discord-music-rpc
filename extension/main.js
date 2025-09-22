const state = {
  updateTimer: null,
  lastUpdateTime: 0,
  isUpdating: false,
  lastSongInfo: null,
  errorCount: 0,
  maxErrorCount: 5,
  activeTab: true,
};

const CONSTANTS = {
  ACTIVE_INTERVAL: CONFIG.activeInterval ?? 5000,
  IDLE_INTERVAL: CONFIG?.idleInterval ?? 10000,
  SERVER_PORT: CONFIG.serverPort ?? 3000,
  RECOVERY_DELAY: (CONFIG.activeInterval ?? 5000) + 2000,
};

function startWatching() {
  if (state.updateTimer) return;
  logInfo("Started watching.");
  state.activeTab = true;
  mainLoop();
}

function stopWatching() {
  logInfo("Stopped watching.");
  clearTimeout(state.updateTimer);
  state.updateTimer = null;
  state.isUpdating = false;
  state.activeTab = false;
}

function scheduleNextUpdate(interval = CONSTANTS.ACTIVE_INTERVAL) {
  if (!state.activeTab) return;

  clearTimeout(state.updateTimer);
  logInfo(`Next Update Scheduled: ${interval / 1000} seconds later.`);
  state.updateTimer = setTimeout(() => {
    if (state.activeTab) mainLoop();
  }, interval);
}

async function mainLoop() {
  if (state.isUpdating) return;
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

    const isChanged = rpcState.isSongChanged(song);
    const isSeeking = rpcState.isSeekDetected(song.position, song.duration);
    const hasValidDuration = typeof song.duration === "number" && song.duration > 0;
    const hasValidPosition = typeof song.position === "number" && song.position >= 0;
    const progress = hasValidDuration && hasValidPosition ? Math.min(100, (song.position / song.duration) * 100) : 0;
    const positionStable = typeof rpcState.lastPosition === "number" && Math.abs(song.position - rpcState.lastPosition) < 1;
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

      if (isIdle && !isChanged && !isSeeking) {
        logInfo(`Delaying next update by ${CONSTANTS.ACTIVE_INTERVAL / 1000}s (idle state)`);
        await delay(CONSTANTS.ACTIVE_INTERVAL);
        updatedProgress = hasValidDuration && hasValidPosition ? Math.min(100, ((song.position + CONSTANTS.ACTIVE_INTERVAL / 1000) / song.duration) * 100) : 0;
      }

      const didUpdate = await processRPCUpdate(song, updatedProgress);
      if (didUpdate) {
        rpcState.lastPosition = song.position;
        statelastUpdateTime = Date.now();
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

async function processRPCUpdate(song, progress) {
  const rpcOk = await isRpcConnected();
  if (!rpcOk) {
    logInfo("RPC not connected, triggering recovery...");
    triggerRecovery();
    return false;
  }

  logInfo(`RPC server status ok, RPC Updating...`);
  let result = null;
  try {
    result = await browser.runtime.sendMessage({
      type: "UPDATE_RPC",
      data: { ...song, progress, lastUpdated: Date.now() },
    });
  } catch (e) {
    logError("RPC update failed:", e);
    triggerRecovery();
    return false;
  }

  if (result) {
    if (!window._rpcKeepActiveInjected) rtcKeepAliveTab();
    else window._rpcKeepAliveActive?.();
    rpcState.clearError();
    rpcState.updateLastActivity(song, progress);
    logInfo(`RPC Updated: ${result}`);
    return true;
  }

  return false;
}

async function isRpcConnected() {
  try {
    return await browser.runtime.sendMessage({ type: "IS_RPC_CONNECTED" });
  } catch {
    return false;
  }
}

async function isHostnameMatch() {
  try {
    return await browser.runtime.sendMessage({ type: "IS_HOSTNAME_MATCH" });
  } catch {
    return false;
  }
}

async function triggerRecovery() {
  if (rpcState.isRecovering) return;
  rpcState.isRecovering = true;
  stopWatching();
  logInfo(`Triggering RPC Recovery...`);
  try {
    await browser.runtime.sendMessage({ type: "RECOVER_RPC" });
  } catch (e) {
    logError("Recovery message failed:", e);
  }

  setTimeout(() => {
    rpcState.isRecovering = false;
    startWatching();
  }, CONSTANTS.RECOVERY_DELAY);
}

async function handleNoSong() {
  if (!rpcState.lastActivity) return;
  logInfo(`No song played. RPC is being cleaned ...`);
  await browser.runtime.sendMessage({ type: "CLEAR_RPC" }).catch(logError);
  rpcState.reset();
}

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

async function init() {
  const start = async () => {
    if (typeof window.getSongInfo !== "function") {
      setTimeout(init, 5000);
      return;
    }
    const hostMatch = await isHostnameMatch();
    if (!hostMatch) {
      return;
    }
    startWatching();
  };

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.addEventListener("beforeunload", () => {
    stopWatching();
    rpcState.reset();
    navigator.sendBeacon?.(`http://localhost:${CONSTANTS.SERVER_PORT}/clear-rpc`, JSON.stringify({ clientId: `tab_${browser.devtools?.inspectedWindow?.tabId || "unknown"}` }));
  });
}

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

function rtcKeepAliveTab() {
  applyOverrides();
  // Apply again every 5 seconds
  setInterval(applyOverridesLoop, 5000);
  window._rpcKeepActiveInjected = true;
}

init();
