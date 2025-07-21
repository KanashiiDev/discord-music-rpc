let updateTimer = null;
let lastUpdateTime = 0;
let isUpdating = false;
let overridesApplied = false;
let lastSongInfo = null;
const MAX_ERROR_COUNT = 5;
const songStatus = 0;
let activeTab = true;

function startWatching() {
  if (updateTimer) return;
  logInfo("Started watching.");
  activeTab = true;
  loop();
}

function stopWatching() {
  logInfo("Stopped watching.");
  clearTimeout(updateTimer);
  updateTimer = null;
  isUpdating = false;
  activeTab = false;
}

function scheduleNextUpdate(interval = CONFIG.activeInterval) {
  if (!activeTab) return;

  clearTimeout(updateTimer);
  logInfo(`Next Update Scheduled: ${interval / 1000} seconds later.`);
  updateTimer = setTimeout(() => {
    if (activeTab) loop();
  }, interval);
}

async function loop() {
  if (isUpdating) return;
  isUpdating = true;

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
    const idleInterval = CONFIG?.idleInterval ?? 10000;
    const isIdle = rpcState.lastActivity?.lastUpdated ? Date.now() - rpcState.lastActivity.lastUpdated >= idleInterval : true;

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
        logInfo(`Delaying next update by ${CONFIG.activeInterval / 1000}s (idle state)`);
        await delay(CONFIG.activeInterval);
        updatedProgress = hasValidDuration && hasValidPosition ? Math.min(100, ((song.position + CONFIG.activeInterval / 1000) / song.duration) * 100) : 0;
      }

      const didUpdate = await processRPCUpdate(song, updatedProgress);
      if (didUpdate) {
        rpcState.lastPosition = song.position;
        lastUpdateTime = Date.now();
        scheduleNextUpdate();
        return;
      }
    }

    // Fallback: Pass to the next update with normal flow
    rpcState.lastPosition = song.position;
    lastUpdateTime = Date.now();
    scheduleNextUpdate();
  } catch (e) {
    logError("Loop error:", e);
    scheduleNextUpdate();
  } finally {
    isUpdating = false;
  }
}

async function processRPCUpdate(song, progress) {
  const rpcOk = await isRpcConnected();
  if (!rpcOk) {
    logInfo("RPC not connected, skipping update");
    return false;
  }
  logInfo(`RPC server status ok, RPC Updating...`);
  const result = await browser.runtime.sendMessage({
    type: "UPDATE_RPC",
    data: { ...song, progress, lastUpdated: Date.now() },
  });

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
  }, CONFIG.idleInterval);
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
    lastSongInfo = song;
    return song;
  } catch (error) {
    logError("Song info error:", error);
    return lastSongInfo;
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
    navigator.sendBeacon?.(`http://localhost:${CONFIG.serverPort}/clear-rpc`, JSON.stringify({ clientId: `tab_${browser.devtools?.inspectedWindow?.tabId || "unknown"}` }));
  });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING_FOR_DATA") {
    safeGetSongInfo().then((info) => {
      sendResponse(info?.title && info?.artist ? info : null);
    });
    return true;
  }
});

function rtcKeepAliveTab() {
  applyOverrides();
  // Apply again every 5 seconds
  setInterval(applyOverridesLoop, 5000);
  window._rpcKeepActiveInjected = true;
  logInfo("RPC Keep Alive Activated");
}

init();
