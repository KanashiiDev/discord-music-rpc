const { app, Tray, Menu, Notification, MenuItem, nativeImage, dialog, shell } = require("electron");
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
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === "development" || process.defaultApp;

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

function getIconPath(size = null) {
  let baseDir;

  // Platform-specific base directory
  if (isDev) {
    baseDir = path.join(__dirname, "assets", "icon");
  } else {
    // Production path handling
    if (process.platform === "linux" && process.env.APPIMAGE) {
      // Resources may be in a different location inside the AppImage
      baseDir = path.join(path.dirname(process.execPath), "resources", "app.asar.unpacked", "assets", "icon");

      // Fallback to standard path
      if (!fs.existsSync(baseDir)) {
        baseDir = path.join(process.resourcesPath, "app.asar.unpacked", "assets", "icon");
      }
    } else {
      baseDir = path.join(process.resourcesPath, "app.asar.unpacked", "assets", "icon");
    }
  }
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

// App Ready
function waitForTraySupport() {
  return new Promise((resolve) => {
    if (process.platform !== "linux") {
      resolve(true);
      return;
    }

    // Check tray support in Linux
    let attempts = 0;
    const maxAttempts = 30;
    const checkInterval = 100;

    const checkTray = setInterval(() => {
      attempts++;

      // Check if the Tray class is available
      try {
        const testIcon = nativeImage.createFromPath(getIconPath());
        if (!testIcon.isEmpty()) {
          clearInterval(checkTray);
          resolve(true);
        }
      } catch (err) {
        // Not ready yet
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkTray);
        log.warn("Tray support check timed out, proceeding anyway");
        resolve(false);
      }
    }, checkInterval);
  });
}

// App Ready
app.whenReady().then(async () => {
  try {
    if (process.platform === "linux") {
      // Wait until the tray support is ready
      await waitForTraySupport();
    }

    initializeApp();
  } catch (err) {
    handleCriticalError("App initialization failed", err);
  }
});

// Start Server
async function startServer() {
  const { fork } = require("child_process");
  const serverPath = isDev ? path.join(__dirname, "server.js") : path.join(process.resourcesPath, "app.asar.unpacked", "server.js");

  if (state.serverProcess || state.isServerRunning) {
    log.warn("Server already running");
    return;
  }

  if (state.restartAttempts >= config.server.MAX_RESTART_ATTEMPTS) {
    log.error("Max restart attempts reached. Please check server configuration.");
    return;
  }

  log.info(`Starting server (attempt ${state.restartAttempts + 1}) at: ${serverPath}`);

  return new Promise((resolve, reject) => {
    state.serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        ELECTRON_MODE: isDev,
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
        updateServerSettings();
        log.info("Server started successfully");
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
    setupSingleInstanceLock();
    createTrayWithRetry();
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
          { type: "separator" },
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

      // Context menu optimization for Linux
      if (process.platform === "linux") {
        setTimeout(() => {
          state.tray.setContextMenu(contextMenu);
        }, 100);
      } else {
        state.tray.setContextMenu(contextMenu);
      }

      state.tray.setToolTip(`Discord Music RPC\nServer: ${state.isServerRunning ? "Running" : "Stopped"}\nRPC: ${state.isRPCConnected ? "Connected" : "Disconnected"}`);
    }
  } catch (error) {
    log.error("Error updating tray menu:", error);
  }
}

function createTrayWithRetry(maxAttempts = 15, delay = 1000) {
  let attempts = 0;

  function tryCreateTray() {
    attempts++;

    try {
      createTray();
      return;
    } catch (err) {
      log.warn(`Tray creation failed (attempt ${attempts}):`, err.message);

      if (attempts < maxAttempts) {
        // Progressive delay - increase the waiting time with each attempt
        const nextDelay = delay * (1 + attempts * 0.2);
        log.log(`Retrying tray creation in ${nextDelay}ms...`);
        setTimeout(tryCreateTray, nextDelay);
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
  }, config.server.UPDATE_CHECK_INTERVAL);
}
