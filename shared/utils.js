function truncate(str, maxLength = 128, { fallback = "Unknown", minLength = 2, maxRegexLength = 512 } = {}) {
  if (typeof str !== "string" || !str.trim()) return fallback;

  // Keywords that need to be cleaned
  const alwaysRemoveKeywords = [
    "(flash|flicker|strobe|epilepsy|seizure|photosensitiv)\\s+warn(ing)?",
    "copyright free|royalty free|no copyright|creative commons|free download|download free",
    "download now|new release|official site|official page|buy now|available now|stream now|link in bio|link below",
    "official video|music video|MusicVideo|lyric video|full video|video clip|full version|full ver.|official mv",
    "フルバージョン|完全版|主題歌|劇場版|映画|テーマソング|ミュージックビデオ|音楽ビデオ|公式|ライブ|生放送|カラオケ|歌詞付き|歌詞動画|予告|トレーラー|主題歌/FULL ver.|主題歌",
    "完整版|完整版MV|官方MV|官方视频|主题曲|原声带|插曲|电影版|影视版|演唱会|现场|现场版|歌词版|歌词视频|卡拉OK|预告|预告片|预览|高清|官方预告",
    "완전판|풀버전|정식버전|공식|공식뮤직비디오|뮤비|뮤직비디오|테마송|주제가|영화판|가사영상|가사버전|티저|예고편|예고|영상|고화질",
  ];

  // Keywords that need to be cleaned if they are in parentheses
  const optionalRemoveKeywords = [
    "hd|hq|4k|8k|1080p|720p|480p|\\.mp3|\\.mp4|\\.flac|\\.wav|\\.aac|320kbps|256kbps|128kbps",
    "free\\s+(download|dl|song|now)|download\\s+(free|now)",
    "official(\\s+(video|music\\s+video|audio|lyric\\s+video|visualizer))?",
    "Bonus\\s+Track|PATREON|teaser|trailer|promo|lyric\\s+video|lyrics?|music\\s+video|out\\s+now",
    "subbed|mixed\\s+by\\s+dj|karaoke|backing\\s+track|vocals\\s+only|live(\\s+performance)?",
    "now\\s+available|full\\s+song|full\\s+version|complete\\s+version|original\\s+version",
    "official\\s+trailer|official\\s+teaser|[\\w\\s''.\\-]+\\s+premiere",
  ];

  str = str.trim();
  if (str.length >= 1 && str.length < minLength) str = `[ ${str} ]`;

  // Limit for regex
  let strForRegex = str.length > maxRegexLength ? str.slice(0, maxRegexLength) : str;

  // Always remove
  const alwaysRemoveRegex = new RegExp(alwaysRemoveKeywords.join("|"), "gi");
  const afterAlways = strForRegex.replace(alwaysRemoveRegex, "");

  strForRegex = afterAlways;

  // Optional remove (only in brackets)
  const optionalRegexStr = optionalRemoveKeywords.join("|");
  const afterOptional = strForRegex.replace(/([\[\(（【])([^\]\)）】]+)([\]\)）】])/g, (match, open, content, close) => {
    const cleanedContent = content
      .replace(new RegExp(`\\b(${optionalRegexStr})\\b`, "gi"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const result = cleanedContent ? `${open}${cleanedContent}${close}` : "";

    return result;
  });
  strForRegex = afterOptional;

  // Remove the dash marks inside the parentheses
  const afterDash1 = strForRegex.replace(/[\[\(（]\s*-\s*([^\]\)）]+)[\]\)）]/g, "[$1]");
  const afterDash2 = afterDash1.replace(/[\[\(（]([^\]\)）]+?)\s*-\s*[\]\)）]/g, "[$1]");
  strForRegex = afterDash2;

  // Empty parentheses (run twice to catch newly emptied ones)
  const afterEmptyParens1 = strForRegex.replace(/[\[\(（【]\s*[\]\)）】]/g, "");
  const afterEmptyParens2 = afterEmptyParens1.replace(/[\[\(（【]\s*[\]\)）】]/g, "");
  strForRegex = afterEmptyParens2;

  // Normalize whitespace
  const afterWhitespace = strForRegex.replace(/\s+/g, " ").trim();
  strForRegex = afterWhitespace;

  // Remove problematic characters, control characters and broken surrogates
  try {
    const afterControl = strForRegex.replace(/[\u0000-\u001F\u007F]/g, "");
    const afterZeroWidth = afterControl.replace(/[\u200B-\u200D\uFEFF\u180E]/g, "");
    const afterNFC = afterZeroWidth.normalize("NFC");
    const afterSurrogates = afterNFC.replace(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/g, "").replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
    const afterNonPrint = afterSurrogates.replace(/[^\u0020-\u007E\u00A0-\uD7FF\uE000-\uFFFD]/g, "");

    strForRegex = afterNonPrint;
  } catch (_) {}

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

function normalizeTitleAndArtist(title, artist, replaceArtist = true) {
  let dataTitle = title?.trim() || "";
  let dataArtist = artist?.trim() || "";
  if (!dataTitle) return { title: dataTitle, artist: dataArtist };

  const calculateSimilarity = (str1, str2) => {
    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, "");
    const s1 = normalize(str1);
    const s2 = normalize(str2);
    if (s1 === s2) return 1;
    if (!s1 || !s2) return 0;
    const [longer, shorter] = s1.length >= s2.length ? [s1, s2] : [s2, s1];
    return longer.includes(shorter) ? shorter.length / longer.length : 0;
  };

  const parenIndex = dataTitle.search(/[\[\(（【]/);
  const titleBeforeParen = parenIndex !== -1 ? dataTitle.slice(0, parenIndex) : dataTitle;
  const parenPart = parenIndex !== -1 ? dataTitle.slice(parenIndex) : "";
  const dashMatch = titleBeforeParen.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (dashMatch && replaceArtist) {
    const extractedArtist = dashMatch[1].trim();
    const newTitle = dashMatch[2] + parenPart;

    // Check if the two parts are similar (repetitive title)
    const similarity = calculateSimilarity(extractedArtist, newTitle);

    // If similarity is high , use the first part as title and keep original artist
    if (similarity > 0.7) {
      return { title: extractedArtist, artist: dataArtist };
    }

    const artistLower = dataArtist.toLowerCase();
    const extractedLower = extractedArtist.toLowerCase();

    const artistPattern = new RegExp(`(^|\\s|[-–—])${dataArtist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—]`, "i");
    const artistAppearsInTitle = artistPattern.test(dataTitle);
    const extractedMatchesCurrent = extractedLower === artistLower || extractedLower.includes(artistLower) || artistLower.includes(extractedLower);

    if (artistAppearsInTitle || extractedMatchesCurrent) {
      dataArtist = extractedArtist;
      dataTitle = newTitle;
    }
  }

  const cleanTitle = (title, artist) => {
    if (!title || !artist) return title;

    const artistList = artist
      .split(/\s*(?:,|&|feat\.?|featuring|ft\.?|with)\s*/i)
      .map((a) => a.trim())
      .filter((a) => a.length >= 2);

    if (!artistList.length) return title;

    const escaped = artistList.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const prefixPattern = new RegExp(`^\\s*(?:(?:${escaped})(?:\\s*[&+,xX×]\\s*(?:${escaped}))*)\\s*[-–—:]\\s*`, "i");
    const cleaned = title.replace(prefixPattern, "").trim();
    return cleaned.length >= 2 ? cleaned : title;
  };

  const finalTitle = cleanTitle(dataTitle, dataArtist);
  return { title: finalTitle, artist: dataArtist };
}

function getCurrentTime() {
  const now = new Date();
  return [now.getHours().toString().padStart(2, "0"), now.getMinutes().toString().padStart(2, "0"), now.getSeconds().toString().padStart(2, "0")].join(":");
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

module.exports = {
  getCurrentTime,
  truncate,
  normalizeTitleAndArtist,
  isValidUrl,
};
