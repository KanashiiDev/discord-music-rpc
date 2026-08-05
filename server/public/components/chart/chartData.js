import { HC_RANGES } from "./chart.js";
import { HistoryState } from "../history/history.js";

// Aggregate history data into chart-ready buckets, filtered by mode
export function hc_prepareData(mode, range, chartState, historyMode = "listen") {
  const cfg = HC_RANGES[range];
  const offset = chartState.offset;

  const start = cfg.getStart(offset);
  const bucketsCount = cfg.getDayCount(offset);
  const buckets = new Array(bucketsCount).fill(0);

  const allItems = HistoryState[historyMode]?.fullData;
  if (!Array.isArray(allItems) || allItems.length === 0) {
    return { labels: [], data: [], maxValue: 1 };
  }

  const periodEnd = new Date(start);
  if (range === "week") periodEnd.setDate(periodEnd.getDate() + bucketsCount);
  else if (range === "month") periodEnd.setMonth(periodEnd.getMonth() + 1);
  else if (range === "year") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else if (range === "alltime") periodEnd.setTime(Date.now());

  const effectiveEnd = Math.min(periodEnd.getTime(), Date.now());

  for (const item of allItems) {
    if (!item.date) continue;

    const ts = new Date(item.date);
    if (ts.getTime() > effectiveEnd) continue;

    let idx;
    if (range === "alltime") {
      idx = ts.getFullYear() - 1970;
    } else {
      ts.setHours(0, 0, 0, 0);
      idx = Math.floor((ts - start) / 86_400_000);
    }

    if (idx < 0 || idx >= bucketsCount) continue;

    if (mode === "songs" || mode === "videos") {
      buckets[idx] += 1;
    } else if (item.total_listened_ms > 0) {
      buckets[idx] += item.total_listened_ms / 1000;
    }
  }

  const valuesMode = mode === "songs" || mode === "videos" ? 1 : 0;
  const values = valuesMode ? buckets : buckets.map((s) => Math.round(s / 60));

  if (range === "year") {
    const monthly = new Array(12).fill(0);
    for (let i = 0; i < bucketsCount; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      monthly[d.getMonth()] += values[i];
    }
    const labels = Array.from({ length: 12 }, (_, m) =>
      new Date(2000, m, 1).toLocaleString(navigator.languages?.[0] || navigator.language || "en-US", { month: "short" }),
    );
    return { labels, data: monthly, maxValue: Math.max(...monthly, 1) };
  }

  if (range === "alltime") {
    let firstNonEmpty = 0;
    while (firstNonEmpty < bucketsCount && values[firstNonEmpty] === 0) firstNonEmpty++;
    if (firstNonEmpty === bucketsCount) return { labels: [], data: [], maxValue: 1 };

    const finalValues = values.slice(firstNonEmpty);
    const labels = Array.from({ length: finalValues.length }, (_, i) => String(1970 + firstNonEmpty + i));
    return { labels, data: finalValues, maxValue: Math.max(...finalValues, 1) };
  }

  const labels = Array.from({ length: bucketsCount }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toLocaleString(navigator.languages?.[0] || navigator.language || "en-US", cfg.labelFormat);
  });

  return { labels, data: values, maxValue: Math.max(...values, 1) };
}
