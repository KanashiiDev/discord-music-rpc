const state = {
  updateTimer: null,
  lastUpdateTime: null,
  isUpdating: false,
  activeTab: false,
  messageListenerRegistered: false,
  isConnected: false,
  lastRawPosition: null,
  lastRPCStatus: null,
  lastPrintedLog: null,
  lastUpdateStatus: null,
  lastSeekDetected: 0,
  debugStats: {
    failedUpdates: 0,
    connectionLost: 0,
  },
};

const CONSTANTS = {
  ACTIVE_INTERVAL: CONFIG.activeInterval ?? 5000,
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
    if (state.activeTab) {
      mainLoop();
    } else {
      logInfo("Timer fired but tab not active");
    }
  }, interval);
}

// Main loop to check for song changes and update RPC
async function mainLoop() {
  const hostMatch = await waitForHostname();
  if (!hostMatch) {
    scheduleNextUpdate(CONSTANTS.ACTIVE_INTERVAL, true);
    return;
  }
  if (state.isUpdating) {
    logInfo("mainLoop: already updating, returning");
    return;
  }

  state.isUpdating = true;
  await Promise.resolve();

  try {
    const song = await safeGetSongInfo();
    window._lastParsedSong = song ?? null;

    if (!song) {
      logInfo("mainloop: no song info");

      if (rpcState.lastActivity?.lastUpdated) {
        const timeSinceLastActivity = Date.now() - rpcState.lastActivity.lastUpdated;
        if (timeSinceLastActivity > CONSTANTS.ACTIVE_INTERVAL) {
          logInfo(`mainLoop: no activity for ${Math.round(timeSinceLastActivity / 1000)}s, clearing RPC`);
          await handleNoSong();
        }
      }

      state.lastRawPosition = null;
      return;
    }

    // Initialize last update time
    if (!state.lastUpdateTime) {
      state.lastUpdateTime = Date.now();
      logInfo("mainLoop: initializing lastUpdateTime");
    }

    if (!state.lastSeekDetected) {
      state.lastSeekDetected = Date.now();
    }

    // Save First position
    if (state.lastRawPosition === null) {
      logInfo("mainLoop: initializing lastRawPosition:", song.position);
      state.lastRawPosition = song.position;
    }

    if (rpcState.lastPosition === null) {
      logInfo("mainLoop: initializing rpcState.lastPosition:", song.position);
      rpcState.lastPosition = song.position;
    }

    if (rpcState.lastKnownPosition === 0 || rpcState.lastKnownPosition === null) {
      rpcState.lastKnownPosition = song.position;
    }

    // Calculate derived states
    const hasValidDuration = typeof song.duration === "number" && song.duration > 0;
    const hasValidPosition = typeof song.position === "number" && song.position >= 0;
    const progress = hasValidDuration && hasValidPosition ? Math.min(100, (song.position / song.duration) * 100) : 0;
    const positionStable = typeof rpcState.lastPosition === "number" && Math.abs(song.position - rpcState.lastPosition) < 1;
    const stuckAtZero = typeof rpcState.lastPosition === "number" && song.position === 0 && rpcState.lastPosition === 0 && song.duration === 0;
    const isPaused = positionStable && !stuckAtZero;

    // Change of position
    const rawPositionDiff = Math.abs(song.position - state.lastRawPosition);
    const timeSinceLastUpdate = Date.now() - (state.lastUpdateTime || Date.now());

    // Validate song data
    const isFirstUpdate = !rpcState.lastActivity;
    const isChanged = rpcState.isSongChanged(song);
    const isRadioOrStream = !song.duration || song.duration <= 0;

    // Seek detection
    let isSeeking = false;

    // Detect if the user is seeking within the track
    if (!isRadioOrStream && !isPaused) {
      const expectedProgress = timeSinceLastUpdate / 1000;
      const actualProgress = song.position - (rpcState.lastPosition || 0);
      const progressDeviation = Math.abs(actualProgress - expectedProgress);
      const timeSinceLastSeek = Date.now() - state.lastSeekDetected;
      const managerSeekDetection = rpcState.isSeekDetected(song.position, song.duration);
      const deviationSeekDetection = progressDeviation > 5 && timeSinceLastUpdate > 2000;
      isSeeking = (managerSeekDetection || deviationSeekDetection) && timeSinceLastSeek > CONSTANTS.MIN_SEEK_COOLDOWN;

      if (isSeeking) {
        state.lastSeekDetected = Date.now();
      }
    }

    if (state.isConnected) {
      // State Log
      const lastSeekSeconds = state.lastSeekDetected ? Math.floor((Date.now() - state.lastSeekDetected) / 1000) : "Never";
      const statusLabel = isRadioOrStream ? "🔴 RADIO" : "🎵 SONG";
      const positionText = isRadioOrStream ? "RADIO" : `Pos: ${song.position.toFixed(1)} / ${song.duration}`;
      const positionColor = isRadioOrStream ? "#e91e63" : "#6db9f8";

      // Log Colors
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

      // Create log sections
      const sections = [
        // Current Track Section
        {
          title: "Current Track",
          lines: [
            [`${song.title} - ${song.artist}`, colors.title, colors.artist, colors.value],
            [positionText, positionColor, colors.neutral],
            [`Δ: ${rawPositionDiff.toFixed(1)}s`, colors.accent2, colors.neutral],
            [`Δt: ${(timeSinceLastUpdate / 1000).toFixed(1)}s`, colors.accent2, colors.neutral],
          ],
        },

        // Status Section
        {
          title: "Status",
          lines: [
            [statusLabel, colors.info, colors.neutral],
            [`Paused: ${isPaused}`, isPaused ? colors.warning : colors.success, colors.neutral],
            [`Changed: ${isChanged}`, isChanged ? colors.info : colors.neutral, colors.neutral],
            [`Seeking: ${isSeeking}`, isSeeking ? colors.warning : colors.neutral, colors.neutral],
          ],
        },

        // Playback Section
        {
          title: "Playback",
          lines: [
            [`Valid Duration: ${hasValidDuration}`, hasValidDuration ? colors.success : colors.error, colors.neutral],
            [`Valid Position: ${hasValidPosition}`, hasValidPosition ? colors.success : colors.error, colors.neutral],
            [`Progress: ${progress.toFixed(2)}`, colors.accent1, colors.neutral],
            [`Position Stable: ${positionStable}`, positionStable ? colors.warning : colors.neutral, colors.neutral],
            [`Stuck at Zero: ${stuckAtZero}`, stuckAtZero ? colors.error : colors.neutral, colors.neutral],
            [`Has Only Duration Mode: ${rpcState.hasOnlyDuration}`, colors.neutral],
            [`Remaining Mode: ${rpcState.isRemainingMode}`, colors.neutral],
          ],
        },

        // Seek Detection Section
        {
          title: "Seek Detection",
          lines: [
            [`Expected: ${(timeSinceLastUpdate / 1000).toFixed(2)}s`, colors.accent1, colors.neutral],
            [`Actual: ${(song.position - (rpcState.lastPosition || 0)).toFixed(2)}s`, colors.accent1, colors.neutral],
            [`Deviation: ${Math.abs(song.position - (rpcState.lastPosition || 0) - timeSinceLastUpdate / 1000).toFixed(2)}s`, colors.accent1, colors.neutral],
            [`Last Seek: ${lastSeekSeconds}s`, colors.neutral, colors.neutral],
          ],
        },

        // Statistics Section
        {
          title: "Statistics",
          lines: [
            [`Failed Updates: ${state.debugStats.failedUpdates}`, colors.info, colors.neutral],
            [`Connection Lost: ${state.debugStats.connectionLost}`, colors.error, colors.neutral],
          ],
        },
      ];

      // Build the log message
      const stored = await browser.storage.local.get("debugMode");
      const debugMode = stored.debugMode === 1 ? true : CONFIG.debugMode;
      if (debugMode && state.lastUpdateStatus !== "skipped") {
        let logMessage = "";
        const styles = [];

        sections.forEach((section, sectionIndex) => {
          // Section header
          logMessage += `%c${section.title}%c\n`;
          styles.push(`font-weight: bold; color: ${colors.header};`);
          styles.push("");

          // Section content
          section.lines.forEach((line, lineIndex) => {
            const isLastInSection = lineIndex === section.lines.length - 1;
            const isLastSection = sectionIndex === sections.length - 1;
            const separator = isLastInSection ? (isLastSection ? "" : "\n\n") : " | ";

            logMessage += `%c${line[0]}%c${separator}`;
            styles.push(`color: ${line[1]};`);
            styles.push("");
          });
        });

        // Final log output
        console.groupCollapsed(
          `%c[DISCORD-MUSIC-RPC - INFO] %c${statusLabel}%c | %c${song.title.substring(0, 120)}${song.title.length > 120 ? "..." : ""}%c | %c${song.artist.substring(0, 120)}${
            song.artist.length > 120 ? "..." : ""
          }%c | Paused: %c${isPaused}%c | Seek: %c${isSeeking}%c | Δ: %c${rawPositionDiff.toFixed(1)}s`,
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
      }
    }

    // Update Rules
    let shouldUpdate = false;
    let updateReason = "";

    if (isFirstUpdate) {
      shouldUpdate = true;
      updateReason = "First Update";
    } else if (isChanged) {
      shouldUpdate = true;
      updateReason = "Song Changed";
    } else if (isSeeking) {
      shouldUpdate = true;
      updateReason = "Seek Detected";
    } else if (isPaused) {
      shouldUpdate = false;
      updateReason = "Paused (no update)";
    } else if (isRadioOrStream) {
      if (timeSinceLastUpdate >= CONSTANTS.NORMAL_UPDATE_INTERVAL) {
        shouldUpdate = true;
        updateReason = "Radio/Stream";
      }
    } else {
      if (timeSinceLastUpdate >= CONSTANTS.NORMAL_UPDATE_INTERVAL) {
        shouldUpdate = true;
        updateReason = "Normal Progress";
      }
    }

    // Audible Check
    let audibleCheck = null;
    try {
      audibleCheck = await browser.runtime.sendMessage({ type: "IS_TAB_AUDIBLE" });
    } catch (_) {}

    if (!audibleCheck?.audible && updateReason !== "First Update") {
      if (song.isPlaying !== true) {
        shouldUpdate = false;
        updateReason = "Tab not audible";
      }
    }

    if (!shouldUpdate) {
      if (!updateReason) updateReason = "Update skipped (interval not reached)";
      if (state.lastUpdateStatus !== "skipped") {
        logInfo(
          `%cSkipping update:%c ${updateReason} (Δpos: ${rawPositionDiff.toFixed(1)}s, Δtime: ${(timeSinceLastUpdate / 1000).toFixed(1)}s)`,
          "color:#ff9800; font-weight:bold;",
          "color:#fff;",
        );
      }
      state.lastRawPosition = song.position;
      state.lastUpdateStatus = "skipped";
      return;
    }

    // Send Update
    logInfo(`%c🚀 RPC Update triggered by:%c ${updateReason}`, "color:#4caf50; font-weight:bold;", "color:#fff;");

    const updatedProgress = Math.max(progress, 1);
    const didUpdate = await processRPCUpdate(song, updatedProgress);

    if (didUpdate) {
      state.lastRawPosition = song.position;
      state.lastUpdateStatus = "updated";
      return;
    }

    // Fallback - always update last positions
    state.lastRawPosition = song.position;
    rpcState.lastPosition = song.position;
    state.lastUpdateTime = Date.now();
  } catch (e) {
    logError("mainLoop error:", e);
    logError("Stack trace:", e.stack);
  } finally {
    state.isUpdating = false;
    if (!state.updateTimer) {
      scheduleNextUpdate(CONSTANTS.ACTIVE_INTERVAL, hostMatch);
    } else {
      logInfo("mainLoop: update timer already exists");
    }
  }
}

// Process the RPC update and handle connection
async function processRPCUpdate(song, progress) {
  const rpcHealth = await isRpcConnected();
  if (!rpcHealth.ok) {
    logInfo(rpcHealth.reason ? `RPC health check failed: ${rpcHealth.reason}` : "processRPCUpdate: RPC not connected");
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

  let res = null;
  try {
    res = await browser.runtime.sendMessage({
      type: "UPDATE_RPC",
      data: { ...song, progress, lastUpdated: Date.now() },
    });
    rpcState.lastPosition = song.position;
    state.lastUpdateTime = Date.now();
  } catch (e) {
    logError("processRPCUpdate: RPC update failed:", e);
    logError("Stack trace:", e.stack);
    state.debugStats.failedUpdates++;
    return false;
  }

  if (res?.waiting) {
    if (res?.ok) logInfo("processRPCUpdate: RPC waiting (tab not audible yet)");
    if (!res?.ok && keepAliveManager.initialized) {
      keepAliveManager.destroy();
    }
    return false;
  }

  if (res?.ok) {
    if (!keepAliveManager.initialized) {
      keepAliveManager.init();
    }

    rpcState.clearError();
    rpcState.updateLastActivity(song, progress);
    logInfo(`✅ RPC Updated Successfully!`);
    return true;
  }

  logInfo("processRPCUpdate: unexpected response state:", res);
  return false;
}

// Check if RPC is connected
async function isRpcConnected() {
  try {
    const res = await browser.runtime.sendMessage({ type: "IS_RPC_CONNECTED" });
    return { ok: res?.ok, reason: res?.reason || null };
  } catch (e) {
    logError("isRpcConnected: error:", e);
    return false;
  }
}

// Check if the current hostname matches
async function isHostnameMatch() {
  try {
    const result = await browser.runtime.sendMessage({ type: "IS_HOSTNAME_MATCH" });
    return result;
  } catch (e) {
    logError("isHostnameMatch: error:", e);
    return false;
  }
}

// Handle scenario when no song is playing
async function handleNoSong() {
  if (!rpcState.lastActivity) {
    logInfo("handleNoSong: no last activity to clear");
    return;
  }

  logInfo(`%c⏹️  No song playing - clearing RPC...`, "color:#ff9800; font-weight:bold;");

  try {
    await browser.runtime.sendMessage({ type: "CLEAR_RPC" });
    logInfo("handleNoSong: RPC cleared successfully");
  } catch (e) {
    logError("handleNoSong: failed to clear RPC:", e);
  }

  rpcState.reset();
}

// Safely get song info with error handling and caching
async function safeGetSongInfo(maxRetries = 10, retryDelay = 500) {
  for (let i = 0; i < maxRetries; i++) {
    if (typeof window.getSongInfo === "function") {
      try {
        const song = await window.getSongInfo();
        return song;
      } catch (e) {
        logError(`safeGetSongInfo: attempt ${i + 1} failed:`, e);
      }
    } else {
      logInfo(`safeGetSongInfo: getSongInfo not available (attempt ${i + 1})`);
    }

    await new Promise((r) => setTimeout(r, retryDelay));
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

const waitForHostname = async () => {
  while (true) {
    const hostMatch = await isHostnameMatch();

    if (hostMatch?.ok) {
      logOnce(hostMatch.match || "✅ Hostname Match!");
      return true;
    }

    if (hostMatch.error?.code === 1) {
      logOnce(hostMatch.error.message);
      await delay(CONSTANTS.ACTIVE_INTERVAL);
      continue;
    }

    logOnce(`❌ ${hostMatch.error?.message}`);
    return false;
  }
};

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
  logInfo("%c╔════════════════════════════════════════════════╗", "color:#2196f3; font-weight:bold;");
  logInfo("%c║       MUSIC RPC EXTENSION INITIALIZING         ║", "color:#2196f3; font-weight:bold;");
  logInfo("%c╚════════════════════════════════════════════════╝", "color:#2196f3; font-weight:bold;");

  // Prevent multiple injections (SPA reload, iframes)
  if (window._MUSIC_RPC_LOADED_ || window.top !== window.self) {
    logInfo("init: already loaded or in iframe, aborting");
    return;
  }

  window._MUSIC_RPC_LOADED_ = true;
  const start = async () => {
    // polling for getSongInfo to be available
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

  if (document.readyState !== "loading") {
    logInfo("Document ready, starting immediately");
    start();
  } else {
    logInfo("init: waiting for DOMContentLoaded");
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }

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
