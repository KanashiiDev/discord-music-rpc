const { app, Tray, Menu, Notification, MenuItem, nativeImage, dialog, shell } = require("electron");
let isAppInitialized = false;

// Force English Locale
app.commandLine.appendSwitch("lang", "en-US");

// App Optimizations
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-ipc-flooding-protection");
app.commandLine.appendSwitch("disable-extensions");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("disable-sync");
app.commandLine.appendSwitch("disable-default-apps");
app.commandLine.appendSwitch("disable-translate");
app.commandLine.appendSwitch("disable-plugins");
app.commandLine.appendSwitch("disable-speech-api");
app.commandLine.appendSwitch("disable-print-preview");
app.commandLine.appendSwitch("disable-pdf-extension");
app.commandLine.appendSwitch("no-default-browser-check");
app.commandLine.appendSwitch("disable-hang-monitor");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=192 --optimize-for-size --expose-gc --gc-interval=100");

// Linux-specific optimizations
if (process.platform === "linux") {
  // Wayland/X11 handling
  if (process.env.XDG_SESSION_TYPE === "wayland") {
    app.commandLine.appendSwitch("enable-features", "UseOzonePlatform,WaylandWindowDecorations");
    app.commandLine.appendSwitch("ozone-platform", "wayland");
  } else {
    app.commandLine.appendSwitch("ozone-platform", "x11");
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
  }
  // Tray icon support
  app.commandLine.appendSwitch("enable-features", "AppIndicator,Unity");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}

// Windows-specific optimizations
if (process.platform === "win32") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
}

// MacOS-specific optimizations
if (process.platform === "darwin") {
  app.appNap.disable();
}

const { autoUpdater } = require("electron-updater");
const semver = require("semver");
const path = require("path");
let userDataPath;
let dbPath;
let logFilePath;
let historyFilePath;
const ConfigManager = require("./scripts/configManagement");
const { log, configureLogging, logStartupTimeout } = require("./scripts/electron-log");
let config;
const fs = require("fs");
const os = require("os");
const isPackaged = app.isPackaged;

// Wrap console methods to avoid uncaught write errors (EIO) in packaged environments.
// This will swallow EIO write errors and attempt to surface a short warning via electron-log (if available).
(function safeConsoleWrap() {
  const methods = ["log", "info", "error"];
  for (const m of methods) {
    const orig = console[m];
    if (!orig || typeof orig !== "function") continue;
    console[m] = function (...args) {
      try {
        return orig.apply(console, args);
      } catch (err) {
        try {
          if (err && err.code === "EIO") {
            // Suppress EIO - try to record it to electron-log without throwing.
            if (log && typeof log.warn === "function") {
              try {
                // convert args to short string
                const msg = args.map(a => (typeof a === "string" ? a : String(a))).join(" ");
                log.warn(`Console write EIO suppressed: ${msg}`);
              } catch (_) {}
            }
            return;
          }
        } catch (_) {
          // ignore any secondary errors while attempting diagnostics
        }
        // If it's a different error or we couldn't handle it, swallow to avoid crashing the app.
      }
    };
  }
})();

// State Management
const state = {
  tray: null,
  serverProcess: null,
  isServerRunning: false,
  isStopping: false,
  isStoppingPromise: null,
  isRestarting: false,
  isRestartingPromise: null,
  restartAttempts: 0,
  serverStartTime: null,
  isRPCConnected: false,
};

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

function getPath(...p) {
  const targetPath = path.join(...p);

  if (!isPackaged) {
    return path.join(__dirname, targetPath);
  }

  const possiblePaths = [
    path.join(process.resourcesPath, "build_deps", targetPath),
    path.join(process.resourcesPath, targetPath),
    path.join(path.dirname(process.execPath), "resources", "build_deps", targetPath),
    path.join(app.getAppPath(), targetPath),
  ];

  for (const serverPath of possiblePaths) {
    if (fs.existsSync(serverPath)) {
      return serverPath;
    }
  }

  throw new Error(`${targetPath} not found`);
}

function getIconPath(size = null) {
  let baseDir = getPath("assets", "icon");
  let fileName;

  switch (process.platform) {
    case "win32":
      fileName = size || "icon.ico";
      break;

    case "darwin":
      fileName = "24x24.png";
      break;

    default:
      fileName = "48x48.png";
      break;
  }

  const iconPath = path.join(baseDir, fileName);

  if (!fs.existsSync(iconPath)) {
    log.warn(`Tray icon not found: ${iconPath}`);

    // Fallback icon
    const fallbackPath = path.join(baseDir, "icon.png");
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }

    return null;
  }

  return iconPath;
}

const icons = {
  notification: getIconPath(),
  message: getIconPath("32x32.png"),
  tray: getIconPath("24x24.png"),
  tray_win: getIconPath("16x16.png"),
};

function logToFile(error, type = "UnknownError") {
  let errors = [];
  if (fs.existsSync(logFilePath)) {
    try {
      errors = JSON.parse(fs.readFileSync(logFilePath, "utf-8"));
    } catch {
      errors = [];
    }
  }

  const entry = {
    timestamp: new Date().toISOString(),
    type,
    message: error.message || String(error),
    stack: error.stack || null,
  };

  errors.push(entry);
  fs.writeFileSync(logFilePath, JSON.stringify(errors, null, 2));
}

function setupSingleInstanceLock() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }

  app.on("second-instance", () => {
    if (state.tray) {
      state.tray.popUpContextMenu();
    }
  });
}

setupSingleInstanceLock();

// App Ready
app.whenReady().then(async () => {
  // Prevent restarting a second time
  if (isAppInitialized) {
    log.warn("App already initialized, skipping duplicate initialization");
    return;
  }

  isAppInitialized = true;
  log.info("App initialization started");

  try {
    await initializeApp();
    // Start background update checks
    if (app.isPackaged && config.AUTO_UPDATE_CHECK) {
      setInterval(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          const msg = typeof err?.message === "string" ? err.message.split("\n")[0].trim() : String(err);
          log.error("Background update check failed: " + msg);
        });
      }, config.UPDATE_CHECK_INTERVAL);
    }
  } catch (err) {
    handleCriticalError("App initialization failed", err);
  }
});

// Start Server
async function startServer() {
  const { fork } = require("child_process");
  const serverPath = getPath("server.js");
  if (!config.KEEP_LOGS) fs.writeFileSync(logFilePath, JSON.stringify([], null, 2));
  if (!config.KEEP_HISTORY) fs.writeFileSync(historyFilePath, JSON.stringify([], null, 2));

  ConfigManager.refreshConfig();

  // Do not restart if the server is already running
  if (state.serverProcess || state.isServerRunning) {
    log.warn("Server already running or starting, skipping duplicate start");
    return;
  }

  if (state.restartAttempts >= config.MAX_RESTART_ATTEMPTS) {
    log.error("Max restart attempts reached. Please check server configuration.");
    return;
  }

  log.info(`Starting server (attempt ${state.restartAttempts + 1}) at: ${serverPath}`);

  // Check that the server file is accessible
  if (!fs.existsSync(serverPath)) {
    log.error(`Server file not found: ${serverPath}`);
    return Promise.reject(new Error("Server file not found"));
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    state.serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: config.PORT,
        NODE_ENV: "production",
        LOG_LEVEL: log.transports.file.level || "debug",
        LOG_FILE_PATH: logFilePath,
        HISTORY_FILE_PATH: historyFilePath,
        SETTINGS_FILE_PATH: dbPath,
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      silent: false,
    });

    log.info(`Server process started (PID: ${state.serverProcess.pid})`);

    const readyTimeout = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      try {
        const pid = state.serverProcess && state.serverProcess.pid ? state.serverProcess.pid : null;
        logStartupTimeout({ elapsed, serverPath, pid, env: { PORT: config.PORT } });
      } catch (diagErr) {
        // If diagnostics fail, ensure we still continue with shutdown and log a short warning.
        try {
          log.warn("Failed to record startup diagnostic:", diagErr && diagErr.message);
        } catch (_) {}
      }
      log.warn(`Server startup timeout after ${elapsed}ms`);
      if (state.serverProcess && !state.serverProcess.killed) {
        try {
          state.serverProcess.kill("SIGTERM");
        } catch (err) {
          try {
            log.warn("Failed to kill server process on startup timeout:", err && err.message);
          } catch (_) {}
        }
      }
      cleanupProcess();
      reject(new Error("Server startup timeout"));
    }, config.START_TIMEOUT);

    const cleanupProcess = () => {
      clearTimeout(readyTimeout);
      state.serverProcess = null;
    };

    state.serverProcess.on("message", (msg) => {
      if (msg === "ready") {
        clearTimeout(readyTimeout);
        const elapsedTime = Date.now() - startTime;
        state.isServerRunning = true;
        state.serverStartTime = Date.now();
        state.restartAttempts = 0;
        updateTrayMenu();
        updateServerSettings();
        log.info(`Server ready in ${elapsedTime}ms`);
        resolve();
      }
      if (msg.type === "RPC_STATUS") {
        state.isRPCConnected = msg.value;
        updateTrayMenu();
      }
      if (msg === "RESTART_SERVER") {
        restartServer();
      }
      if (msg === "RESET_CONFIG") {
        ConfigManager.resetConfig();
      }
    });

    state.serverProcess.stdout.on("data", (data) => {
      if (data) {
        log.info("SERVER:", data.toString().trim());
        logToFile(data.toString().trim(), "info");
      }
    });

    state.serverProcess.stderr.on("data", (data) => {
      if (data) {
        log.info("SERVER ERROR:", data.toString().trim());
        logToFile(data.toString().trim(), "error");
      }
    });

    state.serverProcess.on("error", (err) => {
      log.error("Server process error:", err);
      logToFile(err.stack || err.message, "error");
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
        if (code !== 0 && code !== 1) {
          scheduleServerRestart();
        } else if (code === 1) {
          log.error("Server failed to start (exit code 1). Check logs for details.");
        }
      } else {
        log.info("Server stopped normally");
      }
    });
  });
}

// Stop Server
async function stopServer() {
  if (!state.serverProcess) {
    log.info("No server process to stop.");
    return;
  }

  if (state.isStopping) {
    log.info("Stop already in progress...");
    return state.isStoppingPromise;
  }

  log.info("Stopping server...");
  state.isStopping = true;

  state.isStoppingPromise = new Promise((resolve) => {
    const proc = state.serverProcess;

    let resolved = false;

    function safeResolve() {
      if (resolved) return;
      resolved = true;
      state.isStopping = false;
      state.serverProcess = null;
      state.isServerRunning = false;
      resolve();
    }

    // Wait for the server to exit
    proc.once("exit", (code, signal) => {
      log.info(`Server exited (code=${code}, signal=${signal}).`);
      safeResolve();
    });

    // send the shutdown message
    try {
      if (!proc.killed) {
        proc.send("shutdown");
      }
    } catch (err) {
      log.warn("Could not send shutdown message:", err.message);
    }

    // 4-second shutdown wait
    const shutdownTimeout = 4000;
    // If the process doesn't exit within this time, SIGTERM → SIGKILL fallback
    setTimeout(() => {
      if (resolved) return;

      log.warn("Graceful shutdown timeout — sending SIGTERM...");
      try {
        if (!proc.killed) proc.kill("SIGTERM");
      } catch (err) {
        log.warn("SIGTERM failed:", err.message);
      }

      // Short wait for SIGTERM → if it still doesn't close, SIGKILL
      setTimeout(() => {
        if (resolved) return;

        log.warn("Server did not terminate — forcing SIGKILL!");
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch (err) {
          log.warn("SIGKILL failed:", err.message);
        }

        safeResolve();
      }, 500);
    }, shutdownTimeout);
  });

  return state.isStoppingPromise;
}

// Restart Server
async function restartServer() {
  if (state.isRestarting) {
    log.info("Restart already in progress...");
    return state.isRestartingPromise;
  }

  state.isRestarting = true;
  log.info("Restarting server...");
  state.isRestartingPromise = (async () => {
    try {
      await stopServer();
      await startServer();
      log.info("Server restarted successfully.");
      return true;
    } catch (err) {
      log.error("Restart failed:", err);
      return false;
    } finally {
      state.isRestarting = false;
    }
  })();

  return state.isRestartingPromise;
}

// Server Restart Scheduling
function scheduleServerRestart() {
  if (state.restartAttempts >= config.MAX_RESTART_ATTEMPTS) {
    log.error("Max restart attempts reached. Manual intervention required.");
    return;
  }

  // If the server process still exists, stop it first
  if (state.serverProcess && !state.serverProcess.killed) {
    log.info("Cleaning up existing server process before restart");
    stopServer().then(() => {
      scheduleActualRestart();
    });
  } else {
    scheduleActualRestart();
  }
}

function scheduleActualRestart() {
  state.restartAttempts++;
  const delay = config.RESTART_DELAY * state.restartAttempts;

  log.info(`Scheduling server restart in ${delay / 1000} seconds (attempt ${state.restartAttempts})`);

  setTimeout(() => {
    startServer().catch((err) => {
      log.error("Scheduled restart failed:", err);
    });
  }, delay);
}

// Update Server Settings
function updateServerSettings() {
  if (state.serverProcess) {
    const settings = {
      logSongUpdate: config.LOG_SONG_UPDATE,
    };

    state.serverProcess.send({
      type: "UPDATE_SETTINGS",
      value: settings,
    });
  }
}

// Initialize the application
async function initializeApp() {
  try {
    // Set up paths and configuration
    userDataPath = app.getPath("userData");
    dbPath = path.join(userDataPath, "config.json");
    logFilePath = path.join(userDataPath, "logs.json");
    historyFilePath = path.join(userDataPath, "history.json");
    ConfigManager.initialize(userDataPath, log);
    config = ConfigManager.config;

    // Configure logging
    configureLogging({
      logDir: path.join(userDataPath, "logs"),
      maxSize: config.MAX_LOG_SIZE,
      rotationInterval: config.LOG_ROTATION_INTERVAL,
    });

    // Set app user model id
    if (app.setAppUserModelId) {
      app.setAppUserModelId("com.kanashiidev.discord.music.rpc");
    }
    if (process.platform === "linux") {
      // Set the app name
      app.setName("Discord Music RPC");
    }

    // macOS hide dock
    if (process.platform === "darwin") {
      app.dock.hide();
    }
    Menu.setApplicationMenu(null);

    if (process.platform === "linux") {
      // Wait until the tray support is ready
      setTimeout(() => {
        createTrayWithRetry();
      }, 500);
    } else {
      createTrayWithRetry();
    }
    setupAutoUpdater();

    if (isPackaged) {
      try {
        const serverPath = getPath("server.js");
        log.info("Pre-warming: Reading server file to cache...");
        fs.readFileSync(serverPath, "utf8");
        log.info("Pre-warming completed");

        // Start the server
        setTimeout(() => {
          startServer().catch((err) => {
            log.error("Initial server start failed:", err);
            scheduleServerRestart();
          });
        }, 100);
      } catch (err) {
        log.warn("Pre-warming failed, starting server normally:", err.message);
        startServer().catch((err) => {
          log.error("Initial server start failed:", err);
          scheduleServerRestart();
        });
      }
    } else {
      // Development mode
      startServer().catch((err) => {
        log.error("Initial server start failed:", err);
        scheduleServerRestart();
      });
    }
  } catch (err) {
    handleCriticalError("Initialization failed", err);
  }
}

// Auto Updater Setup
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("update-available", (info) => {
    log.info(`Update available: ${info.version}, downloading automatically...`);
  });
  autoUpdater.on("update-downloaded", (info) => {
    const platform = os.release().split(".")[0];
    const isWin10OrLater = parseInt(platform, 10) >= 10;

    if (process.platform === "win32" && !isWin10OrLater) {
      state.tray.displayBalloon({
        icon: icons.notification,
        title: `Update ${info.version} ready`,
        content: "Click to install",
      });
    } else {
      let notificationIcon = icons.notification;
      if (process.platform === "linux" && notificationIcon) {
        notificationIcon = path.resolve(notificationIcon);
      }
      // Windows 10/11 - Modern Notification
      const notification = new Notification({
        title: `Update ${info.version} ready`,
        body: "Click to install",
        icon: notificationIcon,
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
    const msg = typeof err?.message === "string" ? err.message.split("\n")[0].trim() : String(err);
    log.error("Update check failed: " + msg);
  });
}

// Auto-start functions
function isAutoStartEnabled() {
  // Linux
  if (process.platform === "linux") {
    const autostartDir = path.join(os.homedir(), ".config", "autostart");
    const desktopFile = path.join(autostartDir, "discord-music-rpc.desktop");
    return fs.existsSync(desktopFile);
  }
  // Win / MacOS
  return app.getLoginItemSettings().openAtLogin;
}

// AppImage Location Control
function checkAppImageExecution() {
  if (process.platform === "linux" && process.env.APPIMAGE) {
    const execPath = process.env.APPIMAGE;

    // Check if the AppImage is executable
    try {
      fs.accessSync(execPath, fs.constants.X_OK);
      const fd = fs.openSync(execPath, "r");
      const buffer = Buffer.alloc(4);
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
    } catch (error) {
      log.error("AppImage execution check failed:", error);
      return false;
    }
    return true;
  }
  return true;
}

function setAutoStart(enable) {
  if (process.platform === "linux") {
    const autostartDir = path.join(os.homedir(), ".config", "autostart");
    const desktopFile = path.join(autostartDir, "discord-music-rpc.desktop");

    // Get the AppImage path
    let execPath = process.env.APPIMAGE || process.execPath;

    if (enable) {
      // Check running AppImage
      if (!checkAppImageExecution()) {
        dialog.showErrorBox(
          "Auto-start Error",
          "Cannot set auto-start: AppImage may be corrupted or inaccessible.\n\nPlease ensure the AppImage is in a permanent location and has execute permissions."
        );
        return;
      }

      if (!fs.existsSync(autostartDir)) {
        fs.mkdirSync(autostartDir, { recursive: true });
      }

      // Desktop Entry format
      const desktopEntry = `
      [Desktop Entry]
      Type=Application
      Name=Discord Music RPC
      Comment=Show music from ANY website on your Discord!
      Exec=${execPath} --no-sandbox
      Terminal=false
      Hidden=false
      X-GNOME-Autostart-enabled=true
      Categories=Audio;
      `.trim();

      try {
        fs.writeFileSync(desktopFile, desktopEntry, { mode: 0o644 });
      } catch (err) {
        log.error("Failed to create desktop entry:", err);
        dialog.showErrorBox("Auto-start Error", `Failed to enable auto-start: ${err.message}\n\nYou may need to manually create a desktop entry.`);
      }
    } else {
      // Disable auto-start
      try {
        if (fs.existsSync(desktopFile)) {
          fs.unlinkSync(desktopFile);
        }
      } catch (err) {
        log.error("Failed to disable auto-start:", err);
      }
    }
  } else {
    // Windows / macOS
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,
    });
  }
}

// Tray Menu
function updateTrayMenu() {
  if (!state.tray) {
    log.warn("Tray not available, cannot update menu");
    return;
  }
  try {
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
        checked: isAutoStartEnabled(),
        click: (item) => {
          setAutoStart(item.checked);
          updateTrayMenu();
        },
      },
      {
        label: "Check for Updates",
        click: async () => {
          try {
            log.info("Manual update check triggered by user");
            const result = await autoUpdater.checkForUpdates();

            if (result?.updateInfo?.version && semver.gt(result.updateInfo.version, app.getVersion())) {
              dialog.showMessageBox({
                type: "info",
                buttons: ["OK"],
                title: "Discord Music RPC - Update Available",
                message: `A new version (${result.updateInfo.version}) is available.`,
                detail: "The update will download and install in the background.",
                icon: icons.message,
              });
            } else {
              dialog.showMessageBox({
                type: "info",
                buttons: ["OK"],
                title: "Discord Music RPC - Up to Date",
                message: "You're using the latest version.",
                detail: `Version: ${app.getVersion()}`,
                icon: icons.message,
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
              icon: icons.message,
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
          {
            label: `Port: ${config.PORT || "3000"}`,
            enabled: false,
          },
          { label: "Config", click: () => openConfig() },
          { type: "separator" },

          { label: "Open Logs", click: () => openLogs() },
          {
            label: "Run IPC Diagnostic (Linux)",
            click: () => {
              // Run IPC Diagnostic
              const { exec } = require("child_process");
              const scriptPath = getPath("discord_ipc_diagnostic.sh");
              const outputFile = path.join(userDataPath, "discord_ipc_diagnostic_result.txt");
              exec(`bash "${scriptPath}" > "${outputFile}" 2>&1`, (err) => {
                if (err) {
                  dialog.showErrorBox("IPC Diagnostic Error", err.message);
                  return;
                }
                // Show Open File Dialog
                dialog
                  .showMessageBox({
                    type: "info",
                    title: "IPC Diagnostic Output",
                    message: `Output written to ${outputFile}`,
                    buttons: ["Open File", "Close"],
                  })
                  .then((res) => {
                    if (res.response === 0) {
                      require("electron").shell.openPath(outputFile);
                    }
                  });
              });
            },
            visible: process.platform === "linux",
            enabled: process.platform === "linux",
          },
          {
            label: "Log Song Updates",
            type: "checkbox",
            checked: config.LOG_SONG_UPDATE,
            click: (item) => {
              config.LOG_SONG_UPDATE = !!item.checked;
              updateConfig();
              log.info(`Log Song Updates ${config.LOG_SONG_UPDATE ? "enabled" : "disabled"} succesfully.`);
              updateServerSettings();
              updateTrayMenu();
            },
          },
        ],
      },

      { label: "Open Dashboard", click: () => openStatus(), enabled: state.isServerRunning },
      { type: "separator" },
      {
        label: "Exit",
        click: () => app.quit(),
      },
    ]);

    if (state.tray) {
      // Insert update menu items at the beginning
      if (updateMenuItem.visible) {
        contextMenu.insert(0, updateMenuItem);
        contextMenu.insert(1, updateMenuItemSeparator);
      }

      state.tray.setContextMenu(contextMenu);

      state.tray.setToolTip(`Discord Music RPC\nServer: ${state.isServerRunning ? "Running" : "Stopped"}\nRPC: ${state.isRPCConnected ? "Connected" : "Disconnected"}`);
    }
  } catch (error) {
    log.error("Error updating tray menu:", error);
  }
}

function createTrayWithRetry(maxAttempts = 10, delay = 200) {
  let attempts = 0;

  function tryCreateTray() {
    attempts++;

    try {
      createTray();
      return;
    } catch (err) {
      log.warn(`Tray creation failed (attempt ${attempts}/${maxAttempts}):`, err.message);

      if (attempts < maxAttempts) {
        setTimeout(tryCreateTray, delay);
      } else {
        log.error("Tray could not be created after multiple attempts");
        showTrayFallbackNotification();
      }
    }
  }

  tryCreateTray();
}

// Create tray
function createTray() {
  try {
    // Check the icon path
    const iconPath = getIconPath();
    if (!iconPath) {
      throw new Error("Tray icon path not found");
    }

    // Load the icon
    let trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      throw new Error("Failed to load tray icon");
    }

    // Platform-specific optimizations
    if (process.platform === "darwin") {
      trayIcon.setTemplateImage(true);

      // Retina display support
      const size = trayIcon.getSize();
      if (size.width > 22 || size.height > 22) {
        trayIcon = trayIcon.resize({
          width: 22,
          height: 22,
          quality: "best",
        });
      }
    } else if (process.platform === "linux") {
      // Size optimization for Linux
      const iconSize = trayIcon.getSize();
      if (iconSize.width > 24 || iconSize.height > 24) {
        trayIcon = trayIcon.resize({
          width: 24,
          height: 24,
          quality: "best",
        });
      }
    }

    // Create tray
    state.tray = new Tray(trayIcon);

    if (!state.tray) {
      throw new Error("Tray object is null");
    }

    // Set tray events
    state.tray.setToolTip("Discord Music RPC");

    // Platform-specific click handlers
    if (process.platform === "darwin") {
      // Only left click on macOS
      state.tray.on("click", () => {
        state.tray.popUpContextMenu();
      });
    } else {
      // left and right click for both Linux and Windows
      state.tray.on("click", () => {
        state.tray.popUpContextMenu();
      });

      state.tray.on("right-click", () => {
        state.tray.popUpContextMenu();
      });
    }

    updateTrayMenu();
    log.info("Tray created successfully");
  } catch (error) {
    log.error("Tray creation error details:", error);
    throw error;
  }
}

// Tray fallback notification
function showTrayFallbackNotification() {
  const notification = new Notification({
    title: "Discord Music RPC - Running in Background",
    body: "The app is running but system tray is not available. Use app indicator or check system settings.",
    icon: icons.notification,
  });

  notification.show();

  // Also show the dialog
  dialog.showMessageBox({
    type: "info",
    title: "System Tray Not Available",
    message: "Discord Music RPC is running in background mode",
    detail: "Your desktop environment may not support system tray icons. The application will continue to run. You can access it through application indicators or system menu.",
    buttons: ["OK"],
  });
}

function openStatus() {
  const url = `http://localhost:${config.PORT}`;
  shell.openExternal(url);
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

function openConfig() {
  if (!fs.existsSync(dbPath)) {
    dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      title: "Config File",
      message: "Config file does not exist yet",
      detail: "The application will create it on first run or after saving settings.",
    });
    return;
  }

  shell
    .openPath(dbPath)
    .then((result) => {
      if (result) {
        dialog.showErrorBox("Error", "Could not open config file. Try viewing it manually at: " + dbPath);
      }
    })
    .catch((err) => {
      console.error("Failed to open config:", err);
      dialog.showErrorBox("Error", "Could not open config file. Try viewing it manually at: " + dbPath);
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
app.on("before-quit", async (event) => {
  event.preventDefault();
  await stopServer();
  app.exit(0);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  handleCriticalError("Uncaught Exception", err);
});

process.on("unhandledRejection", (reason, promise) => {
  log.error("Unhandled rejection at:", promise, "reason:", reason);
});
