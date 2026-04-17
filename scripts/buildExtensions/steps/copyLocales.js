const fs = require("fs-extra");
const path = require("path");

/**
 * Copies the contents of locales to the extension.
 * Skips server.json files - those are not needed in the extension.
 */
function copyLocales(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;

  const items = fs.readdirSync(sourceDir, { withFileTypes: true });

  items.forEach((item) => {
    const srcPath = path.join(sourceDir, item.name);
    const destPath = path.join(targetDir, item.name);

    if (item.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyLocales(srcPath, destPath);
    } else if (item.isFile()) {
      if (!item.name.endsWith(".json")) return;
      if (item.name.toLowerCase() === "server.json") return;

      fs.copyFileSync(srcPath, destPath);
    }
  });
}

module.exports = { copyLocales };
