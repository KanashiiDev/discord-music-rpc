const log = require("electron-log");
const path = require("path");
const fs = require("fs");

let _logDir = null;
function configureLogging({ logDir, maxSize, rotationInterval }) {
  _logDir = logDir;

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  log.transports.file.level = "debug";
  log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
  log.transports.file.resolvePathFn = () => path.join(logDir, "main.log");

  // Console transport: disable when packaged to avoid EIO / broken stdout in some packaging environments
  try {
    // Try to detect packaged mode safely (may throw if electron isn't available in test env)
    let isPackaged = false;
    try {
      const electron = require("electron");
      if (electron && electron.app && typeof electron.app.isPackaged === "boolean") {
        isPackaged = electron.app.isPackaged;
      }
    } catch (_) {
      // ignore - not running in electron main process context
    }

    // Also disable console transport when NODE_ENV is production as a precaution
    if (isPackaged || process.env.NODE_ENV === "production") {
      log.transports.console.level = false; // disables console transport
    } else {
      // Keep console for development; set a compact format
      log.transports.console.format = "[{h}:{i}:{s}] {text}";
      log.transports.console.level = "debug";
    }
  } catch (_) {
    // If anything goes wrong configuring console transport, ensure we don't crash the app
    try {
      log.transports.console.level = false;
    } catch (_) {
      // swallow
    }
  }

  function rotateLogs() {
    try {
      const fileTransport = log.transports.file;
      const fileObj = fileTransport.getFile();
      const logFile = fileObj && fileObj.path;
      if (!logFile || !fs.existsSync(logFile)) return;

      const { size } = fs.statSync(logFile);
      if (size < maxSize) return;
      fileTransport.clear();

      const backup = `${logFile}.old`;
      if (fs.existsSync(backup)) fs.unlinkSync(backup);

      fs.renameSync(logFile, backup);
      log.info("Rotated log file");
    } catch (err) {
      try {
        console.error("Log rotation failed:", err);
      } catch (_) {
        // swallow
      }
    }
  }

  rotateLogs();
  setInterval(rotateLogs, rotationInterval);
}

function logStartupTimeout({ elapsed, serverPath = null, pid = null, env = {} } = {}) {
  const msg = `Server startup timeout after ${elapsed}ms${pid ? ` (pid=${pid})` : ""}${serverPath ? ` — serverPath=${serverPath}` : ""}`;
  log.warn(msg);

  // Write a diagnostic JSON entry to help offline debugging
  if (_logDir) {
    try {
      const diagFile = path.join(_logDir, "startup-timeout.json");
      let entries = [];
      if (fs.existsSync(diagFile)) {
        try {
          entries = JSON.parse(fs.readFileSync(diagFile, "utf8")) || [];
        } catch (_) {
          entries = [];
        }
      }

      const entry = {
        timestamp: new Date().toISOString(),
        elapsed,
        pid: pid || null,
        serverPath: serverPath || null,
        env: Object.keys(env).length ? env : undefined,
      };
      entries.push(entry);
      fs.writeFileSync(diagFile, JSON.stringify(entries, null, 2));
    } catch (err) {
      // If writing the diagnostic file fails, don't throw — just log
      log.error("Failed to write startup-timeout diagnostic:", err);
    }
  }
}

module.exports = { log, configureLogging, logStartupTimeout };
