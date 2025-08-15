const HISTORY_KEY = "listeningHistory";
const MAX_HISTORY = 500;

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
  const lastArtist = last.title === last.artist ? "" : last.artist;
  const normalized = normalizeTitleAndArtist(title, artist);
  const normalizedArtist = normalized.artist === normalized.title ? "Radio" : normalized.artist;
  const normalizedTitle = normalized.title;
  const titleText = truncate(normalizedTitle, 128, { fallback: "Unknown Song" });
  const artistText = truncate(normalizedArtist, 128, {fallback: "Unknown Artist" });
  const sourceText = truncate(source, 32, {fallback: "Unknown Source" });
  const sameAsLast = last && last.title === titleText && lastArtist === artistText && last.source === sourceText;

  const entry = {
    image,
    title: titleText,
    artist: artistText,
    source: sourceText,
    playedAt: Date.now(),
  };

  if (sameAsLast) {
    history[0] = entry;
  } else {
    history.unshift(entry);
  }

  await saveHistory(history);
}
