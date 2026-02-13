import { HC_RANGES, chartState } from "./chart.js";
import { HistoryState } from "../history/history.js";
import { ScrollManager } from "../../manager/scrollManager.js";
import { createSVG, svg_paths, updateSimpleBarPadding, relativeTime, fullDateTime } from "../../utils.js";

// Build a single DOM node
function hc_buildSongNode(item) {
  const wrap = document.createElement("div");
  wrap.className = "song hc-song";

  // Image link
  if (item.songUrl) {
    const a = document.createElement("a");
    a.href = item.songUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Go to the song";

    const img = document.createElement("img");
    img.className = "song-image lazyload";
    img.alt = item.title || "";
    img.dataset.src = item.image || "assets/icon-dark.png";
    img.src = "assets/icon-dark.png";
    img.onerror = function () {
      this.onerror = null;
      this.src = "assets/icon-dark.png";
    };
    a.appendChild(img);
    wrap.appendChild(a);
  }

  // Info block
  const info = document.createElement("div");
  info.className = "song-info";

  const dateP = document.createElement("p");
  dateP.className = "date";
  if (item.date) {
    dateP.title = fullDateTime(item.date);
    dateP.textContent = relativeTime(item.date);
  }

  const titleH = document.createElement("h2");
  titleH.className = "title";
  titleH.textContent = item.title || "Unknown title";

  const artistP = document.createElement("p");
  artistP.className = "artist";
  artistP.textContent = item.artist || "";

  const sourceP = document.createElement("p");
  sourceP.className = "source";
  sourceP.textContent = item.source || "";

  info.appendChild(dateP);
  info.appendChild(titleH);
  info.appendChild(artistP);
  info.appendChild(sourceP);
  wrap.appendChild(info);

  return wrap;
}

// Toggle the song list for a platform row
async function hc_toggleSongList(platformRow, songs, platName) {
  // Close existing open list
  if (chartState.expandedPlatform && chartState.expandedPlatform !== platName) {
    const open = document.querySelector(".chart-detail-row.hc-expanded");
    if (open) {
      open.classList.remove("hc-expanded");
      const existing = open.nextElementSibling;
      if (existing?.classList.contains("hc-song-list")) {
        ScrollManager.cleanups.get(`hcSong_${chartState.expandedPlatform}`)?.();
        ScrollManager.cleanups.delete(`hcSong_${chartState.expandedPlatform}`);
        ScrollManager.activeIntervals.delete(`hcSong_${chartState.expandedPlatform}`);
        existing.classList.remove("hc-open");
        await new Promise((resolve) => {
          existing.addEventListener(
            "transitionend",
            () => {
              existing.remove();
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  }

  // Toggle current
  const isOpen = platformRow.classList.contains("hc-expanded");

  if (isOpen) {
    platformRow.classList.remove("hc-expanded");
    ScrollManager.cleanups.get(`hcSong_${platName}`)?.();
    ScrollManager.cleanups.delete(`hcSong_${platName}`);
    ScrollManager.activeIntervals.delete(`hcSong_${platName}`);
    chartState.expandedPlatform = null;
    const listEl = platformRow.nextElementSibling;
    if (listEl?.classList.contains("hc-song-list")) {
      listEl.classList.remove("hc-open");
      listEl.addEventListener("transitionend", () => listEl.remove(), { once: true });
    }
    return;
  }

  platformRow.classList.add("hc-expanded");
  chartState.expandedPlatform = platName;

  // Build list container
  const listWrap = document.createElement("div");
  listWrap.className = "hc-song-list";
  listWrap.id = "hcSongList";

  const inner = document.createElement("div");
  inner.className = "hc-song-list-inner";
  inner.id = "hcSongListInner";
  listWrap.appendChild(inner);
  platformRow.insertAdjacentElement("afterend", listWrap);

  // SimpleBar init
  let sbInstance = null;
  if (typeof SimpleBar !== "undefined") {
    sbInstance = new SimpleBar(listWrap, { autoHide: false });
  }

  const sorted = [...songs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const PAGE = 20;

  const scrollState = {
    fullData: sorted,
    filteredData: [],
    isFiltering: false,
    currentOffset: 0,
    isLoading: false,
  };

  const scrollRenderer = {
    _isRendering: false,
    async render({ reset }) {
      if (reset) {
        inner.textContent = "";
        scrollState.currentOffset = 0;
      }
      const slice = scrollState.fullData.slice(scrollState.currentOffset, scrollState.currentOffset + PAGE);
      for (const item of slice) {
        inner.appendChild(hc_buildSongNode(item));
      }
      scrollState.currentOffset += slice.length;
    },
  };

  await scrollRenderer.render({ reset: true });

  ScrollManager.activate(`hcSong_${platName}`, sbInstance, scrollRenderer, scrollState, "hcSongList", "songs");

  requestAnimationFrame(() => listWrap.classList.add("hc-open"));
  updateSimpleBarPadding("hcSongList");
}

// Populate and reveal the detail panel for the clicked bar
export function hc_showDetails(barIndex, chartData, mode, range) {
  const panel = document.getElementById("chartDetails");
  const titleEl = document.getElementById("chartDetailsTitle");
  const totalEl = document.getElementById("chartDetailsTotal");
  const platformEl = document.getElementById("chartDetailsPlatforms");
  if (!panel) return;

  chartState.expandedPlatform = null;

  titleEl.textContent = chartData.labels[barIndex] ?? "";
  totalEl.textContent = "";
  platformEl.textContent = "";

  const cfg = HC_RANGES[range];
  const periodStart = new Date(cfg.getStart());
  const isYear = range === "year";
  const targetMonth = isYear ? barIndex : null;

  if (!isYear) {
    periodStart.setDate(periodStart.getDate() + barIndex);
    periodStart.setHours(0, 0, 0, 0);
  }

  let totalCount = 0;
  let totalMs = 0;
  const byPlatform = {};

  for (const item of HistoryState.fullData ?? []) {
    if (!item.date) continue;

    const src = item.source || "Unknown";
    if (src === "Unknown") continue;

    const d = new Date(item.date);
    d.setHours(0, 0, 0, 0);

    const hit = isYear ? d.getFullYear() === periodStart.getFullYear() && d.getMonth() === targetMonth : d.getTime() === periodStart.getTime();

    if (!hit) continue;
    if (mode === "minutes" && !(item.total_listened_ms > 0)) continue;

    if (!byPlatform[src]) byPlatform[src] = { count: 0, ms: 0, items: [] };
    byPlatform[src].count += 1;
    byPlatform[src].items.push(item);
    totalCount += 1;

    if (item.total_listened_ms > 0) {
      byPlatform[src].ms += item.total_listened_ms;
      totalMs += item.total_listened_ms;
    }
  }

  if (totalCount === 0) {
    totalEl.textContent = "No records for this period.";
    panel.classList.remove("hidden");
    return;
  }

  totalEl.textContent = mode === "songs" ? `${totalCount} song${totalCount !== 1 ? "s" : ""}` : `${Math.round(totalMs / 60_000)} min total`;

  const sorted = Object.entries(byPlatform).sort((a, b) => b[1].count - a[1].count);

  for (const [plat, stat] of sorted) {
    const row = document.createElement("div");
    row.className = "chart-detail-row";

    const name = document.createElement("span");
    name.className = "chart-detail-platform";
    name.textContent = plat;

    const val = document.createElement("span");
    val.className = "chart-detail-value";
    val.textContent = mode === "songs" ? `${stat.count} song${stat.count !== 1 ? "s" : ""}` : `${stat.count} tracks · ${Math.round(stat.ms / 60_000)} min`;

    const chevron = document.createElement("span");
    chevron.className = "chart-detail-chevron";
    chevron.append(createSVG(svg_paths.expand));

    row.appendChild(name);
    row.appendChild(val);
    row.appendChild(chevron);
    platformEl.appendChild(row);

    row.addEventListener("click", () => hc_toggleSongList(row, stat.items, plat));
  }

  panel.classList.remove("hidden");
  panel.addEventListener(
    "transitionend",
    () => {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    { once: true },
  );
}

// Collapse the detail panel and any open song list
export function hc_hideDetails() {
  const panel = document.getElementById("chartDetails");
  if (panel) panel.classList.add("hidden");
  chartState.lastClickedBarIndex = null;
  chartState.expandedPlatform = null;
}
