const { app, Tray, Menu, nativeImage, dialog, shell } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const log = require("./logger");
const fs = require("fs");
const { checkAndUpdate, startAutoUpdate } = require("./updater");

const config = {
  server: {
    PORT: 3000,
    START_TIMEOUT: 10000,
    HEALTH_CHECK_INTERVAL: 30000,
    MAX_RESTART_ATTEMPTS: 5,
    RESTART_DELAY: 5000,
  },
};

// State Management
const state = {
  tray: null,
  serverProcess: null,
  isServerRunning: false,
  isStopping: false,
  restartAttempts: 0,
  serverStartTime: null,
};

// App Ready
app.commandLine.appendSwitch("lang", "en-US");
app.whenReady().then(() => {
  try {
    initializeApp();

    // Schedule periodic update checks
    startAutoUpdate();

    // Initial update check
    checkAndUpdate();
  } catch (err) {
    handleCriticalError("App initialization failed", err);
  }
});

// Start Server
async function startServer() {
  if (state.serverProcess || state.isServerRunning) {
    log.warn("Server already running");
    return;
  }

  if (state.restartAttempts >= config.server.MAX_RESTART_ATTEMPTS) {
    log.error("Max restart attempts reached. Please check server configuration.");
    return;
  }

  const serverPath = path.join(__dirname, "server.js");
  log.info(`Starting server (attempt ${state.restartAttempts + 1}) at: ${serverPath}`);

  return new Promise((resolve, reject) => {
    state.serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        ELECTRON_MODE: "true",
        PORT: config.server.PORT,
        NODE_ENV: "production",
        LOG_LEVEL: "debug",
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      silent: false,
    });

    const readyTimeout = setTimeout(() => {
      log.warn("Server did not signal 'ready' in time");
      cleanupProcess();
      reject(new Error("Server startup timeout"));
    }, config.server.START_TIMEOUT);

    const cleanupProcess = () => {
      clearTimeout(readyTimeout);
      state.serverProcess = null;
    };

    state.serverProcess.on("message", (msg) => {
      if (msg === "ready") {
        clearTimeout(readyTimeout);
        state.isServerRunning = true;
        state.serverStartTime = Date.now();
        state.restartAttempts = 0;
        updateTrayMenu();
        log.info("Server started successfully");
        resolve();
      }
    });

    state.serverProcess.stdout.on("data", (data) => {
      const message = data.toString().trim();
      if (message) log.info("SERVER:", message);
    });

    state.serverProcess.stderr.on("data", (data) => {
      const message = data.toString().trim();
      if (message) log.error("SERVER ERROR:", message);
    });

    state.serverProcess.on("error", (err) => {
      log.error("Server process error:", err);
      cleanupProcess();
      reject(err);
      scheduleServerRestart();
    });

    state.serverProcess.on("exit", (code, signal) => {
      cleanupProcess();
      state.isServerRunning = false;
      updateTrayMenu();

      if (!signal && !state.isStopping) {
        log.warn(`Server exited unexpectedly with code ${code}`);
        scheduleServerRestart();
      } else {
        log.info("Server stopped normally");
      }
    });
  });
}

// Stop Server
async function stopServer() {
  if (!state.serverProcess) return;
  state.isStopping = true;

  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      if (state.serverProcess) {
        state.serverProcess.kill("SIGKILL");
      }
      resolve();
    }, 3000);

    state.serverProcess.once("exit", () => {
      clearTimeout(killTimeout);
      state.isStopping = false;
      resolve();
    });

    state.serverProcess.send("shutdown");
  });
}

// Restart Server
async function restartServer() {
  log.info("Initiating server restart...");
  try {
    await stopServer();
    await startServer();
    log.info("Server restarted successfully");
  } catch (err) {
    log.error("Server restart failed:", err);
    throw err;
  }
}

// Server Restart Scheduling
function scheduleServerRestart() {
  if (state.restartAttempts >= config.server.MAX_RESTART_ATTEMPTS) {
    log.error("Max restart attempts reached. Manual intervention required.");
    return;
  }

  state.restartAttempts++;
  const delay = config.server.RESTART_DELAY * state.restartAttempts;

  log.info(`Scheduling server restart in ${delay / 1000} seconds (attempt ${state.restartAttempts})`);

  setTimeout(() => {
    startServer().catch((err) => {
      log.error("Scheduled restart failed:", err);
    });
  }, delay);
}

// Single instance lock
function setupSingleInstanceLock() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }

  app.on("second-instance", () => {
    log.info("Another instance attempted to run - focusing existing instance");
    if (state.tray) {
      state.tray.popUpContextMenu();
    }
  });
}

// Initialize the application
function initializeApp() {
  try {
    app.setAppUserModelId("com.kanashiidev.discord.music.rpc");
    setupSingleInstanceLock();
    createTray();
    startServer().catch((err) => {
      log.error("Initial server start failed:", err);
      scheduleServerRestart();
    });
  } catch (err) {
    handleCriticalError("Initialization failed", err);
  }
}

// Tray Menu
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Status: ${state.isServerRunning ? "Running" : "Stopped"}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Restart Server",
      click: () =>
        restartServer().catch((err) => {
          dialog.showErrorBox("Restart Error", err.message);
        }),
    },
    {
      label: state.isServerRunning ? "Stop Server" : "Start Server",
      click: () => (state.isServerRunning ? stopServer() : startServer()),
    },
    { type: "separator" },
    {
      label: "Run at Startup",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) =>
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          openAsHidden: true,
        }),
    },
    {
      label: "Check for Updates",
      click: () => {
        log.info("Manual update check triggered by user");
        checkAndUpdate()
          .then((result) => {
            if (result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()) {
              dialog.showMessageBox({
                type: "info",
                buttons: ["OK"],
                title: "Discord Music RPC - Update Available",
                message: `A new version (${result.updateInfo.version}) is available.`,
                detail: "The update will download and install in the background.",
                icon: path.join(__dirname, "assets", "icon", "icon.ico"),
              });
            } else {
              dialog.showMessageBox({
                type: "info",
                buttons: ["OK"],
                title: "Discord Music RPC - Up to Date",
                message: "You're using the latest version.",
                detail: `Version: ${app.getVersion()}`,
                icon: path.join(__dirname, "assets", "icon", "icon.ico"),
              });
            }
          })
          .catch((err) => {
            log.error("Manual update check failed:", err);
            dialog.showMessageBox({
              type: "error",
              buttons: ["OK"],
              title: "Discord Music RPC - Update Check Failed",
              message: "Could not check for updates.",
              detail: err.message,
              icon: path.join(__dirname, "assets", "icon", "icon.ico"),
            });
          });
      },
    },
    {
      label: "Open Logs",
      click: () => openLogs(),
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => app.quit(),
    },
  ]);

  if (state.tray) {
    state.tray.setContextMenu(contextMenu);
    state.tray.setToolTip(`Music RPC\nStatus: ${state.isServerRunning ? "Running" : "Stopped"}`);
  }
}

// Create tray
function createTray() {
  try {
    const iconPath = path.join(__dirname, "assets", "icon", "icon.ico");
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    state.tray = new Tray(trayIcon);
  } catch (error) {
    log.error("Tray icon creation failed, using empty icon:", error);
    state.tray = new Tray(nativeImage.createEmpty());
  }

  state.tray.on("click", () => state.tray.popUpContextMenu());
  updateTrayMenu();
}

// Open Logs
function openLogs() {
  const logPath = log.transports.file.getFile().path;

  if (!fs.existsSync(logPath)) {
    dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      title: "Log File",
      message: "Log file does not exist yet",
      detail: "The application needs to run for a while to generate logs.",
    });
    return;
  }

  shell.openPath(logPath).catch((err) => {
    log.error("Failed to open logs:", err);
    dialog.showErrorBox("Error", "Could not open log file. Try viewing it manually at: " + logPath);
  });
}

// Handle Errors
function handleCriticalError(message, error) {
  log.error(message, error);

  const dialogOptions = {
    type: "error",
    buttons: ["OK", "Open Logs"],
    title: "Application Error",
    message: `${message}: ${error.message}`,
    detail: error.stack,
  };

  dialog.showMessageBox(dialogOptions).then(({ response }) => {
    if (response === 1) {
      openLogs();
    }
    app.quit();
  });
}

// Cleanup on quit
app.on("before-quit", async () => {
  log.info("Application quitting...");
  await stopServer();
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  handleCriticalError("Uncaught Exception", err);
});

process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled rejection at:", promise, "reason:", reason);
});
