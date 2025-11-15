const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { version } = require("../package.json");
const inputVersion = process.argv[2];
const releaseVersion = inputVersion || version;
const projectRoot = path.join(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const extensionBuildsDir = path.join(projectRoot, "extensionBuilds");
const releaseDir = path.join(projectRoot, "release");

// Clean or create release folder
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// File tracking
let exeFilePath = null;
let appImagePath = null;
let macFilePath = null;

// Helper: recursively collect files from dist
function getAllFiles(dir) {
  let files = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  });
  return files;
}

const distFiles = getAllFiles(distDir);

// Copy relevant build outputs
for (const fullPath of distFiles) {
  const file = path.basename(fullPath);

  // Copy update metadata (latest.yml)
  if (file.startsWith("latest") && file.endsWith(".yml")) {
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📄 Copied ${file}`);
  }

  // Windows EXE
  if (file.endsWith(".exe") && file.startsWith("Discord-Music-RPC-Setup")) {
    exeFilePath = fullPath;
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`💻 Copied Windows installer: ${file}`);
  }

  // Linux AppImage
  if (file.endsWith(".AppImage") && file.startsWith("discord-music-rpc-")) {
    appImagePath = fullPath;
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`🐧 Copied Linux AppImage: ${file}`);
  }

  // Mac package
  if (file.endsWith(".dmg") && file.startsWith("Discord-Music-RPC-")) {
    macFilePath = fullPath;
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📦 Copied Mac package: ${file}`);
  }
}

// Compress each platform installer
function zipFile(sourcePath, zipName) {
  const zipPath = path.join(releaseDir, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      console.log(`✅ Zipped ${path.basename(sourcePath)} → ${path.basename(zipPath)} (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on("error", reject);
    archive.pipe(output);
    archive.file(sourcePath, { name: path.basename(sourcePath) });
    archive.finalize();
  });
}

(async () => {
  if (exeFilePath) await zipFile(exeFilePath, `Discord-Music-RPC-Win.zip`);
  if (appImagePath) await zipFile(appImagePath, `Discord-Music-RPC-Linux.zip`);
  if (macFilePath) await zipFile(macFilePath, `Discord-Music-RPC-macOS.zip`);
})();

// Copy browser extensions
if (fs.existsSync(extensionBuildsDir)) {
  fs.readdirSync(extensionBuildsDir)
    .filter((file) => file.endsWith(".zip"))
    .forEach((file) => {
      const src = path.join(extensionBuildsDir, file);
      const dest = path.join(releaseDir, file);
      fs.copyFileSync(src, dest);
      console.log(`🧩 Copied extension: ${file}`);
    });
}

console.log(`\n✅ All release files prepared in: ${path.relative(projectRoot, releaseDir)} folder\n`);
