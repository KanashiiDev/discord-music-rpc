const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { Client, StatusDisplayType } = require("@xhayper/discord-rpc");
const { addHistoryEntry, getCurrentTime, isSameActivity, isSameActivityIgnore, truncate, isValidUrl, notifyRpcStatus, detectElectronMode } = require("./utils.js");
let PORT = 3000;
const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000; // 10 seconds
const CLIENT_TIMEOUT = 30000; // 30 seconds
const AUTO_CLEAR_TIMEOUT = 24000; // 24 seconds
const STUCK_TIMEOUT = 12000; // 12 seconds
const MAX_CLEAR_RETRIES = 3;
let reconnectScheduled = false;
let historyTimeout = null;
const settingsFilePath = process.env.SETTINGS_FILE_PATH;
const logFilePath = process.env.LOG_FILE_PATH;
const historyFilePath = process.env.HISTORY_FILE_PATH;
const IS_ELECTRON = detectElectronMode();
process.env.ELECTRON_MODE = IS_ELECTRON ? "true" : "false";

if (IS_ELECTRON) {
  PORT = process.env.PORT || PORT;
}

const isRpcReady = (client) => {
  return Boolean(isRpcConnected && client && !client.destroyed && client.user && typeof client.user.setActivity === "function");
};

if (global.__SERVER_INSTANCE_RUNNING__) {
  console.error("Server already running in this process!");
  process.exit(1);
}
global.__SERVER_INSTANCE_RUNNING__ = true;
process.on("exit", () => {
  global.__SERVER_INSTANCE_RUNNING__ = false;
});

// Title and general info
console.log("Starting Discord MUSIC RPC Server");
console.log("Server Configuration: " + `Port: ${PORT} - Electron Mode: ${process.env.ELECTRON_MODE} - Platform: ${process.platform} - Node Version: ${process.version}`);

let rpcClient = null;
let isRpcConnected = false;
let isConnecting = false;
let connectPromise = null;
let isShuttingDown = false;
let shutdownPromise = null;
let currentActivity = null;
let lastActiveClient = null;
let lastSavedHistoryEntry = null;
let lastUpdateAt = null;
let healthCheckInterval = null;
let serverInstance = null;
let hasLoggedRpcFailure = false;
let lastUpdateRequest = null;
let lastClearRpcResult = null;
let historySaveLock = false;

// Settings
let serverSettings = {
  showSmallIcon: false,
  logSongUpdate: false,
};

// Create Express app
const app = express();
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// no-cache
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});

// Middleware
app.use(cors());
app.use(express.json());

// RPC update - POST
app.post("/update-rpc", async (req, res) => {
  if (lastUpdateAt && Date.now() - lastUpdateAt < 2000) {
    return res.status(429).json({ error: "Too many updates" });
  }
  lastUpdateAt = Date.now();
  try {
    const { data, clientId } = req.body || {};
    lastUpdateRequest = data;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ error: "Invalid data object" });
    }

    const progress = Number(data.progress) || 0;
    const duration = Number(data.duration) || 0;
    const now = Date.now();
    const startTime = now - (progress / 100) * duration * 1000;
    const endTime = startTime + duration * 1000;

    // Client check
    if (lastActiveClient && lastActiveClient.clientId !== clientId && now - (lastActiveClient.timestamp || 0) < CLIENT_TIMEOUT) {
      return res.json({ success: true, message: "Another Client is Active" });
    }

    lastActiveClient = {
      clientId: String(clientId || "unknown"),
      timestamp: now,
    };

    // RPC connection check
    if (!(await connectRPC())) {
      return res.status(500).json({ error: "RPC connection failed" });
    }

    // Clear activity
    if (!data.status) {
      if (rpcClient?.user?.clearActivity) {
        try {
          await Promise.race([rpcClient.user.clearActivity(), new Promise((_, reject) => setTimeout(() => reject(new Error("Clear timeout")), 5000))]);
        } catch (err) {
          console.warn("[UPDATE-RPC] Failed to clear activity:", err.message);
          isRpcConnected = false;
        }
      }
      currentActivity = null;
      lastActiveClient = null;
      lastUpdateAt = null;
      return res.json({ success: true, action: "cleared" });
    }

    // String Extraction
    const dataTitle = String(data.title || "").trim();
    const rawArtist = String(data.artist ?? "").trim();
    const artistIsIntentionallyEmpty = !rawArtist || rawArtist === "-1";
    const dataArtist = artistIsIntentionallyEmpty ? "" : rawArtist;
    const dataSource = String(data.source || "").trim();
    const artistIsMissingOrSame = artistIsIntentionallyEmpty || dataArtist === dataTitle;
    const dataSettings = data.settings;

    // Default settings
    const defaultSettings = {
      showFavIcon: false,
      showArtist: true,
      showCover: true,
      showSource: true,
      customCover: false,
      customCoverUrl: null,
      showButtons: true,
      showTimeLeft: true,
    };

    const activitySettings = {
      ...defaultSettings,
      ...(dataSettings && typeof dataSettings === "object" ? dataSettings : {}),
    };

    const shouldShowArtist = !artistIsMissingOrSame && activitySettings.showArtist;

    // Server settings check
    if (!serverSettings || typeof serverSettings !== "object") {
      serverSettings = {};
    }

    serverSettings.showSmallIcon = Boolean(activitySettings.showFavIcon);

    // Creating FavIcon
    let favIcon = null;
    if (serverSettings.showSmallIcon && data.songUrl) {
      try {
        const songUrl = String(data.songUrl).trim();
        if (songUrl) {
          const iconUrl = new URL(songUrl);
          const iconSize = 64;
          favIcon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(iconUrl.hostname)}&sz=${iconSize}`;
        }
      } catch (err) {
        console.warn("Invalid songUrl for favicon:", err.message);
        favIcon = null;
      }
    }

    // Activity
    const activity = {
      details: dataTitle,
      state: shouldShowArtist ? dataArtist : dataSource,
      type: data.watching ? 3 : 2,
      instance: false,
    };

    // StatusDisplayType check
    if (typeof StatusDisplayType !== "undefined" && StatusDisplayType.STATE) {
      activity.statusDisplayType = StatusDisplayType.STATE;
    }

    // Large image
    if (activitySettings.customCover && activitySettings.customCoverUrl) {
      activity.largeImageKey = String(activitySettings.customCoverUrl);
    } else if (activitySettings.showCover && data.image && !/\.webp(\?.*)?$/i.test(data.image)) {
      activity.largeImageKey = String(data.image);
    }

    // Large image text
    if (!artistIsIntentionallyEmpty && activitySettings.showSource && dataTitle !== dataArtist && dataTitle !== dataSource) {
      activity.largeImageText = dataSource;
    }

    // Small image
    if (!artistIsIntentionallyEmpty && serverSettings.showSmallIcon) {
      activity.smallImageKey = favIcon || (data.watching ? "watch" : "listen");
    }

    // Small image text
    if (artistIsIntentionallyEmpty) {
      activity.smallImageText = "";
    } else if (serverSettings.showSmallIcon) {
      activity.smallImageText = dataSource;
    } else {
      activity.smallImageText = data.watching ? "Watching" : "Listening";
    }

    // Buttons
    if (activitySettings.showButtons) {
      const buttonsRaw = (Array.isArray(data.buttons) ? data.buttons : []).filter((btn) => {
        return btn && typeof btn === "object" && btn.text && String(btn.text).trim() && isValidUrl(btn.link);
      });

      const buttons = buttonsRaw.slice(0, 2).map((btn) => ({
        label: truncate(btn.text, 32),
        url: String(btn.link),
      }));

      if (buttons.length === 2) {
        activity.buttons = buttons;
      } else if (buttons.length === 1 && isValidUrl(data.songUrl)) {
        activity.buttons = [
          buttons[0],
          {
            label: truncate(`Open on ${data.source || "Source"}`, 32),
            url: String(data.songUrl),
          },
        ];
      } else if (isValidUrl(data.songUrl)) {
        activity.buttons = [
          {
            label: truncate(`Open on ${data.source || "Source"}`, 32),
            url: String(data.songUrl),
          },
        ];
      }

      if (isValidUrl(data.songUrl)) {
        activity.detailsUrl = String(data.songUrl);
      }
    }

    // Timestamps
    if (duration > 0) {
      activity.startTimestamp = Math.floor(startTime / 1000);
      if (activitySettings.showTimeLeft) {
        activity.endTimestamp = Math.floor(endTime / 1000);
      }
    }

    // Add to history if type is not watching
    if (activity.type !== 3) {
      if (!isSameActivityIgnore(activity, currentActivity)) {
        // The song changed - cancel the previous timeout
        if (historyTimeout) {
          clearTimeout(historyTimeout);
          historyTimeout = null;
        }
        historySaveLock = false;

        // Save song after 25 seconds.
        historyTimeout = setTimeout(() => {
          if (!isSameActivityIgnore(activity, lastSavedHistoryEntry)) {
            addHistoryEntry(activity, historyFilePath);
            lastSavedHistoryEntry = JSON.parse(JSON.stringify(activity));
          }
          historyTimeout = null;
          historySaveLock = false;
        }, 25000);
      } else if (!historySaveLock && !historyTimeout) {
        // The song is the same, but the timeout hasn't started yet
        historySaveLock = true;
        historyTimeout = setTimeout(() => {
          if (!isSameActivityIgnore(activity, lastSavedHistoryEntry)) {
            addHistoryEntry(activity, historyFilePath);
            lastSavedHistoryEntry = JSON.parse(JSON.stringify(activity));
          }
          historyTimeout = null;
          historySaveLock = false;
        }, 25000);
      }
    }

    // Update activity
    const isSame = typeof isSameActivity === "function" ? isSameActivity(activity, currentActivity) : false;
    if (!isSame) {
      // If the logSongUpdate setting is enabled, log the song change.
      if (serverSettings.logSongUpdate) {
        console.log(`RPC Updated: ${activity.details} by ${activity.state} - ${getCurrentTime()}`);
      }

      const client = rpcClient;

      // RPC client check
      if (isRpcReady(client)) {
        try {
          await client.user.setActivity(activity);
          currentActivity = activity;
        } catch (err) {
          console.error("setActivity failed:", err.message);
          isRpcConnected = false;

          // Reconnect
          if (!reconnectScheduled && !isConnecting && !isShuttingDown) {
            reconnectScheduled = true;
            setTimeout(async () => {
              reconnectScheduled = false;
              if (!isConnecting && !isShuttingDown) {
                await connectRPC();
              }
            }, 2000);
          }
        }
      } else {
        console.error("RPC client or setActivity method not available");
        return res.status(503).json({ error: "RPC client not ready" });
      }
    }

    res.json({ success: true, action: "updated" });
  } catch (err) {
    console.error("RPC Update Error:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

// RPC update - GET
app.get("/update-rpc", (req, res) => {
  if (!lastUpdateRequest) {
    return res.json({ message: "No update-rpc request has been made yet." });
  }
  res.json({
    ...lastUpdateRequest,
  });
});

// Clear RPC - POST
app.post("/clear-rpc", express.json(), async (req, res) => {
  try {
    // Validation
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { clientId } = req.body;
    if (!clientId || typeof clientId !== "string") {
      return res.status(400).json({ error: "clientId is required and must be a string" });
    }

    // Clear the timeout
    if (historyTimeout) {
      clearTimeout(historyTimeout);
      historyTimeout = null;
      historySaveLock = false;
    }

    // RPC cleanup with retry
    let clearSuccess = false;
    const hadActivity = currentActivity !== null;

    if (await connectRPC()) {
      if (hadActivity || rpcClient?.user) {
        for (let attempt = 1; attempt <= MAX_CLEAR_RETRIES; attempt++) {
          try {
            await Promise.race([rpcClient.user?.clearActivity(), new Promise((_, reject) => setTimeout(() => reject(new Error("Clear timeout")), 5000))]);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            clearSuccess = true;
            break;
          } catch (err) {
            console.error(`[CLEAR-RPC] Failed to clear activity (attempt ${attempt}/${MAX_CLEAR_RETRIES}):`, err.message);

            if (attempt < MAX_CLEAR_RETRIES) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }

        if (!clearSuccess) {
          console.error(`[CLEAR-RPC] All clear attempts failed. Forcing client reconnection...`);

          isRpcConnected = false;
          const oldClient = rpcClient;
          rpcClient = null;

          try {
            await oldClient?.destroy();
          } catch (destroyErr) {
            console.warn(`[CLEAR-RPC] Error destroying client:`, destroyErr.message);
          }

          await connectRPC();

          try {
            if (rpcClient?.user?.clearActivity) {
              await rpcClient.user.clearActivity();
              console.log(`[CLEAR-RPC] Activity cleared after reconnection`);
              clearSuccess = true;
            }
          } catch (finalErr) {
            console.error(`[CLEAR-RPC] Final clear attempt failed:`, finalErr.message);
          }
        }
      } else {
        clearSuccess = true;
      }
    }

    // Clear the state
    currentActivity = null;
    lastActiveClient = null;
    lastUpdateAt = null;

    const response = {
      success: true,
      cleared: clearSuccess,
      reconnected: !clearSuccess,
    };

    lastClearRpcResult = response;
    res.json(response);
  } catch (err) {
    console.error("RPC Clear Error:", err);
    const errorResp = {
      error: "Internal server error",
      details: err.message,
    };
    lastClearRpcResult = errorResp;
    res.status(500).json(errorResp);
  }
});

// Clear RPC - GET
app.get("/clear-rpc", (req, res) => {
  if (!lastClearRpcResult) {
    return res.json({ message: "No clear-rpc request has been made yet." });
  }
  res.json(lastClearRpcResult);
});

// Health check - GET
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    rpcConnected: isRpcConnected,
    lastActiveClient: lastActiveClient
      ? {
          clientId: lastActiveClient.clientId,
          activeSince: new Date(lastActiveClient.timestamp).toISOString(),
          secondsAgo: Math.floor((Date.now() - lastActiveClient.timestamp) / 1000),
        }
      : null,
  });
});

// Main - GET
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Status - GET
app.get("/status", (req, res) => {
  res.json({
    status: "ok",
    rpcConnected: isRpcConnected,
    electronMode: process.env.ELECTRON_MODE,
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Activity - GET
app.get("/activity", (req, res) => {
  res.json({
    activity: currentActivity,
    rpcConnected: isRpcConnected,
    lastUpdateRequest,
  });
});

// History - GET
app.get("/history", (req, res) => {
  const history = fs.existsSync(historyFilePath) ? JSON.parse(fs.readFileSync(historyFilePath, "utf-8")) : [];

  res.json(history);
});

// LOGS - GET
app.get("/logs", (req, res) => {
  const logs = fs.existsSync(logFilePath) ? JSON.parse(fs.readFileSync(logFilePath, "utf-8")) : [];
  res.json(logs);
});

// SETTINGS - GET
app.get("/settings", (req, res) => {
  fs.readFile(settingsFilePath, "utf8", (err, data) => {
    if (err) return res.status(500).json({ error: "The file could not be read" });
    res.json(JSON.parse(data));
  });
});

// SETTINGS - POST
app.post("/update-settings", (req, res) => {
  const incoming = req.body;

  fs.readFile(settingsFilePath, "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Settings Read Failed: " + err });
    }

    let settings;
    try {
      settings = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: "Settings Parse Failed: " + e });
    }

    let updated = false;

    for (const key in incoming.server) {
      if (!settings.server[key]) continue;

      // value-only update
      settings.server[key].value = incoming.server[key];
      updated = true;
    }

    if (!updated) {
      return res.status(400).json({ error: "No valid settings to update" });
    }

    fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 4), "utf8", (err) => {
      if (err) {
        return res.status(500).json({ error: "Settings Update Failed: " + err });
      }

      res.json({ success: true, message: "Settings Updated" });
      console.log("The server is restarting to apply new settings..");
      sendRestart();
    });
  });
});

// Reset Settings - POST
app.post("/reset-settings", (req, res) => {
  sendResetConfig();
  res.json({ success: true, message: "Config reset initiated" });
});

// UPDATE PORT - POST
app.post("/update-port", (req, res) => {
  const { newPort } = req.body;

  if (typeof newPort !== "number" || isNaN(newPort)) {
    return res.status(400).json({ error: "Invalid port value" });
  }

  fs.readFile(settingsFilePath, "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Settings Read Failed: " + err });
    }

    let settings;
    try {
      settings = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: "Settings Parse Failed: " + e });
    }

    const portSchema = settings?.server?.PORT;

    if (!portSchema || portSchema.type !== "number") {
      return res.status(500).json({ error: "PORT setting schema not found" });
    }

    // Schema-based validation
    if ((portSchema.min && newPort < portSchema.min) || (portSchema.max && newPort > portSchema.max)) {
      return res.status(400).json({
        error: `Port must be between ${portSchema.min} and ${portSchema.max}`,
      });
    }

    // Update
    portSchema.value = newPort;

    fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 4), "utf8", (err) => {
      if (err) {
        return res.status(500).json({ error: "Settings Update Failed: " + err });
      }

      res.json({
        success: true,
        message: "Port updated successfully",
        updatedPort: newPort,
      });

      console.log(`Server port changed: ${newPort}`);
      console.log(`Restarting server to apply port change...`);
      sendRestart();
    });
  });
});

// Create new RPC Client
function createClient() {
  // If there is an existing client and it is working, return it
  if (rpcClient && !rpcClient.destroyed) {
    return rpcClient;
  }

  console.log("Creating new RPC Client...");

  if (rpcClient) {
    rpcClient.removeAllListeners();
    rpcClient = null;
  }

  rpcClient = new Client({
    clientId: CLIENT_ID,
    transport: "ipc",
    useSteam: false,
    reconnect: false,
  });

  console.log("RPC Client ready");
  setupClientEvents();
  return rpcClient;
}

function setupClientEvents() {
  if (!rpcClient) return;

  rpcClient.setMaxListeners(20);

  // Ready Event
  rpcClient.once("ready", () => {
    isRpcConnected = true;
    isConnecting = false;
    hasLoggedRpcFailure = false;
    notifyRpcStatus(isRpcConnected);
  });

  // Disconnect Event
  rpcClient.on("disconnected", async () => {
    console.log("RPC disconnected event triggered");
    isRpcConnected = false;
    isConnecting = false;
    notifyRpcStatus(isRpcConnected);

    if (!isShuttingDown) {
      console.warn("Attempting reconnect in 3 seconds...");

      const oldClient = rpcClient;
      rpcClient = null;

      try {
        await oldClient?.destroy();
      } catch (err) {
        console.warn("Error destroying old client:", err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await connectRPC();
    }
  });

  // Error handling
  rpcClient.on("error", (err) => {
    console.error("RPC Client Error:", err);
    if (err.message?.includes("ENOENT") || err.message?.includes("socket")) {
      console.error("IPC Socket error - Discord may not be running or socket path incorrect");
    }
  });
}

// Connect to RPC
async function connectRPC() {
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    if (isRpcConnected || isConnecting) {
      return true;
    }

    isConnecting = true;
    let attempt = 0;

    while (!isRpcConnected && !isShuttingDown) {
      attempt++;
      try {
        const client = createClient();

        // Clear old connected listeners before each login attempt
        client.removeAllListeners("connected");

        await Promise.race([client.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);

        if (attempt === 1) {
          console.log(`Connecting to RPC..`);
        }

        isRpcConnected = isRpcReady(client);
        hasLoggedRpcFailure = false;
        isConnecting = false;
        notifyRpcStatus(isRpcConnected);
        console.log("RPC connected successfully");
        return true;
      } catch (err) {
        isRpcConnected = false;
        isConnecting = false;

        if (!hasLoggedRpcFailure) {
          console.error(`RPC connection failed: ${err.message}`);
          if (err.message?.includes("ENOENT")) {
            console.error("Discord IPC socket not found. Is Discord running?");
          } else if (err.message?.includes("EACCES")) {
            console.error("Permission denied accessing IPC socket");
          } else if (err.message?.includes("ECONNREFUSED")) {
            console.error("Discord refused connection. Try restarting Discord.");
          }
          console.log("Waiting for connection..");
          hasLoggedRpcFailure = true;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }

    if (!isRpcConnected && !isShuttingDown) {
      console.error("RPC could not connect.");
    }
    return false;
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

// Health check timer
function startHealthCheckTimer() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    if (isShuttingDown) return;
    try {
      const now = Date.now();
      if (currentActivity !== null && lastUpdateAt && now - lastUpdateAt > AUTO_CLEAR_TIMEOUT) {
        console.log(`[HEALTH] No update for ${Math.floor((now - lastUpdateAt) / 1000)}s, auto-clearing activity...`);

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            if (rpcClient?.user?.clearActivity) {
              await Promise.race([rpcClient.user.clearActivity(), new Promise((_, reject) => setTimeout(() => reject(new Error("Clear timeout")), 5000))]);
              console.log(`[HEALTH] Activity auto-cleared successfully`);
              break;
            }
          } catch (err) {
            console.warn(`[HEALTH] Failed to auto-clear (attempt ${attempt}):`, err.message);

            if (attempt === 2) {
              console.log("[HEALTH] Forcing client reconnection after failed auto-clear...");
              isRpcConnected = false;
              const oldClient = rpcClient;
              rpcClient = null;

              try {
                await oldClient?.destroy();
              } catch (destroyErr) {
                console.warn("[HEALTH] Error destroying client:", destroyErr.message);
              }

              await connectRPC();
            }
          }
        }

        currentActivity = null;
        lastActiveClient = null;
        lastUpdateAt = null;

        if (historyTimeout) {
          clearTimeout(historyTimeout);
          historyTimeout = null;
          historySaveLock = false;
        }
      }

      if (lastActiveClient?.timestamp && now - lastActiveClient.timestamp > CLIENT_TIMEOUT) {
        console.log(`[HEALTH] Client inactive for ${Math.floor((now - lastActiveClient.timestamp) / 1000)}s, clearing...`);

        try {
          if (rpcClient?.user?.clearActivity) {
            await rpcClient.user.clearActivity();
            console.log(`[HEALTH] Activity cleared due to client timeout`);
          }
        } catch (err) {
          console.warn(`[HEALTH] Failed to clear inactive client:`, err.message);
        }

        currentActivity = null;
        lastActiveClient = null;
        lastUpdateAt = null;
      }

      // Client control
      if (!rpcClient || rpcClient.destroyed || !rpcClient.user) {
        if (!isConnecting && !isShuttingDown) {
          isRpcConnected = false;
          await connectRPC();
        }
        return;
      }

      // Connection state verification
      const shouldBeConnected = !!(rpcClient && !rpcClient.destroyed && rpcClient.user);
      if (isRpcConnected !== shouldBeConnected) {
        console.log(`[HEALTH] Connection state mismatch. Reconnecting...`);
        isRpcConnected = shouldBeConnected;
        notifyRpcStatus(isRpcConnected);

        if (!shouldBeConnected && !isConnecting) {
          await connectRPC();
        }
      }
    } catch (err) {
      console.error("[HEALTH] Unexpected error:", err.message);
      if (!isConnecting && !isShuttingDown) {
        isRpcConnected = false;
        await connectRPC();
      }
    }
  }, STUCK_TIMEOUT);
}

// Send Ready
function sendReady() {
  if (process.env.ELECTRON_MODE === "true") {
    if (typeof process.send === "function") {
      try {
        process.send("ready");
      } catch (err) {
        console.error("[FAIL] Failed to send ready signal:", err.message);
      }
    } else {
      console.error("[FAIL] CRITICAL: process.send is not available!");
    }
  }
}

// Send Restart
function sendRestart() {
  setTimeout(() => {
    if (process.env.ELECTRON_MODE === "true") {
      if (typeof process.send === "function") {
        try {
          process.send("RESTART_SERVER");
        } catch (err) {
          console.error("[FAIL] Failed to send restart signal:", err.message);
        }
      } else {
        console.error("[FAIL] CRITICAL: process.send is not available!");
      }
    }
  }, 1000);
}

// Send Reset Config
function sendResetConfig() {
  setTimeout(() => {
    if (process.env.ELECTRON_MODE === "true") {
      if (typeof process.send === "function") {
        try {
          process.send("RESET_CONFIG");
        } catch (err) {
          console.error("[FAIL] Failed to send reset config signal:", err.message);
        }
      } else {
        console.error("[FAIL] CRITICAL: process.send is not available!");
      }
    }
  }, 1000);
}

// Shutdown
async function shutdown() {
  if (isShuttingDown) {
    return shutdownPromise;
  }

  isShuttingDown = true;

  shutdownPromise = (async () => {
    console.log("[Server] Shutdown initiated...");

    try {
      // Stop HealthCheck interval
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
        console.log("[Server] Health check interval cleared.");
      }

      // RPC Cleanup
      if (rpcClient) {
        try {
          console.log("[Server] Clearing RPC activity...");
          if (rpcClient.user) {
            await rpcClient.user.clearActivity().catch(() => {});
          }

          console.log("[Server] Destroying RPC client...");
          await rpcClient.destroy().catch(() => {});
        } catch (err) {
          console.warn("[Server] RPC cleanup failed (ignored):", err.message);
        } finally {
          rpcClient = null;
        }
      }

      // Express server shutdown
      if (serverInstance) {
        console.log("[Server] Closing HTTP server...");

        await new Promise((resolve) => {
          serverInstance.close((err) => {
            if (err) {
              console.warn("[Server] Error closing HTTP server:", err);
            } else {
              console.log("[Server] HTTP server closed.");
            }
            resolve();
          });
        });

        serverInstance = null;
      }

      console.log("[Server] Cleanup complete. Exiting...");
    } catch (err) {
      console.error("[Server] Shutdown error:", err);
    } finally {
      setTimeout(() => {
        console.log("[Server] shutdown complete.");
        process.exit(0);
      }, 50);
    }
  })();

  return shutdownPromise;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (process.env.ELECTRON_MODE === "true") {
  process.on("message", (msg) => {
    if (msg === "shutdown") {
      shutdown();
      return;
    }

    if (msg.type === "UPDATE_SETTINGS") {
      const newSettings = msg.value;
      serverSettings = { ...serverSettings, ...newSettings };
    }
  });
}

process.on("exit", (code) => {
  if (code !== 0) {
    console.log("Process exit with code:", code);
  }
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown();
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

console.log("Starting server...");
serverInstance = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  sendReady();

  // Start the RPC connection
  connectRPC().catch((err) => {
    console.error("Failed to connect RPC:", err);
  });

  // Start health check
  startHealthCheckTimer();
});

serverInstance.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`FATAL ERROR: Port ${PORT} is already in use!`);
    console.error(`Another instance may be running. Exiting...`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
