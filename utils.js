const fs = require("fs");

function getCurrentTime() {
  const now = new Date();
  return [now.getHours().toString().padStart(2, "0"), now.getMinutes().toString().padStart(2, "0"), now.getSeconds().toString().padStart(2, "0")].join(":");
}

function isSameActivity(a, b) {
  return a && b && a.details === b.details && a.state === b.state && a.startTimestamp === b.startTimestamp && a.endTimestamp === b.endTimestamp;
}

function isSameActivityIgnore(a, b) {
  return a && b && a.details === b.details && a.state === b.state;
}

function truncate(str, maxLength = 128, { fallback = "Unknown", minLength = 2, maxRegexLength = 512 } = {}) {
  if (typeof str !== "string") return fallback;
  str = str.trim();
  if (!str) return fallback;
  if (str.length >= 1 && str.length < minLength) str = `- ${str} -`;

  // Limit for regex
  let strForRegex = str.length > maxRegexLength ? str.slice(0, maxRegexLength) : str;

  // Keywords that need to be cleaned
  const alwaysRemoveKeywords = [
    "FLASH WARNING",
    "copyright free|royalty free|no copyright|creative commons|free download|download free",
    "download now|new release|official site|official page|buy now|available now|stream now|link in bio|link below",
    "official video|music video|MusicVideo|lyric video|full video|video clip|full version|full ver.|official mv",
    "フルバージョン|完全版|主題歌|劇場版|映画|テーマソング|ミュージックビデオ|音楽ビデオ|公式|ライブ|生放送|カラオケ|歌詞付き|歌詞動画|予告|トレーラー|主題歌/FULL ver.|主題歌",
    "完整版|完整版MV|官方MV|官方视频|主题曲|原声带|插曲|电影版|影视版|演唱会|现场|现场版|歌词版|歌词视频|卡拉OK|预告|预告片|预览|高清|官方预告",
    "완전판|풀버전|정식버전|공식|공식뮤직비디오|뮤비|뮤직비디오|테마송|주제가|영화판|가사영상|가사버전|티저|예고편|예고|영상|고화질",
  ];

  // Keywords that need to be cleaned if they are in parentheses
  const optionalRemoveKeywords = [
    "hd|hq|4k|8k|1080p|720p|480p|mp3|mp4|flac|wav|aac|320kbps|256kbps|128kbps",
    "free\\s+(download|dl|song|now)|download\\s+(free|now)",
    "official(\\s+(video|music\\s+video|audio|lyric\\s+video|visualizer))?",
    "/Bonus\\s+Track|PATREON|teaser|trailer|promo|lyric\\s+video|lyrics?|music\\s+video|out\\s+now",
    "subbed|mixed\\s+by\\s+dj|karaoke|backing\\s+track|vocals\\s+only|live(\\s+performance)?",
    "now\\s+available|full\\s+song|full\\s+version|complete\\s+version|original\\s+version\\s+version",
    "official\\s+trailer|official\\s+teaser|[\\w\\s'’.\\-]+\\s+premiere",
  ];

  // Always remove
  const alwaysRemoveRegex = new RegExp(alwaysRemoveKeywords.join("|"), "gi");
  strForRegex = strForRegex.replace(alwaysRemoveRegex, "");

  // Optional remove (only in brackets)
  const optionalRegexStr = optionalRemoveKeywords.join("|");
  const optionalRemoveRegex = new RegExp(`\\b${optionalRegexStr}\\b|\\s*-\\s*${optionalRegexStr}\\s*$`, "gi");
  strForRegex = strForRegex.replace(optionalRemoveRegex, "");
  strForRegex = strForRegex.replace(/[\[\(（]\s*-\s*([^\]\)）]+)[\]\)）]/g, "[$1]");
  strForRegex = strForRegex.replace(/[\[\(（]([^\]\)）]+?)\s*-\s*[\]\)）]/g, "[$1]");

  // Empty parentheses (run twice to catch newly emptied ones)
  strForRegex = strForRegex.replace(/[\[\(（【]\s*[\]\)）】]/g, "");
  strForRegex = strForRegex.replace(/[\[\(（【]\s*[\]\)）】]/g, "");

  // Normalize whitespace
  strForRegex = strForRegex.replace(/\s+/g, " ").trim();

  // Remove problematic characters, control characters and broken surrogates
  try {
    strForRegex = strForRegex.replace(/[\u0000-\u001F\u007F]/g, "");
    strForRegex = strForRegex.replace(/[\u200B-\u200D\uFEFF\u180E]/g, "");
    strForRegex = strForRegex.normalize("NFC");
    strForRegex = strForRegex.replace(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/g, "").replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
    strForRegex = strForRegex.replace(/[^\u0020-\uD7FF\uE000-\uFFFD]/g, "");
  } catch (e) {
    // Continue without removing problematic characters
  }

  // Max length
  let result = strForRegex;
  if (strForRegex.length > maxLength) {
    const chars = Array.from(strForRegex);

    if (chars.length > maxLength) {
      let truncateIndex = maxLength - 3;

      // Try not to leave the last word unfinished
      for (let i = Math.min(maxLength - 3, chars.length - 1); i > maxLength / 2; i--) {
        if (/[\s\p{P}\p{Z}]/u.test(chars[i])) {
          truncateIndex = i;
          break;
        }
      }

      result = chars.slice(0, truncateIndex).join("") + "...";
    }
  }

  result = result.trim();
  if (result.length < minLength) return fallback;

  // If only special characters remain return fallback
  if (/^[\s\p{P}\p{S}]+$/u.test(result)) return fallback;

  return result;
}

function cleanTitle(title, artist) {
  const trimmedTitle = title.trim();
  const trimmedArtist = artist.trim();

  if (trimmedTitle.toLowerCase() === trimmedArtist.toLowerCase()) {
    return trimmedTitle;
  }

  // Separate the artist list
  const artistListRaw = trimmedArtist
    .split(/\s*(?:,|&|feat\.?|featuring|ft\.?|with)\s*/i)
    .map((a) => a.trim())
    .filter((a) => a.length >= 2);

  if (artistListRaw.length === 0) return trimmedTitle;

  // Escape and lowercase
  const artistList = artistListRaw.map((a) => a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // Create a pattern
  const pattern = new RegExp(`^(${artistList.join("|")})(\\s*[&+,xX×]\\s*(${artistList.join("|")}))*\\s[-–—:]+\\s`, "i");
  const cleaned = trimmedTitle.replace(pattern, "").trim();
  const finalCleaned = cleaned.replace(/^[-–—:]+\s*/, "").trim();
  return finalCleaned.length > 0 ? finalCleaned : trimmedTitle;
}

function normalizeTitleAndArtist(title, artist, replaceArtist = true) {
  let dataTitle = title?.trim() || "";
  let dataArtist = artist?.trim() || "";

  const calculateSimilarity = (str1, str2) => {
    const s1 = str1.toLowerCase().replace(/[^\w\s]/g, "");
    const s2 = str2.toLowerCase().replace(/[^\w\s]/g, "");

    if (s1 === s2) return 1;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    // Check if shorter is contained in longer
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }

    return 0;
  };

  const parenIndex = dataTitle.search(/[(\[\(（【]/);
  const titleBeforeParen = parenIndex !== -1 ? dataTitle.substring(0, parenIndex) : dataTitle;
  const parenPart = parenIndex !== -1 ? dataTitle.substring(parenIndex) : "";
  const dashMatch = titleBeforeParen.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dashMatch && replaceArtist) {
    const extractedArtist = dashMatch[1].trim();
    const newTitle = dashMatch[2].trim() + parenPart;

    // Check if the two parts are similar (repetitive title)
    const similarity = calculateSimilarity(extractedArtist, newTitle);

    // If similarity is high , use the first part as title and keep original artist
    if (similarity > 0.7) {
      return { title: extractedArtist, artist: dataArtist };
    }

    const extractedLower = extractedArtist.toLowerCase();
    const artistLower = dataArtist.toLowerCase();

    if (!(dataArtist.length > extractedArtist.length && artistLower.includes(extractedLower) && dataArtist !== dataTitle)) {
      dataArtist = extractedArtist;
      dataTitle = newTitle;
    }
  }

  return { title: dataTitle, artist: dataArtist };
}

const isValidUrl = (url) => {
  if (typeof url !== "string" || url.trim() === "") return false;

  try {
    const u = new URL(url);
    if (u.protocol === "javascript:" || u.protocol === "data:") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

function notifyRpcStatus(isRpcConnected) {
  if (process.send) {
    process.send({ type: "RPC_STATUS", value: isRpcConnected });
  }
}

function detectElectronMode() {
  if (process.env.ELECTRON_MODE !== undefined) {
    return process.env.ELECTRON_MODE === "true";
  }
  if (process.versions.electron) {
    return true;
  }
  if (process.type === "renderer" || process.type === "browser") {
    return true;
  }
  if (process.env.APPIMAGE) {
    return true;
  }
  if (process.execPath.includes("/.mount_") || process.execPath.includes(".AppImage")) {
    return true;
  }
  try {
    if (require.main && (require.main.filename.includes("electron") || require.main.filename.includes("app.asar"))) {
      return true;
    }
  } catch (err) {
    // Continue in case of error
  }
  if (typeof window !== "undefined" && window.process && window.process.type) {
    return true;
  }
  return false;
}

function addHistoryEntry(song, historyPath) {
  if (!song || !song.details || !song.state) {
    return;
  }

  let history = [];

  if (fs.existsSync(historyPath)) {
    const data = fs.readFileSync(historyPath, "utf8");
    try {
      history = JSON.parse(data);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }

  // LAST RECORD COMPARISON
  const last = history[history.length - 1];
  if (last) {
    const sameTitle = last.title === song.details;
    const sameArtist = last.artist === song.state;

    if (sameTitle && sameArtist) {
      return;
    }
  }

  // Add new entry
  const entry = {
    title: song.details,
    artist: song.state,
    image: song.largeImageKey || "",
    source: song.largeImageText || "",
    songUrl: song.detailsUrl || "",
    date: Date.now(),
  };

  history.push(entry);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8");
}

module.exports = { addHistoryEntry, getCurrentTime, isSameActivity, isSameActivityIgnore, truncate, cleanTitle, normalizeTitleAndArtist, isValidUrl, notifyRpcStatus, detectElectronMode };
