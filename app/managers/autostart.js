const { app, dialog } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { log } = require("../scripts/electron-log");
const { getIconPath } = require("../utils");

function getDesktopFileName() {
  return `${app.getName().toLowerCase().replace(/\s+/g, "-")}.desktop`;
}

function isAutoStartEnabled() {
  if (process.platform === "linux") {
    const desktopFile = path.join(os.homedir(), ".config", "autostart", getDesktopFileName());
    return fs.existsSync(desktopFile);
  }
  return app.getLoginItemSettings().openAtLogin;
}

function checkAppImageExecution() {
  if (process.platform !== "linux" || !process.env.APPIMAGE) return true;

  const execPath = process.env.APPIMAGE;
  try {
    if (!fs.existsSync(execPath)) {
      log.error("AppImage not found at:", execPath);
      return false;
    }
    fs.accessSync(execPath, fs.constants.X_OK);
    const fd = fs.openSync(execPath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return true;
  } catch (err) {
    log.error("AppImage execution check failed:", err);
    return false;
  }
}

function setAutoStart(enable) {
  if (process.platform === "linux") {
    const autostartDir = path.join(os.homedir(), ".config", "autostart");
    const desktopFile = path.join(autostartDir, getDesktopFileName());
    const execPath = process.env.APPIMAGE ?? process.execPath;
    const isAppImage = process.env.APPIMAGE !== undefined;

    if (enable) {
      if (isAppImage && !checkAppImageExecution()) {
        dialog.showErrorBox(
          "Auto-start Error",
          "Cannot set auto-start: AppImage may be corrupted or inaccessible.\n\nPlease ensure the AppImage is:\n• In a permanent location (not in /tmp or Downloads)\n• Has execute permission",
        );
        return false;
      }

      if (!fs.existsSync(autostartDir)) {
        try {
          fs.mkdirSync(autostartDir, { recursive: true });
        } catch (err) {
          log.error("Failed to create autostart directory:", err);
          dialog.showErrorBox("Auto-start Error", `Failed to create autostart directory: ${err.message}`);
          return false;
        }
      }

      const iconPath = getIconPath() ?? "";
      const desktopEntry =
        [
          "[Desktop Entry]",
          "Type=Application",
          `Name=${app.getName()}`,
          `Comment=Show what you're listening to on Discord from ANY music website`,
          `Exec="${execPath}"${isAppImage ? " --no-sandbox" : ""}`,
          "Terminal=false",
          "Hidden=false",
          "NoDisplay=false",
          "X-GNOME-Autostart-enabled=true",
          ...(iconPath ? [`Icon=${iconPath}`] : []),
          "Categories=Utility;",
          "StartupNotify=false",
          "X-GNOME-Autostart-Delay=5",
        ].join("\n") + "\n";

      try {
        fs.writeFileSync(desktopFile, desktopEntry, { mode: 0o644, encoding: "utf8" });
        log.info("Auto-start enabled:", desktopFile);
        return true;
      } catch (err) {
        log.error("Failed to create desktop entry:", err);
        dialog.showErrorBox("Auto-start Error", `Failed to enable auto-start: ${err.message}\n\nYou may need to manually create a desktop entry or check permissions.`);
        return false;
      }
    } else {
      try {
        if (fs.existsSync(desktopFile)) {
          fs.unlinkSync(desktopFile);
          log.info("Auto-start disabled:", desktopFile);
        }
        return true;
      } catch (err) {
        log.error("Failed to disable auto-start:", err);
        dialog.showErrorBox("Auto-start Error", `Failed to disable auto-start: ${err.message}`);
        return false;
      }
    }
  }

  try {
    app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true });
    log.info(`Auto-start ${enable ? "enabled" : "disabled"} for ${process.platform}`);
    return true;
  } catch (err) {
    log.error("Failed to set login item settings:", err);
    return false;
  }
}

module.exports = { isAutoStartEnabled, setAutoStart };
