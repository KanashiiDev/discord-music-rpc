const flatpickrInstances = { start: null, end: null };
function clearFlatpickr() {
  flatpickrInstances.start?.clear();
  flatpickrInstances.end?.clear();
}

function saveToCache(cacheKey, container) {
  if (statsModule._topStatsCache.has(cacheKey)) return;
  statsModule._topStatsCache.set(cacheKey, container.cloneNode(true));
  statsModule._topStatsCacheOrder.push(cacheKey);
  if (statsModule._topStatsCacheOrder.length > 10) {
    statsModule._topStatsCache.delete(statsModule._topStatsCacheOrder.shift());
  }
}

function restoreFromCache(cacheKey) {
  const container = document.getElementById("statsEntries");
  if (!container) return false;
  const cached = statsModule._topStatsCache.get(cacheKey);
  if (!cached) return false;

  container.replaceChildren(...cached.cloneNode(true).childNodes);

  if (container._artistClickListener) {
    container.removeEventListener("click", container._artistClickListener);
  }
  container._artistClickListener = handleArtistEntryClick;
  container.addEventListener("click", container._artistClickListener);
  return true;
}

const handleApplyCustomRange = async () => {
  if (!statsModule.currentCustomStart) return alert("Please select start date");
  statsModule.currentCustomEnd ??= Date.now();

  const cacheKey = `custom-${statsModule.currentCustomStart}-${statsModule.currentCustomEnd}`;

  if (restoreFromCache(cacheKey)) {
    await activateSimpleBar("historyStatsPanel");
    return;
  }

  const container = document.getElementById("statsEntries");
  container.replaceChildren();
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  container.appendChild(spinner);

  await renderTopStats(historyState.fullHistory, "custom", 5, statsModule.currentCustomStart, statsModule.currentCustomEnd);

  saveToCache(cacheKey, container);
  spinner.remove();
  await activateSimpleBar("historyStatsPanel");
};

const handleClearCustomRange = async () => {
  const datePicker = document.querySelector(".date-range-picker");

  for (const key of [...statsModule._topStatsCache.keys()]) {
    if (key.startsWith("custom-")) {
      statsModule._topStatsCache.delete(key);
      const idx = statsModule._topStatsCacheOrder.indexOf(key);
      if (idx > -1) statsModule._topStatsCacheOrder.splice(idx, 1);
    }
  }

  clearFlatpickr();
  statsModule.currentCustomStart = null;
  statsModule.currentCustomEnd = null;
  datePicker.style.display = "none";
  await activateSimpleBar("historyStatsPanel");
};
