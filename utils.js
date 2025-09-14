// Rate-limited Logging
const LOG_INTERVAL = 10000; // 10 seconds
const lastLogMap = new Map();
function logRpcConnection(message) {
  const now = Date.now();
  const lastTime = lastLogMap.get(message) || 0;
  if (now - lastTime < LOG_INTERVAL) return;
  console.log(message);
  lastLogMap.set(message, now);
}

// Connection Retry Frequency
function shouldLogAttempt(attempt) {
  if (attempt <= 3) return true;
  return attempt % 10 === 0;
}

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

  let strForRegex = str.length > maxRegexLength ? str.slice(0, maxRegexLength) : str;

  // Keywords that need to be cleaned
  const alwaysRemoveKeywords = [
    "copyright free|royalty free|no copyright|creative commons|free download|download free",
    "download now|new release|official site|official page|buy now|available now|stream now|link in bio|link below",
    "official video|music video|lyric video|full video|video clip|full version|full ver\.|official mv",
    "フルバージョン|完全版|主題歌|劇場版|映画|テーマソング|MV|ミュージックビデオ|音楽ビデオ|公式|ライブ|生放送|カラオケ|歌詞付き|歌詞動画|予告|トレーラー|主題歌/FULL ver\.|主題歌",
    "完整版|完整版MV|官方MV|官方视频|主题曲|原声带|插曲|电影版|影视版|演唱会|现场|现场版|歌词版|歌词视频|卡拉OK|预告|预告片|预览|高清|官方预告",
    "완전판|풀버전|정식버전|공식|공식뮤직비디오|뮤비|뮤직비디오|테마송|주제가|영화판|가사영상|가사버전|티저|예고편|예고|영상|고화질",
  ];

  // Keywords that need to be cleaned if they are in parentheses
  const optionalRemoveKeywords = [
    "hd|hq|4k|8k|1080p|720p|480p|mp3|mp4|flac|wav|aac|320kbps|256kbps|128kbps",
    "free\\s+(download|dl|song|now)|download\\s+(free|now)",
    "official(\\s+(video|music\\s+video|audio|lyric\\s+video|visualizer))?",
    "teaser|trailer|promo|lyric\\s+video|lyrics?|music\\s+video|out\\s+now",
    "mixed\\s+by\\s+dj|karaoke|backing\\s+track|vocals\\s+only|live(\\s+performance)?",
    "now\\s+available|full\\s+song|full\\s+version|complete\\s+version|original\\s+version\\s+version",
    "official\\s+trailer|official\\s+teaser|[\\w\\s'’\\-]+\\s+premiere",
  ];

  // Always remove
  const alwaysRemoveRegex = new RegExp(alwaysRemoveKeywords.join("|"), "gi");
  strForRegex = strForRegex.replace(alwaysRemoveRegex, "");

  // Optional remove (only in brackets)
  const optionalRegexStr = optionalRemoveKeywords.join("|");
  const optionalRemoveRegex = new RegExp(`([\\[\\(（]\\s*(${optionalRegexStr})\\s*[\\]\\)）])|(\\s*-\\s*(${optionalRegexStr})\\s*$)`, "gi");
  strForRegex = strForRegex.replace(optionalRemoveRegex, "");

  // Clean unnecessary parentheses
  strForRegex = strForRegex.replace(/[\\[\\(（【].*?[\\)\\]）】]/g, "");

  // Empty parentheses/square bracket cleaning
  strForRegex = strForRegex.replace(/(\(\s*\)|\[\s*\]|（\s*）|【\s*】)/g, "");

  // Clean up the extra spaces
  strForRegex = strForRegex.replace(/\s+/g, " ").trim();

  // Max length
  let result = strForRegex;
  if (strForRegex.length > maxLength) {
    // Try not to leave the last word unfinished.
    const lastSpaceIndex = strForRegex.lastIndexOf(" ", maxLength - 3);
    const truncateIndex = lastSpaceIndex > maxLength / 2 ? lastSpaceIndex : maxLength - 3;
    result = strForRegex.slice(0, truncateIndex) + "...";
  }

  if (result.length < minLength) return fallback;
  return result;
}

function cleanTitle(title, artist) {
  const trimmedTitle = title.trim();
  const trimmedArtist = artist.trim();

  if (trimmedTitle.toLowerCase() === trimmedArtist.toLowerCase()) {
    return trimmedTitle;
  }

  const artistListRaw = trimmedArtist
    .split(/,|&|feat\.?|featuring/gi)
    .map((a) => a.trim())
    .filter((a) => a.length >= 3);

  if (artistListRaw.length === 0) return trimmedTitle;

  const artistList = artistListRaw.map((a) => a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^(${artistList.join("|")})(\\s*[&+,xX]\\s*(${artistList.join("|")}))*\\s*[-–:|.]?\\s*`, "i");
  const cleaned = trimmedTitle.replace(pattern, "").trim();

  return cleaned.length > 0 ? cleaned : trimmedTitle;
}

function extractArtistFromTitle(title, originalArtist) {
  const pattern = /^(.+?)\s*-\s*/;
  const match = title.match(pattern);
  if (match) {
    const extracted = match[1].trim();
    const origLower = originalArtist.toLowerCase();
    const extractedLower = extracted.toLowerCase();

    if (extractedLower !== origLower && (extractedLower.includes(origLower) || origLower.includes(extractedLower)) && extracted.length > originalArtist.length) {
      return extracted;
    }
  }
  return originalArtist;
}

function normalizeTitleAndArtist(title, artist) {
  let dataTitle = title?.trim() || "";
  let dataArtist = artist?.trim() || "";

  if (!dataTitle || !dataArtist) return { title: dataTitle, artist: dataArtist };

  // If the title and artist are exactly the same and contain ' - ', separate them
  if (dataTitle.toLowerCase() === dataArtist.toLowerCase() && dataTitle.includes(" - ")) {
    const parts = dataTitle
      .split("-")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (parts.length >= 2) {
      dataArtist = parts.shift();
      dataTitle = parts.join(" - ");
    }
  } else {
    // Normal extract + clean process
    dataArtist = extractArtistFromTitle(dataTitle, dataArtist);
    dataTitle = cleanTitle(dataTitle, dataArtist);
  }

  return { title: dataTitle, artist: dataArtist };
}

const isValidUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_) {
    return false;
  }
};

function notifyRpcStatus(isRpcConnected) {
  if (process.send) {
    process.send({ type: "RPC_STATUS", value: isRpcConnected });
  }
}

module.exports = {
  logRpcConnection,
  shouldLogAttempt,
  getCurrentTime,
  isSameActivity,
  isSameActivityIgnore,
  truncate,
  cleanTitle,
  extractArtistFromTitle,
  normalizeTitleAndArtist,
  isValidUrl,
  notifyRpcStatus,
};
