let customStartTime = null;
let toggleTimeout;
let expandTimeout;
let lastTrackId = null;
const container = document.querySelector(".container");
const containerToggle = document.getElementById("toggleContainer");
const theme = document.querySelector(".theme");
const main = document.querySelector(".main");
const activitySimpleBar = new SimpleBar(document.getElementById("activityWrapper"));
const lastActivitySimpleBar = new SimpleBar(document.getElementById("lastActivityWrapper"));
const logsSimpleBar = new SimpleBar(document.getElementById("logsWrapper"));
const historySimpleBar = new SimpleBar(document.getElementById("historyWrapper"));
let previousHistory = [];
let previousLogs = [];

// DOM Element Cache
const domCache = {
  rpcStatus: document.getElementById("rpcStatus"),
  activityJson: document.getElementById("activityJson"),
  lastActivityJson: document.getElementById("lastActivityJson"),
  logsContainer: document.getElementById("logsContainer"),
  historyContainer: document.getElementById("historyContainer"),
  trackTitle: document.getElementById("trackTitle"),
  trackArtist: document.getElementById("trackArtist"),
  trackSource: document.getElementById("trackSource"),
  coverImage: document.getElementById("coverImage"),
  timePassed: document.getElementById("timePassed"),
  duration: document.getElementById("duration"),
  progressBar: document.getElementById("progressBar"),
  progressFill: document.getElementById("progressFill"),
  trackLink1: document.getElementById("trackLink1"),
  trackLink2: document.getElementById("trackLink2"),
};

// Toggle Settings
const settingsContainer = document.getElementById("settingsContainer");
const settingsToggle = document.getElementById("settingsToggle");
settingsToggle.appendChild(createSVG(svg_paths.gear));
const settingsBack = document.getElementById("settingsBack");
settingsBack.appendChild(createSVG(svg_paths.back));
const settingsSave = document.getElementById("saveSettingsBtn");
const settingsReset = document.getElementById("resetSettingsBtn");
const settingsForm = document.getElementById("settingsForm");

// SETTINGS TOGGLE
settingsToggle.addEventListener("click", () => {
  container.classList.add("switch");
  if (toggleTimeout) clearTimeout(toggleTimeout);
  toggleTimeout = setTimeout(() => {
    main.style.display = "none";
    containerToggle.style.display = "none";
    settingsToggle.style.display = "none";
    settingsContainer.style.display = "block";
    settingsBack.style.display = "block";
    loadSettings();
    container.classList.remove("switch");
  }, 300);
});

//  BACK BUTTON
settingsBack.addEventListener("click", () => {
  container.classList.add("switch");
  if (toggleTimeout) clearTimeout(toggleTimeout);
  toggleTimeout = setTimeout(() => {
    containerToggle.style.display = "block";
    settingsToggle.style.display = "block";
    settingsContainer.style.display = "none";
    settingsBack.style.display = "none";
    main.style.display = "block";
    container.classList.remove("switch");
  }, 300);
});

//  SAVE BUTTON
settingsSave.addEventListener("click", () => {
  saveSettings();
});

// RESET BUTTON
settingsReset.addEventListener("click", async () => {
  try {
    resetSettings();
  } catch (err) {
    alert("Failed to reset settings: " + err.message);
  }
});

// Container Theme Switch
const containerTheme = () => localStorage.getItem("theme-switch") === "true";
const statusBox = document.querySelector(".status-box");
const musicCardContainer = document.getElementById("musicCardContainer");
const rightContainer = document.querySelector(".right");
const squareSvg = createSVG(svg_paths.single);
const doubleSvg = createSVG(svg_paths.dual);

if (containerTheme()) {
  container.classList.add("grid");
  containerToggle.appendChild(squareSvg);
} else {
  container.classList.remove("grid");
  containerToggle.appendChild(doubleSvg);
  statusBox.insertAdjacentElement("afterend", musicCardContainer);
}

// Container Theme Switch Toggle
containerToggle.addEventListener("click", () => {
  container.classList.add("switch");
  if (toggleTimeout) clearTimeout(toggleTimeout);
  toggleTimeout = setTimeout(() => {
    containerToggle.innerHTML = "";
    container.classList.toggle("grid");
    const isGrid = container.classList.contains("grid");
    isGrid ? containerToggle.appendChild(squareSvg) : containerToggle.appendChild(doubleSvg);
    localStorage.setItem("theme-switch", isGrid);

    if (containerTheme()) {
      rightContainer.insertAdjacentElement("afterbegin", musicCardContainer);
    } else {
      statusBox.insertAdjacentElement("afterend", musicCardContainer);
    }
    container.classList.remove("switch");
  }, 300);
});

// Collapsible Toggle
document.querySelectorAll("h2.collapsible").forEach((header) => {
  header.addEventListener("click", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT" || e.target.closest("select")) {
      return;
    }

    if (expandTimeout) clearTimeout(expandTimeout);

    const box = header.nextElementSibling;
    if (!box) return;

    const isOpen = box.classList.contains("open");
    header.classList.toggle("open", !isOpen);

    // Close
    if (isOpen) {
      const currentHeight = box.scrollHeight;
      box.style.maxHeight = currentHeight + "px";
      requestAnimationFrame(() => {
        box.classList.remove("open");
        box.style.maxHeight = "";
      });
      return;
    }

    // OPEN
    const minHeightBefore = box.offsetHeight;
    box.classList.add("open");
    const prevMax = box.style.maxHeight;
    box.style.maxHeight = "none";
    let realHeight = getTotalHeight(box, box);
    const cssMax = parseInt(box.dataset.maxHeight);
    realHeight = realHeight > cssMax ? (realHeight = cssMax) : realHeight;
    box.style.maxHeight = prevMax;

    // Simplebar updates
    activitySimpleBar.recalculate();
    lastActivitySimpleBar.recalculate();
    document.querySelector("#activityJson").style.paddingBottom = document.querySelector(
      "#activityWrapper .simplebar-track.simplebar-horizontal[style='visibility: visible;']",
    )
      ? "20px"
      : "0";
    document.querySelector("#lastActivityJson").style.paddingBottom = document.querySelector(
      "#lastActivityWrapper .simplebar-track.simplebar-horizontal[style='visibility: visible;']",
    )
      ? "20px"
      : "0";

    // if the height hasn't changed, cancel opening
    requestAnimationFrame(() => {
      box.style.maxHeight = realHeight + "px";
    });

    box.dataset.minHeight = minHeightBefore;
    if (!box.dataset.maxHeight) box.dataset.maxHeight = realHeight;

    header.style.pointerEvents = "none";
    expandTimeout = setTimeout(() => {
      const minH = parseInt(box.dataset.minHeight);
      const maxH = parseInt(box.dataset.maxHeight);

      if (maxH <= minH + 1) {
        box.style.maxHeight = "";
        box.classList.remove("open");
        header.classList.remove("open");
      }

      header.style.pointerEvents = "";
    }, 300);
  });
});

// LOGS
function updateLogs(logs, filter) {
  const filtered = logs
    .slice()
    .reverse()
    .filter((log) => filter === "all" || log.type === filter);

  // Don't update if there are no changes
  if (JSON.stringify(filtered) === JSON.stringify(previousLogs)) {
    return;
  }
  previousLogs = filtered;

  const fragment = document.createDocumentFragment();

  filtered.forEach((log) => {
    const div = document.createElement("div");
    div.className = `logEntry ${log.type}`;

    const header = document.createElement("div");
    header.className = `header`;

    const time = document.createElement("span");
    const date = new Date(log.timestamp);
    const dateLong = date.toLocaleString();
    const unixSeconds = Math.floor(date.getTime() / 1000);
    const dateAgo = nativeTimeElement(unixSeconds);
    time.className = "time";
    time.textContent = `${dateAgo} (${dateLong})`;
    time.dataset.songDate = Date.parse(log.timestamp);

    const type = document.createElement("span");
    type.className = `type ${log.type}`;
    type.textContent = `${log.type}`;

    const message = document.createElement("div");
    message.className = `message`;
    message.textContent = `${log.message}`;

    const stack = document.createElement("div");
    stack.className = `stack`;
    stack.textContent = `${log.stack || ""}`;

    header.append(time, type);
    div.append(header, message, stack);
    fragment.appendChild(div);
  });

  // Update the DOM
  domCache.logsContainer.innerHTML = "";
  domCache.logsContainer.appendChild(fragment);

  // Simplebar Recalculate
  logsSimpleBar.recalculate();
  domCache.logsContainer.style.paddingRight = document.querySelector("#logsWrapper .simplebar-track[style='visibility: visible;']") ? "" : "0";
}

// Song History
function updateHistory(history) {
  if (JSON.stringify(history) === JSON.stringify(previousHistory)) {
    return;
  }

  // Find newly added songs
  const newSongs = history.slice(previousHistory.length);
  previousHistory = history;

  // If there’s no new song, leave.
  if (newSongs.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  // Add the new songs
  newSongs
    .slice()
    .reverse()
    .forEach((song) => {
      const songDiv = document.createElement("div");
      songDiv.classList.add("song");

      const imageLink = document.createElement("a");
      if (song.songUrl) {
        imageLink.href = song.songUrl;
        imageLink.target = "_blank";
        imageLink.rel = "noopener noreferrer";
        imageLink.title = "Go to the song";
      }

      const img = document.createElement("img");
      img.className = "song-image lazyload";
      img.dataset.src = song.image || "assets/icon-dark.png";
      img.src = "assets/icon-dark.png";
      img.alt = song.title;

      const infoDiv = document.createElement("div");
      infoDiv.classList.add("song-info");

      const title = document.createElement("h2");
      title.textContent = song.title;
      title.classList.add("title");

      const artist = document.createElement("p");
      artist.textContent = song.artist;
      artist.classList.add("artist");

      const source = document.createElement("p");
      source.textContent = song.source;
      source.classList.add("source");

      const date = document.createElement("p");
      const dateLong = new Date(song.date).toLocaleString();
      const unixSeconds = Math.floor(song.date / 1000);
      const dateAgo = nativeTimeElement(unixSeconds);
      date.textContent = dateAgo;
      date.title = dateLong;
      date.classList.add("date");
      date.dataset.songDate = song.date;

      imageLink.append(img);
      infoDiv.append(date, title, artist, source);
      songDiv.append(imageLink, infoDiv);
      fragment.appendChild(songDiv);
    });

  // Add new songs to the top
  domCache.historyContainer.insertBefore(fragment, domCache.historyContainer.firstChild);

  // Simplebar Recalculate
  historySimpleBar.recalculate();
  domCache.historyContainer.style.paddingRight = document.querySelector("#historyWrapper .simplebar-track[style='visibility: visible;']") ? "" : "0";
}

// Update Dashboard
async function updateDashboard() {
  try {
    const [status, activity, logs, history] = await Promise.all([
      fetch("/status").then((r) => r.json()),
      fetch("/activity").then((r) => r.json()),
      fetch("/logs").then((r) => r.json()),
      fetch("/history").then((r) => r.json()),
    ]);

    // Activity
    const rpcConnected = status.rpcConnected ? "Connected" : "Not Connected";
    if (domCache.rpcStatus.textContent !== rpcConnected) {
      domCache.rpcStatus.textContent = rpcConnected;
      domCache.rpcStatus.className = status.rpcConnected ? "connected" : "disconnected";
    }

    const activityText = JSON.stringify(activity.activity || {}, null, 2);
    if (domCache.activityJson.textContent !== activityText) {
      domCache.activityJson.textContent = activityText;
    }

    const lastActivityText = JSON.stringify(activity.lastUpdateRequest || {}, null, 2);
    if (domCache.lastActivityJson.textContent !== lastActivityText) {
      domCache.lastActivityJson.textContent = lastActivityText;
    }

    // Logs
    const filter = document.getElementById("errorFilter");
    updateLogs(logs, filter.value);

    // History
    updateHistory(history);

    // Update Song Dates
    const dateElements = document.querySelectorAll(".song-info > .date, .logEntry > .header > .time");
    dateElements.forEach((el) => {
      const timestamp = Number(el.dataset.songDate);
      const unixSeconds = Math.floor(timestamp / 1000);
      const newText = nativeTimeElement(unixSeconds);
      if (el.textContent !== newText) {
        el.textContent = newText;
      }
    });
  } catch (err) {
    console.error(err);
    domCache.rpcStatus.textContent = "Server Offline";
    domCache.rpcStatus.className = "disconnected";
  }
}

// Update Listening to Music Card
async function updateMusicCard() {
  try {
    const data = await fetch("/activity").then((r) => r.json());
    const act = data?.activity;

    // No activity
    if (!act || !act.details) {
      if (domCache.trackTitle.textContent !== "No Music Playing") {
        domCache.trackTitle.textContent = "No Music Playing";
        domCache.trackArtist.textContent = "Artist";
        domCache.trackSource.textContent = "Source";
        domCache.coverImage.src = "assets/icon-dark.png";
        domCache.progressFill.style.width = "0%";
        domCache.timePassed.textContent = "0:00";
        domCache.duration.textContent = "0:00";
        domCache.trackLink1.style.display = "none";
        domCache.trackLink2.style.display = "none";
        container.classList.add("no-music");
      }

      customStartTime = null;
      lastTrackId = null;
      return;
    } else if (container.classList.contains("no-music")) {
      container.classList.remove("no-music");
    }

    // Update fields
    const newTitle = act.details || "Unknown Title";
    if (domCache.trackTitle.textContent !== newTitle) {
      domCache.trackTitle.textContent = newTitle;
    }

    const newArtist = act.state || "Unknown Artist";
    if (domCache.trackArtist.textContent !== newArtist) {
      domCache.trackArtist.textContent = newArtist;
    }

    const newSource = act.largeImageText || "Unknown Source";
    if (domCache.trackSource.textContent !== newSource) {
      domCache.trackSource.textContent = newSource;
    }

    const newCover = act.largeImageKey ?? "assets/icon-dark.png";
    if (domCache.coverImage.src !== newCover) {
      domCache.coverImage.src = newCover;
    }

    const trackId = `${act.details}__${act.state}`;
    if (trackId !== lastTrackId) {
      lastTrackId = trackId;
      customStartTime = Date.now();
      document.querySelectorAll("h2.collapsible").forEach((header) => {
        const box = header.nextElementSibling;
        if (!box) return;
        if (box.classList.contains("open")) box.style.maxHeight = box.scrollHeight + "px";
      });
    }

    const elapsed = Math.floor((Date.now() - customStartTime) / 1000);
    const now = Math.floor(Date.now() / 1000);
    const start = act.startTimestamp;
    const end = act.endTimestamp;
    const hasTimestamps = typeof start === "number" && typeof end === "number";

    if (hasTimestamps) {
      const total = Math.max(0, end - start);
      let passed = Math.max(0, now - start);
      if (passed > total) passed = total;

      const passedText = formatTime(passed);
      if (domCache.timePassed.textContent !== passedText) {
        domCache.timePassed.textContent = passedText;
      }

      const durationText = formatTime(total);
      if (domCache.duration.textContent !== durationText) {
        domCache.duration.textContent = durationText;
      }

      let progressPercent = total === 0 ? 0 : (passed / total) * 100;
      if (progressPercent > 100) progressPercent = 100;
      const progressWidth = progressPercent + "%";
      if (domCache.progressFill.style.width !== progressWidth) {
        domCache.progressFill.style.width = progressWidth;
      }

      domCache.timePassed.style.display = "inline-block";
      domCache.duration.style.display = "inline-block";
      domCache.progressBar.style.display = "flex";
    } else {
      const elapsedText = formatTime(elapsed);
      if (domCache.timePassed.textContent !== elapsedText) {
        domCache.timePassed.textContent = elapsedText;
      }
      domCache.duration.style.display = "none";
      domCache.progressBar.style.display = "none";
    }

    const buttons = act.buttons || [];

    if (buttons[0]) {
      if (domCache.trackLink1.href !== buttons[0].url) {
        domCache.trackLink1.href = buttons[0].url;
      }
      if (domCache.trackLink1.textContent !== buttons[0].label) {
        domCache.trackLink1.textContent = buttons[0].label;
      }
      domCache.trackLink1.style.display = "inline-block";
    } else {
      domCache.trackLink1.style.display = "none";
    }

    if (buttons[1]) {
      if (domCache.trackLink2.href !== buttons[1].url) {
        domCache.trackLink2.href = buttons[1].url;
      }
      if (domCache.trackLink2.textContent !== buttons[1].label) {
        domCache.trackLink2.textContent = buttons[1].label;
      }
      domCache.trackLink2.style.display = "inline-block";
    } else {
      domCache.trackLink2.style.display = "none";
    }
  } catch (err) {
    console.error(err);
  }
}

// Auto update every second
setInterval(() => {
  updateDashboard();
  updateMusicCard();
}, 1000);

window.onload = () => {
  updateDashboard();
  updateMusicCard();
};
