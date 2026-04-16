import { loadImage } from "../../../utils.js";

/** Renders the minutes/tracks hero block. */
export function buildMinutesView(data) {
  const wrap = document.createElement("div");
  wrap.className = "summary-minutes-view";

  const hero = document.createElement("div");
  hero.className = "summary-hero";

  const createCell = (number, labelText) => {
    const cell = document.createElement("div");
    cell.className = "summary-hero-cell";

    const num = document.createElement("div");
    num.className = "summary-hero-number";
    num.textContent = number.toLocaleString();

    const label = document.createElement("div");
    label.className = "summary-hero-label";
    label.dataset.i18n = `chart.summary.${labelText.replace(/[^\w]/g, "_")}`;
    label.textContent = labelText;

    cell.appendChild(num);
    cell.appendChild(label);
    return cell;
  };

  hero.appendChild(createCell(data.totalMinutes, "minutes listened"));
  hero.appendChild(createCell(data.totalSongs, "tracks played"));
  wrap.appendChild(hero);
  return wrap;
}

/** Renders a ranked list of songs or artists. */
export function buildRankedList(items, type) {
  const wrap = document.createElement("div");
  wrap.className = "summary-ranked-list";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "summary-empty";
    empty.dataset.i18n = `chart.summary.empty`;
    empty.textContent = "No data for this period.";
    wrap.appendChild(empty);
    return wrap;
  }

  const maxCount = items[0].count;
  const isSongs = type === "songs";

  for (const [idx, item] of items.entries()) {
    const row = document.createElement("div");
    row.className = idx === 0 ? "summary-row summary-row--top" : "summary-row";
    row.style.animationDelay = `${idx * 40}ms`;

    const rank = document.createElement("div");
    rank.className = "summary-rank";
    rank.textContent = idx + 1;

    const imgWrap = document.createElement("div");
    imgWrap.className = "summary-img-wrap spinner";

    const img = document.createElement("img");
    img.className = "summary-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "";
    imgWrap.appendChild(img);

    const info = document.createElement("div");
    info.className = "summary-info";

    const title = document.createElement("div");
    title.className = "summary-title";
    title.textContent = isSongs ? item.title || "Unknown" : item.displayName || item.name || "Unknown";

    const sub = document.createElement("div");
    sub.className = "summary-sub";
    if ((isSongs && !item.artist) || !isSongs) {
      sub.dataset.i18n = `${item.uniqueSongs !== 1 ? "chart.summary.uniqueTracks" : "chart.summary.uniqueTrack"}`;
      sub.dataset.i18nParams = JSON.stringify([item.uniqueSongs]);
    }
    sub.textContent = isSongs ? item.artist || "" : `${item.uniqueSongs} unique track${item.uniqueSongs !== 1 ? "s" : ""}`;

    info.appendChild(title);
    info.appendChild(sub);

    const right = document.createElement("div");
    right.className = "summary-right";

    const barWrap = document.createElement("div");
    barWrap.className = "summary-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "summary-bar";
    bar.style.setProperty("--summary-bar-pct", `${Math.max(4, Math.round((item.count / maxCount) * 100))}%`);
    barWrap.appendChild(bar);

    const count = document.createElement("div");
    count.className = "summary-count";
    count.textContent = `${item.count}×`;

    right.appendChild(barWrap);
    right.appendChild(count);

    row.appendChild(rank);
    row.appendChild(imgWrap);
    row.appendChild(info);
    row.appendChild(right);

    if (isSongs && item.songUrl) {
      row.addEventListener("click", () => window.open(item.songUrl, "_blank", "noopener,noreferrer"));
    }

    wrap.appendChild(row);
    loadImage({ target: img, src: item.image });
  }

  return wrap;
}
