const state = {
  updateTimer: null,
  lastUpdateTime: null,
  isUpdating: false,
  activeTab: false,
  isConnected: null,
  lastRawPosition: null,
  lastPrintedLog: null,
  lastUpdateStatus: null,
  lastSeekDetected: 0,
  lastPauseState: null,
  pendingUpdateReason: null,
  lastBlockedLog: null,
  isFirstUpdate: true,
  debugStats: {
    failedUpdates: 0,
    connectionLost: 0,
  },
};

const CONSTANTS = {
  ACTIVE_INTERVAL: CONFIG?.activeInterval ?? 5000,
  NORMAL_UPDATE_INTERVAL: CONFIG?.idleInterval ?? 10000,
  SEEK_CHECK_INTERVAL: 5000,
  MIN_SEEK_COOLDOWN: 3000,
};

const keepAliveManager = new KeepAliveManager();

// Start watching tab activity and song changes
function startWatching() {
  if (state.isUpdating || state.updateTimer) {
    logInfo("startWatching called but already active");
    return;
  }

  logInfo("%c╔══════════════════════════════════════╗", "color:#4caf50; font-weight:bold;");
  logInfo("%c║    MUSIC RPC STARTED WATCHING        ║", "color:#4caf50; font-weight:bold;");
  logInfo("%c╚══════════════════════════════════════╝", "color:#4caf50; font-weight:bold;");

  state.activeTab = true;
  state.lastRawPosition = null;
  state.lastSeekDetected = 0;
  mainLoop();
}

// Stop watching tab activity and song changes
function stopWatching() {
  logInfo("%c╔══════════════════════════════════════╗", "color:#ff5252; font-weight:bold;");
  logInfo("%c║    MUSIC RPC STOPPED WATCHING        ║", "color:#ff5252; font-weight:bold;");
  logInfo("%c╚══════════════════════════════════════╝", "color:#ff5252; font-weight:bold;");

  clearTimeout(state.updateTimer);
  state.updateTimer = null;
  state.isUpdating = false;
  state.activeTab = false;
  state.lastRawPosition = null;
  state.lastSeekDetected = 0;
  rpcState.reset();
  keepAliveManager.destroy();
}

// Schedule the next update based on activity
function scheduleNextUpdate(interval = CONSTANTS.ACTIVE_INTERVAL, log) {
  if (!state.activeTab) {
    logInfo("scheduleNextUpdate: tab not active, skipping");
    return;
  }

  if (state.updateTimer) {
    logInfo("scheduleNextUpdate: clearing existing timer");
    clearTimeout(state.updateTimer);
    state.updateTimer = null;
  }

  if (!log) {
    logInfo(`%cNext Update Check Scheduled:%c ${interval / 1000} seconds later.`, "color:#999; font-weight:bold;", "color:#4caf50;");
  }

  state.updateTimer = setTimeout(() => {
    state.updateTimer = null;
    if (state.activeTab) mainLoop();
  }, interval);
}

// Main loop to check for song changes and update RPC
async function mainLoop() {
  const hostMatch = await waitForHostname();
  if (!hostMatch) {
    scheduleNextUpdate(CONSTANTS.ACTIVE_INTERVAL, true);
    return;
  }

  if (state.isConnected === null) {
    const rpcHealth = await isRpcConnected();
    state.isConnected = rpcHealth?.ok ?? false;
  }

  try {
    const song = await safeGetSongInfo();
    window._lastParsedSong = song && song !== "blocked" ? song : null;

    if (!song || song === "blocked" || (!song.title && !song.artist)) {
      if (!song) logInfo("mainLoop: no song info");
      if (rpcState.lastActivity?.lastUpdated) await handleNoSong();
      state.lastRawPosition = null;
      return;
    }

    if (state.isUpdating) return;
    state.isUpdating = true;

    if (!state.lastUpdateTime) state.lastUpdateTime = Date.now();
    if (!state.lastSeekDetected) state.lastSeekDetected = Date.now();

    // Song change detection
    const isChanged = rpcState.isSongChanged(song);
    if (isChanged) {
      rpcState.reset();
      state.lastRawPosition = 0;
      state.isFirstUpdate = true;
    }

    // Seed position once
    const isValidPlaybackPos = isValidNumber(song.position) && song.position > 0;
    if (state.lastRawPosition === null && isValidPlaybackPos) {
      state.lastRawPosition = song.position;
    }

    // Derived state flags
    const hasValidDuration = isValidNumber(song.duration) && song.duration > 0;
    const hasValidPosition = isValidNumber(song.position) && song.position >= 0;

    const progress = song.progress !== undefined ? song.progress : hasValidDuration && hasValidPosition ? Math.min(100, (song.position / song.duration) * 100) : null;

    const timeSinceLastUpdate = Date.now() - (state.lastUpdateTime || Date.now());

    // Audible Check
    let audibleCheck = null;
    try {
      audibleCheck = await browser.runtime.sendMessage({ type: "IS_TAB_AUDIBLE" });
    } catch (_) {}

    const isPlayingAudio = !!song.isPlaying;
    const isAudible = !!audibleCheck?.audible;

    // Playing Detection
    let playerPlaying;

    if (isAudible) {
      playerPlaying = true;
    } else if (song.isPlaying !== undefined) {
      playerPlaying = song.isPlaying;
    } else {
      playerPlaying = false;
    }

    const { isSeeking, isPaused } = rpcState.analyzePlayback(song.position, song.duration, playerPlaying);

    const rawPositionDiff = isValidNumber(song.position) && isValidNumber(state.lastRawPosition) ? Math.abs(song.position - state.lastRawPosition) : 0;
    const isRadioOrStream = !isValidNumber(song.duration) || song.duration <= 0;

    const seekJustDetected = isSeeking;
    if (seekJustDetected) {
      state.lastSeekDetected = Date.now();
    }

    // Update Rules
    let shouldUpdate = false;
    let updateReason = "";

    if (!rpcState.lastActivity || isChanged) {
      shouldUpdate = true;
      updateReason = isChanged ? "Song Changed" : "First Update";
      state.pendingUpdateReason = null;
    } else {
      if (isSeeking) state.pendingUpdateReason = "Seek Detected";

      if (state.lastPauseState === null) {
        state.lastPauseState = isPaused;
      } else if (isPaused !== state.lastPauseState) {
        if (state.pendingUpdateReason !== "Seek Detected") {
          state.pendingUpdateReason = isPaused ? "Paused" : "Resumed";
        }
      }

      if (timeSinceLastUpdate >= CONSTANTS.ACTIVE_INTERVAL) {
        if (state.pendingUpdateReason) {
          shouldUpdate = true;
          updateReason = state.pendingUpdateReason;
          state.pendingUpdateReason = null;
        } else if (!isPaused && timeSinceLastUpdate > CONSTANTS.NORMAL_UPDATE_INTERVAL) {
          shouldUpdate = true;
          updateReason = "Normal Progress";
        }
      } else {
        updateReason = `Cooldown Active (${Math.ceil((CONSTANTS.ACTIVE_INTERVAL - timeSinceLastUpdate) / 1000)}s left)`;
      }
    }

    state.lastPauseState = isPaused;

    if (!playerPlaying) {
      if (rpcState.lastActivity?.lastUpdated) await handleNoSong();
      state.lastUpdateStatus = "skipped";
      state.isUpdating = false;
      shouldUpdate = false;
    }

    if (!shouldUpdate) {
      if (state.lastUpdateStatus !== "skipped") {
        logInfo(
          `%cSkipping update:%c ${updateReason || "Update skipped (interval not reached)"} (Δpos: ${rawPositionDiff}s, Δtime: ${timeSinceLastUpdate / 1000}s)`,
          "color:#ff9800; font-weight:bold;",
          "color:#fff;",
        );
      }
      // Keep lastRawPosition in sync even when skipping
      if (isValidNumber(song.position)) state.lastRawPosition = song.position;
      state.lastUpdateStatus = "skipped";
      return;
    }

    logInfo(`%c🚀 RPC Update triggered by:%c ${updateReason}`, "color:#4caf50; font-weight:bold;", "color:#fff;");

    const updatedProgress = isValidNumber(progress) ? Math.max(progress, 1) : 0;
    const didUpdate = await processRPCUpdate(song, updatedProgress);

    if (didUpdate && isValidNumber(song.position)) {
      state.lastRawPosition = song.position;
      state.lastUpdateTime = state.isFirstUpdate ? Date.now() - CONSTANTS.NORMAL_UPDATE_INTERVAL : Date.now();
      state.isFirstUpdate = false;
      state.lastUpdateStatus = "updated";
    } else {
      state.lastUpdateStatus = "failed";
    }

    if (!state.isConnected) return;

    // State Log
    const lastSeekSeconds = state.lastSeekDetected ? Math.floor((Date.now() - state.lastSeekDetected) / 1000) : "Never";

    let statusLabel = "🎵 SONG";
    let statusMode = 0;
    if (song?.mode === "watch" && isRadioOrStream) {
      statusLabel = "🔴 STREAM";
      statusMode = 1;
    } else if (song?.mode === "watch") {
      statusLabel = "📺 VIDEO";
    } else if (isRadioOrStream) {
      statusLabel = "📻 RADIO";
      statusMode = 1;
    }

    const positionText = statusMode ? statusLabel : `Pos: ${song.position} / ${song.duration}`;
    const positionColor = statusMode ? "#e91e63" : "#6db9f8";

    const colors = {
      title: "#d8b800",
      artist: "#b99e00",
      header: "#999",
      value: "#fff",
      success: "#4caf50",
      warning: "#ff9800",
      error: "#f44336",
      info: "#2196f3",
      accent1: "#cc00f0ff",
      accent2: "#00e1ffff",
      accent3: "#ff5722",
      neutral: "#7d7d7dff",
    };

    const sections = [
      {
        title: "Current Track",
        lines: [
          [`${song.title}`, colors.title, colors.neutral],
          [`${song.artist}`, colors.artist, colors.neutral],
          [positionText, positionColor, colors.neutral],
          [`Δ: ${rawPositionDiff}s`, colors.accent2, colors.neutral],
          [`Δt: ${timeSinceLastUpdate / 1000}s`, colors.accent2, colors.neutral],
        ],
      },
      {
        title: "Status",
        lines: [
          [statusLabel, colors.info, colors.neutral],
          [`Paused: ${isPaused}`, isPaused ? colors.warning : colors.success, colors.neutral],
          [`Changed: ${isChanged}`, isChanged ? colors.info : colors.neutral, colors.neutral],
          [`Seeking: ${isSeeking}`, isSeeking ? colors.warning : colors.neutral, colors.neutral],
          [`Pending Action: ${state.pendingUpdateReason || "None"}`, state.pendingUpdateReason ? colors.warning : colors.neutral, colors.neutral],
        ],
      },
      {
        title: "Playback",
        lines: [
          [`Valid Duration: ${hasValidDuration}`, hasValidDuration ? colors.success : colors.error, colors.neutral],
          [`Valid Position: ${hasValidPosition}`, hasValidPosition ? colors.success : colors.error, colors.neutral],
          [`Progress: ${progress?.toFixed(2)}`, colors.accent1, colors.neutral],
          [`Has Only Duration Mode: ${rpcState.hasOnlyDuration}`, rpcState.hasOnlyDuration ? colors.info : colors.neutral],
          [`Remaining Mode: ${rpcState.isRemainingMode}`, rpcState.isRemainingMode ? colors.info : colors.neutral],
        ],
      },
      {
        title: "Seek Detection",
        lines: [
          [`Expected: ${timeSinceLastUpdate / 1000}s`, colors.accent1, colors.neutral],
          [`Actual: ${song.position - (rpcState.lastValidPosition || 0)}s`, colors.accent1, colors.neutral],
          [`Deviation: ${Math.abs(song.position - (rpcState.lastValidPosition || 0) - timeSinceLastUpdate / 1000)?.toFixed(3)}s`, colors.accent1, colors.neutral],
          [`Last Seek: ${lastSeekSeconds}s`, colors.neutral, colors.neutral],
        ],
      },
      {
        title: "Statistics",
        lines: [
          [`Failed Updates: ${state.debugStats.failedUpdates}`, colors.info, colors.neutral],
          [`Connection Lost: ${state.debugStats.connectionLost}`, colors.error, colors.neutral],
        ],
      },
    ];

    const stored = await browser.storage.local.get("debugMode");
    const debugMode = stored.debugMode === 1 ? true : CONFIG.debugMode;
    if (!debugMode || state.lastUpdateStatus === "skipped") return;

    let logMessage = "";
    const styles = [];

    sections.forEach((section, sectionIndex) => {
      logMessage += `%c${section.title}%c\n`;
      styles.push(`font-weight: bold; color: ${colors.header};`, "");

      section.lines.forEach((line, lineIndex) => {
        const isLastInSection = lineIndex === section.lines.length - 1;
        const isLastSection = sectionIndex === sections.length - 1;
        const separator = isLastInSection ? (isLastSection ? "" : "\n\n") : " | ";
        logMessage += `%c${line[0]}%c${separator}`;
        styles.push(`color: ${line[1]};`, line[2] ? `color: ${line[2]};` : "");
      });
    });

    console.groupCollapsed(
      `%c[DISCORD-MUSIC-RPC - INFO] %c${statusLabel}%c | %c${song.title.substring(0, 120)}${song.title.length > 120 ? "..." : ""}%c | %c${song.artist.substring(0, 120)}${
        song.artist.length > 120 ? "..." : ""
      }%c | Paused: %c${isPaused}%c | Seek: %c${isSeeking}%c | Δ: %c${rawPositionDiff}s`,
      "color:#2196f3; font-weight:bold;",
      `font-weight:bold; color:${isRadioOrStream ? "#e91e63" : "#4caf50"}`,
      "",
      `color:${colors.title}`,
      "",
      `color:${colors.artist}`,
      "",
      isPaused ? "color:#ff9800" : "color:#4caf50",
      "",
      isSeeking ? "color:#ff9800" : "color:#666",
      "",
      rawPositionDiff > 5 ? "color:#f44336" : "color:#4caf50",
      "",
    );
    console.log(logMessage, ...styles);
    console.groupEnd();
  } catch (e) {
    logError("mainLoop error:", e);
    logError("Stack trace:", e.stack);
  } finally {
    state.isUpdating = false;
    scheduleNextUpdate(CONSTANTS.ACTIVE_INTERVAL, hostMatch);
  }
}

// Process the RPC update and handle connection
async function processRPCUpdate(song, progress) {
  const rpcHealth = await isRpcConnected();
  if (!rpcHealth?.ok) {
    logInfo(rpcHealth?.reason ? `RPC health check failed: ${rpcHealth.reason}` : "processRPCUpdate: RPC not connected");
    if (state.isConnected) {
      state.debugStats.connectionLost++;
      logInfo("🔌 RPC CONNECTION LOST!");
    }
    state.isConnected = false;
    return false;
  }

  if (!state.isConnected) {
    logInfo("🔌 RPC CONNECTION ESTABLISHED!");
  }
  state.isConnected = true;

  try {
    const res = await browser.runtime.sendMessage({
      type: "UPDATE_RPC",
      data: {
        ...sanitizeSongForRPC(song, progress),
        lastUpdated: Date.now(),
      },
    });

    if (res?.ok) {
      rpcState.updateLastActivity(song, progress);
      logInfo("✅ RPC Updated Successfully!");
      return true;
    } else if (res?.waiting) {
      logInfo("processRPCUpdate: RPC waiting (tab not audible yet)");
      if (keepAliveManager.initialized) keepAliveManager.destroy();
      return false;
    } else {
      logInfo("processRPCUpdate: unexpected response state:", res);
      if (keepAliveManager.initialized) keepAliveManager.destroy();
      return false;
    }
  } catch (e) {
    logError("processRPCUpdate: RPC update failed:", e);
    logError("Stack trace:", e.stack);
    state.debugStats.failedUpdates++;
    return false;
  }
}

// Check if RPC is connected
async function isRpcConnected() {
  try {
    return await browser.runtime.sendMessage({ type: "IS_RPC_CONNECTED" });
  } catch {
    return { ok: false };
  }
}

// Handle scenario when no song is playing
let clearingRpc = false;

async function handleNoSong() {
  if (clearingRpc) return;
  clearingRpc = true;

  try {
    logInfo(`%c⏹️  No song is currently playing - clearing RPC...`, "color:#ff9800; font-weight:bold;");
    await browser.runtime.sendMessage({ type: "CLEAR_RPC" });
    rpcState.reset();
    keepAliveManager.destroy();
    window._lastParsedSong = null;
    logInfo("handleNoSong: RPC cleared successfully");
  } catch (e) {
    logError("handleNoSong: failed to clear RPC:", e);
    rpcState.reset();
    keepAliveManager.destroy();
  } finally {
    clearingRpc = false;
  }
}

// Safely get song info with error handling and caching
async function safeGetSongInfo(maxRetries = 10, retryDelay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (typeof window.getSongInfo === "function") {
        return await window.getSongInfo();
      }
    } catch (e) {
      logError(`safeGetSongInfo: attempt ${i + 1} failed:`, e);
    }
    await delay(retryDelay);
  }

  logInfo("safeGetSongInfo: all retries exhausted, returning null");
  return null;
}

function logOnce(msg) {
  if (msg !== state.lastPrintedLog) {
    logInfo(msg);
    state.lastPrintedLog = msg;
  }
}

async function waitForHostname() {
  while (true) {
    try {
      const res = await browser.runtime.sendMessage({
        type: "IS_HOSTNAME_MATCH",
      });
      if (res?.ok) {
        logOnce(res?.match || "✅ Hostname Match!");
        return true;
      }
      logOnce(`❌ ${res?.error?.message || "Hostname mismatch"}`);
      return false;
    } catch (e) {
      logError("waitForHostname error:", e);
      await delay(CONSTANTS.ACTIVE_INTERVAL);
    }
  }
}

function isValidNumber(v) {
  return typeof v === "number" && isFinite(v);
}

function sanitizeSongForRPC(song, progress) {
  return {
    ...song,
    position: isValidNumber(song.position) ? song.position : undefined,
    duration: isValidNumber(song.duration) ? song.duration : undefined,
    progress: isValidNumber(progress) ? progress : undefined,
  };
}

async function applyLocalCustomCSS() {
  const { port } = await browser.runtime.sendMessage({
    type: "GET_RPC_PORT",
  });

  const serverHref = `http://localhost:${port}/`;
  if (location.href === serverHref) {
    await applyColorSettings(0);
    await applyBackgroundSettings(0);
    await applyThemeSettings();
  }
}

// Initialize the extension
function init() {
  if (window._MUSIC_RPC_LOADED_ || window.top !== window.self) return;
  window._MUSIC_RPC_LOADED_ = true;

  logInfo("%c╔════════════════════════════════════════════════╗", "color:#2196f3; font-weight:bold;");
  logInfo("%c║       MUSIC RPC EXTENSION INITIALIZING         ║", "color:#2196f3; font-weight:bold;");
  logInfo("%c╚════════════════════════════════════════════════╝", "color:#2196f3; font-weight:bold;");

  const start = async () => {
    let tries = 0;
    const maxTries = 30;
    while (typeof window.getSongInfo !== "function" && tries < maxTries) {
      logInfo(`init: getSongInfo not available (attempt ${tries + 1}/${maxTries})`);
      await delay(2000);
      tries++;
    }

    if (typeof window.getSongInfo !== "function") {
      logError("init: getSongInfo not available after retries, aborting");
      return;
    }

    registerRuntimeMessageListener();
    startWatching();
  };

  if (location.href.includes("http://localhost")) applyLocalCustomCSS();
  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  window.addEventListener("beforeunload", () => {
    logInfo("init: beforeunload event - stopping");
    stopWatching();
  });
}

// Listen for messages from the background script
function messageHandler(message, sender, sendResponse) {
  if (message.type === "PING_FOR_DATA") {
    const cached = window._lastParsedSong;
    const response = cached?.title && cached?.artist ? cached : null;
    sendResponse(response);
    return true;
  }

  if (message.action === "reloadPage") {
    logInfo("messageHandler: reloading page as requested");
    location.reload();
  }
}

function registerRuntimeMessageListener() {
  logInfo("registerRuntimeMessageListener: registering listener...");

  try {
    browser.runtime.onMessage.removeListener(messageHandler);
  } catch (e) {
    logInfo("registerRuntimeMessageListener: no old listener to remove");
  }

  try {
    browser.runtime.onMessage.addListener(messageHandler);
  } catch (e) {
    logError("registerRuntimeMessageListener: failed to add listener:", e);
    return;
  }
}

init();
