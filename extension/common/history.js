const HISTORY_KEY = "listeningHistory";
const MAX_HISTORY = 500;

function truncate(str, maxLength = 128, { prefix = "", fallback = "Unknown", minLength = 2 } = {}) {
  if (!str) str = "";
  const cleanRegex = /[\[(]\s*(free\s+(download|song|now)|download\s+(free|now)|official\s+video|lyrics|hd)\s*[\])]/gi;
  str = str.replace(cleanRegex, "").trim();
  let result = str.length > maxLength ? str.slice(0, maxLength - 3) + "..." : str;
  if (result.length < minLength) result = prefix + fallback;
  return result;
}

function cleanTitle(title, artist) {
  const trimmedTitle = title.trim();
  const trimmedArtist = artist.trim();

  // If they are completely equal, return as is
  if (trimmedTitle.toLowerCase() === trimmedArtist.toLowerCase()) {
    return trimmedTitle;
  }

  // If the title starts with artist, remove the artist part at the beginning.
  if (trimmedTitle.toLowerCase().startsWith(trimmedArtist.toLowerCase())) {
    const cleaned = trimmedTitle
      .slice(trimmedArtist.length)
      .replace(/^[\s\-–:|.]+/, "")
      .trim();

    return cleaned || trimmedTitle;
  }

  return trimmedTitle;
}

async function loadHistory() {
  const result = await browser.storage.local.get(HISTORY_KEY);
  return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
}

async function saveHistory(list) {
  await browser.storage.local.set({
    [HISTORY_KEY]: list.slice(0, MAX_HISTORY),
  });
}

async function addToHistory({ image, title, artist, source }) {
  if (!title || !artist) return;

  const history = await loadHistory();
  const last = history[0];

  const normalizedTitle = cleanTitle(title, artist);

  const sameAsLast = last && last.title === truncate(normalizedTitle, 128) && last.artist === truncate(artist, 128) && last.source === truncate(source, 32);

  const entry = {
    image,
    title: truncate(cleanTitle(title, artist), 128, { prefix: "Artist: ", fallback: "Unknown Artist" }),
    artist: truncate(artist, 128, { prefix: "Artist: ", fallback: "Unknown Artist" }),
    source: truncate(source, 32, { prefix: "Source: ", fallback: "Unknown Source" }),
    playedAt: Date.now(),
  };

  if (sameAsLast) {
    history[0] = entry;
  } else {
    history.unshift(entry);
  }

  await saveHistory(history);
}
