const express = require("express");
const cors = require("cors");
const { Client } = require("@xhayper/discord-rpc");

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

function setupRpcListeners(client) {
  client.removeAllListeners();

  client.on("disconnected", () => {
    isRpcConnected = false;
    isConnecting = false;

    if (!isShuttingDown) {
      console.warn("RPC disconnected. Attempting reconnect...");
      connectRPC().catch(console.error);
    }
  });
}

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
          console.warn("Failed to cleanly destroy RPC client:", err.message);
        }
        rpcClient = null;
        global.gc?.();
      }

      rpcClient = createClient();
      if (attempt <= 3 || attempt % 10 === 0) {
        console.log(`Connecting to RPC (attempt ${attempt})...`);
      }
      await Promise.race([rpcClient.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);

      isRpcConnected = true;
      console.log("RPC connected");
      return true;
    } catch (err) {
      if (attempt <= 3 || attempt % 10 === 0) {
        console.error(`RPC connection failed (attempt #${attempt}): ${err.message}`);
        console.log(`Retrying every ${RETRY_DELAY / 1000} seconds.`);
      }
      if (attempt === 4) console.log("RPC connection still fails. The log will now be sent every 10 attempts to avoid unnecessary logs.");
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    } finally {
      isConnecting = false;
    }
  }

  return false;
}

// Health check timer
function startHealthCheckTimer() {
  if (healthCheckTimeout) {
    clearTimeout(healthCheckTimeout);
    healthCheckTimeout = null;
  }

  if (currentActivity) {
    healthCheckTimeout = setTimeout(async () => {
      if (isRpcConnected) {
        try {
          await rpcClient.user?.clearActivity();
          currentActivity = null;
          console.log("No health check in 30s. Activity cleared.");
        } catch (err) {
          console.error("Error clearing RPC:", err);
        }
      }
    }, CLIENT_TIMEOUT);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

function getCurrentTime() {
  const now = new Date();
  return [now.getHours().toString().padStart(2, "0"), now.getMinutes().toString().padStart(2, "0"), now.getSeconds().toString().padStart(2, "0")].join(":");
}

function isSameActivity(a, b) {
  return a && b && a.details === b.details && a.state === b.state && a.startTimestamp === b.startTimestamp && a.endTimestamp === b.endTimestamp;
}

function isSameActivityIgnore(a, b) {
  return a && b && a.details === b.details && a.state === b.state;
}

function truncate(str, maxLength = 128, { prefix = "", fallback = "Unknown", minLength = 2 } = {}) {
  if (!str) str = "";
  const cleanRegex = /[\[(]\s*(free\s+(download|song|now)|download\s+(free|now))\s*[\])]/gi;
  str = str.replace(cleanRegex, "").trim();
  let result = str.length > maxLength ? str.slice(0, maxLength - 3) + "..." : str;
  if (result.length < minLength) result = prefix + fallback;
  return result;
}

function cleanTitle(song, artist) {
  const escapedArtist = artist.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`^\\s*${escapedArtist}\\s*[-–:|]?\\s*`, "i");
  return song.replace(regex, "").trim();
}

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

    let dataTitle = truncate(data?.title, 128, { prefix: "Title: ", fallback: "Unknown Song" });
    let dataArtist = truncate(data?.artist, 128, { prefix: "Artist: ", fallback: "Unknown Artist" });

    if (dataTitle && dataArtist) {
      dataTitle = cleanTitle(dataTitle, dataArtist);
    }

    const activity = {
      details: dataTitle,
      state: dataArtist,
      type: data?.watching ? 3 : 2,
      largeImageKey: data.image || "",
      largeImageText: truncate(data?.source, 32, { prefix: "Source: ", fallback: "Unknown Source" }),
      smallImageKey: data?.watching ? "watch" : "listen",
      smallImageText: data?.watching ? "Watching" : "Listening",
      ...(duration > 0 && {
        startTimestamp: Math.floor(startTime / 1000),
        endTimestamp: Math.floor(endTime / 1000),
      }),
      buttons: data.songUrl ? [{ label: truncate(`Open on ${data.source}`, 32), url: data.songUrl }] : undefined,
      instance: false,
    };

    if (!isSameActivity(activity, currentActivity)) {
      if (!isSameActivityIgnore(activity, currentActivity)) {
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
      console.log(`RPC Cleared`);
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

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (process.env.ELECTRON_MODE === "true" && process.send) process.send("ready");
  connectRPC().catch(console.error);
});

// Initial connection
connectRPC().catch(console.error);

// Stuck activity cleanup
setInterval(() => {
  if (lastActiveClient && Date.now() - lastActiveClient.timestamp > STUCK_THRESHOLD) {
    console.log("Cleaned stale RPC activity.");
    currentActivity = null;
    rpcClient.user?.clearActivity().catch(console.error);
    lastActiveClient = null;
  }
}, STUCK_TIMEOUT);
