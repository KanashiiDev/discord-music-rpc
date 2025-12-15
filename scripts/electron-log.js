const log = require("electron-log");
const path = require("path");
const fs = require("fs");

function configureLogging({ logDir, maxSize, rotationInterval }) {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  log.transports.file.level = "debug";
  log.transports.file.format =
    "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";

  log.transports.file.resolvePathFn = () =>
    path.join(logDir, "main.log");

  function rotateLogs() {
    try {
      const logFile = log.transports.file.getFile().path;
      if (!fs.existsSync(logFile)) return;

      const { size } = fs.statSync(logFile);
      if (size < maxSize) return;

      log.transports.file.clear();

      const backup = `${logFile}.old`;
      if (fs.existsSync(backup)) fs.unlinkSync(backup);

      fs.renameSync(logFile, backup);
      log.info("Rotated log file");
    } catch (err) {
      console.error("Log rotation failed:", err);
    }
  }

  rotateLogs();
  setInterval(rotateLogs, rotationInterval);
}

module.exports = { log, configureLogging };
