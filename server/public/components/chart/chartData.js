import { HC_RANGES } from "./chart.js";
import { HistoryState } from "../history/history.js";

// Aggregate HistoryState.fullData into chart-ready buckets
export function hc_prepareData(mode, range) {
  const cfg = HC_RANGES[range];
  const start = cfg.getStart();
  const days = cfg.getDayCount();
  const buckets = new Array(days).fill(0);
  const items = HistoryState?.fullData;
  if (!Array.isArray(items) || items.length === 0) {
    return { labels: [], data: [], maxValue: 1 };
  }

  const now = Date.now();

  for (const item of items) {
    if (!item.date) continue;

    const ts = new Date(item.date);
    if (ts.getTime() > now) continue;

    ts.setHours(0, 0, 0, 0);
    const idx = Math.floor((ts - start) / 86_400_000);
    if (idx < 0 || idx >= days) continue;

    if (mode === "songs") {
      buckets[idx] += 1;
    } else if (item.total_listened_ms > 0) {
      buckets[idx] += item.total_listened_ms / 1000; // → seconds
    }
  }

  // Convert seconds → minutes for "minutes" mode
  const values = mode === "songs" ? buckets : buckets.map((s) => Math.round(s / 60));

  // Year view: collapse daily → 12 monthly buckets
  if (range === "year") {
    const monthly = new Array(12).fill(0);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      monthly[d.getMonth()] += values[i];
    }
    const labels = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleString("en-US", { month: "short" }));
    return { labels, data: monthly, maxValue: Math.max(...monthly, 1) };
  }

  // Week / month: one bar per day
  const labels = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.toLocaleDateString("en-US", cfg.labelFormat);
  });

  return { labels, data: values, maxValue: Math.max(...values, 1) };
}
