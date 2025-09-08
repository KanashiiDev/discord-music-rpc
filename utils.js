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

  const keywordGroup = [
    "free\\s+(download|dl|song|now)",
    "download\\s+(free|now)",
    "official(\\s+(video|music\\s+video|audio|lyric\\s+video|visualizer))?",
    "lyric\\s+video|lyrics?|music\\s+video|out\\s+now",
    "hd|hq|4k|1080p|720p|mp3|mp4|320kbps|flac",
    "extended\\s+remix|radio\\s+edit|club\\s+mix|party\\s+mix|mixed\\s+by\\s+dj|live(\\s+performance)?",
    "cover|karaoke|instrumental|backing\\s+track|vocals\\s+only",
    "teaser|trailer|promo|bootleg|mashup",
    "now\\s+available|full\\s+song|full\\s+version|complete\\s+version|original\\s+version|radio\\s+version",
    "explicit|clean\\s+version|copyright\\s+free|royalty\\s+free|no\\s+copyright|creative\\s+commons|cc",
    "official\\s+trailer|official\\s+teaser|[\\w\\s'’\\-]+\\s+premiere",
  ].join("|");

  const cleanRegex = new RegExp(`([\\[\\(]\\s*(${keywordGroup})\\s*[\\]\\)])|(\\s*-\\s*(${keywordGroup})\\s*$)`, "gi");

  strForRegex = strForRegex.replace(cleanRegex, "").replace(/\s+/g, " ").trim();

  let result = strForRegex.length > maxLength ? strForRegex.slice(0, maxLength - 3) + "..." : strForRegex;

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

module.exports = { logRpcConnection, shouldLogAttempt, getCurrentTime, isSameActivity, isSameActivityIgnore, truncate, cleanTitle, extractArtistFromTitle, normalizeTitleAndArtist, isValidUrl, notifyRpcStatus };
