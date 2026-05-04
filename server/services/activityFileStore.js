const fs = require("fs");
const path = require("path");

let _dirPath = null;

/**
 * Initialize with the path to the currentActivity folder.
 * Should be called once at startup with userDataPath.
 */
function init(userDataPath) {
  _dirPath = path.join(userDataPath, "currentActivity");
}

function getDirPath() {
  return _dirPath;
}

/**
 * Ensures the currentActivity directory exists.
 */
function ensureDir() {
  if (!_dirPath) return;
  if (!fs.existsSync(_dirPath)) {
    fs.mkdirSync(_dirPath, { recursive: true });
  }
}

/**
 * Downloads an image URL and saves it as cover.png.
 * Returns true on success, false on failure.
 */
async function downloadCover(imageUrl) {
  if (!_dirPath || !imageUrl) return false;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return false;

    const contentType = response.headers.get("content-type") || "";
    // Only accept image types
    if (!contentType.startsWith("image/")) return false;

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(path.join(_dirPath, "cover.png"), Buffer.from(buffer));
    return true;
  } catch (err) {
    console.warn("[ACTIVITY_FILE_STORE] Failed to download cover:", err.message);
    return false;
  }
}

/**
 * Writes activity metadata files and downloads cover image.
 * Called whenever a new/changed activity is set.
 *
 * @param {object} activity - The activity object (uses _artist, details, _source, _cover fields)
 */
async function writeActivityFiles(activity) {
  if (!_dirPath) return;

  try {
    ensureDir();

    const artist = activity._artist ?? "";
    const title = activity.details ?? "";
    const source = activity._source ?? "";
    const cover = activity._cover ?? "";

    fs.writeFileSync(path.join(_dirPath, "artist.txt"), artist, "utf8");
    fs.writeFileSync(path.join(_dirPath, "title.txt"), title, "utf8");
    fs.writeFileSync(path.join(_dirPath, "source.txt"), source, "utf8");

    const meta = { artist, title, source, cover, updatedAt: Date.now() };
    fs.writeFileSync(path.join(_dirPath, "activity.json"), JSON.stringify(meta, null, 2), "utf8");

    if (cover && cover.startsWith("http")) {
      await downloadCover(cover);
    } else {
      removeCover();
    }
  } catch (err) {
    console.warn("[ACTIVITY_FILE_STORE] Failed to write activity files:", err.message);
  }
}

/**
 * Removes cover.png if it exists.
 */
function removeCover() {
  if (!_dirPath) return;
  const coverPath = path.join(_dirPath, "cover.png");
  try {
    if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
  } catch (_) {}
}

/**
 * Clears activity files on reset.
 */
function clearActivityFiles() {
  if (!_dirPath) return;

  try {
    if (!fs.existsSync(_dirPath)) return;

    for (const file of ["artist.txt", "title.txt", "source.txt"]) {
      const filePath = path.join(_dirPath, file);
      try {
        fs.writeFileSync(filePath, "", "utf8");
      } catch (_) {}
    }

    try {
      const empty = { artist: "", title: "", source: "", cover: "", updatedAt: Date.now() };
      fs.writeFileSync(path.join(_dirPath, "activity.json"), JSON.stringify(empty, null, 2), "utf8");
    } catch (_) {}

    removeCover();
  } catch (err) {
    console.warn("[ACTIVITY_FILE_STORE] Failed to clear activity files:", err.message);
  }
}

module.exports = {
  init,
  getDirPath,
  writeActivityFiles,
  clearActivityFiles,
};
