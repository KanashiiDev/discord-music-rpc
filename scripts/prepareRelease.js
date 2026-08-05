const fs = require("fs");
const path = require("path");
const { ZipArchive } = require("archiver");
const { version } = require("../package.json");
const { checkMissingTranslations, generateLanguages } = require("./checkMissingTranslations");
const inputVersion = process.argv[2];
const releaseVersion = inputVersion || version;
const projectRoot = path.join(__dirname, "..");
const LOCALES_DIR = path.join(projectRoot, "locales");
const distDir = path.join(projectRoot, "dist");
const extensionBuildsDir = path.join(projectRoot, "extensionBuilds");
const releaseDir = path.join(projectRoot, "release");
const winUnpackedDir = path.join(distDir, "win32", "win-unpacked");

// Clean or create release folder
if (fs.existsSync(releaseDir)) fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

// Update readme.md version
function updateReadmeVersion() {
  const readmePath = path.join(projectRoot, "readme.md");
  if (!fs.existsSync(readmePath)) {
    console.log("⚠️  readme.md not found, skipping");
    return;
  }
  const content = fs.readFileSync(readmePath, "utf8");
  const pattern = /(\/releases\/latest\/download\/[a-zA-Z-]+-)(\d+\.\d+\.\d+)(-[a-zA-Z0-9._-]+)/g;
  let count = 0,
    oldVer = null,
    same = true;
  const updated = content.replace(pattern, (_, pre, ver, suf) => {
    oldVer ??= ver;
    if (ver !== releaseVersion) same = false;
    count++;
    return `${pre}${releaseVersion}${suf}`;
  });
  if (!count) return console.log("⚠️  No version patterns found in readme.md");
  if (same) return console.log(`ℹ️  readme.md already at ${releaseVersion}`);
  fs.writeFileSync(readmePath, updated, "utf8");
  console.log(`📝 readme.md: ${oldVer} → ${releaseVersion} (${count} occurrences)`);
}
updateReadmeVersion();

// Helper: recursively collect files from dist
function getAllFiles(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    out = e.isDirectory() ? out.concat(getAllFiles(full)) : [...out, full];
  }
  return out;
}

// Helper: rename "web-presence-bridge-" prefix to "web-presence-" in filename
function resolvedName(f) {
  return f.startsWith("web-presence-bridge-") ? f.replace("web-presence-bridge-", "web-presence-") : f;
}

// Collect & copy dist files
for (const full of getAllFiles(distDir)) {
  const f = path.basename(full);
  const renamed = resolvedName(f);
  const dest = path.join(releaseDir, renamed);

  if (f.startsWith("latest") && f.endsWith(".yml")) {
    fs.copyFileSync(full, dest);
    console.log(`📄 Copied ${f}`);
  }
  if ((f.startsWith("web-presence-bridge-") || f.startsWith("web-presence-")) && f.endsWith(".exe")) {
    fs.copyFileSync(full, dest);
    console.log(`📦 Windows installer: ${f}`);
  }
  if ((f.startsWith("web-presence-bridge-") || f.startsWith("web-presence-")) && f.endsWith(".AppImage")) {
    fs.copyFileSync(full, dest);
    const arch = f.includes("aarch64") ? "aarch64" : "x86_64";
    console.log(`📦 AppImage (${arch}): ${f}`);
  }
  if ((f.startsWith("web-presence-bridge-") || f.startsWith("web-presence-")) && f.endsWith(".deb")) {
    fs.copyFileSync(full, dest);
    console.log(`📦 DEB: ${f}`);
  }
  if ((f.startsWith("web-presence-bridge-") || f.startsWith("web-presence-")) && f.endsWith(".rpm")) {
    fs.copyFileSync(full, dest);
    console.log(`📦 RPM: ${f}`);
  }
  if ((f.startsWith("web-presence-bridge-") || f.startsWith("web-presence-")) && f.endsWith(".dmg")) {
    fs.copyFileSync(full, dest);
    console.log(`📦 Mac DMG: ${f}`);
  }
  if ((f.startsWith("web-presence-bridge-") || f.startsWith("web-presence-")) && f.endsWith(".pacman")) {
    fs.copyFileSync(full, dest);
    console.log(`📦 Pacman: ${f}`);
  }
}

// ZIP Windows unpacked
function zipDir(src, zipName) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(path.join(releaseDir, zipName));
    const arc = new ZipArchive({ zlib: { level: 9 } });
    out.on("close", () => {
      console.log(`✅ Zipped → ${zipName}`);
      resolve();
    });
    arc.on("error", reject);
    arc.pipe(out);
    arc.directory(src, false);
    arc.finalize();
  });
}

// Main
checkMissingTranslations(LOCALES_DIR);
generateLanguages(LOCALES_DIR);

(async () => {
  if (fs.existsSync(winUnpackedDir)) {
    await zipDir(winUnpackedDir, `web-presence-${releaseVersion}-x64.zip`);
  }

  if (fs.existsSync(extensionBuildsDir)) {
    for (const f of fs.readdirSync(extensionBuildsDir).filter((f) => f.endsWith(".zip"))) {
      const dest = path.join(releaseDir, f);
      fs.copyFileSync(path.join(extensionBuildsDir, f), dest);
      console.log(`🧩 Extension: ${f}`);
    }
  }

  console.log(`\n✅ Release files ready in: release/\n`);
})();
