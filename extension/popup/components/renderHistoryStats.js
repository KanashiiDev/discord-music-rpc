// Filter History
function filterHistoryByRange(history, range, customStart = null, customEnd = null) {
  const { startTime, endTime } = getStartTime(range, customStart, customEnd);
  return history.filter((e) => e.p >= startTime && e.p <= endTime);
}

// Get Top Artists
async function getFilteredTopArtists(filteredHistory) {
  // All artist names in History
  const allArtists = [...new Set(filteredHistory.map((e) => e.a))];

  // Parser list
  const list = await getFreshParserList();

  // Items in the parser list that include the artist's name
  const parserTexts = list.map((entry) => {
    return ((entry.title || "") + " " + (entry.domain || "")).toLowerCase();
  });

  // Filter history artists: select those not included in the parser
  const filteredArtists = allArtists.filter((artist) => {
    const name = artist.toLowerCase();
    return !parserTexts.some((text) => text.includes(name));
  });

  return filteredArtists;
}

// Get Top Songs
async function getTopSongs(filteredHistory, topN = 5) {
  // Get artist names filtered from the parser list
  const allowedArtists = await getFilteredTopArtists(filteredHistory);

  // Top Artists - only those not in the parser list
  const artistCounts = {};
  filteredHistory.forEach((e) => {
    const normalized = normalizeArtistName(e.a);
    // Only count those that are in allowedArtists
    if (allowedArtists.includes(e.a)) {
      artistCounts[normalized] = (artistCounts[normalized] || 0) + 1;
    }
  });
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));

  // Top Tracks - only songs from artists not in the parser list
  const songCounts = {};
  filteredHistory.forEach((e) => {
    if (allowedArtists.includes(e.a)) {
      const key = `${e.t} - ${normalizeArtistName(e.a)}`;
      songCounts[key] = (songCounts[key] || 0) + 1;
    }
  });
  const topSongs = Object.entries(songCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));
  return { topArtists, topSongs };
}

async function toggleArtistStats(artistName, artistId, range, customStart, customEnd) {
  const container = document.getElementById("statsEntries");
  const artistDiv = container.querySelector(`.history-stats-artist-entry[data-artist-id="${artistId}"] .stats`);
  const artistNameDiv = container.querySelector(`.history-stats-artist-entry[data-artist-id="${artistId}"] .artist-name`);
  if (!artistDiv) return;

  const parent = artistDiv.parentElement;
  const simpleContent = artistDiv.querySelector(".simplebar-content") || artistDiv;

  // Close
  if (parent.classList.contains("active")) {
    parent.style.maxHeight = parent.scrollHeight + "px";
    requestAnimationFrame(async () => {
      const nameHeight = artistNameDiv.offsetHeight;
      parent.style.maxHeight = `${nameHeight}px`;
      await delay(300);
      parent.classList.remove("active");
      simpleContent.replaceChildren();
    });
    return;
  }

  // Open
  const filteredHistory = filterHistoryByRange(fullHistory, range, customStart, customEnd);
  const artistSongs = filteredHistory.filter((e) => normalizeArtistName(e.a) === artistName);
  const grouped = {};
  for (const e of artistSongs) {
    const key = `${e.t} - ${e.s}`;
    if (!grouped[key]) grouped[key] = { entry: e, count: 0 };
    grouped[key].count++;
  }

  const fragment = document.createDocumentFragment();
  Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .forEach(({ entry, count }) => {
      const parserEntry = createHistoryEntry(entry);
      parserEntry.classList.add("artist-songs");
      parserEntry.dataset.artistId = artistId;
      const src = parserEntry.querySelector(".history-source");
      if (src) src.textContent = `${count} ${count > 1 ? "times" : "time"} listened`;
      fragment.appendChild(parserEntry);
    });

  simpleContent.replaceChildren(fragment);
  await activateSimpleBar(artistDiv.id);
  parent.classList.add("active");
  parent.style.maxHeight = parent.scrollHeight + "px";
}

// Render Top Songs
async function renderTopStats(history, range = "day", topN = 5, customStart = null, customEnd = null) {
  const container = document.getElementById("statsEntries");
  container.innerHTML = "";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  container.appendChild(spinner);
  const filteredHistory = filterHistoryByRange(history, range, customStart, customEnd);
  const stats = await getTopSongs(filteredHistory, topN);
  container.querySelector(".spinner")?.remove();

  // Artists Header
  const artistsHeader = document.createElement("h3");
  artistsHeader.textContent = "Top Artists";
  container.appendChild(artistsHeader);

  // Build Artists List
  stats.topArtists.forEach((artist, i) => {
    const div = document.createElement("div");
    div.className = "history-stats-artist-entry";
    div.dataset.artist = artist.name;
    div.dataset.artistId = `artist-${i}`;

    // Artist name
    const nameSpan = document.createElement("span");
    nameSpan.className = "artist-name";
    nameSpan.textContent = artist.name;
    div.appendChild(nameSpan);

    // Stats div
    const divStats = document.createElement("div");
    divStats.className = "stats";
    divStats.id = `artist-${i}-stats`;
    div.appendChild(divStats);

    // Click event
    div.addEventListener("click", async () => {
      await toggleArtistStats(artist.name, div.dataset.artistId, range, customStart, customEnd);
    });

    container.appendChild(div);
  });

  if (!stats.topArtists.length) {
    const emptyMsg = document.createElement("i");
    emptyMsg.textContent = "Empty.";
    container.appendChild(emptyMsg);
  }

  // Top Tracks Header
  const tracksHeader = document.createElement("h3");
  tracksHeader.textContent = "Top Tracks";
  container.appendChild(tracksHeader);

  // Top Tracks List
  stats.topSongs.forEach(({ name, count }) => {
    const [title, artist] = name.split(" - ");
    const entry = filteredHistory.find((e) => e.t === title && normalizeArtistName(e.a) === artist);
    if (!entry) return;

    const parserEntry = createHistoryEntry(entry);
    const sourceDiv = parserEntry.querySelector(".history-source");
    if (sourceDiv) sourceDiv.textContent = `${count} ${count > 1 ? "times" : "time"} listened`;
    container.appendChild(parserEntry);
  });

  if (!stats.topSongs.length) {
    const emptyMsg = document.createElement("i");
    emptyMsg.textContent = "Empty.";
    container.appendChild(emptyMsg);
  }
}

// Add the date picker when the page loads
document.addEventListener("DOMContentLoaded", () => {
  let currentCustomStart = null;
  let currentCustomEnd = null;
  const historyPanel = document.getElementById("historyStatsPanel");
  const dropdownToggle = document.getElementById("dropdownToggle");
  const dropdownMenu = document.getElementById("dropdownMenu");
  const datePicker = document.querySelector(".date-range-picker");

  // Dropdown toggle
  dropdownToggle.addEventListener("click", () => {
    dropdownToggle.classList.toggle("open");
    dropdownMenu.classList.toggle("open");
    historyPanel.classList.remove("custom");
    datePicker.style.display = "none";
    historyPanel.style.minHeight = dropdownMenu.classList.contains("open") ? "310px" : "";
    dropdownToggle.querySelector(".arrow").style.transform = dropdownMenu.classList.contains("open") ? "rotate(180deg)" : "rotate(0deg)";
  });

  // Dropdown selections
  dropdownMenu.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", async () => {
      const range = li.dataset.range;

      dropdownToggle.childNodes[0].textContent = li.textContent;
      dropdownToggle.classList.remove("open");
      historyPanel.style.minHeight = "";
      dropdownMenu.classList.remove("open");
      dropdownToggle.querySelector(".arrow").style.transform = "rotate(0deg)";

      if (range === "custom") {
        historyPanel.classList.add("custom");
        datePicker.style.display = "block";
      } else {
        historyPanel.classList.remove("custom");
        datePicker.style.display = "none";
        currentCustomStart = null;
        currentCustomEnd = null;
        await renderTopStats(fullHistory, range);
      }
      historyPanel.style.paddingRight = "";
      await activateSimpleBar("historyStatsPanel");
    });
  });

  // Flatpickr init
  flatpickr("#customStartDate", {
    dateFormat: "d-m-Y",
    onChange: (selectedDates) => {
      if (selectedDates[0]) {
        selectedDates[0].setHours(0, 0, 0, 0);
        currentCustomStart = selectedDates[0].getTime();
      }
    },
  });

  flatpickr("#customEndDate", {
    dateFormat: "d-m-Y",
    onChange: (selectedDates) => {
      if (selectedDates[0]) {
        selectedDates[0].setHours(23, 59, 59, 999);
        currentCustomEnd = selectedDates[0].getTime();
      }
    },
  });

  // Apply button
  document.getElementById("applyCustomRange").addEventListener("click", async () => {
    if (!currentCustomStart) return alert("Please select start date");
    if (!currentCustomEnd) currentCustomEnd = new Date().getTime();
    await renderTopStats(fullHistory, "custom", 5, currentCustomStart, currentCustomEnd);
  });

  // Clear button
  document.getElementById("clearCustomRange").addEventListener("click", () => {
    document.querySelector("#customStartDate")._flatpickr.clear();
    document.querySelector("#customEndDate")._flatpickr.clear();
    historyPanel.classList.remove("custom");
    currentCustomStart = null;
    currentCustomEnd = null;
    datePicker.style.display = "none";
    dropdownToggle.childNodes[0].textContent = "Select Range";
  });
});
