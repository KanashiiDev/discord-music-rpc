// logger.js
const log = require("electron-log");
const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const config = {
  MAX_LOG_SIZE: 5 * 1024 * 1024, // 5MB
  LOG_ROTATION_INTERVAL: 10 * 60 * 1000, // 10 minutes
};
function configureLogging() {
  const logDir = path.join(app.getPath("userData"), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  log.transports.file.level = "debug";
  log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
  log.transports.file.resolvePathFn = () => path.join(app.getPath("userData"), "logs/main.log");
  rotateLogs();
  setInterval(rotateLogs, config.LOG_ROTATION_INTERVAL);
}

function rotateLogs() {
  try {
    const logFile = log.transports.file.getFile().path;
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > config.MAX_LOG_SIZE) {
        const backupPath = logFile + ".old";
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.renameSync(logFile, backupPath);
        log.info("Rotated log file");
      }
    }
  } catch (err) {
    log.error("Log rotation failed:", err);
  }
}

configureLogging();

module.exports = log;
