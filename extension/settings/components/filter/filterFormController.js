// FORM CONTROLLER - Manages filter creation/editing form
const FormController = {
  // Toggle form visibility
  toggle() {
    const isOpen = FilterState.form.isOpen;

    if (isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  // Open form
  async open() {
    const form = document.getElementById("formContainer");
    const btn = document.getElementById("toggleFormBtn");
    const addFilterContainer = document.querySelector(".filter-actions-header");

    // Move form if needed
    if (addFilterContainer?.parentNode && form.parentNode !== addFilterContainer.parentNode) {
      addFilterContainer.parentNode.insertBefore(form, addFilterContainer.nextSibling);
    }

    form.classList.add("active");
    btn.textContent = "Hide Filter Menu";

    document.querySelectorAll(".filter-item").forEach((item) => {
      item.classList.add("dimmed");
    });

    FilterState.form.isOpen = true;
    this.reset();

    await activateSimpleBar(["selectedParsersList", "availableParsersList"]);
  },

  // Close form
  close() {
    const form = document.getElementById("formContainer");
    const btn = document.getElementById("toggleFormBtn");
    const addFilterContainer = document.querySelector(".filter-actions-header");

    form.classList.remove("active");
    btn.textContent = "+ Add New Filter";

    document.querySelectorAll(".filter-item").forEach((item) => {
      item.classList.remove("dimmed");
    });

    // Move form back
    if (addFilterContainer?.parentNode && form.parentNode !== addFilterContainer.parentNode) {
      addFilterContainer.parentNode.insertBefore(form, addFilterContainer.nextSibling);
    }

    FilterState.form.isOpen = false;
    this.reset();
  },

  // Reset form to defaults
  reset() {
    FilterState.form.editingFilterId = null;
    FilterState.form.mode = "filter";
    FilterState.form.entries = [{ artist: "", title: "", replaceArtist: "", replaceTitle: "" }];
    FilterState.form.replaceAction = "update";

    // Clear search
    const searchInput = document.querySelector(".parser-search-input");
    if (searchInput) searchInput.value = "";

    ParserController.reset();
    this.renderMode();
    this.renderEntries();
    ParserController.render();
  },

  // Start editing filter
  async startEdit(filter, scrollToIndex = null) {
    const form = document.getElementById("formContainer");
    const btn = document.getElementById("toggleFormBtn");

    // If already editing same filter, exit
    if (FilterState.form.editingFilterId === filter.id && FilterState.form.isOpen) {
      this.exitEdit();
      return;
    }

    // Dim other filters
    document.querySelectorAll(".filter-item").forEach((item) => {
      item.classList.add("dimmed");
    });

    const filterItem = document.querySelector(`[data-filter-id="${filter.id}"]`);
    if (filterItem) {
      filterItem.classList.remove("dimmed");
    }

    // Load filter data
    FilterState.form.editingFilterId = filter.id;
    FilterState.form.entries = JSON.parse(JSON.stringify(filter.entries)).map((entry) => ({
      artist: entry.artist || "",
      title: entry.title || "",
      replaceArtist: entry.replaceArtist || "",
      replaceTitle: entry.replaceTitle || "",
    }));
    FilterState.form.mode = FilterUtils.isReplaceFilter(filter) ? "replace" : "filter";
    FilterState.form.isOpen = true;

    // Move form under filter
    if (filterItem?.parentNode && form.parentNode !== filterItem.parentNode) {
      filterItem.parentNode.insertBefore(form, filterItem.nextSibling);
    }

    form.classList.add("active");
    btn.textContent = "Exit Edit Mode";

    // Load parsers
    ParserController.loadFromFilter(filter);

    this.renderMode();
    this.renderEntries();
    ParserController.render();

    await activateSimpleBar(["selectedParsersList", "availableParsersList"]);

    // Scroll to entry
    if (scrollToIndex !== null && scrollToIndex >= 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const entryItems = document.querySelectorAll("#entriesList .entry-item");
      if (entryItems[scrollToIndex]) {
        entryItems[scrollToIndex].scrollIntoView({ behavior: "smooth", block: "center" });
        entryItems[scrollToIndex].classList.add("highlight-entry");
        setTimeout(() => {
          entryItems[scrollToIndex].classList.remove("highlight-entry");
        }, 2000);
      }
    }
  },

  // Exit edit mode
  exitEdit() {
    const form = document.getElementById("formContainer");
    const btn = document.getElementById("toggleFormBtn");

    document.querySelectorAll(".filter-item").forEach((item) => {
      item.classList.remove("dimmed");
    });

    form.classList.remove("active");
    btn.textContent = "Add New Filter";

    document.querySelector(".container").appendChild(form);

    FilterState.form.isOpen = false;
    this.reset();
  },

  // Add new entry
  addEntry() {
    FilterState.form.entries.push({
      artist: "",
      title: "",
      replaceArtist: "",
      replaceTitle: "",
    });
    this.renderEntries();
  },

  // Remove entry
  async removeEntry(index) {
    const entry = FilterState.form.entries[index];
    const isReplace = FilterState.form.mode === "replace";
    const hasReplaceValues = isReplace && (entry.replaceArtist.trim() || entry.replaceTitle.trim());

    // Ask about reverting if editing replace filter
    if (hasReplaceValues && FilterState.form.editingFilterId) {
      const shouldRevert = confirm("Do you want to restore the original song data to the history?");

      if (shouldRevert) {
        const filter = FilterState.parserFilters.find((f) => f.id === FilterState.form.editingFilterId);
        if (filter) {
          await sendAction("filterHistoryReplace", {
            mode: "revert",
            entries: [
              {
                artist: entry.artist || "",
                title: entry.title || "",
                replaceArtist: entry.replaceArtist || "",
                replaceTitle: entry.replaceTitle || "",
              },
            ],
            parsers: filter.parsers,
            parserList: FilterState.parserList,
          });
        }
      }
    }

    FilterState.form.entries.splice(index, 1);
    this.renderEntries();
  },

  // Validate form
  validate() {
    const { entries, mode } = FilterState.form;
    const isReplace = mode === "replace";

    // Check for valid entries
    const validEntries = entries.filter((e) => e.artist.trim() || e.title.trim());

    if (validEntries.length === 0) {
      alert("Enter at least one Artist or Title");
      return null;
    }

    // Check replace mode has replacement values
    if (isReplace) {
      const missingReplacements = validEntries.some((e) => (e.artist.trim() || e.title.trim()) && !e.replaceArtist.trim() && !e.replaceTitle.trim());

      if (missingReplacements) {
        alert("Please provide replacement values for all entries in Replace mode");
        return null;
      }
    }

    // Validate parser selection
    if (!ParserController.validate()) {
      return null;
    }

    return validEntries;
  },

  // Save filter
  async save() {
    const validEntries = this.validate();
    if (!validEntries) return;

    const { editingFilterId, mode } = FilterState.form;
    const isReplace = mode === "replace";
    const selectedParsers = ParserController.getSelection();

    // Find existing filter with same parsers and mode
    const existingFilterIndex = FilterState.parserFilters.findIndex((f) => {
      if (editingFilterId && f.id === editingFilterId) return false;

      // Check parsers match
      if (f.parsers.length !== selectedParsers.length) return false;
      const parsersMatch = [...f.parsers].sort().every((val, idx) => val === [...selectedParsers].sort()[idx]);
      if (!parsersMatch) return false;

      // Check mode match
      return FilterUtils.isReplaceFilter(f) === isReplace;
    });

    let entriesToProcess = [];
    let parsersToProcess = [];

    if (existingFilterIndex !== -1 && !editingFilterId) {
      // Merge with existing filter
      const existingFilter = FilterState.parserFilters[existingFilterIndex];
      const existingEntries = existingFilter.entries;

      // Filter duplicates
      const newUnique = validEntries.filter((entry) => {
        return !existingEntries.some((existing) => {
          return FilterUtils.createEntryKey(entry, isReplace) === FilterUtils.createEntryKey(existing, isReplace);
        });
      });

      if (newUnique.length === 0) {
        alert("All entries already exist in this filter");
        return;
      }

      existingFilter.entries.push(...newUnique);
      existingFilter.updatedAt = new Date().toISOString();

      if (isReplace) {
        entriesToProcess = newUnique;
        parsersToProcess = existingFilter.parsers;
      }
    } else {
      // Create new or update existing filter
      const uniqueEntries = FilterUtils.removeDuplicates(validEntries, isReplace);

      const filterData = {
        entries: uniqueEntries.map((entry) => {
          const clean = { artist: entry.artist, title: entry.title };
          if (isReplace) {
            clean.replaceArtist = entry.replaceArtist || "";
            clean.replaceTitle = entry.replaceTitle || "";
          }
          return clean;
        }),
        parsers: selectedParsers,
      };

      if (editingFilterId) {
        const index = FilterState.parserFilters.findIndex((f) => f.id === editingFilterId);
        if (index === -1) {
          alert("Filter not found");
          return;
        }

        FilterState.parserFilters[index] = {
          ...FilterState.parserFilters[index],
          ...filterData,
          updatedAt: new Date().toISOString(),
        };
      } else {
        FilterState.parserFilters.push({
          id: FilterUtils.generateId(),
          createdAt: new Date().toISOString(),
          ...filterData,
        });
      }

      if (isReplace) {
        entriesToProcess = filterData.entries;
        parsersToProcess = selectedParsers;
      }
    }

    await FilterStorage.saveFilters();

    // Process filter for replace mode
    if (isReplace && entriesToProcess.length > 0) {
      await sendAction("filterHistoryReplace", {
        mode: FilterState.form.replaceAction,
        entries: entriesToProcess,
        parsers: parsersToProcess,
        parserList: FilterState.parserList,
      });
    }

    // Move form back to default position
    const form = document.getElementById("formContainer");
    const addFilterContainer = document.querySelector(".filter-actions-header");
    if (form && addFilterContainer?.parentNode && form.parentNode !== addFilterContainer.parentNode) {
      addFilterContainer.parentNode.insertBefore(form, addFilterContainer.nextSibling);
    }

    FilterTabsController.render();
    FilterListController.render();
    this.close();
  },

  // RENDER
  renderMode() {
    const container = document.getElementById("filterModeContainer");
    if (!container) return;

    container.innerHTML = "";

    // Hide mode selector in edit mode
    if (FilterState.form.editingFilterId) {
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
      const btn = document.createElement("button");
      btn.className = `mode-option${FilterState.form.mode === mode.value ? " active" : ""}`;
      btn.textContent = mode.label;
      btn.dataset.mode = mode.value;

      FilterEvents.add(btn, "click", () => {
        FilterState.form.mode = mode.value;
        this.renderMode();
        this.renderEntries();
      });

      optionsContainer.appendChild(btn);
    });

    wrapper.appendChild(optionsContainer);
    container.appendChild(wrapper);
  },

  renderEntries() {
    const container = document.getElementById("entriesList");
    if (!container) return;

    // Clear old
    container.querySelectorAll(".entry-item").forEach((el) => {
      FilterEvents.removeFrom(el);
    });
    container.innerHTML = "";

    const isReplace = FilterState.form.mode === "replace";

    FilterState.form.entries.forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = `entry-item${isReplace ? " replace-mode" : ""}`;

      // Original inputs
      const originalGroup = document.createElement("div");
      originalGroup.className = "input-group original-group";

      const artistInput = this.createInput(
        isReplace ? "Original Artist" : "Artist",
        entry.artist,
        (e) => {
          FilterState.form.entries[index].artist = e.target.value;
        },
        "input-original",
      );

      const titleInput = this.createInput(
        isReplace ? "Original Title" : "Title",
        entry.title,
        (e) => {
          FilterState.form.entries[index].title = e.target.value;
        },
        "input-original",
      );

      originalGroup.append(artistInput, titleInput);
      item.appendChild(originalGroup);

      // Replace inputs
      if (isReplace) {
        item.appendChild(createSVG(svg_paths.forwardIconPaths));

        const replaceGroup = document.createElement("div");
        replaceGroup.className = "input-group replace-group";

        const replaceArtistInput = this.createInput(
          "Replace with Artist",
          entry.replaceArtist,
          (e) => {
            FilterState.form.entries[index].replaceArtist = e.target.value;
          },
          "input-replace",
        );

        const replaceTitleInput = this.createInput(
          "Replace with Title",
          entry.replaceTitle,
          (e) => {
            FilterState.form.entries[index].replaceTitle = e.target.value;
          },
          "input-replace",
        );

        replaceGroup.append(replaceArtistInput, replaceTitleInput);
        item.appendChild(replaceGroup);
      }

      // Remove button
      if (FilterState.form.entries.length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-remove";
        removeBtn.appendChild(createSVG(svg_paths.crossIconPaths));

        FilterEvents.add(removeBtn, "click", () => this.removeEntry(index));

        item.appendChild(removeBtn);
      }

      container.appendChild(item);
    });
  },

  createInput(placeholder, value, onInput, className = "") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = value || "";
    if (className) input.className = className;

    FilterEvents.add(input, "input", onInput);

    return input;
  },
};
