const fs = require("fs");
const path = require("path");

module.exports = async function (context) {
  const appOutDir = context.appOutDir;

  // Helper Function
  const tryRemove = (fileOrDir) => {
    const fullPath = path.join(appOutDir, fileOrDir);
    if (fs.existsSync(fullPath)) {
      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.rmSync(fullPath);
      }
    }
  };

  // 1) General Files to be cleaned
  const toRemove = ["vk_swiftshader.dll", "vk_swiftshader_icd.json", "swiftshader", "LICENSES.chromium.html", "ffmpeg.dll", "libGLESv2.dll", "vulkan-1.dll", "d3dcompiler_47.dll"];

  toRemove.forEach(tryRemove);

  // 2) Leave only en-us.pak in the Locales folder
  const localesDir = path.join(appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    const localeFiles = fs.readdirSync(localesDir);
    localeFiles.forEach((file) => {
      if (file !== "en-US.pak") {
        tryRemove(path.join("locales", file));
      }
    });
  } else {
    console.log("The Locales folder was not found, skipping.");
  }
};
