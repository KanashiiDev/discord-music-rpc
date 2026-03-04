const path = require("path");
const express = require("express");
const cors = require("cors");

const { detectElectronMode } = require("./utils.js");
const IS_ELECTRON = detectElectronMode();
process.env.ELECTRON_MODE = IS_ELECTRON ? "true" : "false";

const { state } = require("./rpc/state.js");
const { connectRPC, destroyClient } = require("./rpc/client.js");
const { resetActivityState } = require("./rpc/activity.js");
const { startHealthCheckTimer } = require("./services/healthCheck.js");
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

// Shutdown
async function shutdown() {
  if (state.isShuttingDown) return state.shutdownPromise;
  state.isShuttingDown = true;

  state.shutdownPromise = (async () => {
    console.log("[SERVER] Shutdown initiated...");
    try {
      resetActivityState(historyFilePath);

      if (state.healthCheckInterval) {
        clearInterval(state.healthCheckInterval);
        state.healthCheckInterval = null;
        console.log("[SERVER] Health check cleared");
      }

      if (state.rpcClient) {
        console.log("[SERVER] Clearing RPC activity...");
        await state.rpcClient.user?.clearActivity().catch(() => {});
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

          state.serverInstance.close((err) => {
            if (err && err.code !== "ERR_SERVER_NOT_RUNNING") {
              console.warn("HTTP close error:", err.message);
            }
            safeResolve();
          });

          setTimeout(() => {
            console.warn("HTTP close timeout");
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

// Start
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
