import { createSVG, svg_paths } from "../utils.js";

export const dom = {
  container: document.querySelector(".container"),
  containerToggle: document.getElementById("toggleContainer"),
  main: document.querySelector(".main"),
  rpcStatus: document.getElementById("rpcStatus"),
  statusBox: document.querySelector(".status-box"),

  leftContainer: document.querySelector(".left"),
  rightContainer: document.querySelector(".right"),

  logsContainer: document.getElementById("logsContainer"),
  historyContainer: document.getElementById("historyContainer"),

  activityJson: document.getElementById("activityJson"),
  lastActivityJson: document.getElementById("lastActivityJson"),
  errorFilter: document.getElementById("errorFilter"),

  musicCard: {
    container: document.getElementById("musicCardContainer"),
    trackTitle: document.getElementById("trackTitle"),
    trackArtist: document.getElementById("trackArtist"),
    trackSource: document.getElementById("trackSource"),
    coverImage: document.getElementById("coverImage"),
    progressFill: document.getElementById("progressFill"),
    timePassed: document.getElementById("timePassed"),
    duration: document.getElementById("duration"),
    progressBar: document.getElementById("progressBar"),
    trackLink1: document.getElementById("trackLink1"),
    trackLink2: document.getElementById("trackLink2"),
  },
  settings: {
    container: document.getElementById("settingsContainer"),
    form: document.getElementById("settingsForm"),
    saveBtn: document.getElementById("saveSettingsBtn"),
    resetBtn: document.getElementById("resetSettingsBtn"),
    toggle: document.getElementById("settingsToggle"),
    back: document.getElementById("settingsBack"),
  },
};

export const icons = {
  single: createSVG(svg_paths.single),
  dual: createSVG(svg_paths.dual),
};

export const simpleBars = {
  activity: new SimpleBar(document.getElementById("activityWrapper")),
  lastActivity: new SimpleBar(document.getElementById("lastActivityWrapper")),
  logs: new SimpleBar(document.getElementById("logsWrapper")),
  history: new SimpleBar(document.getElementById("historyWrapper")),
};
