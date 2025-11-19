const express = require("express");
const net = require("net");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const { Client, StatusDisplayType } = require("@xhayper/discord-rpc");
const { getCurrentTime, isSameActivity, isSameActivityIgnore, truncate, normalizeTitleAndArtist, isValidUrl, notifyRpcStatus, detectElectronMode } = require("./utils.js");
let PORT = 3000;
const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000; // 10 seconds
const CLIENT_TIMEOUT = 30000; // 30 seconds
const STUCK_TIMEOUT = 40000; // 40 seconds
const IS_ELECTRON = detectElectronMode();
process.env.ELECTRON_MODE = IS_ELECTRON ? "true" : "false";

if (global.__SERVER_INSTANCE_RUNNING__) {
  console.error("Server already running in this process!");
  process.exit(1);
}
global.__SERVER_INSTANCE_RUNNING__ = true;
process.on("exit", () => {
  global.__SERVER_INSTANCE_RUNNING__ = false;
});

if (IS_ELECTRON) {
  PORT = process.env.PORT || PORT;
}

// Expected Discord IPC Socket Paths
const expectedPaths = [];
if (process.platform === "win32") {
  expectedPaths.push("\\\\.\\pipe\\discord-ipc-0");
} else if (process.platform === "linux") {
  const uid = process.getuid ? process.getuid() : 1000;
  const xdgRuntime = process.env.XDG_RUNTIME_DIR;

  // Standard native Discord location
  if (xdgRuntime) {
    expectedPaths.push(`${xdgRuntime}/discord-ipc-0`);
  }
  expectedPaths.push(`/run/user/${uid}/discord-ipc-0`);
  expectedPaths.push("/tmp/discord-ipc-0");

  // Flatpak Discord locations
  if (xdgRuntime) {
    expectedPaths.push(`${xdgRuntime}/app/com.discordapp.Discord/discord-ipc-0`);
  }
  expectedPaths.push(`/run/user/${uid}/app/com.discordapp.Discord/discord-ipc-0`);

  // Snap Discord locations
  if (xdgRuntime) {
    expectedPaths.push(`${xdgRuntime}/snap.discord/discord-ipc-0`);
  }
  expectedPaths.push(`/run/user/${uid}/snap.discord/discord-ipc-0`);

  // Alternative Discord clients (Vesktop, WebCord, etc.)
  if (xdgRuntime) {
    expectedPaths.push(`${xdgRuntime}/app/dev.vencord.Vesktop/discord-ipc-0`);
    expectedPaths.push(`${xdgRuntime}/app/io.github.spacingbat3.webcord/discord-ipc-0`);
  }

  // Legacy locations (for older installations)
  expectedPaths.push("/var/run/discord-ipc-0");
  if (process.env.TMPDIR) {
    expectedPaths.push(`${process.env.TMPDIR}/discord-ipc-0`);
  }
} else if (process.platform === "darwin") {
  expectedPaths.push("/tmp/discord-ipc-0");
  if (process.env.TMPDIR) {
    expectedPaths.push(`${process.env.TMPDIR}/discord-ipc-0`);
  }
}

// Socket entity status
const socketStatus = expectedPaths.map((path) => ({
  path,
  exists: fs.existsSync(path),
}));

const hasValidSocket = socketStatus.some((s) => s.exists);

// Title and general info
console.log("Starting Discord MUSIC RPC Server");
console.log("Server Configuration: " + `Port: ${PORT} - Electron Mode: ${process.env.ELECTRON_MODE} - Platform: ${process.platform} - Node Version: ${process.version}`);
if (process.platform === "linux") {
  console.log(`XDG_RUNTIME_DIR: ${process.env.XDG_RUNTIME_DIR || "⚠️  NOT SET"}`);
}

// Socket status
const socketCheckResults = [];
socketStatus.forEach((s) => {
  const message = `Discord IPC Socket Found: [${s.path}]`;

  if (s.exists) {
    console.log(message);
    socketCheckResults.push(s.path);
  }
});

if (!socketCheckResults.length > 0) {
  console.log("No Discord IPC socket found! Will retry when Discord is running.");
}

// IPC connection test
if (hasValidSocket) {
  const validPath = socketStatus.find((s) => s.exists).path;
  console.log(`Testing IPC connection to: ${validPath}`);
  const testSocket = net.createConnection(validPath);

  testSocket.on("connect", () => {
    console.log(`IPC connection test successful`);
    testSocket.end();
  });

  testSocket.on("error", (err) => {
    console.log(`[FAIL] IPC connection test failed: ${err.message}`);
  });
}

let rpcClient = null;
let isRpcConnected = false;
let isConnecting = false;
let isShuttingDown = false;
let currentActivity = null;
let lastActiveClient = null;
let healthCheckInterval = null;
let serverInstance = null;
let hasLoggedRpcFailure = false;
let lastUpdateRequest = null;
let lastClearRpcResult = null;

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
    let response;

    if (currentActivity === null) {
      response = { success: true, message: "Already cleared" };
    } else {
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

      response = { success: true };
    }

    lastClearRpcResult = response;
    res.json(response);
  } catch (err) {
    console.error("RPC Clear Error:", err);
    const errorResp = { error: "Internal server error", details: err.message };
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

// Create new RPC Client
function createClient() {
  // If there is an existing client and it is working, return it
  if (rpcClient && !rpcClient.destroyed) {
    return rpcClient;
  }

  console.log("Creating new RPC Client...");

  rpcClient = new Client({
    clientId: CLIENT_ID,
    transport: process.env.ELECTRON_MODE === "true" ? "ipc" : "websocket",
    useSteam: false,
    reconnect: false,
  });

  rpcClient.setMaxListeners(20);

  // Disconnect Event
  rpcClient.once("disconnected", async () => {
    console.log("RPC disconnected event triggered");
    isRpcConnected = false;
    isConnecting = false;
    notifyRpcStatus(isRpcConnected);

    const oldClient = rpcClient;
    rpcClient = null;

    if (!isShuttingDown) {
      console.warn("RPC disconnected. Attempting reconnect...");
      try {
        await oldClient.destroy();
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

  return rpcClient;
}

// Connect to RPC
async function connectRPC() {
  if (isRpcConnected || isConnecting) {
    return true;
  }

  isConnecting = true;
  let attempt = 0;

  while (!isRpcConnected && !isShuttingDown) {
    attempt++;
    try {
      const client = createClient();

      if (client.user) {
        console.log("RPC Client already has user, skipping login");
        isRpcConnected = true;
        isConnecting = false;
        notifyRpcStatus(isRpcConnected);
        return true;
      }

      // Clear old connected listeners before each login attempt
      client.removeAllListeners("connected");

      await Promise.race([client.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);

      if (attempt === 1) {
        console.log(`Connecting to RPC..`);
      }

      isRpcConnected = !!(client && !client.destroyed && client.user);
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
  if (isShuttingDown) {
    console.log("Shutdown already in progress...");
    return;
  }

  console.log("Shutting down server...");
  isShuttingDown = true;

  try {
    // Clear health check
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }

    // Cleanup RPC
    if (rpcClient) {
      if (rpcClient.user) {
        await rpcClient.user.clearActivity();
      }
      await rpcClient.destroy();
      rpcClient = null;
    }

    currentActivity = null;
    lastActiveClient = null;
    hasLoggedRpcFailure = false;
    lastUpdateRequest = null;
    lastClearRpcResult = null;

    // Close server
    if (serverInstance) {
      await new Promise((resolve) => {
        serverInstance.close(() => {
          console.log("Server closed successfully");
          resolve();
        });
      });
    }
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
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
