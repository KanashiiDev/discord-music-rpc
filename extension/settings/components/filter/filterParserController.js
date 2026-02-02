// PARSER CONTROLLER - Manages parser selection UI
const ParserController = {
  // Set search query
  setSearch(query) {
    FilterState.parsers.searchQuery = FilterUtils.normalize(query);
    this.render();
  },

  // Toggle all parsers
  toggleAll(checked) {
    FilterState.parsers.allSelected = checked;
    if (checked) {
      FilterState.parsers.selectedIds = [];
      FilterState.parsers.searchQuery = "";
    }
    this.render();
  },

  // Toggle single parser
  toggle(parserId, checked) {
    const { selectedIds } = FilterState.parsers;

    if (checked) {
      if (!selectedIds.includes(parserId)) {
        selectedIds.push(parserId);
      }
    } else {
      FilterState.parsers.selectedIds = selectedIds.filter((id) => id !== parserId);
    }

    this.render();
  },

  // Get parsers for current search
  getFiltered() {
    const { searchQuery } = FilterState.parsers;
    if (!searchQuery) return FilterState.parserList;

    return FilterState.parserList.filter((parser) => {
      const text = FilterUtils.normalize(parser.title || parser.domain);
      return text.includes(searchQuery);
    });
  },

  // Get selected/unselected parsers
  getSeparated() {
    const filtered = this.getFiltered();
    const selected = [];
    const unselected = [];
    const { allSelected, selectedIds } = FilterState.parsers;

    filtered.forEach((parser) => {
      const isSelected = allSelected || selectedIds.includes(parser.id);
      (isSelected ? selected : unselected).push(parser);
    });

    // Sort selected by order
    selected.sort((a, b) => {
      return selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id);
    });

    return { selected, unselected };
  },

  // Load from filter (for editing)
  loadFromFilter(filter) {
    const allParsers = filter.parsers.includes("*");
    FilterState.parsers.allSelected = allParsers;
    FilterState.parsers.selectedIds = allParsers ? [] : [...filter.parsers];
    FilterState.parsers.searchQuery = "";
  },

  // Get current selection (for saving)
  getSelection() {
    return FilterState.parsers.allSelected ? ["*"] : [...FilterState.parsers.selectedIds];
  },

  // Reset to defaults
  reset() {
    FilterState.parsers.allSelected = false;
    FilterState.parsers.selectedIds = [];
    FilterState.parsers.searchQuery = "";
  },

  // Validate selection
  validate() {
    const selection = this.getSelection();
    if (selection.length === 0) {
      alert("Please select at least one site");
      return false;
    }
    return true;
  },

  // RENDER
  render() {
    this.renderAllSwitch();
    this.renderSearch();
    this.renderList();
  },

  renderAllSwitch() {
    const container = document.getElementById("allParsersContainer");
    if (!container) return;

    container.innerHTML = "";

    const label = document.createElement("label");
    label.className = "switch-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "allParsersSwitch";
    checkbox.checked = FilterState.parsers.allSelected;
    FilterEvents.add(checkbox, "change", (e) => this.toggleAll(e.target.checked));

    const slider = document.createElement("span");
    slider.className = "slider";

    const text = document.createElement("span");
    text.className = "switch-text";
    text.textContent = "Applies to All Websites";

    label.append(checkbox, slider);
    container.append(label, text);
  },

  renderSearch() {
    const container = document.getElementById("parserList");
    if (!container) return;

    let wrapper = container.querySelector(".parser-search-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "parser-search-wrapper";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "parser-search-input";
      input.placeholder = "Search websites...";

      const debouncedSearch = debounce((e) => {
        this.setSearch(e.target.value);
      }, 300);

      FilterEvents.add(input, "input", debouncedSearch);
      wrapper.appendChild(input);
      container.insertBefore(wrapper, container.firstChild);
    }

    const input = wrapper.querySelector("input");
    if (input) input.value = FilterState.parsers.searchQuery;
  },

  async renderList() {
    const container = document.getElementById("parserList");
    if (!container) return;

    // Clear old
    container.querySelectorAll(".parser-option").forEach((el) => {
      FilterEvents.removeFrom(el);
      el.remove();
    });
    container.querySelectorAll(".parser-section-label, .selected-parsers-section, .available-parsers-section, .parser-no-results").forEach((el) => el.remove());

    const { selected, unselected } = this.getSeparated();
    const filtered = this.getFiltered();

    // Selected section
    if (selected.length > 0) {
      const label = document.createElement("div");
      label.className = "parser-section-label selected";
      label.textContent = "Selected Websites";
      container.appendChild(label);

      const section = document.createElement("div");
      section.className = "selected-parsers-section";
      section.id = "selectedParsersList";

      selected.forEach((parser) => {
        section.appendChild(this.createOption(parser, true));
      });

      container.appendChild(section);
    }

    // Available section
    if (unselected.length > 0) {
      const label = document.createElement("div");
      label.className = "parser-section-label available";
      label.textContent = "Available Websites";
      container.appendChild(label);

      const section = document.createElement("div");
      section.className = "available-parsers-section";
      section.id = "availableParsersList";

      unselected.forEach((parser) => {
        section.appendChild(this.createOption(parser, false));
      });

      container.appendChild(section);
    }

    // No results
    if (filtered.length === 0 && FilterState.parsers.searchQuery) {
      const noResults = document.createElement("div");
      noResults.className = "parser-no-results";
      noResults.textContent = "No websites found";
      container.appendChild(noResults);
    }

    await activateSimpleBar(["selectedParsersList", "availableParsersList"]);
  },

  createOption(parser, isSelected) {
    const wrapper = document.createElement("div");
    wrapper.className = "parser-option";
    if (isSelected) wrapper.classList.add("active");

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.parserId = parser.id;
    checkbox.checked = isSelected;
    checkbox.disabled = FilterState.parsers.allSelected;

    FilterEvents.add(checkbox, "change", (e) => {
      this.toggle(parser.id, e.target.checked);
    });

    FilterEvents.add(wrapper, "click", (e) => {
      if (e.target === checkbox || e.target.classList.contains("slider")) return;
      if (checkbox.disabled) return;
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });

    const slider = document.createElement("span");
    slider.className = "slider";

    const text = document.createElement("span");
    text.className = "parser-title";
    text.textContent = parser.title || parser.domain;

    // Highlight search
    const query = FilterState.parsers.searchQuery;
    if (query) {
      const textValue = text.textContent;
      const lowerText = textValue.toLowerCase();
      const index = lowerText.indexOf(query);

      if (index !== -1) {
        text.innerHTML = "";
        text.appendChild(document.createTextNode(textValue.slice(0, index)));
        const mark = document.createElement("mark");
        mark.textContent = textValue.slice(index, index + query.length);
        text.appendChild(mark);
        text.appendChild(document.createTextNode(textValue.slice(index + query.length)));
      }
    }

    switchLabel.append(checkbox, slider);
    wrapper.append(switchLabel, text);

    return wrapper;
  },
};
