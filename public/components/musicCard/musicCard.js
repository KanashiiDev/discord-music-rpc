import { dom } from "../../core/dom.js";
import { DataStore } from "../../core/dataStore.js";
import { formatTime } from "../../utils.js";

const musicCardState = {
  customStartTime: null,
  lastTrackId: null,
  lastKnownMusic: {
    title: null,
    artist: null,
    source: null,
    cover: null,
    hasTimestamps: null,
    start: null,
    end: null,
    isPlaying: null,
  },
};

function updateMusicCardUI() {
  if (document.hidden) return;

  const cardContainer = dom.musicCard.container;
  if (!cardContainer || cardContainer.offsetParent === null) return;

  const activityData = DataStore.get("activity");
  const act = activityData?.activity;

  if (!act?.details) {
    if (musicCardState.lastKnownMusic.isPlaying !== false) {
      dom.musicCard.trackTitle.textContent = "No Music Playing";
      dom.musicCard.trackArtist.textContent = "Artist";
      dom.musicCard.trackSource.textContent = "Source";
      dom.musicCard.coverImage.src = "assets/icon-dark.png";
      dom.musicCard.progressFill.style.width = "0%";
      dom.musicCard.timePassed.textContent = "0:00";
      dom.musicCard.duration.textContent = "0:00";
      dom.musicCard.trackLink1.style.display = "none";
      dom.musicCard.trackLink2.style.display = "none";
      dom.musicCard.container.classList.add("no-music");

      musicCardState.lastKnownMusic.isPlaying = false;
      musicCardState.customStartTime = null;
      musicCardState.lastTrackId = null;
      musicCardState.lastKnownMusic.title = null;
      musicCardState.lastKnownMusic.start = null;
      musicCardState.lastKnownMusic.end = null;
    }
    return;
  }

  if (musicCardState.lastKnownMusic.isPlaying !== true) {
    dom.musicCard.container.classList.remove("no-music");
    musicCardState.lastKnownMusic.isPlaying = true;
  }

  const title = act.details ?? "Unknown Title";
  const artist = act.state ?? "Unknown Artist";
  const source = act.largeImageText ?? "Unknown Source";
  const cover = act.largeImageKey ?? "assets/icon-dark.png";

  if (title !== musicCardState.lastKnownMusic.title) dom.musicCard.trackTitle.textContent = title;
  if (artist !== musicCardState.lastKnownMusic.artist) dom.musicCard.trackArtist.textContent = artist;
  if (source !== musicCardState.lastKnownMusic.source) dom.musicCard.trackSource.textContent = source;
  if (cover !== musicCardState.lastKnownMusic.cover) dom.musicCard.coverImage.src = cover;

  const trackId = `${title}__${artist}`;
  if (trackId !== musicCardState.lastTrackId) {
    musicCardState.lastTrackId = trackId;
    musicCardState.customStartTime = Date.now();

    dom.musicCard.coverImage.src = cover;
    musicCardState.lastKnownMusic.cover = cover;
  }

  if (act.startTimestamp && act.endTimestamp) {
    const start = act.startTimestamp;
    const end = act.endTimestamp;
    const total = Math.max(0, end - start);
    const passed = Math.min(Math.max(0, Math.floor(Date.now() / 1000) - start), total);

    const timeStr = formatTime(passed);
    const durStr = formatTime(total);
    const percent = total === 0 ? 0 : (passed / total) * 100;

    if (musicCardState.lastKnownMusic.hasTimestamps !== true) {
      dom.musicCard.duration.style.display = "inline-block";
      dom.musicCard.progressBar.style.display = "flex";
      musicCardState.lastKnownMusic.hasTimestamps = true;
    }

    if (dom.musicCard.duration.textContent !== durStr) dom.musicCard.duration.textContent = durStr;
    if (dom.musicCard.timePassed.textContent !== timeStr) dom.musicCard.timePassed.textContent = timeStr;

    const newWidth = `${Math.min(percent, 100)}%`;
    if (dom.musicCard.progressFill.style.width !== newWidth) {
      dom.musicCard.progressFill.style.width = newWidth;
    }

    musicCardState.lastKnownMusic.start = start;
    musicCardState.lastKnownMusic.end = end;
  } else {
    const elapsed = musicCardState.customStartTime ? Math.floor((Date.now() - musicCardState.customStartTime) / 1000) : 0;
    const timeStr = formatTime(elapsed);

    if (musicCardState.lastKnownMusic.hasTimestamps !== false) {
      dom.musicCard.duration.style.display = "none";
      dom.musicCard.progressBar.style.display = "none";
      musicCardState.lastKnownMusic.hasTimestamps = false;
    }
    if (dom.musicCard.timePassed.textContent !== timeStr) dom.musicCard.timePassed.textContent = timeStr;
  }

  [0, 1].forEach((index) => {
    const btnData = act.buttons?.[index];
    const btnDom = index === 0 ? dom.musicCard.trackLink1 : dom.musicCard.trackLink2;

    if (btnData) {
      if (btnDom.textContent !== btnData.label || btnDom.href !== btnData.url) {
        btnDom.textContent = btnData.label;
        btnDom.href = btnData.url;
        btnDom.style.display = "inline-block";
      }
    } else if (btnDom.style.display !== "none") {
      btnDom.style.display = "none";
    }
  });

  musicCardState.lastKnownMusic.title = title;
  musicCardState.lastKnownMusic.artist = artist;
  musicCardState.lastKnownMusic.source = source;
  musicCardState.lastKnownMusic.cover = cover;
}

// UI update interval
let uiUpdateInterval = null;

// Start the music card
export function initMusicCard() {
  DataStore.subscribe("activity", () => {
    updateMusicCardUI();
  });

  // Update the UI every 1 second
  if (uiUpdateInterval) clearInterval(uiUpdateInterval);
  uiUpdateInterval = setInterval(updateMusicCardUI, 1000);
}

// Cleanup
export function destroyMusicCard() {
  if (uiUpdateInterval) {
    clearInterval(uiUpdateInterval);
    uiUpdateInterval = null;
  }
}
