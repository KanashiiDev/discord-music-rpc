const express = require("express");
const cors = require("cors");
const { Client, StatusDisplayType } = require("@xhayper/discord-rpc");

const app = express();
const PORT = 3000;
const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000; // 10 seconds
const CLIENT_TIMEOUT = 20000; // 20 seconds
const STUCK_TIMEOUT = 60000; // 60 seconds
const STUCK_THRESHOLD = 90000; // 90 seconds
const logSongUpdate = false;

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

  const keywordGroup = [
    "free\\s+(download|dl|song|now)",
    "download\\s+(free|now)",
    "official(\\s+(video|music\\s+video|audio|lyric\\s+video|visualizer))?",
    "lyric\\s+video|lyrics?|music\\s+video|out\\s+now",
    "hd|hq|4k|1080p|720p|mp3|mp4|320kbps|flac",
    "extended\\s+remix|radio\\s+edit|club\\s+mix|party\\s+mix|mixed\\s+by\\s+dj|live(\\s+performance)?",
    "cover|karaoke|instrumental|backing\\s+track|vocals\\s+only",
    "teaser|trailer|promo|bootleg|mashup",
    "now\\s+available|full\\s+song|full\\s+version|complete\\s+version|original\\s+version|radio\\s+version",
    "explicit|clean\\s+version|copyright\\s+free|royalty\\s+free|no\\s+copyright|creative\\s+commons|cc",
    "official\\s+trailer|official\\s+teaser|[\\w\\s'’\\-]+\\s+premiere",
  ].join("|");

  const cleanRegex = new RegExp(`([\\[\\(]\\s*(${keywordGroup})\\s*[\\]\\)])|(\\s*-\\s*(${keywordGroup})\\s*$)`, "gi");
  str = str.replace(cleanRegex, "").replace(/\s+/g, " ").trim();

  let result = str.length > maxLength ? str.slice(0, maxLength - 3) + "..." : str;
  if (result.length < minLength) result = prefix + fallback;
  return result;
}

function cleanTitle(title, artist) {
  const trimmedTitle = title.trim();
  const trimmedArtist = artist.trim();

  if (trimmedTitle.toLowerCase() === trimmedArtist.toLowerCase()) {
    return trimmedTitle;
  }

  const artistListRaw = trimmedArtist
    .split(/,|&|feat\.?|featuring/gi)
    .map((a) => a.trim())
    .filter((a) => a.length >= 3);

  if (artistListRaw.length === 0) return trimmedTitle;

  const artistList = artistListRaw.map((a) => a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^(${artistList.join("|")})(\\s*[&+,xX]\\s*(${artistList.join("|")}))*\\s*[-–:|.]?\\s*`, "i");
  const cleaned = trimmedTitle.replace(pattern, "").trim();

  return cleaned.length > 0 ? cleaned : trimmedTitle;
}

function extractArtistFromTitle(title, originalArtist) {
  const pattern = /^(.+?)\s*-\s*/;
  const match = title.match(pattern);
  if (match) {
    const extracted = match[1].trim();
    const origLower = originalArtist.toLowerCase();
    const extractedLower = extracted.toLowerCase();

    if (extractedLower !== origLower && (extractedLower.includes(origLower) || origLower.includes(extractedLower)) && extracted.length > originalArtist.length) {
      return extracted;
    }
  }
  return originalArtist;
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

    let dataTitle = data?.title || "";
    let dataArtist = data?.artist || "";
    let settings = data?.settings;

    if (dataTitle && dataArtist) {
      dataArtist = extractArtistFromTitle(dataTitle, dataArtist);
      dataTitle = cleanTitle(dataTitle, dataArtist);
    }

    dataTitle = truncate(dataTitle, 128, { prefix: "Title: ", fallback: "Unknown Song" });
    dataArtist = truncate(dataArtist, 128, { prefix: "Artist: ", fallback: "Unknown Artist" });

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

    const activity = {
      details: dataTitle,
      state: dataArtist,
      type: data?.watching ? 3 : 2,
      largeImageKey: activitySettings.customCover && activitySettings.customCoverUrl ? activitySettings.customCoverUrl : activitySettings.showCover ? data.image || "" : undefined,
      largeImageText: activitySettings.showSource ? truncate(data?.source, 32, { prefix: "Source: ", fallback: "Unknown Source" }) : undefined,
      smallImageKey: showSmallIcon ? favIcon || (data?.watching ? "watch" : "listen") : undefined,
      smallImageText: showSmallIcon ? truncate(data?.source, 32, { prefix: "Source: ", fallback: "Unknown Source" }) : data?.watching ? "Watching" : "Listening",
      instance: false,
      statusDisplayType: StatusDisplayType.STATE,
    };

    if (activitySettings.showButtons && data.songUrl) {
      activity.buttons = [
        {
          label: truncate(`Open on ${data.source}`, 32),
          url: data.songUrl,
        },
      ];
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
      if (logSongUpdate) console.log(`RPC Cleared`);
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
