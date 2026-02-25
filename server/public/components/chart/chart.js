import { getCSS } from "../../utils.js";

// Chart state
export const chartState = {
  mode: "minutes",
  range: "month",
  instance: null,
  lastClickedBarIndex: null,
  expandedPlatform: null,
};

export const HC_COLORS = {
  minutes: {
    rgb: getCSS("--chart-time", "#4a6a94", "rgb-string"),
    accent: getCSS("--chart-time", "#4a6a94"),
    label: "Listening time",
  },
  songs: {
    rgb: getCSS("--chart-songs", "#44864e", "rgb-string"),
    accent: getCSS("--chart-songs", "#44864e"),
    label: "Songs",
  },
};

export const HC_RANGES = {
  week: {
    barThickness: 32,
    labelFormat: { weekday: "short" },
    getStart() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
      return d;
    },
    getDayCount() {
      return 7;
    },
  },
  month: {
    barThickness: 10,
    labelFormat: { day: "numeric", month: "short" },
    getStart() {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    },
    getDayCount() {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    },
  },
  year: {
    barThickness: 22,
    labelFormat: null,
    getStart() {
      return new Date(new Date().getFullYear(), 0, 1);
    },
    getDayCount() {
      const y = new Date().getFullYear();
      return new Date(y, 1, 29).getMonth() === 1 ? 366 : 365;
    },
  },
};
