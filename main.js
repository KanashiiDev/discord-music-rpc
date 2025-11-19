const { app, Tray, Menu, Notification, MenuItem, nativeImage, dialog, shell } = require("electron");
let isAppInitialized = false;

// Force English Locale
app.commandLine.appendSwitch("lang", "en-US");

// Linux-specific optimizations
if (process.platform === "linux") {
  // Wayland/X11 handling
  if (process.env.XDG_SESSION_TYPE === "wayland") {
    app.commandLine.appendSwitch("enable-features", "UseOzonePlatform,WaylandWindowDecorations");
    app.commandLine.appendSwitch("ozone-platform", "wayland");
  } else {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  }

  // Tray icon support
  app.commandLine.appendSwitch("enable-features", "AppIndicator,Unity");
}

// App Optimizations
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("no-zygote");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-vsync");
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu-memory-buffer-compositor-resources");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-ipc-flooding-protection");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("js-flags", "--max-old-space-size=128 --expose-gc");
app.commandLine.appendSwitch("high-dpi-support", "1");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("disable-extensions");
app.commandLine.appendSwitch("disable-breakpad");
app.commandLine.appendSwitch("no-default-browser-check");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-logging");
app.commandLine.appendSwitch("disable-dev-shm-usage");

const { autoUpdater } = require("electron-updater");
const semver = require("semver");
const path = require("path");
const JSONdb = require("simple-json-db");
const userDataPath = app.getPath("userData");
const dbPath = path.join(userDataPath, "config.json");
const store = new JSONdb(dbPath);
const log = require("./scripts/electron-log");
const fs = require("fs");
const os = require("os");
const isPackaged = app.isPackaged;

const defaultConfig = {
  server: {
    PORT: 3000,
    START_TIMEOUT: 15000,
    UPDATE_CHECK_INTERVAL: 3600000,
    MAX_RESTART_ATTEMPTS: 5,
    RESTART_DELAY: 5000,
  },
};

// Store Config Check
if (!store.has("server")) {
  store.set("server", defaultConfig.server);
} else {
  const current = store.get("server");
  let updated = false;

  for (const key in defaultConfig.server) {
    if (!(key in current)) {
      current[key] = defaultConfig.server[key];
      updated = true;
    }
  }
  if (updated) {
    store.set("server", current);
  }
}

const config = store.get("server");

// State Management
const state = {
  tray: null,
  serverProcess: null,
  isServerRunning: false,
  isStopping: false,
  restartAttempts: 0,
  serverStartTime: null,
  logSongUpdate: store.get("logSongUpdate") || false,
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
    initializeApp();
  } catch (err) {
    handleCriticalError("App initialization failed", err);
  }
});

// Start Server
async function startServer() {
  const { fork } = require("child_process");
  const serverPath = getPath("server.js");

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
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      silent: false,
    });

    log.info(`Server process started (PID: ${state.serverProcess.pid})`);

    const readyTimeout = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      log.warn(`Server startup timeout after ${elapsed}ms`);
      if (state.serverProcess && !state.serverProcess.killed) {
        state.serverProcess.kill("SIGTERM");
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
    });

    state.serverProcess.stdout.on("data", (data) => {
      if (data) log.info("SERVER:", data.toString().trim());
    });

    state.serverProcess.stderr.on("data", (data) => {
      if (data) log.info("SERVER ERROR:", data.toString().trim());
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
    log.info("No server process to stop");
    return;
  }

  log.info("Stopping server...");
  state.isStopping = true;

  return new Promise((resolve) => {
    const timeoutDuration = Math.min(3000, state.serverStartTime ? Date.now() - state.serverStartTime : 3000);
    const killTimeout = setTimeout(() => {
      if (state.serverProcess && !state.serverProcess.killed) {
        log.warn("Server did not stop gracefully, forcing kill");
        state.serverProcess.kill("SIGKILL");
      }
      state.serverProcess = null;
      state.isServerRunning = false;
      state.isStopping = false;
      resolve();
    }, timeoutDuration);

    state.serverProcess.once("exit", () => {
      clearTimeout(killTimeout);
      state.serverProcess = null;
      state.isServerRunning = false;
      state.isStopping = false;
      resolve();
    });

    // If there is a process and it hasn't died, send a shutdown message
    if (state.serverProcess && !state.serverProcess.killed) {
      try {
        state.serverProcess.send("shutdown");
      } catch (err) {
        log.warn("Could not send shutdown message:", err.message);
        state.serverProcess.kill("SIGTERM");
      }
    } else {
      clearTimeout(killTimeout);
      state.serverProcess = null;
      state.isServerRunning = false;
      state.isStopping = false;
      resolve();
    }
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
      logSongUpdate: state.logSongUpdate,
    };

    state.serverProcess.send({
      type: "UPDATE_SETTINGS",
      value: settings,
    });
  }
}

// Initialize the application
function initializeApp() {
  try {
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
    log.error("Update check failed:", err);
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
          { type: "separator" },
          { label: "Open Status", click: () => openStatus(), enabled: state.isServerRunning },
          { label: "Open Logs", click: () => openLogs() },
          {
            label: "Log Song Updates",
            type: "checkbox",
            checked: state.logSongUpdate,
            click: (item) => {
              state.logSongUpdate = item.checked;
              store.set("logSongUpdate", state.logSongUpdate);
              log.info(`Log Song Updates ${state.logSongUpdate ? "enabled" : "disabled"} succesfully.`);
              updateServerSettings();
              updateTrayMenu();
            },
          },
        ],
      },
      { label: "Config", click: () => openConfig() },
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

// Background update checks
if (app.isPackaged) {
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => log.error("Background update check failed:", err));
  }, config.UPDATE_CHECK_INTERVAL);
}
