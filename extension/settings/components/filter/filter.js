// INIT
async function initFilter() {
  await FilterStorage.loadParsers();
  await FilterStorage.loadFilters();

  FilterTabsController.render();
  FilterListController.render();

  // Setup event listeners for main buttons
  const toggleFormBtn = document.getElementById("toggleFormBtn");
  if (toggleFormBtn) {
    FilterEvents.add(toggleFormBtn, "click", () => FormController.toggle());
  }

  const blockCurrentBtn = document.getElementById("getSongInfoBtn");
  if (blockCurrentBtn) {
    FilterEvents.add(blockCurrentBtn, "click", () => QuickActions.blockCurrent());
  }
}

window.initFilter = initFilter;
