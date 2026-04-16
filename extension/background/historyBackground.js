const HISTORY_KEY = "listeningHistory";
const HISTORY_DB_NAME = "HistoryDB";
const HISTORY_STORE_NAME = "historyStore";
const HISTORY_DB_VERSION = 2;
const MAX_HISTORY = 60000;

async function saveHistory(data) {
  if (Array.isArray(data)) {
    data = data.slice(0, MAX_HISTORY);
  }
  const db = await openIndexedDB(HISTORY_DB_NAME, HISTORY_STORE_NAME, HISTORY_DB_VERSION);
  const tx = db.transaction(HISTORY_STORE_NAME, "readwrite");
  const store = tx.objectStore(HISTORY_STORE_NAME);
  const compressed = pako.deflate(JSON.stringify({ h: data }));
  store.put(compressed, "history");
  await tx.complete;
}

async function loadHistory() {
  const db = await openIndexedDB(HISTORY_DB_NAME, HISTORY_STORE_NAME, HISTORY_DB_VERSION);
  const tx = db.transaction(HISTORY_STORE_NAME, "readonly");
  const store = tx.objectStore(HISTORY_STORE_NAME);
  const req = store.get("history");

  return new Promise((resolve) => {
    req.onsuccess = () => {
      const compressed = req.result;
      if (!compressed || !compressed.length) return resolve([]);
      try {
        const decompressed = pako.inflate(compressed, { to: "string" });
        const data = JSON.parse(decompressed);
        resolve(Array.isArray(data.h) ? data.h : []);
      } catch (e) {
        resolve([]);
      }
    };

    req.onerror = () => resolve([]);
  });
}

async function addToHistory({ image, title, artist, source, songUrl, date = Date.now() }) {
  if (!title || !artist) return;

  const history = await loadHistory();
  const last = history[0];
  const lastArtist = last?.t === last?.a ? "" : last?.a;
  const sameAsLast = last && last.t === title && lastArtist === artist && last.s === source;

  const entry = {
    i: image,
    t: title,
    a: artist,
    s: source,
    u: songUrl,
    p: date,
  };

  if (sameAsLast) {
    history[0] = entry;
  } else {
    history.unshift(entry);
  }

  if (state.serverPort) {
    await handleAddHistoryToServer({ title, artist, source, image, songUrl, date });
  }

  await saveHistory(history);
}
