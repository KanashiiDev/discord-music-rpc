const { dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let _log = null;
let _logFilePath = null;
let _historyFilePath = null;
let _dbPath = null;
let _config = null;

function init({ log, logFilePath, historyFilePath, dbPath, config }) {
  _log = log;
  _logFilePath = logFilePath;
  _historyFilePath = historyFilePath;
  _dbPath = dbPath;
  _config = config;
}

// Getters — called by other modules after init
const getLogFilePath = () => _logFilePath;
const getHistoryFilePath = () => _historyFilePath;
const getDbPath = () => _dbPath;
const getConfig = () => _config;

// Console Safety
// Wrap console methods to avoid uncaught write errors (EIO) in packaged environments.
// This will swallow EIO write errors and attempt to surface a short warning via electron-log (if available).
function safeConsoleWrap(log) {
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
                const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
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
}

// Paths
const isPackaged = require("electron").app.isPackaged;

function getAppPath(...p) {
  return path.join(__dirname, ...p);
}

function getServerPath(...p) {
  return path.join(__dirname, "..", "server", ...p);
}

function getResourcePath(...p) {
  return isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, "..", ...p);
}

function getIconPath(size = null) {
  const baseDir = getAppPath("assets", "icon");

  let fileName;
  switch (process.platform) {
    case "win32":
      fileName = size ?? "icon.ico";
      break;
    case "darwin":
      fileName = "24x24.png";
      break;
    default:
      fileName = "48x48.png";
      break;
  }

  const iconPath = path.join(baseDir, fileName);
  if (fs.existsSync(iconPath)) return iconPath;

  _log?.warn(`Tray icon not found: ${iconPath}`);
  const fallback = path.join(baseDir, "icon.png");
  return fs.existsSync(fallback) ? fallback : null;
}

const icons = {
  notification: getIconPath(),
  message: getIconPath("32x32.png"),
  tray: getIconPath("24x24.png"),
  tray_win: getIconPath("16x16.png"),
};

// File Logging
function logToFile(error, type = "UnknownError") {
  let entries = [];
  if (fs.existsSync(_logFilePath)) {
    try {
      entries = JSON.parse(fs.readFileSync(_logFilePath, "utf-8"));
    } catch {
      entries = [];
    }
  }
  entries.push({
    timestamp: new Date().toISOString(),
    type,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  });
  fs.writeFileSync(_logFilePath, JSON.stringify(entries, null, 2));
}

// Shell Helpers
function openStatus() {
  shell.openExternal(`http://localhost:${_config.PORT}`);
}

function openLogs() {
  const logPath = _log.transports.file.getFile().path;
  if (!fs.existsSync(logPath)) {
    dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      title: "Log File",
      message: "Log file does not exist yet",
      detail: "The application needs to run for a while to generate logs.",
      icon: icons.message,
    });
    return;
  }
  shell.openPath(logPath).catch((err) => {
    _log.error("Failed to open logs:", err);
    dialog.showErrorBox("Error", `Could not open log file. Try viewing it manually at: ${logPath}`);
  });
}

function openConfig() {
  if (!fs.existsSync(_dbPath)) {
    dialog.showMessageBox({
      type: "info",
      buttons: ["OK"],
      title: "Config File",
      message: "Config file does not exist yet",
      detail: "The application will create it on first run or after saving settings.",
      icon: icons.message,
    });
    return;
  }
  shell
    .openPath(_dbPath)
    .then((result) => {
      if (result) dialog.showErrorBox("Error", `Could not open config file. Try viewing it manually at: ${_dbPath}`);
    })
    .catch((err) => {
      console.error("Failed to open config:", err);
      dialog.showErrorBox("Error", `Could not open config file. Try viewing it manually at: ${_dbPath}`);
    });
}

// Error Handling
function handleCriticalError(message, error) {
  _log.error(message, error);
  dialog
    .showMessageBox({
      type: "error",
      buttons: ["OK", "Open Logs"],
      title: "Application Error",
      message: `${message}: ${error.message}`,
      detail: error.stack,
      icon: icons.message,
    })
    .then(({ response }) => {
      if (response === 1) openLogs();
      require("electron").app.quit();
    });
}

module.exports = {
  init,
  safeConsoleWrap,
  getAppPath,
  getResourcePath,
  getServerPath,
  getIconPath,
  getLogFilePath,
  getHistoryFilePath,
  getDbPath,
  getConfig,
  icons,
  logToFile,
  openStatus,
  openLogs,
  openConfig,
  handleCriticalError,
};
