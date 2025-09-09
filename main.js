const { app, Tray, Menu, Notification, MenuItem, nativeImage, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const JSONdb = require("simple-json-db");
const userDataPath = app.getPath("userData");
const dbPath = path.join(userDataPath, "config.json");
const store = new JSONdb(dbPath);
const { fork } = require("child_process");
const log = require("./logger");
const fs = require("fs");
const os = require("os");

const config = {
  server: {
    PORT: 3000,
    START_TIMEOUT: 10000,
    UPDATE_CHECK_INTERVAL: 3600000,
    MAX_RESTART_ATTEMPTS: 5,
    RESTART_DELAY: 5000,
  },
};

// State Management
const state = {
  tray: null,
  updateAvailable: false,
  serverProcess: null,
  isServerRunning: false,
  isStopping: false,
  restartAttempts: 0,
  serverStartTime: null,
  logSongUpdate: store.get("logSongUpdate") || false,
  isRPCConnected: false,
};

// Force English Locale
app.commandLine.appendSwitch("lang", "en-US");

// App Optimizations
app.commandLine.appendSwitch("disable-gpu");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=128 --expose-gc");
app.commandLine.appendSwitch("no-sandbox");

// Auto Updater Menu Item
const updateMenuItem = new MenuItem({
  label: "New Update - Click to Install",
  visible: false,
  click: () => autoUpdater.quitAndInstall(),
});
const updateMenuItemSeparator = new MenuItem({
  type: "separator",
  visible: false,
});

// App Ready
app.whenReady().then(() => {
  try {
    initializeApp();
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
      if (msg.type === "RPC_STATUS") {
        state.isRPCConnected = msg.value;
        updateTrayMenu();
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
    const timeoutDuration = Math.min(3000, state.serverStartTime ? Date.now() - state.serverStartTime : 3000);
    const killTimeout = setTimeout(() => {
      if (state.serverProcess) {
        state.serverProcess.kill("SIGKILL");
      }
      resolve();
    }, timeoutDuration);

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
    setupAutoUpdater();
    startServer().catch((err) => {
      log.error("Initial server start failed:", err);
      scheduleServerRestart();
    });
  } catch (err) {
    handleCriticalError("Initialization failed", err);
  }
}

// Auto Updater Setup
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("update-downloaded", (info) => {
    updateAvailable = true;
    const platform = os.release().split(".")[0];
    const isWin10OrLater = parseInt(platform, 10) >= 10;

    if (process.platform === "win32" && !isWin10OrLater) {
      // Windows 7/8 Tray Balloon
      state.tray.displayBalloon({
        icon: path.join(__dirname, "assets", "icon", "icon.ico"),
        title: `Update ${info.version} ready`,
        content: "Click to install",
      });
    } else {
      // Windows 10/11 - Modern Notification
      const notification = new Notification({
        title: `Update ${info.version} ready`,
        body: "Click to install",
        icon: path.join(__dirname, "assets", "icon", "icon.ico"),
      });

      notification.on("click", () => autoUpdater.quitAndInstall());
      notification.show();
    }

    // Add the update to the tray menu
    updateMenuItem.visible = true;
    updateMenuItemSeparator.visible = true;
    updateTrayMenu();
  });
  autoUpdater.checkForUpdates().catch((err) => {
    log.error("Update check failed:", err);
  });
}

// Tray Menu
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Version: ${app.getVersion()}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: state.isServerRunning ? "Stop Server" : "Start Server",
      click: () => (state.isServerRunning ? stopServer() : startServer()),
    },
    {
      label: "Restart Server",
      click: () =>
        restartServer().catch((err) => {
          dialog.showErrorBox("Restart Error", err.message);
        }),
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
      click: async () => {
        try {
          log.info("Manual update check triggered by user");
          const result = await autoUpdater.checkForUpdates();
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
        } catch (err) {
          log.error("Manual update check failed:", err);
          dialog.showMessageBox({
            type: "error",
            buttons: ["OK"],
            title: "Discord Music RPC - Update Check Failed",
            message: "Could not check for updates.",
            detail: err.message,
            icon: path.join(__dirname, "assets", "icon", "icon.ico"),
          });
        }
      },
    },
    {
      label: "Debug",
      submenu: [
        {
          label: `Status: ${state.isServerRunning ? "Running" : "Stopped"}`,
          enabled: false,
        },
        {
          label: `RPC: ${state.isRPCConnected ? "Connected" : "Disconnected"}`,
          enabled: false,
        },
        { type: "separator" },
        { label: "Open Logs", click: () => openLogs() },
        {
          label: "Log Song Updates",
          type: "checkbox",
          checked: state.logSongUpdate,
          click: (item) => {
            state.logSongUpdate = item.checked;
            store.set("logSongUpdate", state.logSongUpdate);
            if (state.serverProcess) {
              state.serverProcess.send({
                type: "SET_LOG_SONG_UPDATE",
                value: state.logSongUpdate,
              });
            }
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => app.quit(),
    },
  ]);

  if (state.tray) {
    state.tray.setContextMenu(contextMenu);
    contextMenu.append(updateMenuItem, updateMenuItemSeparator);
    state.tray.setToolTip(`Discord Music RPC\nStatus: ${state.isServerRunning ? "Running" : "Stopped"}\nRPC: ${state.isRPCConnected ? "Connected" : "Disconnected"}`);
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

// App Exit Handling
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

// Background update checks
if (app.isPackaged) {
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => log.error("Background update check failed:", err));
  }, config.server.UPDATE_CHECK_INTERVAL);
}
