const { autoUpdater } = require("electron-updater");
const semver = require("semver");
const log = require("./logger");
const https = require("https");
const currentVersion = require("./package.json").version;
const CHECK_INTERVAL = 3600000;

function getVersionFromFilename(filename) {
  const match = filename.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: "/repos/KanashiiDev/discord-music-rpc/releases/latest",
      headers: { "User-Agent": "discord-music-rpc-app" },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on("checking-for-update", () => {
  log.info("Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
  log.info("Update available:", info.version);
});

autoUpdater.on("update-not-available", () => {
  log.info("No updates available");
});

autoUpdater.on("error", (err) => {
  log.error("Update error:", err);
});

autoUpdater.on("download-progress", (progress) => {
  log.info(`Download progress: ${Math.floor(progress.percent)}%`);
});

autoUpdater.on("update-downloaded", (info) => {
  log.info(`Version ${info.version} update downloaded, quitting in 5s to install...`);
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 5000);
});

async function checkAndUpdate() {
  try {
    const release = await fetchLatestRelease();
    const exeAsset = release.assets?.find((asset) => asset.name?.toLowerCase().endsWith(".exe") && asset.name?.toLowerCase().startsWith("discord music rpc setup")) || null;
    const latestElectron = exeAsset ? getVersionFromFilename(exeAsset.name) : currentVersion;

    log.info("Current version:", currentVersion);
    log.info("Latest version from exe filename:", latestElectron);

    if (semver.gt(latestElectron, currentVersion)) {
      log.info(`New version detected (${latestElectron}), starting update process...`);
      autoUpdater.checkForUpdates();
    } else {
      log.info("It's already in the latest version.");
    }

    return { latestElectron };
  } catch (err) {
    log.error("Update check error:", err);
    return null;
  }
}

function startAutoUpdate() {
  setInterval(() => checkAndUpdate(), CHECK_INTERVAL);
}

module.exports = { checkAndUpdate, startAutoUpdate };
