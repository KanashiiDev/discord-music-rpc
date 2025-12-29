async function initApplyAttrs() {
  const { styleAttrs } = await browser.storage.local.get("styleAttrs");
  if (styleAttrs) {
    document.body.setAttribute("style", styleAttrs);
  }

  const { theme } = await browser.storage.local.get("theme");
  if (theme) {
    document.body.dataset.theme = theme;
  }
}

function initStorageListener() {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.styleAttrs) {
      const styleString = changes.styleAttrs.newValue || "";
      document.body.setAttribute("style", styleString);
    }
    if (changes.theme) {
      document.body.dataset.theme = changes.theme.newValue || "dark";
    }
  });
}

// Export Button
document.getElementById("exportBtn").onclick = async () => {
  const storageDump = await browser.storage.local.get(null);
  const historyDump = await exportIndexedDB("HistoryDB");
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  const dateString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const fullBackup = {
    time: now.toISOString(),
    storage: storageDump,
    indexedDB: {
      HistoryDB: historyDump,
    },
  };

  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `discord-music-rpc-backup-${dateString}.json`;
  a.click();
  URL.revokeObjectURL(url);
  log("Export completed.");
};

// Import Button
document.getElementById("importBtn").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = async () => {
    const file = input.files[0];
    const text = await file.text();

    try {
      const data = JSON.parse(text);
      // storage
      await browser.storage.local.clear();
      await browser.storage.local.set(data.storage);

      // indexedDB
      if (data.indexedDB?.HistoryDB) await importIndexedDB("HistoryDB", data.indexedDB.HistoryDB);
      log("Import completed. Reloading...");
      browser.runtime.reload();
    } catch (err) {
      log("Import failed: " + err.message);
    }
  };

  input.click();
};

// LOG helper
function log(msg) {
  const logEl = document.getElementById("log");
  logEl.classList.add("visible");
  logEl.textContent += msg + "\n";
}

initApplyAttrs();
initStorageListener();
