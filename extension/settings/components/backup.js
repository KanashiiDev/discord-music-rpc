// Export Button
document.getElementById("exportBtn").onclick = async () => {
  try {
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
  } catch (err) {
    log("Export failed: " + err.message);
  }
};

// Import Button
document.getElementById("importBtn").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const storageToRestore = data.storage;

      if (!storageToRestore || typeof storageToRestore !== "object") {
        throw new Error("Invalid storage data");
      }
      // storage
      await browser.storage.local.clear();
      await browser.storage.local.set(storageToRestore);
      // indexedDB
      if (data.indexedDB?.HistoryDB) {
        await importIndexedDB("HistoryDB", data.indexedDB.HistoryDB);
      }

      log("Import completed. Reloading...");
      browser.runtime.reload();
    } catch (err) {
      log("Import failed: " + (err.message || err));
    }
  };

  input.click();
};

// Sync History Button
document.getElementById("syncBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncBtn");
  const originalText = btn.textContent;

  try {
    btn.textContent = "Syncing...";
    btn.disabled = true;

    const result = await sendAction("syncHistory");

    if (result.ok) {
      btn.textContent = `Synced ${result.count} entries`;
    } else {
      btn.textContent = `Failed: ${result.error}`;
    }
  } catch (error) {
    btn.textContent = `Error: ${error.message}`;
  } finally {
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 3000);
  }
});
