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
  if (!str || str.length < minLength) return fallback;

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
    "PATREON|teaser|trailer|promo|lyric\\s+video|lyrics?|music\\s+video|out\\s+now",
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
  const safeParenthesesRegex = new RegExp(`[\[\(（【][^\[\]()（）【】]{0,500}[\)\]）】]`, "g");
  strForRegex = strForRegex.replace(safeParenthesesRegex, "");

  // Empty parentheses
  strForRegex = strForRegex.replace(/[\[\(（【]\s*[\]\)）】]/g, "");
  strForRegex = strForRegex.replace(/\s+/g, " ").trim();

  // Max length
  let result = strForRegex;
  if (strForRegex.length > maxLength) {
    const chars = Array.from(strForRegex);

    if (chars.length > maxLength) {
      let truncateIndex = maxLength - 3;

      // Try not to leave the last word unfinished.
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
  const pattern = new RegExp(`^(${artistList.join("|")})(\\s*[&+,xX×]\\s*(${artistList.join("|")}))*\\s*[-–—:]+\\s*`, "i");
  const cleaned = trimmedTitle.replace(pattern, "").trim();
  const finalCleaned = cleaned.replace(/^[-–—:]+\s*/, "").trim();
  return finalCleaned.length > 0 ? finalCleaned : trimmedTitle;
}

function normalizeTitleAndArtist(title, artist, replaceArtist = true) {
  let dataTitle = title?.trim() || "";
  let dataArtist = artist?.trim() || "";

  const dashMatch = dataTitle.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch && replaceArtist) {
    const extractedArtist = dashMatch[1].trim();
    const newTitle = dashMatch[2].trim();

    const extractedLower = extractedArtist.toLowerCase();
    const artistLower = dataArtist.toLowerCase();

    if (!(dataArtist.length > extractedArtist.length && artistLower.includes(extractedLower))) {
      dataArtist = extractedArtist;
    }

    dataTitle = newTitle;
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
  normalizeTitleAndArtist,
  isValidUrl,
  notifyRpcStatus,
};
