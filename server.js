const express = require("express");
const cors = require("cors");
const { Client, StatusDisplayType } = require("@xhayper/discord-rpc");
const { logRpcConnection, getCurrentTime, isSameActivity, isSameActivityIgnore, truncate, normalizeTitleAndArtist, isValidUrl, notifyRpcStatus, detectElectronMode } = require("./utils.js");
const app = express();
const PORT = 3000;
const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000; // 10 seconds
const CLIENT_TIMEOUT = 30000; // 30 seconds
const STUCK_TIMEOUT = 40000; // 40 seconds
const IS_ELECTRON = detectElectronMode();
process.env.ELECTRON_MODE = IS_ELECTRON ? "true" : "false";
console.log("\n=== Server Initialization ===");
console.log("Port:", PORT);
console.log("Electron Mode:", process.env.ELECTRON_MODE);
console.log("============================\n");

let rpcClient = null;
let isRpcConnected = false;
let isConnecting = false;
let isShuttingDown = false;
let currentActivity = null;
let lastActiveClient = null;
let healthCheckInterval = null;

// Settings
let serverSettings = {
  showSmallIcon: false,
  logSongUpdate: false,
};

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (process.env.ELECTRON_MODE === "true" && process.send) process.send("ready");
  connectRPC().catch(console.error);
  startHealthCheckTimer();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Error: Port ${PORT} is already in use!`);
  } else {
    console.error("Server error:", err);
  }
});

// Create new RPC Client
function createClient() {
  if (rpcClient && !rpcClient.destroyed) {
    return rpcClient;
  }

  rpcClient = new Client({
    clientId: CLIENT_ID,
    transport: process.env.ELECTRON_MODE === "true" ? "ipc" : "websocket",
    useSteam: false,
    reconnect: false,
  });

  rpcClient.setMaxListeners(20);

  // Disconnect Event
  rpcClient.once("disconnected", async () => {
    isRpcConnected = false;
    isConnecting = false;
    notifyRpcStatus(isRpcConnected);

    const oldClient = rpcClient;
    rpcClient = null;

    if (!isShuttingDown) {
      console.warn("RPC disconnected. Attempting reconnect...");
      try {
        await oldClient.destroy();
      } catch (err) {}
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

  return rpcClient;
}

// Connect to RPC
async function connectRPC() {
  if (isRpcConnected || isConnecting) return true;
  isConnecting = true;
  let attempt = 0;

  while (!isRpcConnected && !isShuttingDown) {
    attempt++;
    try {
      isConnecting = true;
      const client = createClient();
      // Clear old connected listeners before each login attempt
      client.removeAllListeners("connected");

      await Promise.race([client.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);

      if (attempt === 1) {
        logRpcConnection(`Connecting to RPC..`);
      }

      isRpcConnected = !!(client && !client.destroyed && client.user);
      notifyRpcStatus(isRpcConnected);
      logRpcConnection(`RPC connected successfully`);
      return true;
    } catch (err) {
      isRpcConnected = false;
      if (attempt === 5) {
        logRpcConnection(`RPC connection failed: ${err.message}`);
        if (err.message?.includes("ENOENT")) {
          console.error("Discord IPC socket not found. Is Discord running?");
        } else if (err.message?.includes("EACCES")) {
          console.error("Permission denied accessing IPC socket");
        } else if (err.message?.includes("ECONNREFUSED")) {
          console.error("Discord refused connection. Try restarting Discord.");
        }
        logRpcConnection("Waiting for connection..");
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    } finally {
      isConnecting = false;
    }
  }

  logRpcConnection("RPC could not connect.");
  return false;
}

// Middleware
app.use(cors());
app.use(express.json());

// RPC update endpoint
app.post("/update-rpc", async (req, res) => {
  try {
    const { data, clientId } = req.body || {};

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
        await rpcClient.user.clearActivity();
      }
      currentActivity = null;
      return res.json({ success: true, action: "cleared" });
    }

    // String Extraction
    let dataTitle = String(data.title || "").trim();
    let dataArtist = String(data.artist || "").trim();
    let dataSettings = data.settings;

    // Normalization
    if (dataTitle && dataArtist) {
      const normalized = normalizeTitleAndArtist(dataTitle, dataArtist);
      dataTitle = normalized?.title || dataTitle;
      dataArtist = normalized?.artist || dataArtist;
    }

    dataTitle = truncate(dataTitle, 128, { fallback: "Unknown Song" });
    dataArtist = truncate(dataArtist, 128, { fallback: "Unknown Artist" });

    // Default settings
    const defaultSettings = {
      showFavIcon: false,
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

    const sourceText = truncate(data.source, 32, { fallback: "Unknown Source" });
    const artistIsMissingOrSame = !dataArtist || dataArtist === dataTitle;

    // Activity
    const activity = {
      details: dataTitle,
      state: artistIsMissingOrSame ? sourceText : dataArtist,
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
    } else if (activitySettings.showCover && data.image) {
      activity.largeImageKey = String(data.image);
    }

    // Large image text
    if (activitySettings.showSource && dataTitle !== dataArtist && dataTitle !== sourceText) {
      activity.largeImageText = sourceText;
    }

    // Small image
    if (!artistIsMissingOrSame && serverSettings.showSmallIcon) {
      activity.smallImageKey = favIcon || (data.watching ? "watch" : "listen");
    }

    // Small image text
    if (serverSettings.showSmallIcon) {
      activity.smallImageText = sourceText;
    } else {
      activity.smallImageText = data.watching ? "Watching" : "Listening";
    }

    // Buttons
    if (activitySettings.showButtons) {
      const isValidUrl = (url) => {
        if (!url || typeof url !== "string") return false;
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

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

    // Update activity
    const isSame = typeof isSameActivity === "function" ? isSameActivity(activity, currentActivity) : false;

    if (!isSame) {
      const isSameIgnore = typeof isSameActivityIgnore === "function" ? isSameActivityIgnore(activity, currentActivity) : false;

      if (!isSameIgnore && serverSettings.logSongUpdate) {
        console.log(`RPC Updated: ${activity.details} by ${activity.state} - ${getCurrentTime()}`);
      }

      // RPC client check
      if (rpcClient?.user?.setActivity) {
        await rpcClient.user.setActivity(activity);
        currentActivity = activity;
      } else {
        console.error("RPC client or setActivity method not available");
        return res.status(500).json({ error: "RPC client not ready" });
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

// Clear RPC
app.post("/clear-rpc", express.json(), async (req, res) => {
  try {
    if (currentActivity === null) {
      return res.json({ success: true, message: "Already cleared" });
    }

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { clientId } = req.body;

    if (!clientId || typeof clientId !== "string") {
      return res.status(400).json({ error: "clientId is required and must be a string" });
    }

    if (await connectRPC()) {
      await rpcClient.user?.clearActivity();
      currentActivity = null;
      if (lastActiveClient?.clientId === clientId) lastActiveClient = null;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("RPC Clear Error:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

// Health check
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

// Health check timer
function startHealthCheckTimer() {
  if (healthCheckInterval) clearInterval(healthCheckInterval);

  healthCheckInterval = setInterval(async () => {
    if (isShuttingDown) return;
    try {
      const now = Date.now();

      // If there is no client or it has been destroyed -> reconnect
      if (!rpcClient || rpcClient.destroyed || !rpcClient.user) {
        if (!isConnecting && !isShuttingDown) {
          isRpcConnected = false;
          await connectRPC();
        }
        return;
      }

      // If the activity is stuck -> clearActivity
      if (lastActiveClient?.timestamp && now - lastActiveClient.timestamp > CLIENT_TIMEOUT) {
        console.log("[HEALTH] No updates from client, clearing stale activity...");
        try {
          await rpcClient?.user?.clearActivity();
        } catch (err) {
          console.warn("[HEALTH] Failed to clear activity:", err.message);
        }
        currentActivity = null;
        lastActiveClient = null;
      }

      // RPC is connected but only the reconnect guard
      isRpcConnected = !!(rpcClient && !rpcClient.destroyed && rpcClient.user);
    } catch (err) {
      console.error("[HEALTH] Unexpected error:", err.message);
    }
  }, STUCK_TIMEOUT);
}

// Shutdown
async function shutdown() {
  console.log("Shutting down...");
  isShuttingDown = true;

  try {
    if (rpcClient) {
      if (rpcClient.user) {
        await rpcClient.user.clearActivity();
      }
      await rpcClient.destroy();
      rpcClient = null;
    }
  } catch (err) {
    console.error("RPC destroy failed:", err);
  }

  currentActivity = null;
  lastActiveClient = null;
  if (healthCheckInterval) clearInterval(healthCheckInterval);

  server.close(() => process.exit(0));
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
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
