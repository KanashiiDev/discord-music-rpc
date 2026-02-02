// INIT
async function initFilter() {
  await FilterStorage.loadParsers();
  await FilterStorage.loadFilters();
  ParserController.renderAllSwitch();
  ParserController.render();
  FilterTabsController.render();
  FilterListController.render();
  FormController.renderMode();
  FormController.renderEntries();

  // Setup event listeners for main buttons
  const toggleFormBtn = document.getElementById("toggleFormBtn");
  if (toggleFormBtn) {
    FilterEvents.add(toggleFormBtn, "click", () => FormController.toggle());
  }

  const saveBtn = document.querySelector(".btn-save");
  if (saveBtn) {
    FilterEvents.add(saveBtn, "click", () => FormController.save());
  }

  const cancelBtn = document.querySelector(".btn-cancel");
  if (cancelBtn) {
    FilterEvents.add(cancelBtn, "click", () => FormController.close());
  }

  const addEntryBtn = document.querySelector(".btn-add-entry");
  if (addEntryBtn) {
    FilterEvents.add(addEntryBtn, "click", () => FormController.addEntry());
  }

  const fillCurrentBtn = document.querySelector(".btn-fill-current");
  if (fillCurrentBtn) {
    FilterEvents.add(fillCurrentBtn, "click", () => QuickActions.fillCurrent());
  }

  const blockCurrentBtn = document.querySelector("#getSongInfoBtn");
  if (blockCurrentBtn) {
    FilterEvents.add(blockCurrentBtn, "click", () => QuickActions.blockCurrent());
  }
}

window.initFilter = initFilter;
