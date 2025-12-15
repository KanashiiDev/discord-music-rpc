const params = new URLSearchParams(window.location.search);
const theme = params.get("theme");
if (theme) {
  document.body.dataset.theme = theme || "dark";
}

// Export Button
document.getElementById("exportBtn").onclick = async () => {
  const storageDump = await browser.storage.local.get(null);
  const historyDump = await exportIndexedDB("HistoryDB");

  const fullBackup = {
    time: new Date().toISOString(),
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
  a.download = "backup.json";
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
