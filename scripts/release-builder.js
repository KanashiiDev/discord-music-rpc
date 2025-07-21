const fs = require("fs");
const path = require("path");

// Indexes
const projectRoot = path.join(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const extensionBuildsDir = path.join(projectRoot, "extensionBuilds");
const releaseDir = path.join(projectRoot, "release");

// Clean or create the release folder
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true });
}
fs.mkdirSync(releaseDir);

// Copy the .exe files
fs.readdirSync(distDir)
  .filter((file) => file.endsWith(".exe"))
  .forEach((file) => {
    const src = path.join(distDir, file);
    const dest = path.join(releaseDir, file);
    fs.copyFileSync(src, dest);
  });

// Copy the .zip files
fs.readdirSync(extensionBuildsDir)
  .filter((file) => file.endsWith(".zip"))
  .forEach((file) => {
    const src = path.join(extensionBuildsDir, file);
    const dest = path.join(releaseDir, file);
    fs.copyFileSync(src, dest);
  });

console.log(`All release files copied to: ${path.relative(projectRoot, releaseDir)} folder.`);
