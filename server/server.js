const path = require("path");
const express = require("express");
const cors = require("cors");

const { detectElectronMode } = require("./utils.js");
const IS_ELECTRON = detectElectronMode();
process.env.ELECTRON_MODE = IS_ELECTRON ? "true" : "false";

const { state } = require("./rpc/state.js");
const { connectRPC, destroyClient, cancelReconnect } = require("./rpc/client.js");
const { resetActivityState } = require("./rpc/activity.js");
const { startHealthCheckTimer, stopHealthCheckTimer } = require("./services/healthCheck.js");
const { sendReady } = require("./services/electron.js");
const { createRpcRouter } = require("./routes/rpc.js");
const { createHistoryRouter } = require("./routes/history.js");
const { createSettingsRouter } = require("./routes/settings.js");

// Singleton Guard
if (global.__SERVER_INSTANCE_RUNNING__) {
  console.error("[SERVER] Already running in this process!");
  process.exit(1);
}
global.__SERVER_INSTANCE_RUNNING__ = true;
process.on("exit", () => {
  global.__SERVER_INSTANCE_RUNNING__ = false;
});

// Environment
const PORT = IS_ELECTRON ? Number(process.env.PORT) || 3000 : 3000;
const settingsFilePath = process.env.SETTINGS_FILE_PATH;
const logFilePath = process.env.LOG_FILE_PATH;
const historyFilePath = process.env.HISTORY_FILE_PATH;

console.log("[SERVER] Starting Discord MUSIC RPC Server");
console.log(`[SERVER] Port: ${PORT} | Electron: ${process.env.ELECTRON_MODE} | ` + `Platform: ${process.platform} | Node: ${process.version}`);

// Express App
const app = express();
const publicPath = path.join(__dirname, "public");
const sharedPath = path.join(__dirname, "..", "shared");

app.use(express.static(publicPath));
app.use("/shared", express.static(sharedPath));
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.use("/", createRpcRouter(historyFilePath));
app.use("/", createHistoryRouter(historyFilePath, logFilePath));
app.use("/", createSettingsRouter(settingsFilePath));

app.get("/", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    rpcConnected: state.isRpcConnected,
    reconnectScheduled: state.reconnectState?.scheduled || false,
    isConnecting: state.isConnecting,
    lastActiveClient: state.lastActiveClient
      ? {
          clientId: state.lastActiveClient.clientId,
          activeSince: new Date(state.lastActiveClient.timestamp).toISOString(),
          secondsAgo: Math.floor((Date.now() - state.lastActiveClient.timestamp) / 1000),
        }
      : null,
  }),
);

app.get("/status", (_req, res) =>
  res.json({
    status: "ok",
    rpcConnected: state.isRpcConnected,
    electronMode: process.env.ELECTRON_MODE,
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
  }),
);

app.get("/proxy", async (req, res) => {
  try {
    const targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send("Missing url");
    }

    const response = await fetch(targetUrl);

    if (!response.ok) {
      return res.status(response.status).send("Failed to fetch resource");
    }

    res.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.set("Access-Control-Allow-Origin", "*");

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.status(500).send("Proxy error");
  }
});

// Shutdown
async function shutdown() {
  if (state.isShuttingDown) return state.shutdownPromise;
  state.isShuttingDown = true;

  state.shutdownPromise = (async () => {
    console.log("[SERVER] Shutdown initiated...");

    try {
      cancelReconnect();
      stopHealthCheckTimer();
      resetActivityState(historyFilePath);

      // Clean up RPC client
      if (state.rpcClient) {
        console.log("[SERVER] Clearing RPC activity...");
        try {
          await state.rpcClient.user?.clearActivity();
        } catch (_) {
          // Ignore during shutdown
        }

        console.log("[SERVER] Destroying RPC client...");
        await destroyClient(state.rpcClient);
        state.rpcClient = null;
      }

      // Close HTTP server
      if (state.serverInstance) {
        console.log("[SERVER] Closing HTTP server...");

        // Close all sockets
        state.serverInstance.closeIdleConnections?.();

        await new Promise((resolve) => {
          let resolved = false;

          const safeResolve = () => {
            if (resolved) return;
            resolved = true;
            resolve();
          };

          // Try graceful close
          state.serverInstance.close((err) => {
            if (err && err.code !== "ERR_SERVER_NOT_RUNNING") {
              console.warn("HTTP close error:", err.message);
            }
            safeResolve();
          });

          // Timeout protection - prevents hanging on keep-alive connections
          setTimeout(() => {
            console.warn("HTTP close timeout, forcing exit");
            safeResolve();
          }, 5000);
        });

        state.serverInstance = null;
      }

      console.log("[SERVER] Cleanup complete");
    } catch (err) {
      console.error("[SERVER] Shutdown error:", err.message);
    } finally {
      // Send a signal to the parent process
      if (process.send) {
        try {
          process.send("shutdown-complete");
        } catch (_) {}
      }

      process.exitCode = 0;
      setImmediate(() => process.exit());
    }
  })();

  return state.shutdownPromise;
}

// Process Signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => {
  console.error("[SERVER] Uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[SERVER] Unhandled rejection:", reason);
  process.exit(1);
});
process.on("exit", (code) => {
  if (code !== 0) console.log("[SERVER] Exit with code:", code);
});

if (IS_ELECTRON) {
  process.on("message", (msg) => {
    if (msg === "shutdown") {
      shutdown();
      return;
    }
    if (msg?.type === "UPDATE_SETTINGS") {
      state.serverSettings = { ...state.serverSettings, ...msg.value };
    }
  });
}

// Start Server
state.serverInstance = app.listen(PORT, () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  sendReady();
  connectRPC().catch((err) => console.error("[SERVER] Initial RPC connect failed:", err.message));
  startHealthCheckTimer(historyFilePath);
});

state.serverInstance.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[SERVER] FATAL: Port ${PORT} already in use — another instance may be running`);
  } else {
    console.error("[SERVER] Fatal error:", err.message);
  }
  process.exit(1);
});
