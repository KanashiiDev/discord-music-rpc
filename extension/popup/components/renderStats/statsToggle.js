async function toggleArtistStats(artistName, artistId, range, customStart, customEnd) {
  const container = document.getElementById("statsEntries");
  const artistEntry = container?.querySelector(`.history-stats-artist-entry[data-artist-id="${artistId}"]`);
  if (!artistEntry) return;

  clearTimeout(artistEntry._simpleBarTimeout);

  const artistDiv = artistEntry.querySelector(".stats");
  const artistNameDiv = artistEntry.querySelector(".artist-name");
  const content = artistDiv?.querySelector(".simplebar-content") ?? artistDiv;
  if (!artistDiv || !content) return;

  // Close
  if (artistEntry.classList.contains("active")) {
    artistEntry.style.maxHeight = `${artistEntry.scrollHeight}px`;
    requestAnimationFrame(async () => {
      artistEntry.style.maxHeight = `${artistNameDiv?.offsetHeight ?? 0}px`;
      await waitForTransitionEnd(artistEntry, "max-height");
      artistEntry.classList.remove("active");
      content.replaceChildren();
      await activateSimpleBar("historyStatsPanel");
      artistEntry._simpleBarTimeout = null;
    });
    return;
  }

  // Open
  const filteredHistory = filterHistoryByRange(historyState.fullHistory, range, customStart, customEnd);

  const grouped = Object.create(null);
  for (const e of filteredHistory) {
    if (normalizeArtistName(e?.a) !== artistName) continue;
    const key = `${e.t} - ${e.s}`;
    if (!grouped[key]) grouped[key] = { entry: e, count: 0 };
    grouped[key].count++;
  }

  const frag = document.createDocumentFragment();
  Object.values(grouped)
    .sort((a, b) => b.count - a.count)
    .forEach(({ entry }) => {
      const el = createHistoryEntry(entry, null, "stats", filteredHistory);
      el.classList.add("artist-songs");
      el.dataset.artistId = artistId;
      frag.appendChild(el);
    });

  content.replaceChildren(frag);
  artistEntry.classList.add("active");

  await activateSimpleBar(artistDiv.id);
  artistEntry.style.maxHeight = `${artistEntry.scrollHeight}px`;

  artistEntry._simpleBarTimeout = setTimeout(async () => {
    await activateSimpleBar("historyStatsPanel");
    artistEntry._simpleBarTimeout = null;
  }, 100);
}

const handleArtistEntryClick = async (ev) => {
  const artistEntry = ev.target.closest(".history-stats-artist-entry");
  if (!artistEntry || ev.target.closest(".stats")) return;
  if (artistEntry._toggling) return;
  artistEntry._toggling = true;
  try {
    await toggleArtistStats(
      artistEntry.dataset.artist,
      artistEntry.dataset.artistId,
      artistEntry.dataset.range,
      artistEntry.dataset.customStart ? parseInt(artistEntry.dataset.customStart, 10) : null,
      artistEntry.dataset.customEnd ? parseInt(artistEntry.dataset.customEnd, 10) : null,
    );
  } finally {
    artistEntry._toggling = false;
  }
};
