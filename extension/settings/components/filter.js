let parserList = [];
let parserFilters = [];
let editingFilterId = null;
let currentFilterMode = "filter";
let currentFilterTab = "all";
let currentEntries = [{ artist: "", title: "", replaceArtist: "", replaceTitle: "" }];
let searchQuery = "";
let selectedParsersOrder = [];

// Event Manager
class FilterEventManager {
  constructor() {
    this.listeners = new Map();
  }

  add(element, event, handler) {
    element.addEventListener(event, handler);
    if (!this.listeners.has(element)) {
      this.listeners.set(element, []);
    }
    this.listeners.get(element).push({ event, handler });
  }

  removeFrom(element) {
    const handlers = this.listeners.get(element);
    if (handlers) {
      handlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.listeners.delete(element);
    }
  }

  clear() {
    this.listeners.forEach((handlers, element) => {
      handlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
    });
    this.listeners.clear();
  }
}

const filterEventManager = new FilterEventManager();

// Duplicate Checker
class FilterDuplicateChecker {
  constructor() {
    this.entrySet = new Set();
  }

  static createKey(entry, includeReplace = false) {
    const artist = (entry.artist || "").toLowerCase().trim();
    const title = (entry.title || "").toLowerCase().trim();

    if (includeReplace) {
      const replaceArtist = (entry.replaceArtist || "").toLowerCase().trim();
      const replaceTitle = (entry.replaceTitle || "").toLowerCase().trim();
      return `${artist}|||${title}|||${replaceArtist}|||${replaceTitle}`;
    }

    return `${artist}|||${title}`;
  }

  loadEntries(entries, includeReplace = false) {
    this.entrySet.clear();
    entries.forEach((entry) => {
      this.entrySet.add(FilterDuplicateChecker.createKey(entry, includeReplace));
    });
  }

  isDuplicate(entry, includeReplace = false) {
    return this.entrySet.has(FilterDuplicateChecker.createKey(entry, includeReplace));
  }

  add(entry, includeReplace = false) {
    this.entrySet.add(FilterDuplicateChecker.createKey(entry, includeReplace));
  }

  filterDuplicates(newEntries, includeReplace = false) {
    return newEntries.filter((entry) => !this.isDuplicate(entry, includeReplace));
  }

  static checkAcrossAllFilters(entry, allFilters, isReplaceMode = false) {
    const key = FilterDuplicateChecker.createKey(entry, isReplaceMode);

    for (const filter of allFilters) {
      const filterHasReplace = filter.entries.some((e) => e.replaceArtist || e.replaceTitle);
      for (const existingEntry of filter.entries) {
        if (FilterDuplicateChecker.createKey(existingEntry, filterHasReplace) === key) {
          return { isDuplicate: true, filterId: filter.id };
        }
      }
    }

    return { isDuplicate: false };
  }
}

// Utilities
function generateUniqueId() {
  return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 8);
}

function isReplaceMode() {
  return currentFilterMode === "replace";
}

function hasReplaceData(entries) {
  return entries.some((e) => e.replaceArtist || e.replaceTitle);
}

// Storage
async function loadParserList() {
  try {
    const { parserList: stored } = await browser.storage.local.get("parserList");
    parserList = stored || [];
  } catch (error) {
    console.error("Failed to load parser list:", error);
    parserList = [];
  }
}

async function loadFilters() {
  try {
    const { parserFilters: stored } = await browser.storage.local.get("parserFilters");
    parserFilters = stored || [];
  } catch (error) {
    console.error("Failed to load filters:", error);
    parserFilters = [];
  }
}

async function saveFiltersToStorage() {
  try {
    await browser.storage.local.set({ parserFilters });
  } catch (error) {
    console.error("Failed to save filters:", error);
    alert("Failed to save filters. Please try again.");
  }
}

function clearElementListeners(container, selector) {
  container.querySelectorAll(selector).forEach((el) => {
    filterEventManager.removeFrom(el);
  });
}

function createInput(placeholder, value, onInput, className = "") {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value || "";
  if (className) input.className = className;
  filterEventManager.add(input, "input", onInput);
  return input;
}

function createButton(className, content, onClick) {
  const btn = document.createElement("button");
  btn.className = className;
  if (typeof content === "string") {
    btn.textContent = content;
  } else {
    btn.appendChild(content);
  }
  filterEventManager.add(btn, "click", onClick);
  return btn;
}

// Form Toggle & Reset
async function toggleForm() {
  const form = document.getElementById("formContainer");
  const btn = document.getElementById("toggleFormBtn");
  const addFilterContainer = document.querySelector(".filter-actions-header");

  if (form.classList.contains("active")) {
    form.classList.remove("active");
    btn.textContent = "+ Add New Filter";
    document.querySelectorAll(".filter-item").forEach((item) => {
      item.classList.remove("dimmed");
    });
  } else {
    if (addFilterContainer?.parentNode) {
      addFilterContainer.parentNode.insertBefore(form, addFilterContainer.nextSibling);
    }
    form.classList.add("active");
    document.querySelectorAll(".filter-item").forEach((item) => {
      item.classList.add("dimmed");
    });
    btn.textContent = "Hide Filter Menu";
    resetForm();
  }
  await activateSimpleBar(["selectedParsersList", "availableParsersList"]);
}

function cancelForm() {
  const form = document.getElementById("formContainer");
  const btn = document.getElementById("toggleFormBtn");
  const addFilterContainer = document.querySelector(".filter-actions-header");

  document.querySelectorAll(".filter-item").forEach((item) => {
    item.classList.remove("dimmed");
  });

  form.classList.remove("active");
  btn.textContent = "+ Add New Filter";

  if (addFilterContainer?.parentNode) {
    addFilterContainer.parentNode.insertBefore(form, addFilterContainer.nextSibling);
  }

  resetForm();
}

function resetForm() {
  currentEntries = [{ artist: "", title: "", replaceArtist: "", replaceTitle: "" }];
  editingFilterId = null;
  currentFilterMode = "filter";
  searchQuery = "";
  selectedParsersOrder = [];

  // Clear search input
  const searchInput = document.querySelector(".parser-search-input");
  if (searchInput) searchInput.value = "";

  renderFilterModeSelector();
  renderEntries();
  updateParserCheckboxes(false, []);
}

function updateParserCheckboxes(allChecked, selectedIds = []) {
  const allSwitch = document.getElementById("allParsersSwitch");
  allSwitch.checked = allChecked;

  if (allChecked) {
    // Clear selected parsers order when "all parsers" is enabled
    selectedParsersOrder = [];
  } else {
    // Update selected parsers order based on selectedIds
    const newSelections = selectedIds.filter((id) => !selectedParsersOrder.includes(id));
    const existingSelections = selectedParsersOrder.filter((id) => selectedIds.includes(id));
    selectedParsersOrder = [...newSelections, ...existingSelections];
  }

  document.querySelectorAll("#parserList input[type='checkbox']").forEach((cb) => {
    cb.checked = allChecked || selectedIds.includes(cb.dataset.parserId);
    cb.disabled = allChecked;

    const wrapper = cb.closest(".parser-option");
    if (wrapper) {
      wrapper.classList.toggle("active", cb.checked);
    }
  });

  renderParserList();
}

// Render Functions
function renderAllParsersSwitch() {
  const container = document.getElementById("allParsersContainer");
  container.textContent = "";

  const label = document.createElement("label");
  label.className = "switch-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "allParsersSwitch";
  filterEventManager.add(checkbox, "change", handleAllParsersChange);

  const slider = document.createElement("span");
  slider.className = "slider";

  const text = document.createElement("span");
  text.className = "switch-text";
  text.textContent = "Applies to All Websites";

  label.appendChild(checkbox);
  label.appendChild(slider);
  container.appendChild(label);
  container.appendChild(text);
}

// Add search input to parser list
function renderParserSearch() {
  const container = document.getElementById("parserList");

  // Check if search already exists
  let searchWrapper = container.querySelector(".parser-search-wrapper");
  if (!searchWrapper) {
    searchWrapper = document.createElement("div");
    searchWrapper.className = "parser-search-wrapper";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "parser-search-input";
    searchInput.placeholder = "Search websites...";
    searchInput.value = searchQuery;

    filterEventManager.add(searchInput, "input", (e) => {
      searchDebounce(e);
    });

    const searchDebounce = debounce(async (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderParserList();
    }, 300);

    searchWrapper.appendChild(searchInput);
    container.insertBefore(searchWrapper, container.firstChild);
  }
}

// Create individual parser option element
function createParserOption(parser, isSelected) {
  const wrapper = document.createElement("div");
  wrapper.className = "parser-option";
  if (isSelected) {
    wrapper.classList.add("active");
  }

  const switchLabel = document.createElement("label");
  switchLabel.className = "switch-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.parserId = parser.id;
  checkbox.checked = isSelected;

  filterEventManager.add(checkbox, "change", (e) => {
    handleParserCheckboxChange(parser.id, e.target.checked);
  });

  filterEventManager.add(wrapper, "click", (e) => {
    if (e.target === checkbox || e.target.classList.contains("slider")) return;
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change"));
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  const text = document.createElement("span");
  text.className = "parser-title";
  text.textContent = parser.title || parser.domain;

  // Highlight search query if present
  if (searchQuery) {
    const textValue = text.textContent;
    const lowerText = textValue.toLowerCase();
    const index = lowerText.indexOf(searchQuery);

    if (index !== -1) {
      while (text.firstChild) {
        text.removeChild(text.firstChild);
      }

      const before = document.createTextNode(textValue.slice(0, index));
      const match = document.createElement("mark");
      match.textContent = textValue.slice(index, index + searchQuery.length);
      const after = document.createTextNode(textValue.slice(index + searchQuery.length));

      text.appendChild(before);
      text.appendChild(match);
      text.appendChild(after);
    }
  }

  switchLabel.appendChild(checkbox);
  switchLabel.appendChild(slider);
  wrapper.appendChild(switchLabel);
  wrapper.appendChild(text);

  return wrapper;
}

// Handle parser checkbox changes
function handleParserCheckboxChange(parserId, isChecked) {
  if (isChecked) {
    // Add to selected parsers if not already there
    if (!selectedParsersOrder.includes(parserId)) {
      selectedParsersOrder.push(parserId);
    }
  } else {
    // Remove from selected parsers
    selectedParsersOrder = selectedParsersOrder.filter((id) => id !== parserId);
  }

  renderParserList();
}

// Parser list rendering
function renderParserList() {
  const container = document.getElementById("parserList");

  // Clear parser options and labels
  clearElementListeners(container, ".parser-option");
  const elementsToRemove = container.querySelectorAll(".selected-parsers-section, .available-parsers-section, .parser-section-label, .parser-no-results");
  elementsToRemove.forEach((el) => el.remove());

  // Add search if it doesn't exist
  renderParserSearch();

  // Filter parsers based on search query
  const filteredParsers = parserList.filter((parser) => {
    if (!searchQuery) return true;
    const searchText = (parser.title || parser.domain || "").toLowerCase();
    return searchText.includes(searchQuery);
  });

  // Separate selected and unselected parsers
  const selectedParsers = [];
  const unselectedParsers = [];

  filteredParsers.forEach((parser) => {
    const allParsersChecked = document.getElementById("allParsersSwitch")?.checked;
    const isSelected = allParsersChecked || selectedParsersOrder.includes(parser.id);

    if (isSelected) {
      selectedParsers.push(parser);
    } else {
      unselectedParsers.push(parser);
    }
  });

  // Sort selected parsers by order they were selected
  selectedParsers.sort((a, b) => {
    return selectedParsersOrder.indexOf(a.id) - selectedParsersOrder.indexOf(b.id);
  });

  // Render selected parsers section
  if (selectedParsers.length > 0) {
    const sectionLabel = document.createElement("div");
    sectionLabel.className = "parser-section-label selected";
    sectionLabel.textContent = "Selected Websites";
    container.appendChild(sectionLabel);

    const selectedSection = document.createElement("div");
    selectedSection.className = "selected-parsers-section";
    selectedSection.id = "selectedParsersList";

    selectedParsers.forEach((parser) => {
      selectedSection.appendChild(createParserOption(parser, true));
    });

    container.appendChild(selectedSection);
  }

  // Render available parsers section
  if (unselectedParsers.length > 0) {
    const sectionLabel = document.createElement("div");
    sectionLabel.className = "parser-section-label available";
    sectionLabel.textContent = "Available Websites";
    container.appendChild(sectionLabel);

    const availableSection = document.createElement("div");
    availableSection.className = "available-parsers-section";
    availableSection.id = "availableParsersList";

    unselectedParsers.forEach((parser) => {
      availableSection.appendChild(createParserOption(parser, false));
    });

    container.appendChild(availableSection);
  }

  // Show "no results" message if search returns nothing
  if (filteredParsers.length === 0 && searchQuery) {
    const noResults = document.createElement("div");
    noResults.className = "parser-no-results";
    noResults.textContent = "No websites found";
    container.appendChild(noResults);
  }

  activateSimpleBar(["selectedParsersList", "availableParsersList"]);
}

function handleAllParsersChange(e) {
  if (e.target.checked) {
    searchQuery = "";
    const searchInput = document.querySelector(".parser-search-input");
    if (searchInput) searchInput.value = "";
  }
  updateParserCheckboxes(e.target.checked, []);
}

function renderFilterModeSelector() {
  const container = document.getElementById("filterModeContainer");
  if (!container) return;

  container.textContent = "";

  if (editingFilterId) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";

  const wrapper = document.createElement("div");
  wrapper.className = "filter-mode-selector";

  const optionsContainer = document.createElement("div");
  optionsContainer.className = "mode-options";

  const modes = [
    { value: "filter", label: "Block" },
    { value: "replace", label: "Replace" },
  ];

  modes.forEach((mode) => {
    const btn = createButton(`mode-option${currentFilterMode === mode.value ? " active" : ""}`, mode.label, () => {
      currentFilterMode = mode.value;
      renderFilterModeSelector();
      renderEntries();
    });
    btn.dataset.mode = mode.value;
    optionsContainer.appendChild(btn);
  });

  wrapper.appendChild(optionsContainer);
  container.appendChild(wrapper);
}

function renderEntries() {
  const container = document.getElementById("entriesList");
  const replaceMode = isReplaceMode();

  clearElementListeners(container, ".entry-item");
  container.textContent = "";

  currentEntries.forEach((entry, index) => {
    const entryItem = document.createElement("div");
    entryItem.className = `entry-item${replaceMode ? " replace-mode" : ""}`;

    // Original inputs
    const originalGroup = document.createElement("div");
    originalGroup.className = "input-group original-group";

    const artistInput = createInput(replaceMode ? "Original Artist" : "Artist", entry.artist, (e) => (currentEntries[index].artist = e.target.value), "input-original");
    const titleInput = createInput(replaceMode ? "Original Title" : "Title", entry.title, (e) => (currentEntries[index].title = e.target.value), "input-original");

    originalGroup.appendChild(artistInput);
    originalGroup.appendChild(titleInput);
    entryItem.appendChild(originalGroup);

    // Replace mode inputs
    if (replaceMode) {
      entryItem.appendChild(createSVG(svg_paths.forwardIconPaths));

      const replaceGroup = document.createElement("div");
      replaceGroup.className = "input-group replace-group";

      const replaceArtistInput = createInput("Replace with Artist", entry.replaceArtist, (e) => (currentEntries[index].replaceArtist = e.target.value), "input-replace");
      const replaceTitleInput = createInput("Replace with Title", entry.replaceTitle, (e) => (currentEntries[index].replaceTitle = e.target.value), "input-replace");

      replaceGroup.appendChild(replaceArtistInput);
      replaceGroup.appendChild(replaceTitleInput);
      entryItem.appendChild(replaceGroup);
    }

    // Remove button
    if (currentEntries.length > 1) {
      const btn = createButton("btn-remove", "", () => removeEntry(index));
      btn.appendChild(createSVG(svg_paths.crossIconPaths));
      entryItem.appendChild(btn);
    }

    container.appendChild(entryItem);
  });
}

async function saveFilter() {
  const allParsers = document.getElementById("allParsersSwitch").checked;
  const replaceMode = isReplaceMode();

  // Validate entries
  const validEntries = currentEntries.filter((e) => e.artist.trim() || e.title.trim());

  if (validEntries.length === 0) {
    alert("Enter at least one Artist or Title");
    return;
  }

  if (replaceMode && validEntries.some((e) => (e.artist.trim() || e.title.trim()) && !e.replaceArtist.trim() && !e.replaceTitle.trim())) {
    alert("Please provide replacement values for all entries in Replace mode");
    return;
  }

  // Get selected parsers
  const selectedParsers = allParsers ? ["*"] : [...selectedParsersOrder];

  if (!selectedParsers.length) {
    alert("Please select at least one site");
    return;
  }

  // Find existing filter
  const existingFilterIndex = parserFilters.findIndex((f) => {
    if (editingFilterId && f.id === editingFilterId) return false;

    // Check parsers match
    if (f.parsers.length !== selectedParsers.length) return false;
    const parsersMatch = [...f.parsers].sort().every((val, idx) => val === [...selectedParsers].sort()[idx]);
    if (!parsersMatch) return false;

    // Check mode match
    return hasReplaceData(f.entries) === replaceMode;
  });

  let entriesToClean = [];
  let parsersToClean = [];

  if (existingFilterIndex !== -1 && !editingFilterId) {
    // Merge with existing filter
    const checker = new FilterDuplicateChecker();
    checker.loadEntries(parserFilters[existingFilterIndex].entries, replaceMode);

    const newUniqueEntries = checker.filterDuplicates(validEntries, replaceMode);
    if (newUniqueEntries.length === 0) {
      alert("All entries already exist in this filter");
      return;
    }

    parserFilters[existingFilterIndex].entries.push(...newUniqueEntries);
    parserFilters[existingFilterIndex].updatedAt = new Date().toISOString();

    if (replaceMode) {
      entriesToClean = newUniqueEntries;
      parsersToClean = parserFilters[existingFilterIndex].parsers;
    }
  } else {
    // Create new or update existing
    const checker = new FilterDuplicateChecker();
    const uniqueEntries = [];

    for (const entry of validEntries) {
      if (!checker.isDuplicate(entry, replaceMode)) {
        const cleanEntry = { artist: entry.artist, title: entry.title };
        if (replaceMode) {
          cleanEntry.replaceArtist = entry.replaceArtist || "";
          cleanEntry.replaceTitle = entry.replaceTitle || "";
        }
        uniqueEntries.push(cleanEntry);
        checker.add(entry, replaceMode);
      }
    }

    const filterData = {
      entries: uniqueEntries,
      parsers: selectedParsers,
    };

    if (editingFilterId) {
      const index = parserFilters.findIndex((f) => f.id === editingFilterId);
      if (index === -1) {
        alert("Filter not found");
        return;
      }

      parserFilters[index] = {
        ...parserFilters[index],
        ...filterData,
        updatedAt: new Date().toISOString(),
      };

      editingFilterId = null;
    } else {
      parserFilters.push({
        id: generateUniqueId(),
        createdAt: new Date().toISOString(),
        ...filterData,
      });
    }

    if (replaceMode) {
      entriesToClean = uniqueEntries;
      parsersToClean = selectedParsers;
    }
  }

  await saveFiltersToStorage();

  // If in replace mode, clear old entries from the history
  if (replaceMode && entriesToClean.length > 0) {
    await sendAction("cleanHistoryForReplace", {
      entries: entriesToClean,
      parsers: parsersToClean,
      parserList: parserList,
    });
  }

  const form = document.getElementById("formContainer");
  const addFilterContainer = document.querySelector(".filter-actions-header");
  if (form && addFilterContainer?.parentNode) {
    addFilterContainer.parentNode.insertBefore(form, addFilterContainer.nextSibling);
  }

  renderFilterTabs();
  renderFilters();
  cancelForm();
}

function addNewEntry() {
  currentEntries.push({ artist: "", title: "", replaceArtist: "", replaceTitle: "" });
  renderEntries();
}

function removeEntry(index) {
  currentEntries.splice(index, 1);
  renderEntries();
}

function renderFilterTabs() {
  const container = document.getElementById("filterTabsContainer");
  if (!container) return;

  container.textContent = "";

  const tabsWrapper = document.createElement("div");
  tabsWrapper.className = "filter-tabs";

  const tabs = [
    { value: "all", label: "All" },
    { value: "block", label: "Block" },
    { value: "replace", label: "Replace" },
  ];

  tabs.forEach((tab) => {
    const tabBtn = createButton(`filter-tab ${currentFilterTab === tab.value ? "active" : ""}`, tab.label, () => {
      currentFilterTab = tab.value;
      cancelForm();
      renderFilterTabs();
      renderFilters();
    });
    tabBtn.dataset.tab = tab.value;
    tabsWrapper.appendChild(tabBtn);
  });

  container.appendChild(tabsWrapper);
}

// Render Filters
function renderFilters() {
  const container = document.getElementById("filtersList");
  clearElementListeners(container, ".filter-item");
  container.textContent = "";

  // Filter based on current tab
  let filteredFilters = parserFilters;

  if (currentFilterTab === "block") {
    filteredFilters = parserFilters.filter((f) => !hasReplaceData(f.entries));
  } else if (currentFilterTab === "replace") {
    filteredFilters = parserFilters.filter((f) => hasReplaceData(f.entries));
  }

  if (!filteredFilters.length) {
    const div = document.createElement("div");
    div.className = "empty-state";
    const p = document.createElement("p");
    p.textContent = currentFilterTab === "all" ? "No filter has been added yet" : `No ${currentFilterTab} filters found`;
    div.appendChild(p);
    container.appendChild(div);
    return;
  }

  filteredFilters.forEach((filter) => {
    const item = document.createElement("div");
    item.className = "filter-item";
    item.dataset.filterId = filter.id;

    const isReplaceFilter = hasReplaceData(filter.entries);
    if (isReplaceFilter) item.classList.add("replace-filter");

    // Actions
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "filter-actions";

    const editBtn = createButton("btn-edit", createSVG(svg_paths.penIconPaths), () => startEditFilter(filter));
    const deleteBtn = createButton("btn-delete", createSVG(svg_paths.trashIconPaths), () => deleteFilter(filter.id));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    // Entries
    const entriesWrapper = document.createElement("div");
    entriesWrapper.className = "filter-entries-wrapper";

    filter.entries.forEach((entry) => {
      const entryDiv = document.createElement("div");
      entryDiv.className = "filter-entry";

      if (isReplaceFilter) {
        const originalSpan = document.createElement("span");
        originalSpan.className = "original";
        originalSpan.textContent = `${entry.artist || "*"} - ${entry.title || "*"}`;

        const replaceSpan = document.createElement("span");
        replaceSpan.className = "replace";
        replaceSpan.textContent = `${entry.replaceArtist || "*"} - ${entry.replaceTitle || "*"}`;

        entryDiv.appendChild(originalSpan);
        entryDiv.appendChild(createSVG(svg_paths.forwardIconPaths, { height: 12 }));
        entryDiv.appendChild(replaceSpan);
      } else {
        entryDiv.textContent = `${entry.artist || "*"} - ${entry.title || "*"}`;
      }

      entriesWrapper.appendChild(entryDiv);
    });

    // More button
    const moreBtn = createButton("btn-more", "More", () => {
      const isExpanded = entriesWrapper.classList.toggle("expanded");
      entriesWrapper.style.maxHeight = isExpanded ? `${entriesWrapper.dataset.maxHeight}px` : "7em";
      moreBtn.textContent = isExpanded ? "Less" : "More";
    });
    moreBtn.style.display = "none";

    const entriesDiv = document.createElement("div");
    entriesDiv.className = "filter-entries";
    entriesDiv.appendChild(entriesWrapper);
    actionsDiv.prepend(moreBtn);
    entriesDiv.appendChild(actionsDiv);
    item.appendChild(entriesDiv);
    item.appendChild(createParserTags(filter.parsers, filter.entries));
    container.appendChild(item);

    // Check if more button is needed
    requestAnimationFrame(() => {
      if (entriesWrapper.scrollHeight > entriesWrapper.clientHeight) {
        entriesWrapper.dataset.maxHeight = entriesWrapper.scrollHeight;
        moreBtn.style.display = "inline-block";
      }
    });
  });
}

// Start Edit Mode
async function startEditFilter(filter) {
  const form = document.getElementById("formContainer");
  const btn = document.getElementById("toggleFormBtn");

  if (editingFilterId === filter.id && form.classList.contains("active")) {
    exitEditMode();
    return;
  }

  document.querySelectorAll(".filter-item").forEach((item) => {
    item.classList.add("dimmed");
  });

  const currentFilterItem = document.querySelector(`[data-filter-id="${filter.id}"]`);
  if (currentFilterItem) {
    currentFilterItem.classList.remove("dimmed");
  }

  editingFilterId = filter.id;
  currentEntries = JSON.parse(JSON.stringify(filter.entries)).map((entry) => ({
    artist: entry.artist || "",
    title: entry.title || "",
    replaceArtist: entry.replaceArtist || "",
    replaceTitle: entry.replaceTitle || "",
  }));

  const filterItem = document.querySelector(`[data-filter-id="${filter.id}"]`);

  form.classList.add("active");
  btn.textContent = "Exit Edit Mode";

  if (filterItem?.parentNode) {
    filterItem.parentNode.insertBefore(form, filterItem.nextSibling);
  }

  currentFilterMode = hasReplaceData(currentEntries) ? "replace" : "filter";

  renderFilterModeSelector();
  renderEntries();
  updateParserCheckboxes(filter.parsers.includes("*"), filter.parsers);
  await activateSimpleBar(["selectedParsersList", "availableParsersList"]);
}

// Exit Edit Mode
function exitEditMode() {
  const form = document.getElementById("formContainer");
  const btn = document.getElementById("toggleFormBtn");

  document.querySelectorAll(".filter-item").forEach((item) => {
    item.classList.remove("dimmed");
  });

  form.classList.remove("active");
  btn.textContent = "Add New Filter";

  resetForm();
}

// Delete Filter
async function deleteFilter(id) {
  if (!confirm("Do you want to delete this filter?")) return;

  parserFilters = parserFilters.filter((f) => f.id !== id);
  await saveFiltersToStorage();
  renderFilterTabs();
  renderFilters();
}

// Fetch song info
async function fetchCurrentSongData(buttonElement, buttonText) {
  buttonElement.disabled = true;
  const originalText = buttonElement.textContent || buttonText;
  buttonElement.textContent = "Fetching...";

  const getSongWithParser = async () => {
    const maxAttempts = 4;
    let songData = null;

    for (let i = 0; i < maxAttempts; i++) {
      const response = await sendAction("getSongInfo");

      if (!response.ok || !response.data?.title || !response.data?.artist) {
        if (i === maxAttempts - 1) return null;
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      if (!songData) songData = response.data;
      if (response.data.parserId) return response.data;
      if (i < maxAttempts - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    return songData;
  };

  const songData = await getSongWithParser();

  return {
    songData,
    resetButton: () => {
      buttonElement.textContent = originalText;
      buttonElement.style.color = "";
      buttonElement.disabled = false;
    },
  };
}

// Fill with Current Song
let fillCurrentSongTimeout = null;
async function fillCurrentSong() {
  const btn = document.querySelector(".btn-fill-current");
  const originalText = btn.textContent;
  const replaceMode = isReplaceMode();
  clearTimeout(fillCurrentSongTimeout);

  const { songData, resetButton } = await fetchCurrentSongData(btn, originalText);

  if (!songData) {
    btn.textContent = "No song found";
    btn.style.color = "var(--red-color)";
    fillCurrentSongTimeout = setTimeout(resetButton, 2000);
    return;
  }

  const { title, artist, parserId } = songData;

  // Check if last entry is already filled
  const lastIndex = currentEntries.length - 1;
  const lastEntry = currentEntries[lastIndex];
  const isLastEntryFilled = lastEntry.artist.trim() !== "" || lastEntry.title.trim() !== "";

  // Check if last entry has the same values as current song
  const isSameAsLastEntry = lastEntry.artist.trim().toLowerCase() === artist.trim().toLowerCase() && lastEntry.title.trim().toLowerCase() === title.trim().toLowerCase();

  // Only add new entry if last entry is filled AND different from current song
  if (isLastEntryFilled && !isSameAsLastEntry) {
    addNewEntry();
    await new Promise((r) => setTimeout(r, 50));
  }

  const newLastIndex = currentEntries.length - 1;
  currentEntries[newLastIndex].artist = artist;
  currentEntries[newLastIndex].title = title;

  // Fill DOM inputs
  const entryItems = document.querySelectorAll("#entriesList .entry-item");
  const lastEntryItem = entryItems[entryItems.length - 1];

  if (lastEntryItem) {
    const titleSelector = replaceMode ? 'input[placeholder="Original Title"]' : 'input[placeholder="Title"]';
    const artistSelector = replaceMode ? 'input[placeholder="Original Artist"]' : 'input[placeholder="Artist"]';

    const titleInput = lastEntryItem.querySelector(titleSelector);
    const artistInput = lastEntryItem.querySelector(artistSelector);

    if (titleInput) titleInput.value = title;
    if (artistInput) artistInput.value = artist;

    titleInput?.dispatchEvent(new Event("input", { bubbles: true }));
    artistInput?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Check for duplicates
  const entry = { artist, title, replaceArtist: "", replaceTitle: "" };
  const duplicateCheck = FilterDuplicateChecker.checkAcrossAllFilters(entry, parserFilters, replaceMode);

  if (duplicateCheck.isDuplicate) {
    btn.textContent = "Already exists";
    btn.style.color = "var(--orange-color)";
    fillCurrentSongTimeout = setTimeout(resetButton, 2000);
    return;
  }

  // Update parser options based on parser ID
  if (parserId) {
    const parserOptions = document.querySelectorAll(".parser-option");
    parserOptions.forEach((option) => {
      const checkbox = option.querySelector('input[type="checkbox"]');
      if (checkbox.dataset.parserId === parserId.toString()) {
        checkbox.checked = true;
        option.classList.add("active");
        // Add to selected parsers order
        if (!selectedParsersOrder.includes(parserId.toString())) {
          selectedParsersOrder.push(parserId.toString());
        }
      }
    });
    // Re-render to show in selected section
    renderParserList();
  }

  // Success feedback
  btn.textContent = "Filled!";
  btn.style.color = "var(--green-color)";
  fillCurrentSongTimeout = setTimeout(resetButton, 1500);
}

// Block Current Song
let addCurrentSongTimeout = null;
async function addCurrentSong() {
  const songInfoBtn = document.querySelector("#getSongInfoBtn span");
  const getSongInfoBtnParent = document.querySelector("#getSongInfoBtn");
  const buttonText = "Block Current Song";
  clearTimeout(addCurrentSongTimeout);

  const { songData, resetButton } = await fetchCurrentSongData(songInfoBtn, buttonText);

  const resetWithParent = () => {
    resetButton();
    getSongInfoBtnParent.disabled = false;
  };

  if (!songData) {
    songInfoBtn.textContent = "No recent song found";
    addCurrentSongTimeout = setTimeout(resetWithParent, 2000);
    return;
  }

  const { title, artist, parserId } = songData;

  // Check duplicate
  const entry = { artist, title, replaceArtist: "", replaceTitle: "" };
  const duplicateCheck = FilterDuplicateChecker.checkAcrossAllFilters(entry, parserFilters, false);

  if (duplicateCheck.isDuplicate) {
    songInfoBtn.textContent = "Already Added";
    addCurrentSongTimeout = setTimeout(resetWithParent, 2000);
    return;
  }

  if (!parserId) {
    songInfoBtn.textContent = "Pending...";
    addCurrentSongTimeout = setTimeout(resetWithParent, 2000);
    return;
  }

  // Find existing filter with same parserId and block mode
  const existingFilterIndex = parserFilters.findIndex((f) => {
    const isBlockFilter = !hasReplaceData(f.entries);
    if (!isBlockFilter) return false;
    return f.parsers.includes(parserId);
  });

  if (existingFilterIndex !== -1) {
    parserFilters[existingFilterIndex].entries.push({ artist, title });
    parserFilters[existingFilterIndex].updatedAt = new Date().toISOString();
  } else {
    parserFilters.push({
      id: generateUniqueId(),
      createdAt: new Date().toISOString(),
      entries: [{ artist, title }],
      parsers: [parserId],
    });
  }

  await saveFiltersToStorage();
  renderFilterTabs();
  renderFilters();

  // Success feedback
  songInfoBtn.textContent = "Added!";
  songInfoBtn.style.color = "var(--green-color)";
  addCurrentSongTimeout = setTimeout(resetWithParent, 1500);
}

function createParserTags(parsers, filterEntries) {
  const wrapper = document.createElement("div");
  wrapper.className = "filter-parsers";

  const isReplaceFilter = hasReplaceData(filterEntries);

  const modeTag = document.createElement("span");
  modeTag.className = `parser-tag mode-tag ${isReplaceFilter ? "replace-mode" : "block-mode"}`;
  modeTag.textContent = `${isReplaceFilter ? "Replace" : "Block"}`;
  wrapper.appendChild(modeTag);

  const names =
    parsers[0] === "*"
      ? ["All Parsers"]
      : parsers.map((id) => {
          const p = parserList.find((x) => x.id === id);
          return p ? p.title || p.domain : id;
        });

  names.forEach((name) => {
    const tag = document.createElement("span");
    tag.className = "parser-tag";
    tag.textContent = name;
    wrapper.appendChild(tag);
  });

  return wrapper;
}
