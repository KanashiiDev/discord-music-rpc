const fs = require("fs");
const path = require("path");

module.exports = async function (context) {
  const appOutDir = context.appOutDir;
  const platform = process.platform;

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

  console.log(`  • cleaning ${platform} build`);

  // Files to be cleaned according to the platform
  let toRemove = [];

  if (platform === "win32") {
    toRemove = [
      "vk_swiftshader.dll",
      "vk_swiftshader_icd.json",
      "swiftshader",
      "LICENSES.chromium.html",
      "ffmpeg.dll",
      "libGLESv2.dll",
      "vulkan-1.dll",
      "d3dcompiler_47.dll",
      "dxcompiler.dll",
      "dxil.dll",
      "libEGL.dll",
    ];
  } else if (platform === "linux") {
    if (platform === "linux") {
      toRemove = ["LICENSES.chromium.html", "vk_swiftshader_icd.json", "swiftshader", "chrome-sandbox", "libEGL.so", "libGLESv2.so", "libvk_swiftshader.so", "libvulkan.so.1"];
    }
  }

  toRemove.forEach(tryRemove);

  // Simplify the Locales folder
  const localesDir = path.join(appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    const localeFiles = fs.readdirSync(localesDir);
    localeFiles.forEach((file) => {
      if (file.toLowerCase() !== "en-us.pak") {
        tryRemove(path.join("locales", file));
      }
    });
  }
};
