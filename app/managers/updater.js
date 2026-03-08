const { app, Notification, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const semver = require("semver");
const path = require("path");
const os = require("os");

const { state } = require("../state");
const { setUpdateMenuState } = require("./tray");
const { log } = require("../scripts/electron-log");
const { icons } = require("../utils");

function setupAutoUpdater() {
  const platform = process.platform;
  const isLinux = platform === "linux";
  const isWindows = platform === "win32";
  const isLinuxAppImage = isLinux && process.env.APPIMAGE !== undefined;
  const isLinuxPackage = isLinux && !isLinuxAppImage;

  autoUpdater.autoDownload = !isLinuxPackage;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    const versionLabel = info.releaseName ?? info.version ?? "new version";

    if (isLinuxPackage) {
      log.info(`Update available: ${versionLabel} (manual installation required for deb/rpm)`);
      const releaseUrl = info.updateURL;
      if (!releaseUrl) {
        log.warn("No release URL available for manual download");
        return;
      }

      const notification = new Notification({
        title: "Update Available",
        body: `${versionLabel} - Click to download`,
        icon: icons.notification ? path.resolve(icons.notification) : undefined,
      });
      notification.on("click", () => shell.openExternal(releaseUrl));
      notification.show();

      setUpdateMenuState({ visible: true, label: `Download Update ${versionLabel}`, releaseUrl, isInstallable: false });
      return;
    }

    log.info(`Update available: ${versionLabel}, downloading automatically...`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    const versionLabel = info.releaseName ?? info.version ?? "new version";
    log.info(`Update downloaded: ${versionLabel}`);

    if (isWindows && parseInt(os.release().split(".")[0], 10) < 10) {
      state.tray?.displayBalloon({ icon: icons.notification, title: "Update Ready", content: `${versionLabel} - Restart to install` });
    } else {
      _showModernNotification(versionLabel, { isWindows, isLinux });
    }

    setUpdateMenuState({ visible: true, label: `Install Update - ${versionLabel}`, releaseUrl: null, isInstallable: true });
  });

  autoUpdater.on("error", (err) => {
    const msg = typeof err?.message === "string" ? err.message.split("\n")[0].trim() : String(err);
    log.error(`Update error (${platform}): ${msg}`);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    const msg = typeof err?.message === "string" ? err.message.split("\n")[0].trim() : String(err);
    log.error(`Update check failed (${platform}): ${msg}`);
  });
}

//  Helpers
function _showModernNotification(versionLabel, { isWindows, isLinux } = {}) {
  isLinux ??= process.platform === "linux";

  let notificationIcon = icons.notification;
  if (isLinux && notificationIcon) notificationIcon = path.resolve(notificationIcon);

  const notification = new Notification({
    title: "Update Ready",
    body: `${versionLabel} - Click tray icon to install`,
    icon: notificationIcon,
    timeoutType: "never",
    urgency: process.platform === "darwin" ? undefined : "critical",
  });

  const doInstall = () => {
    log.info("Notification clicked - Installing update...");
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  };

  notification.on("click", doInstall);
  if (isWindows) notification.on("action", doInstall);
  notification.show();
}

async function runManualUpdateCheck() {
  try {
    log.info("Manual update check triggered by user");
    const result = await autoUpdater.checkForUpdates();

    if (result?.updateInfo?.version && semver.gt(result.updateInfo.version, app.getVersion())) {
      dialog.showMessageBox({
        type: "info",
        buttons: ["OK"],
        title: "Discord Music RPC - Update Available",
        message: `A new version (${result.updateInfo.version}) is available.`,
        detail: "The update will be downloaded automatically. You can start the installation from the tray menu.",
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
}

module.exports = { setupAutoUpdater, runManualUpdateCheck };
