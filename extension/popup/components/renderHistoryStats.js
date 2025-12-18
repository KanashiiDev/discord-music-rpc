// Filter History
function filterHistoryByRange(history, range, customStart = null, customEnd = null) {
  const { startTime, endTime } = getStartTime(range, customStart, customEnd);
  return history.filter((e) => e.p >= startTime && e.p <= endTime);
}

// Get Top Artists
async function getFilteredTopArtists(filteredHistory) {
  const allArtists = [...new Set(filteredHistory.map((e) => e.a))].filter(Boolean).filter((artist) => !artist.includes("Unknown Artist"));
  const list = await getFreshParserList();
  const parserTexts = list.map((entry) => ((entry.title || "") + " " + (entry.domain || "")).toLowerCase());
  return allArtists.filter((artist) => {
    const name = artist.toLowerCase();
    return !parserTexts.some((text) => text.includes(name));
  });
}

// Get Top Songs
async function getTopSongs(filteredHistory, topN = 5) {
  const allowedArtists = await getFilteredTopArtists(filteredHistory);

  const artistCounts = Object.create(null);
  for (const e of filteredHistory) {
    const norm = normalizeArtistName(e.a);
    if (allowedArtists.includes(e.a)) {
      artistCounts[norm] = (artistCounts[norm] || 0) + 1;
    }
  }

  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));

  const songCounts = Object.create(null);
  for (const e of filteredHistory) {
    if (!allowedArtists.includes(e.a)) continue;
    if (!e.t || e.t.includes("Unknown Song")) continue;
    const key = `${e.t} - ${normalizeArtistName(e.a)}`;
    songCounts[key] = (songCounts[key] || 0) + 1;
  }

  const topSongs = Object.entries(songCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));

  return { topArtists, topSongs };
}

async function toggleArtistStats(artistName, artistId, range, customStart, customEnd) {
  const container = document.getElementById("statsEntries");
  const artistEntry = container.querySelector(`.history-stats-artist-entry[data-artist-id="${artistId}"]`);
  if (!artistEntry) return;
  if (artistEntry._simpleBarTimeout) clearTimeout(artistEntry._simpleBarTimeout);
  const artistDiv = artistEntry.querySelector(".stats");
  const artistNameDiv = artistEntry.querySelector(".artist-name");
  const content = artistDiv.querySelector(".simplebar-content") || artistDiv;

  // Close
  if (artistEntry.classList.contains("active")) {
    artistEntry.style.maxHeight = artistEntry.scrollHeight + "px";
    requestAnimationFrame(async () => {
      const nameHeight = artistNameDiv.offsetHeight;
      artistEntry.style.maxHeight = `${nameHeight}px`;
      await delay(300);
      artistEntry.classList.remove("active");
      content.replaceChildren();
      await activateSimpleBar("historyStatsPanel");
      artistEntry._simpleBarTimeout = null;
    });
    return;
  }

  // Open
  const filteredHistory = filterHistoryByRange(fullHistory, range, customStart, customEnd);
  const artistSongs = filteredHistory.filter((e) => normalizeArtistName(e.a) === artistName);
  const grouped = Object.create(null);
  for (const e of artistSongs) {
    const key = `${e.t} - ${e.s}`;
    if (!grouped[key]) grouped[key] = { entry: e, count: 0 };
    grouped[key].count++;
  }

  const frag = document.createDocumentFragment();
  Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .forEach(({ entry, count }) => {
      const el = createHistoryEntry(entry, null, "stats", filteredHistory);
      el.classList.add("artist-songs");
      el.dataset.artistId = artistId;
      frag.appendChild(el);
    });

  while (content.firstChild) {
    content.removeChild(content.firstChild);
  }
  content.appendChild(frag);
  artistEntry.classList.add("active");

  await activateSimpleBar(artistDiv.id);
  artistEntry.style.maxHeight = artistEntry.scrollHeight + "px";
  if (artistEntry._simpleBarTimeout) clearTimeout(artistEntry._simpleBarTimeout);
  artistEntry._simpleBarTimeout = setTimeout(async () => {
    await activateSimpleBar("historyStatsPanel");
  }, 100);
}

// artist click handler
const handleArtistEntryClick = async (ev) => {
  const artistEntry = ev.target.closest(".history-stats-artist-entry");
  if (!artistEntry) return;
  if (ev.target.closest(".stats")) return;

  const artistName = artistEntry.dataset.artist;
  const artistId = artistEntry.dataset.artistId;
  const range = artistEntry.dataset.range;
  const customStart = artistEntry.dataset.customStart ? parseInt(artistEntry.dataset.customStart) : null;
  const customEnd = artistEntry.dataset.customEnd ? parseInt(artistEntry.dataset.customEnd) : null;

  await toggleArtistStats(artistName, artistId, range, customStart, customEnd);
};

// Render Top Songs
async function renderTopStats(history, range = "day", topN = 5, customStart = null, customEnd = null) {
  const container = document.getElementById("statsEntries");
  if (!container) return;

  if (container._artistClickListener) {
    container.removeEventListener("click", container._artistClickListener);
  }

  container.replaceChildren();
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  container.appendChild(spinner);

  const filteredHistory = filterHistoryByRange(history, range, customStart, customEnd);
  const stats = await getTopSongs(filteredHistory, topN);
  spinner.remove();

  // Artists
  const artistHeader = document.createElement("h3");
  artistHeader.textContent = "Top Artists";
  container.appendChild(artistHeader);

  if (stats.topArtists.length) {
    const frag = document.createDocumentFragment();
    stats.topArtists.forEach((artist, i) => {
      const div = document.createElement("div");
      div.className = "history-stats-artist-entry";
      div.dataset.artist = artist.name;
      div.dataset.artistId = `artist-${i}`;
      div.dataset.range = range;
      if (customStart) div.dataset.customStart = customStart;
      if (customEnd) div.dataset.customEnd = customEnd;

      const header = document.createElement("div");
      header.className = "artist-header";
      div.appendChild(header);

      const name = document.createElement("span");
      name.className = "artist-name";
      name.textContent = `${artist.name}`;
      header.appendChild(name);

      const total = document.createElement("span");
      const totalPlays = filteredHistory.filter((e) => normalizeArtistName(e.a) === artist.name).length;
      total.className = "artist-total";
      total.textContent = `▶ ${totalPlays}`;
      total.title = "Total Plays";
      header.appendChild(total);

      const statsDiv = document.createElement("div");
      statsDiv.className = "stats";
      statsDiv.id = `artist-${i}-stats`;
      div.appendChild(statsDiv);
      frag.appendChild(div);
    });
    container.appendChild(frag);

    // Set the maximum height of artist entries
    const entries = container.querySelectorAll(".history-stats-artist-entry");
    entries.forEach((entry) => {
      const header = entry.children[0];
      if (header) {
        entry.style.maxHeight = `${header.offsetHeight}px`;
      }
    });
  } else {
    const iTag = document.createElement("i");
    iTag.textContent = "Empty.";
    container.appendChild(iTag);
  }

  if (container._artistClickListener) {
    container.removeEventListener("click", container._artistClickListener);
  }
  container._artistClickListener = handleArtistEntryClick;
  container.addEventListener("click", container._artistClickListener);

  // Tracks
  const trackHeader = document.createElement("h3");
  trackHeader.textContent = "Top Tracks";
  container.appendChild(trackHeader);

  if (stats.topSongs.length) {
    const frag = document.createDocumentFragment();
    stats.topSongs.forEach(({ name, count }) => {
      const [title, artist] = name.split(" - ");
      const entry = filteredHistory.find((e) => e.t === title && normalizeArtistName(e.a) === artist);
      if (!entry) return;
      const el = createHistoryEntry(entry, null, "stats", filteredHistory);
      frag.appendChild(el);
    });
    container.appendChild(frag);
  } else {
    const iTag = document.createElement("i");
    iTag.textContent = "Empty.";
    container.appendChild(iTag);
  }
}

const handleDropdownToggleClick = () => {
  const dropdownToggle = document.getElementById("dropdownToggle");
  const dropdownMenu = document.getElementById("dropdownMenu");
  const historyPanel = document.getElementById("historyStatsPanel");
  const datePicker = document.querySelector(".date-range-picker");

  dropdownToggle.classList.toggle("open");
  dropdownMenu.classList.toggle("open");
  historyPanel.classList.remove("custom");
  datePicker.style.display = "none";
  historyPanel.style.minHeight = dropdownMenu.classList.contains("open") ? "310px" : "";
  dropdownToggle.querySelector(".arrow").style.transform = dropdownMenu.classList.contains("open") ? "rotate(180deg)" : "rotate(0deg)";
};

let flatpickrInstances = { start: null, end: null };

const handleDropdownMenuClick = async (e) => {
  const li = e.target.closest("li");
  if (!li || !li.dataset.range) return;

  const dropdownToggle = document.getElementById("dropdownToggle");
  const dropdownMenu = document.getElementById("dropdownMenu");
  const historyPanel = document.getElementById("historyStatsPanel");
  const datePicker = document.querySelector(".date-range-picker");
  const range = li.dataset.range;

  dropdownToggle.childNodes[0].textContent = li.textContent;
  dropdownToggle.classList.remove("open");
  historyPanel.style.minHeight = "";
  dropdownMenu.classList.remove("open");
  dropdownToggle.querySelector(".arrow").style.transform = "rotate(0deg)";

  // Cache control
  const cacheKey = `${range}-${statsModule.currentCustomStart}-${statsModule.currentCustomEnd}`;
  if (statsModule._topStatsCache.has(cacheKey)) {
    const container = document.getElementById("statsEntries");
    const cachedNode = statsModule._topStatsCache.get(cacheKey);
    container.replaceChildren(...cachedNode.cloneNode(true).childNodes);
    await activateSimpleBar("historyStatsPanel");
    return;
  }

  if (range === "custom") {
    historyPanel.classList.add("custom");
    datePicker.style.display = "block";
  } else {
    historyPanel.classList.remove("custom");
    datePicker.style.display = "none";
    statsModule.currentCustomStart = null;
    statsModule.currentCustomEnd = null;

    // Loading Spinner
    const container = document.getElementById("statsEntries");
    container.replaceChildren();
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    container.appendChild(spinner);

    await renderTopStats(fullHistory, range);

    const cloned = container.cloneNode(true);
    statsModule._topStatsCache.set(cacheKey, cloned);

    if (!statsModule._topStatsCacheOrder.includes(cacheKey)) {
      statsModule._topStatsCacheOrder.push(cacheKey);
    }
    if (statsModule._topStatsCacheOrder.length > 10) {
      const oldestKey = statsModule._topStatsCacheOrder.shift();
      statsModule._topStatsCache.delete(oldestKey);
    }

    spinner.remove();
  }

  await activateSimpleBar("historyStatsPanel");
  if (flatpickrInstances.start) flatpickrInstances.start.clear();
  if (flatpickrInstances.end) flatpickrInstances.end.clear();
};

const handleApplyCustomRange = async () => {
  if (!statsModule.currentCustomStart) return alert("Please select start date");
  if (!statsModule.currentCustomEnd) statsModule.currentCustomEnd = new Date().getTime();

  const cacheKey = `custom-${statsModule.currentCustomStart}-${statsModule.currentCustomEnd}`;

  // Show immediately if there is cache
  if (statsModule._topStatsCache.has(cacheKey)) {
    const container = document.getElementById("statsEntries");
    const cachedNode = statsModule._topStatsCache.get(cacheKey);
    container.replaceChildren(...cachedNode.cloneNode(true).childNodes);
    await activateSimpleBar("historyStatsPanel");
    return;
  }

  // Or calculate
  const container = document.getElementById("statsEntries");
  container.replaceChildren();
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  container.appendChild(spinner);

  await renderTopStats(fullHistory, "custom", 5, statsModule.currentCustomStart, statsModule.currentCustomEnd);

  // Save to cache
  const cloned = container.cloneNode(true);
  statsModule._topStatsCache.set(cacheKey, cloned);
  if (!statsModule._topStatsCacheOrder.includes(cacheKey)) {
    statsModule._topStatsCacheOrder.push(cacheKey);
  }
  if (statsModule._topStatsCacheOrder.length > 10) {
    const oldestKey = statsModule._topStatsCacheOrder.shift();
    statsModule._topStatsCache.delete(oldestKey);
  }

  spinner.remove();
  await activateSimpleBar("historyStatsPanel");
};

const handleClearCustomRange = async () => {
  const historyPanel = document.getElementById("historyStatsPanel");
  const datePicker = document.querySelector(".date-range-picker");

  for (const key of statsModule._topStatsCache.keys()) {
    if (key.startsWith("custom-")) {
      statsModule._topStatsCache.delete(key);
      const idx = statsModule._topStatsCacheOrder.indexOf(key);
      if (idx > -1) statsModule._topStatsCacheOrder.splice(idx, 1);
    }
  }

  if (flatpickrInstances.start) flatpickrInstances.start.clear();
  if (flatpickrInstances.end) flatpickrInstances.end.clear();
  historyPanel.classList.remove("custom");
  statsModule.currentCustomStart = null;
  statsModule.currentCustomEnd = null;
  datePicker.style.display = "none";
  await activateSimpleBar("historyStatsPanel");
};

const statsModule = {
  currentCustomStart: null,
  currentCustomEnd: null,
  initialized: false,
  _topStatsCache: new Map(),
  _topStatsCacheOrder: [],
  init() {
    if (this.initialized) return;
    this.initialized = true;

    const dropdownToggle = document.getElementById("dropdownToggle");
    const dropdownMenu = document.getElementById("dropdownMenu");
    const applyBtn = document.getElementById("applyCustomRange");
    const clearBtn = document.getElementById("clearCustomRange");

    dropdownToggle.addEventListener("click", handleDropdownToggleClick);
    dropdownMenu.addEventListener("click", handleDropdownMenuClick);
    applyBtn.addEventListener("click", handleApplyCustomRange);
    clearBtn.addEventListener("click", handleClearCustomRange);

    flatpickrInstances.start = flatpickr("#customStartDate", {
      dateFormat: "d-m-Y",
      onChange: (selectedDates) => {
        if (selectedDates[0]) {
          selectedDates[0].setHours(0, 0, 0, 0);
          statsModule.currentCustomStart = selectedDates[0].getTime();
        }
      },
    });

    flatpickrInstances.end = flatpickr("#customEndDate", {
      dateFormat: "d-m-Y",
      onChange: (selectedDates) => {
        if (selectedDates[0]) {
          selectedDates[0].setHours(23, 59, 59, 999);
          statsModule.currentCustomEnd = selectedDates[0].getTime();
        }
      },
    });
  },
};

// Add the date picker when the page loads
document.addEventListener("DOMContentLoaded", () => {
  statsModule.init();
});
