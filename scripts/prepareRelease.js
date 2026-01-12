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
const winUnpackedDir = path.join(distDir, "win32", "win-unpacked");

// Clean or create release folder
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir, { recursive: true });

// Update readme.md version
function updateReadmeVersion() {
  const readmePath = path.join(projectRoot, "readme.md");

  if (!fs.existsSync(readmePath)) {
    console.log("⚠️  readme.md not found, skipping version update");
    return;
  }

  const readmeContent = fs.readFileSync(readmePath, "utf8");
  const releaseUrlPattern = /(\/releases\/latest\/download\/[a-zA-Z-]+-)(\d+\.\d+\.\d+)(-[a-zA-Z0-9._-]+)/g;

  let changeCount = 0;
  let oldVersion = null;
  let isSameVersion = true;

  const updatedContent = readmeContent.replace(releaseUrlPattern, (match, prefix, version, suffix) => {
    if (!oldVersion) {
      oldVersion = version;
    }
    if (version !== releaseVersion) {
      isSameVersion = false;
    }
    changeCount++;
    return `${prefix}${releaseVersion}${suffix}`;
  });

  if (changeCount === 0) {
    console.log("⚠️  No version patterns found in readme.md release URLs");
  } else if (isSameVersion) {
    console.log(`ℹ️  readme.md already uses version ${releaseVersion}, no update needed`);
  } else {
    fs.writeFileSync(readmePath, updatedContent, "utf8");
    console.log(`📝  Updated readme.md: ${oldVersion} → ${releaseVersion} (${changeCount} occurrences)`);
  }
}
updateReadmeVersion();

// File tracking
const debFiles = [];
const rpmFiles = [];
const appImages = [];

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
  if (file.endsWith(".exe") && file.startsWith("Discord-Music-RPC-")) {
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📦 Copied Windows installer: ${file}`);
  }

  // Linux AppImage
  if (file.endsWith(".AppImage") && file.startsWith("discord-music-rpc-")) {
    appImages.push(fullPath);
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📦 Copied Linux AppImage: ${file}`);
  }

  // Linux DEB
  if (file.endsWith(".deb") && file.startsWith("discord-music-rpc-")) {
    debFiles.push(fullPath);
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📦 Copied Linux DEB: ${file}`);
  }

  // Linux RPM
  if (file.endsWith(".rpm") && file.startsWith("discord-music-rpc-")) {
    rpmFiles.push(fullPath);
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📦 Copied Linux RPM: ${file}`);
  }

  // Mac package
  if (file.endsWith(".dmg") && file.startsWith("Discord-Music-RPC-")) {
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
    console.log(`📦 Copied Mac package: ${file}`);
  }
}

// Find the unpacked Windows directory and ZIP it
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
    
    if (fs.statSync(sourcePath).isDirectory()) {
      archive.directory(sourcePath, false);
    } else {
      archive.file(sourcePath, { name: path.basename(sourcePath) });
    }
    
    archive.finalize();
  });
}

(async () => {
  if (winUnpackedDir) await zipFile(winUnpackedDir, `Discord-Music-RPC-${releaseVersion}-x64.zip`);
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
