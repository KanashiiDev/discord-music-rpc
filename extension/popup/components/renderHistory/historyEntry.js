function createHistoryEntry(entry, historyIndex, type, filteredHistory = []) {
  const div = Object.assign(document.createElement("div"), { className: "history-entry" });
  div.dataset.historyIndex = historyIndex;

  // Checkbox
  const checkbox = Object.assign(document.createElement("input"), {
    type: "checkbox",
    className: "history-checkbox",
  });
  checkbox.dataset.index = historyIndex;

  // Image
  const img = Object.assign(document.createElement("img"), {
    width: 46,
    height: 46,
    className: "history-image lazyload",
    alt: "",
  });
  img.dataset.src = entry.i || browser.runtime.getURL("icons/48x48.png");
  img.addEventListener(
    "error",
    () => {
      img.src = browser.runtime.getURL("icons/48x48.png");
    },
    { once: true },
  );

  // Info
  const info = document.createElement("div");
  info.className = "history-info";

  const strong = Object.assign(document.createElement("strong"), {
    textContent: entry.t,
    className: "history-title",
  });

  const small = Object.assign(document.createElement("small"), {
    className: "history-source",
  });

  const time = new Date(entry.p);
  let extraText = "";

  if (type === "stats") {
    const totalPlays = filteredHistory.filter((e) => e.t === entry.t).length;
    if (totalPlays) extraText = ` • ${totalPlays} plays`;
  } else {
    const formattedTime = dateHourMinute(time);
    if (formattedTime) extraText = ` • ${formattedTime}`;
  }

  small.textContent = `${entry.s}${extraText}`;
  info.appendChild(strong);

  if (entry.a !== "Radio") {
    const artist = Object.assign(document.createElement("span"), {
      className: "history-artist",
      textContent: entry.a,
    });
    info.append(artist, document.createElement("br"));
  }

  info.appendChild(small);

  // Link
  const link = Object.assign(document.createElement("a"), {
    className: "song-link",
    title: "Go to The Song",
    target: "_blank",
    rel: "noopener noreferrer",
  });
  if (entry.u) link.href = entry.u;
  link.appendChild(createSVG(svg_paths.redirectIconPaths));

  div.append(checkbox, img, info, link);
  return div;
}
