let cleaningMode = false;
let fullHistory = [];

async function renderHistory() {
  const panel = document.getElementById("historyPanel");
  panel.innerHTML = "";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  panel.appendChild(spinner);
  fullHistory = await loadHistory();
  const history = fullHistory.slice(0, MAX_HISTORY);
  panel.innerHTML = "";

  if (!history.length) {
    const emptyMsg = document.createElement("i");
    emptyMsg.textContent = "Empty.";
    panel.appendChild(emptyMsg);
    return;
  }

  if (document.getElementById("historySearchBox")) {
    document.getElementById("historySearchBox").value = "";
  }

  let lastHeader = null;
  const fragment = document.createDocumentFragment();

  history.forEach((entry, i) => {
    const time = new Date(entry.p);
    const header = isSameDay(time, dateToday) ? "Today" : isSameDay(time, dateYesterday) ? "Yesterday" : dateFull(time);

    if (header !== lastHeader) {
      const h3 = document.createElement("h3");
      h3.textContent = header;
      h3.style.marginTop = "10px";
      fragment.appendChild(h3);
      lastHeader = header;
    }

    const div = document.createElement("div");
    div.className = "history-entry";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "history-checkbox";
    checkbox.dataset.index = fullHistory.indexOf(entry);

    const img = document.createElement("img");
    img.width = 36;
    img.height = 36;
    img.className = "history-image lazyload";
    img.dataset.src = entry.i || browser.runtime.getURL("icons/48x48.png");

    img.onerror = function () {
      this.onerror = null;
      this.src = browser.runtime.getURL("icons/48x48.png");
    };

    const info = document.createElement("div");
    info.className = "history-info";

    const strong = document.createElement("strong");
    strong.textContent = entry.t;

    const link = document.createElement("a");
    link.className = entry.u ? "song-link" : "song-link hidden";
    link.title = "Go to The Song";
    link.appendChild(createSVG(svg_paths.redirectIconPaths));
    if (entry.u) link.href = entry.u;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const small = document.createElement("small");
    small.textContent = `${entry.s}${dateHourMinute(time) ? " • " + dateHourMinute(time) : ""}`;

    info.appendChild(strong);
    const parts = [];
    if (entry.a !== "Radio") {
      const br = document.createElement("br");
      parts.push(` ${entry.a}`, br);
    }
    parts.push(small);
    info.append(...parts);
    div.append(checkbox, img, info, link);
    fragment.appendChild(div);
  });

  panel.appendChild(fragment);

  // Add checkbox events while in cleaning mode
  if (cleaningMode) attachCheckboxListeners();
}

// Filter Render history
function filterRenderedHistory(query) {
  const entries = document.querySelectorAll(".history-entry");

  entries.forEach((entry) => {
    const textContent = entry.innerText.toLowerCase();
    entry.style.display = textContent.includes(query) ? "" : "none";
  });

  // Hide headers if no visible entries
  const headers = document.querySelectorAll("#historyPanel h3");
  headers.forEach((header) => {
    // Check if any sibling entries are visible
    let sibling = header.nextElementSibling;
    let hasVisible = false;
    while (sibling && !sibling.matches("h3")) {
      if (sibling.style.display !== "none") {
        hasVisible = true;
        break;
      }
      sibling = sibling.nextElementSibling;
    }
    header.style.display = hasVisible ? "" : "none";
  });
}

// Listen checkbox changes
function attachCheckboxListeners() {
  const checkboxes = document.querySelectorAll(".history-checkbox");

  checkboxes.forEach((cb) => {
    const entry = cb.closest(".history-entry");
    if (!entry) return;

    // Checkbox listener
    cb.addEventListener("change", () => {
      entry.classList.toggle("selected", cb.checked);
      updateClearBtnText();
    });

    // If there is a trash icon, skip it; if not, add it.
    if (!entry.querySelector(".history-trash")) {
      const trashIcon = document.createElement("span");
      trashIcon.className = "history-trash";
      trashIcon.appendChild(createSVG(svg_paths.trashIconPaths));

      // Trash icon click → checkbox toggle
      trashIcon.addEventListener("click", () => {
        cb.checked = !cb.checked;
        entry.classList.toggle("selected", cb.checked);
        updateClearBtnText();
      });

      cb.insertAdjacentElement("afterend", trashIcon);
    }
  });
}

// Clear Button
const clearBtn = document.getElementById("clearHistoryBtn");
const cancelCleanBtn = document.getElementById("cancelCleanBtn");

// Update Clear Button
function updateClearBtnText() {
  if (!cleaningMode) return;
  const selectedItems = Array.from(document.querySelectorAll(".history-checkbox")).filter((cb) => cb.checked && cb.closest(".history-entry").style.display !== "none");
  const selectedCount = selectedItems.length;
  clearBtn.textContent = selectedCount > 0 ? `Delete Selected (${selectedCount})` : "Delete All";
}

// Clear Button Click Event
clearBtn.addEventListener("click", async () => {
  if (!cleaningMode) {
    // Start the cleaning mode
    cleaningMode = true;
    document.body.classList.add("cleaning-mode");
    cancelCleanBtn.style.display = "inline-block";
    updateClearBtnText();
    attachCheckboxListeners();
    return;
  }

  // Get selected items
  const selectedIndexes = Array.from(document.querySelectorAll(".history-checkbox:checked"))
    .filter((cb) => cb.closest(".history-entry").style.display !== "none")
    .map((cb) => parseInt(cb.dataset.index));

  //If no items were selected, ask for user confirmation to delete all history.
  if (selectedIndexes.length === 0) {
    if (!confirm("Are you sure you want to delete ALL history?")) return;
    fullHistory = [];
  }
  // If there are selected items, delete only them.
  else {
    if (!confirm(`Delete ${selectedIndexes.length} selected item(s)?`)) return;
    fullHistory = fullHistory.filter((_, i) => !selectedIndexes.includes(i));
  }

  //Update the database and refresh the UI
  await saveHistory(fullHistory);
  await renderHistory();
  exitCleaningMode();
});

// Cancel Button Event
cancelCleanBtn.addEventListener("click", exitCleaningMode);

// Exit cleaning mode
function exitCleaningMode() {
  cleaningMode = false;
  document.body.classList.remove("cleaning-mode");
  clearBtn.textContent = "Clear History";
  cancelCleanBtn.style.display = "none";
  document.querySelectorAll(".history-checkbox").forEach((cb) => {
    cb.parentElement?.classList.remove("selected");
    cb.checked = false;
  });
}
