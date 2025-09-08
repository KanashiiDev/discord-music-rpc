const express = require("express");
const cors = require("cors");
const { Client, StatusDisplayType } = require("@xhayper/discord-rpc");
const { logRpcConnection, shouldLogAttempt, getCurrentTime, isSameActivity, isSameActivityIgnore, truncate, normalizeTitleAndArtist, isValidUrl, notifyRpcStatus } = require("./utils.js");
const app = express();
const PORT = 3000;
const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000; // 10 seconds
const CLIENT_TIMEOUT = 20000; // 20 seconds
const STUCK_TIMEOUT = 60000; // 60 seconds
const STUCK_THRESHOLD = 90000; // 90 seconds

console.log("\n=== Server Initialization ===");
console.log("Port:", PORT);
console.log("Electron Mode:", process.env.ELECTRON_MODE === "true");
console.log("============================\n");

let rpcClient = null;
let isRpcConnected = false;
let isConnecting = false;
let isShuttingDown = false;
let currentActivity = null;
let lastActiveClient = null;
let healthCheckTimeout = null;
let showSmallIcon = false;
let logSongUpdate = false;

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (process.env.ELECTRON_MODE === "true" && process.send) process.send("ready");
  connectRPC().catch(console.error);
});

// Initial connection
connectRPC().catch(console.error);

// Setup RPC event listeners
function setupRpcListeners(client) {
  client.removeAllListeners();

  client.on("disconnected", () => {
    isRpcConnected = false;
    isConnecting = false;
    notifyRpcStatus(isRpcConnected);
    if (!isShuttingDown) {
      console.warn("RPC disconnected. Attempting reconnect...");
      connectRPC().catch(console.error);
    }
  });
}

// Create new RPC Client
function createClient() {
  const client = new Client({
    clientId: CLIENT_ID,
    transport: process.env.ELECTRON_MODE === "true" ? "ipc" : "websocket",
    useSteam: false,
    reconnect: false,
  });

  setupRpcListeners(client);
  return client;
}

// Connect to RPC
async function connectRPC() {
  if (isRpcConnected || isConnecting) return true;
  isConnecting = true;
  let attempt = 0;

  while (!isRpcConnected && !isShuttingDown) {
    attempt++;

    try {
      if (rpcClient) {
        try {
          rpcClient.removeAllListeners();
          await rpcClient.destroy();
        } catch (err) {
          logRpcConnection(`Failed to cleanly destroy RPC client: ${err.message}`);
        }
        rpcClient = null;
        global.gc?.();
      }

      rpcClient = createClient();

      if (shouldLogAttempt(attempt)) {
        logRpcConnection(`Connecting to RPC (attempt ${attempt})`);
      }

      await Promise.race([rpcClient.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);

      isRpcConnected = true;
      notifyRpcStatus(isRpcConnected);
      logRpcConnection(`RPC connected successfully`);
      return true;
    } catch (err) {
      if (shouldLogAttempt(attempt)) {
        logRpcConnection(`RPC connection failed (attempt #${attempt}): ${err.message}`);
        logRpcConnection(`Retrying every ${RETRY_DELAY / 1000} seconds`);
      }

      if (attempt === 4) {
        logRpcConnection("RPC connection still fails. Subsequent failures will be logged every 10 attempts to reduce noise.");
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
    const { data, clientId } = req.body;
    const progress = data.progress || 0;
    const duration = data.duration || 0;
    const now = Date.now();
    const startTime = now - (progress / 100) * duration * 1000;
    const endTime = startTime + duration * 1000;

    if (lastActiveClient && lastActiveClient.clientId !== clientId && now - lastActiveClient.timestamp < CLIENT_TIMEOUT) {
      return res.status(429).json({
        error: "Another client is currently controlling the RPC",
        retryAfter: Math.ceil((CLIENT_TIMEOUT - (now - lastActiveClient.timestamp)) / 1000),
      });
    }

    lastActiveClient = { clientId: clientId || "unknown", timestamp: now };

    if (!data) return res.status(400).json({ error: "Bad request" });

    if (!(await connectRPC())) {
      return res.status(500).json({ error: "RPC connection failed" });
    }

    if (!data.status) {
      await rpcClient.user?.clearActivity();
      currentActivity = null;
      return res.json({ success: true, action: "cleared" });
    }

    let dataTitle = data?.title || "";
    let dataArtist = data?.artist || "";
    let settings = data?.settings;

    if (dataTitle && dataArtist) {
      const normalized = normalizeTitleAndArtist(dataTitle, dataArtist);
      dataTitle = normalized.title;
      dataArtist = normalized.artist;
    }

    dataTitle = truncate(dataTitle, 128, { fallback: "Unknown Song" });
    dataArtist = truncate(dataArtist, 128, { fallback: "Unknown Artist" });

    const defaultSettings = {
      showFavIcon: false,
      showCover: true,
      showSource: true,
      customCover: false,
      customCoverUrl: null,
      showButtons: true,
      showTimeLeft: true,
    };

    const activitySettings = { ...defaultSettings, ...(settings || {}) };

    if (activitySettings.showFavIcon) {
      showSmallIcon = true;
    } else {
      showSmallIcon = false;
    }

    let favIcon = null;
    if (showSmallIcon) {
      const iconUrl = new URL(data.songUrl || "");
      const iconSize = 64;
      favIcon = iconUrl ? `https://www.google.com/s2/favicons?domain=${iconUrl}&sz=${iconSize}` : "";
    }
    const sourceText = truncate(data?.source, 32, { fallback: "Unknown Source" });
    const artistIsMissingOrSame = !dataArtist || dataArtist === dataTitle;

    const activity = {
      details: dataTitle,
      state: artistIsMissingOrSame ? sourceText : dataArtist,
      type: data?.watching ? 3 : 2,
      largeImageKey: activitySettings.customCover && activitySettings.customCoverUrl ? activitySettings.customCoverUrl : activitySettings.showCover ? data.image || "" : undefined,
      largeImageText: activitySettings.showSource && dataTitle !== dataArtist && dataTitle !== sourceText ? sourceText : undefined,
      smallImageKey: artistIsMissingOrSame ? undefined : showSmallIcon ? favIcon || (data?.watching ? "watch" : "listen") : undefined,
      smallImageText: showSmallIcon ? sourceText : data?.watching ? "Watching" : "Listening",
      instance: false,
      statusDisplayType: StatusDisplayType.STATE,
    };

    if (activitySettings.showButtons) {
      const buttonsRaw = (data.buttons || []).filter((btn) => btn?.text?.trim() && isValidUrl(btn.link));

      const buttons = buttonsRaw.slice(0, 2).map((btn) => ({
        label: truncate(btn.text, 32),
        url: btn.link,
      }));

      if (buttons.length === 2) {
        activity.buttons = buttons;
      } else if (buttons.length === 1 && isValidUrl(data.songUrl)) {
        activity.buttons = [
          buttons[0],
          {
            label: truncate(`Open on ${data.source}`, 32),
            url: data.songUrl,
          },
        ];
      } else if (isValidUrl(data.songUrl)) {
        activity.buttons = [
          {
            label: truncate(`Open on ${data.source}`, 32),
            url: data.songUrl,
          },
        ];
      } else {
        delete activity.buttons;
      }

      activity.detailsUrl = data.songUrl;
    }

    if (duration > 0) {
      activity.startTimestamp = Math.floor(startTime / 1000);
      if (activitySettings.showTimeLeft) {
        activity.endTimestamp = Math.floor(endTime / 1000);
      }
    }

    if (!isSameActivity(activity, currentActivity)) {
      if (!isSameActivityIgnore(activity, currentActivity) && logSongUpdate) {
        console.log(`RPC Updated: ${activity.details} by ${activity.state} - ${getCurrentTime()}`);
      }
      await rpcClient.user?.setActivity(activity);
      currentActivity = activity;
    }

    startHealthCheckTimer();
    res.json({ success: true, action: "updated" });
  } catch (err) {
    console.error("RPC Update Error:", err);
    res.status(500).json({ error: "Internal server error" });
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
  startHealthCheckTimer();
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
  if (healthCheckTimeout) clearTimeout(healthCheckTimeout);

  healthCheckTimeout = setTimeout(() => {
    if (isRpcConnected && currentActivity) {
      rpcClient.user
        ?.clearActivity()
        .then(() => {
          if (logSongUpdate) {
            console.log("RPC cleared due to health timeout.");
          }
          currentActivity = null;
        })
        .catch(console.error);
    }
    lastActiveClient = null;
  }, CLIENT_TIMEOUT);
}

// Stuck activity cleanup
setInterval(async () => {
  if (lastActiveClient && lastActiveClient.timestamp && Date.now() - lastActiveClient.timestamp > STUCK_THRESHOLD) {
    console.log("Cleaned stale RPC activity.");

    currentActivity = null;

    try {
      await rpcClient?.user?.clearActivity();
    } catch (err) {
      console.error("Failed to clear RPC activity:", err);
    }

    lastActiveClient = null;
  }
}, STUCK_TIMEOUT);

// Shutdown
async function shutdown() {
  console.log("Shutting down...");
  isShuttingDown = true;

  if (healthCheckTimeout) clearTimeout(healthCheckTimeout);

  try {
    if (rpcClient) await rpcClient.destroy();
  } catch (err) {
    console.error("RPC destroy failed:", err);
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
if (process.env.ELECTRON_MODE === "true") {
  process.on("message", (msg) => msg === "shutdown" && shutdown());
  process.on("message", (msg) => {
    if (msg.type === "SET_LOG_SONG_UPDATE") {
      logSongUpdate = msg.value;
      console.log(`Logging song updates is ${logSongUpdate ? "enabled" : "disabled"}`);
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
