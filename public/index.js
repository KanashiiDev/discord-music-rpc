let customStartTime = null;
let lastTrackId = null;

document.querySelectorAll("h2.collapsible").forEach((header) => {
  header.addEventListener("click", () => {
    const box = header.nextElementSibling;
    if (!box) return;

    const isOpen = box.classList.contains("open");
    header.classList.toggle("open", !isOpen);

    if (isOpen) {
      // Close
      box.style.maxHeight = "";
      box.classList.remove("open");
    } else {
      // Open
      box.classList.add("open");
      box.style.maxHeight = box.scrollHeight + "px";
    }
  });
});

async function updateDashboard() {
  try {
    const status = await fetch("/status").then((r) => r.json());
    const activity = await fetch("/activity").then((r) => r.json());

    document.getElementById("rpcStatus").textContent = status.rpcConnected ? "Connected" : "Not Connected";
    document.getElementById("rpcStatus").className = status.rpcConnected ? "connected" : "disconnected";
    document.getElementById("activityJson").textContent = JSON.stringify(activity.activity || {}, null, 2);
    document.getElementById("lastActivityJson").textContent = JSON.stringify(activity.lastUpdateRequest || {}, null, 2);
  } catch (err) {
    console.error(err);
  }
}

updateDashboard();
setInterval(updateDashboard, 5000);
function formatTime(sec) {
  if (!sec || sec < 0) return "00:00";

  let m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  let s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

async function updateMusicCard() {
  const data = await fetch("/activity").then((r) => r.json());
  const act = data?.activity;
  const card = document.getElementById("musicCard");
  const cardHeader = document.getElementById("musicCardHeader");

  // No activity
  if (!act || !act.details) {
    card.style.display = "none";
    cardHeader.style.display = "none";
    customStartTime = null;
    lastTrackId = null;
    return;
  }

  card.style.display = "block";
  cardHeader.style.display = "block";

  // Title / Artist
  document.getElementById("trackTitle").textContent = act.details || "Unknown Title";
  document.getElementById("trackArtist").textContent = act.state || "Unknown Artist";

  // Source
  document.getElementById("trackSource").textContent = act.largeImageText || "Unknown Source";

  // Cover
  document.getElementById("coverImage").src = act.largeImageKey ?? "assets/icon.png";

  // TrackId
  const trackId = `${act.details}__${act.state}`;
  // If the song has changed
  if (trackId !== lastTrackId) {
    lastTrackId = trackId;
    customStartTime = Date.now();

    // Update the height if the collapsible is open when the song changes.
    document.querySelectorAll("h2.collapsible").forEach((header) => {
      const box = header.nextElementSibling;
      if (!box) return;

      const isOpen = box.classList.contains("open");

      if (isOpen) {
        box.style.maxHeight = box.scrollHeight + "px";
      }
    });
  }

  // elapsed seconds
  const elapsed = Math.floor((Date.now() - customStartTime) / 1000);

  // DOM elements for timestamps
  const timePassedElem = document.getElementById("timePassed");
  const durationElem = document.getElementById("duration");
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  const now = Math.floor(Date.now() / 1000);
  const start = act.startTimestamp;
  const end = act.endTimestamp;
  const hasTimestamps = typeof start === "number" && typeof end === "number";

  if (hasTimestamps) {
    let total = Math.max(0, end - start);
    let passed = Math.max(0, now - start);

    if (passed > total) passed = total;

    timePassedElem.textContent = formatTime(passed);
    durationElem.textContent = formatTime(total);

    // Progress %
    let progressPercent = total === 0 ? 0 : (passed / total) * 100;
    if (progressPercent > 100) progressPercent = 100;

    progressFill.style.width = progressPercent + "%";

    // Show all
    timePassedElem.style.display = "inline-block";
    durationElem.style.display = "inline-block";
    progressBar.style.display = "flex";
  } else {
    timePassedElem.textContent = formatTime(elapsed);
    // hide unused stuff
    durationElem.style.display = "none";
    progressBar.style.display = "none";
  }

  // BUTTONS
  const btn1 = document.getElementById("trackLink1");
  const btn2 = document.getElementById("trackLink2");
  const buttons = act.buttons || [];

  if (btn1) btn1.style.display = "none";
  if (btn2) btn2.style.display = "none";

  if (buttons[0] && btn1) {
    btn1.href = buttons[0].url;
    btn1.textContent = buttons[0].label;
    btn1.style.display = "inline-block";
  }

  if (buttons[1] && btn2) {
    btn2.href = buttons[1].url;
    btn2.textContent = buttons[1].label;
    btn2.style.display = "inline-block";
  }
}

// Auto update every second
setInterval(updateMusicCard, 1000);

window.onload = () => {
  updateDashboard();
  updateMusicCard();
};
