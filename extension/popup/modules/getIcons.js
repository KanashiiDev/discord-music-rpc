const AUTHOR_KEY = "AUTHORS";
const AUTHOR_DB_NAME = "AUTHORDB";
const AUTHOR_STORE_NAME = "AUTHORStore";
const AUTHOR_DB_VERSION = 1;
const AUTHOR_TTL = 1000 * 60 * 60 * 24 * 7; // 7 Days

// Load all authors
async function loadAuthorsDB() {
  const db = await openIndexedDB(AUTHOR_DB_NAME, AUTHOR_STORE_NAME, AUTHOR_DB_VERSION);
  const tx = db.transaction(AUTHOR_STORE_NAME, "readonly");
  const store = tx.objectStore(AUTHOR_STORE_NAME);
  const req = store.get(AUTHOR_KEY);

  return new Promise((resolve) => {
    req.onsuccess = () => {
      const compressed = req.result;
      if (!compressed || !compressed.length) return resolve([]);
      try {
        const decompressed = pako.inflate(compressed, { to: "string" });
        const data = JSON.parse(decompressed);
        let authors = Array.isArray(data.h) ? data.h : [];

        // TTL check
        const now = Date.now();
        authors = authors.filter((h) => !h.timestamp || now - h.timestamp < AUTHOR_TTL);

        resolve(authors);
      } catch (e) {
        resolve([]);
      }
    };

    req.onerror = () => resolve([]);
  });
}

// Save all authors
async function saveAuthorsDB(data) {
  if (!Array.isArray(data)) return;

  const db = await openIndexedDB(AUTHOR_DB_NAME, AUTHOR_STORE_NAME, AUTHOR_DB_VERSION);
  const tx = db.transaction(AUTHOR_STORE_NAME, "readwrite");
  const store = tx.objectStore(AUTHOR_STORE_NAME);

  const compressed = pako.deflate(JSON.stringify({ h: data }));
  store.put(compressed, AUTHOR_KEY);
  await tx.complete;
}

// Save author
async function saveAuthorDB(username, base64) {
  const existing = await loadAuthorsDB();
  const idx = existing.findIndex((h) => h.username === username);
  if (idx >= 0) {
    existing[idx].authorBase64 = base64;
    existing[idx].timestamp = Date.now();
  } else {
    existing.push({ username, authorBase64: base64, timestamp: Date.now() });
  }
  await saveAuthorsDB(existing);
}

// Load all authors
async function loadAuthorIcons(icons) {
  for (let icon of icons) {
    const username = icon.dataset.src;

    // IndexedDB check
    let authorUrl = null;
    const existingAuthors = await loadAuthorsDB();
    const dbItem = existingAuthors.find((h) => h.username === username);
    if (dbItem?.authorUrl) {
      authorUrl = dbItem.authorUrl;
    }

    // Otherwise fetch GitHub avatar URL + save to DB
    if (!authorUrl) {
      try {
        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error("GitHub API ERROR");
        const data = await res.json();
        authorUrl = data.avatar_url;

        // Save URL to DB
        await saveAuthorDB(username, authorUrl);
      } catch (err) {
        console.error(err);
        authorUrl = browser.runtime.getURL("icons/48x48.png");
      }

      await delay(200);
    }
    icon.src = authorUrl;
    icon.onload = () => {
      icon.classList.remove("hidden");
      icon.parentElement.classList.remove("spinner");
    };
  }
}

//Load all favicons
async function loadFavIcons(icons, concurrency = 3, delayMs = 150, slowAfter = 8) {
  const queue = [...icons];
  let loadedCount = 0;

  const workers = new Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const icon = queue.shift();
      const domain = icon.dataset.src;

      // Proxy URL
      const url = `https://favicons.seadfeng.workers.dev/${domain}.ico`;
      icon.src = url;

      // Fallback default
      icon.onerror = () => {
        icon.src = browser.runtime.getURL("icons/48x48.png");
      };

      icon.onload = () => {
        icon.classList.remove("hidden");
        icon.parentElement.classList.remove("spinner");
      };

      loadedCount++;

      // Increase the delay time
      if (loadedCount > slowAfter) {
        await delay(delayMs * 2);
      } else {
        await delay(delayMs);
      }
    }
  });

  await Promise.all(workers);
}
