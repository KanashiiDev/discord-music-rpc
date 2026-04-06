const parserVisibilityState = {
  hiddenIds: new Set(),
  _loaded: false,
};

// Hidden state
async function loadHiddenParsers() {
  if (parserVisibilityState._loaded) return;
  const { parserHiddenState = {} } = await browser.storage.local.get("parserHiddenState");
  parserVisibilityState.hiddenIds = new Set(Object.keys(parserHiddenState).filter((k) => parserHiddenState[k]));
  parserVisibilityState._loaded = true;
}

async function saveHiddenParsers() {
  const obj = {};
  for (const id of parserVisibilityState.hiddenIds) obj[id] = true;
  await browser.storage.local.set({ parserHiddenState: obj });
}

function isParserHidden(id) {
  return parserVisibilityState.hiddenIds.has(id);
}

function filterVisibleParsers(list) {
  if (!parserVisibilityState.hiddenIds.size) return list;
  return list.filter((e) => !parserVisibilityState.hiddenIds.has(e.id));
}

async function setHiddenParsers(hiddenIds) {
  // Capture previously hidden IDs before overwriting (to know which to unblock)
  const previouslyHidden = new Set(parserVisibilityState.hiddenIds);

  parserVisibilityState.hiddenIds = new Set(hiddenIds);
  parserVisibilityState._loaded = true;
  await saveHiddenParsers();

  // Keep parserEnabledState in sync
  const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");

  // Force-disable newly hidden parsers
  for (const id of hiddenIds) {
    parserEnabledState[`enable_${id}`] = false;
  }

  // Remove the forced-false only for IDs that were previously hidden but are now visible again
  for (const id of previouslyHidden) {
    if (!parserVisibilityState.hiddenIds.has(id)) {
      delete parserEnabledState[`enable_${id}`];
    }
  }

  await browser.storage.local.set({ parserEnabledState });
}

// New-parser snapshot
async function getNewParserIds() {
  const { parserNewIds = [] } = await browser.storage.local.get("parserNewIds");
  return parserNewIds;
}

async function acknowledgeNewParsers() {
  await browser.storage.local.set({ parserNewIds: [] });
}

/**
 * Diffs the current parser list against the stored snapshot.
 * Newly found IDs are appended to parserNewIds.
 */
async function syncParserSnapshot(currentList) {
  const { parserKnownIds = null, parserNewIds = [] } = await browser.storage.local.get(["parserKnownIds", "parserNewIds"]);

  const currentIds = currentList.filter((e) => !e.userAdd && !e.userScript).map((e) => e.id);

  if (parserKnownIds === null) {
    // First snapshot — nothing is "new" yet
    await browser.storage.local.set({ parserKnownIds: currentIds, parserNewIds: [] });
    return;
  }

  const knownSet = new Set(parserKnownIds);
  const existingNewSet = new Set(parserNewIds);
  const freshNew = currentIds.filter((id) => !knownSet.has(id) && !existingNewSet.has(id));

  if (freshNew.length > 0) {
    await browser.storage.local.set({
      parserKnownIds: [...parserKnownIds, ...freshNew],
      parserNewIds: [...parserNewIds, ...freshNew],
    });
  }
}

/**
 * Opens the visibility dialog.
 * @param {Array}   list       Full parser list (entries may have _isNew: true)
 * @param {boolean} isInitial  true = first-run (no dismiss, "Continue" button)
 * @returns {Promise<void>}
 */
function openVisibilityDialog(list, isInitial = false) {
  return new Promise((resolve) => {
    // Acknowledge new parsers
    acknowledgeNewParsers();
    document.getElementById("manageParsersBtn")?.classList.remove("has-new");

    // Overlay
    const overlay = Object.assign(document.createElement("div"), {
      className: "pvs-overlay",
    });

    // Dialog
    const dialog = Object.assign(document.createElement("div"), {
      className: "pvs-dialog",
    });

    dialog.appendChild(
      Object.assign(document.createElement("h2"), {
        className: "pvs-title",
        textContent: "Choose Websites",
      }),
    );

    dialog.appendChild(
      Object.assign(document.createElement("p"), {
        className: "pvs-subtitle",
        textContent: "Select the websites you want to use. You can change this whenever you want.",
      }),
    );

    // Search
    const searchInput = Object.assign(document.createElement("input"), {
      type: "text",
      className: "pvs-search",
      placeholder: "Search websites\u2026",
    });
    dialog.appendChild(searchInput);

    // Bulk row
    const bulkRow = Object.assign(document.createElement("div"), { className: "pvs-bulk-row" });
    const selectAllBtn = Object.assign(document.createElement("button"), {
      className: "pvs-bulk-btn",
      textContent: "Select All",
    });
    const selectNoneBtn = Object.assign(document.createElement("button"), {
      className: "pvs-bulk-btn",
      textContent: "Select None",
    });
    bulkRow.append(selectAllBtn, selectNoneBtn);
    dialog.appendChild(bulkRow);

    // List
    const listContainer = Object.assign(document.createElement("div"), { className: "pvs-list" });
    dialog.appendChild(listContainer);

    // visible = checked; start from current hidden state
    const visibleIds = new Set(list.map((e) => e.id).filter((id) => !isParserHidden(id)));
    const rowMap = new Map();

    const buildRows = async () => {
      const filtered = list.filter((e) => !(e.userScript || e.userAdd));

      // New entries bubble to the top
      const sorted = [...filtered].sort((a, b) => {
        if (a._isNew && !b._isNew) return -1;
        if (!a._isNew && b._isNew) return 1;
        return (a.title ?? a.domain ?? "").localeCompare(b.title ?? b.domain ?? "");
      });

      const fragment = document.createDocumentFragment();

      for (const entry of sorted) {
        const row = Object.assign(document.createElement("label"), {
          className: "pvs-row" + (entry._isNew ? " pvs-row-new" : ""),
        });

        const cb = Object.assign(document.createElement("input"), {
          type: "checkbox",
          checked: visibleIds.has(entry.id),
        });
        cb.dataset.parserId = entry.id;

        row.classList.toggle("active", cb.checked);
        cb.addEventListener("change", () => {
          cb.parentElement.classList.toggle("active", cb.checked);
          if (cb.checked) visibleIds.add(entry.id);
          else visibleIds.delete(entry.id);
        });

        const primaryDomain = Array.isArray(entry.domain) ? entry.domain[0] : entry.domain;
        const favIconContainer = document.createElement("div");
        favIconContainer.className = "pvs-icon-container spinner";

        const favIcon = document.createElement("img");
        favIcon.className = "pvs-icon hidden-visibility";
        favIcon.dataset.src = primaryDomain;
        favIcon.loading = "lazy";
        favIcon.decoding = "async";
        favIconContainer.appendChild(favIcon);

        const nameSpan = Object.assign(document.createElement("span"), {
          className: "pvs-name",
          textContent: entry.title ?? primaryDomain,
        });

        row.append(cb, favIconContainer, nameSpan);

        if (entry._isNew) {
          row.appendChild(
            Object.assign(document.createElement("span"), {
              className: "pvs-new-badge",
              textContent: "NEW",
            }),
          );
        }

        row.dataset.searchText = (entry.title ?? primaryDomain ?? "").toLowerCase();
        rowMap.set(entry.id, row);
        fragment.appendChild(row);
      }

      const simpleBar = simpleBarInstances.get(listContainer);
      const root = simpleBar?.getContentElement() ?? listContainer;
      root.appendChild(fragment);

      loadFavIcons(root.querySelectorAll(".pvs-icon"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await activateSimpleBar(listContainer);
    };

    const filterRows = debounce(async (query = "") => {
      const lq = query.trim().toLowerCase();
      for (const [, row] of rowMap) {
        row.style.display = !lq || row.dataset.searchText.includes(lq) ? "" : "none";
      }
      activateSimpleBar(listContainer);
    }, 250);

    // Updates only the checked state of existing DOM rows
    const syncCheckboxes = () => {
      for (const [id, row] of rowMap) {
        const cb = row.querySelector("input[type='checkbox']");
        if (!cb) continue;
        cb.checked = visibleIds.has(id);
        row.classList.toggle("active", cb.checked);
      }
    };

    buildRows();
    activateSimpleBar(listContainer);
    searchInput.addEventListener("input", () => filterRows(searchInput.value));

    selectAllBtn.addEventListener("click", () => {
      list.forEach((e) => visibleIds.add(e.id));
      syncCheckboxes();
    });
    selectNoneBtn.addEventListener("click", () => {
      visibleIds.clear();
      syncCheckboxes();
    });

    // Confirm button
    const confirmBtn = Object.assign(document.createElement("button"), {
      className: "pvs-confirm-btn button",
      textContent: isInitial ? "Continue" : "Save",
    });
    confirmBtn.addEventListener("click", async () => {
      const hiddenIds = list.map((e) => e.id).filter((id) => !visibleIds.has(id));

      if (visibleIds.size < 1) {
        showPopupMessage("You must select at least one website.", "error", 2000, 0, ".pvs-footer");
        return;
      }

      await setHiddenParsers(hiddenIds);
      overlay.remove();
      resolve();

      // Re-render list and refresh parser tag cache
      await renderList();
      await buildParserTagCache();
      await activateSimpleBar("siteList");
    });
    dialog.appendChild(confirmBtn);

    const footer = Object.assign(document.createElement("div"), {
      className: "pvs-footer",
    });
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Non-initial: overlay background click dismisses without saving
    if (!isInitial) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
          resolve();
        }
      });
    }
  });
}
