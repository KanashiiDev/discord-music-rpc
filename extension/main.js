let updateTimer = null;
let lastUpdateTime = 0;
let isUpdating = false;
let lastSongInfo = null;
const MAX_ERROR_COUNT = 5;

const logInfo = (...a) => CONFIG.debugMode && console.info("[DISCORD-MUSIC-RPC - INFO]", ...a);
const logWarn = (...a) => console.warn("[DISCORD-MUSIC-RPC - WARN]", ...a);
const logError = (...a) => console.error("[DISCORD-MUSIC-RPC - ERROR]", ...a);
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const songStatus = 0;
function startWatching() {
  clearTimeout(updateTimer);
  updateTimer = null;
  isUpdating = false;
  logInfo("Started watching.");
  loop();
}

function stopWatching() {
  logInfo("Stopped watching.");
  clearTimeout(updateTimer);
  updateTimer = null;
  isUpdating = false;
}

function scheduleNextUpdate(interval = CONFIG.activeInterval) {
  clearTimeout(updateTimer);
  logInfo(`Next Update Scheduled: ${interval / 1000} seconds later.`);
  updateTimer = setTimeout(() => loop(), interval);
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
    const idleInterval = CONFIG?.idleInterval ?? 20000;
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
  const originalDocumentAddEventListener = EventTarget.prototype.addEventListener;
  const originalWindowAddEventListener = window.addEventListener;

  function applyOverrides() {
    // Visibility Overrides
    try {
      Object.defineProperty(document, "msHidden", { get: () => false, configurable: true });
    } catch (e) {
      logInfo("msHidden override:", e);
    }
    try {
      Object.defineProperty(document, "oHidden", { get: () => false, configurable: true });
    } catch (e) {
      logInfo("oHidden override:", e);
    }
    try {
      Object.defineProperty(document, "hidden", { get: () => false, configurable: true });
    } catch (e) {
      logInfo("hidden override:", e);
    }
    try {
      Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true });
    } catch (e) {
      logInfo("visibilityState override:", e);
    }

    // Browser-specific visibility
    try {
      Object.defineProperty(document, "mozHidden", { get: () => false, configurable: true });
    } catch (e) {
      logInfo("mozHidden override:", e);
    }
    try {
      Object.defineProperty(document, "webkitHidden", { get: () => false, configurable: true });
    } catch (e) {
      logInfo("webkitHidden override:", e);
    }
    try {
      Object.defineProperty(document, "webkitVisibilityState", { get: () => "visible", configurable: true });
    } catch (e) {
      logInfo("webkitVisibilityState override:", e);
    }

    // Focus Override
    try {
      document.hasFocus = () => true;
    } catch (e) {
      logInfo("hasFocus override:", e);
    }
    ["onfocusin", "onfocusout"].forEach((prop) => {
      try {
        Object.defineProperty(window, prop, {
          get: () => null,
          set: () => {},
          configurable: true,
        });
      } catch (e) {
        logInfo(`${prop} override:`, e);
      }
    });

    // Event Blocking Override
    try {
      const events = ["visibilitychange", "webkitvisibilitychange", "mozvisibilitychange", "blur", "focus"];
      events.forEach((eventName) => {
        originalDocumentAddEventListener.call(document, eventName, (e) => e.stopImmediatePropagation(), true);
        originalWindowAddEventListener.call(window, eventName, (e) => e.stopImmediatePropagation(), true);
      });
    } catch (e) {
      logInfo("Event blocking override:", e);
    }

    // on<Event> null Override
    try {
      const events = ["visibilitychange", "webkitvisibilitychange", "mozvisibilitychange", "blur", "focus"];
      events.forEach((prop) => {
        try {
          Object.defineProperty(document, "on" + prop, {
            get: () => null,
            set: () => {},
            configurable: true,
          });
        } catch (e) {
          logInfo(`document.on${prop} override:`, e);
        }
        try {
          Object.defineProperty(window, "on" + prop, {
            get: () => null,
            set: () => {},
            configurable: true,
          });
        } catch (e) {
          logInfo(`window.on${prop} override:`, e);
        }
      });
    } catch (e) {
      logInfo("on<Event> null override:", e);
    }

    // Title Override
    try {
      Object.defineProperty(document, "title", {
        get: () => "Music Playing",
        set: () => {},
        configurable: true,
      });
    } catch (e) {
      logInfo("Title override:", e);
    }

    // MediaSession Override
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Listening",
          artist: "Music",
          album: "In the background",
        });
      } catch (e) {
        logInfo("MediaSession override:", e);
      }
    }

    // requestIdleCallback Override
    if ("requestIdleCallback" in window) {
      try {
        window.requestIdleCallback = function (callback) {
          return setTimeout(() => callback({ timeRemaining: () => 50 }), 1);
        };
      } catch (e) {
        logInfo("requestIdleCallback override:", e);
      }
    }

    // Page Freeze API Override
    try {
      window.addEventListener("freeze", (e) => e.stopImmediatePropagation(), true);
      window.addEventListener("resume", (e) => e.stopImmediatePropagation(), true);
    } catch (e) {
      logInfo("Page Freeze API override:", e);
    }

    // Visibility API Listener Override
    try {
      document.addEventListener = function (type, listener, options) {
        if (type === "visibilitychange" || type === "webkitvisibilitychange" || type === "mozvisibilitychange") {
          return;
        }
        return originalDocumentAddEventListener.call(this, type, listener, options);
      };
    } catch (e) {
      logInfo("Visibility API listener override:", e);
    }

    // Page Lifecycle API Override
    try {
      if ("lifecycle" in document) {
        Object.defineProperty(document.lifecycle, "state", { get: () => "active", configurable: true });
      }
    } catch (e) {
      logInfo("Page lifecycle override (lifecycle) error:", e);
    }
    try {
      if ("pageLifecycle" in document) {
        Object.defineProperty(document.pageLifecycle, "state", { get: () => "active", configurable: true });
      }
    } catch (e) {
      logInfo("Page lifecycle override (pageLifecycle) error:", e);
    }
  }

  applyOverrides();

  // Apply again every 5 seconds
  setInterval(applyOverrides, 5000);

  // Mouse Move Simulation
  function simulateMouseMove() {
    const x = Math.floor(Math.random() * window.innerWidth);
    const y = Math.floor(Math.random() * window.innerHeight);
    //Movement values ​​randomly between -10 and 10
    const movementX = Math.floor(Math.random() * 21) - 10; // -10..10
    const movementY = Math.floor(Math.random() * 21) - 10;

    const event = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      movementX: movementX,
      movementY: movementY,
    });
    window.dispatchEvent(event);
  }

  // Start mouse movement simulation
  setInterval(simulateMouseMove, 20000);

  window._rpcKeepActiveInjected = true;
  logInfo("RPC Keep Alive Activated");
}

init();
