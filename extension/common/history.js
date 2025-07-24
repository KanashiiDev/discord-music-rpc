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
  const normalizedArtist = extractArtistFromTitle(title, artist);
  const normalizedTitle = cleanTitle(title, normalizedArtist);
  const sameAsLast = last && last.title === truncate(normalizedTitle, 128) && last.artist === truncate(normalizedArtist, 128) && last.source === truncate(source, 32);
  const entry = {
    image,
    title: truncate(normalizedTitle, 128, { prefix: "Artist: ", fallback: "Unknown Artist" }),
    artist: truncate(normalizedArtist, 128, { prefix: "Artist: ", fallback: "Unknown Artist" }),
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
