const parserState = {
  isParserOpen: false,
  isParserAnimating: false,
  currentRenderCleanup: null,
};

async function renderList(filteredList = null, isSearch = null) {
  const container = document.getElementById("siteListContainer");
  container.style = "";

  parserState.currentRenderCleanup?.();
  parserState.currentRenderCleanup = null;
  parserState.isParserOpen = false;
  container.replaceChildren();
  document.querySelector("#searchBox")?.classList.remove("fading");

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabUrl = new URL(tab.url);
  const tabHostname = normalizeHost(tabUrl.hostname);
  const tabPath = tabUrl.pathname;

  const spinner = Object.assign(document.createElement("div"), { className: "spinner" });
  container.appendChild(spinner);

  const list = filteredList ?? (await getFreshParserList());
  spinner.remove();

  if (!list?.length) {
    createEmptyState(container, isSearch);
    return false;
  }

  const { addListener, removeAll } = createListenerManager();

  const [{ parserEnabledState = {} }, { parserSettings = {} }] = await Promise.all([
    browser.storage.local.get("parserEnabledState"),
    browser.storage.local.get("parserSettings"),
  ]);

  let anySettingsDirty = false;
  const fragment = document.createDocumentFragment();

  for (const entry of list) {
    const { wrapper, settingsDirty } = await buildParserEntry({
      entry,
      parserEnabledState,
      parserSettings,
      container,
      tabHostname,
      tabPath,
      addListener,
    });

    if (settingsDirty) anySettingsDirty = true;
    fragment.appendChild(wrapper);
  }

  if (anySettingsDirty) {
    await browser.storage.local.set({ parserSettings });
  }

  container.appendChild(fragment);
  updateMinHeight();
  loadFavIcons(document.querySelectorAll(".parser-icon"));

  parserState.currentRenderCleanup = removeAll;

  return true;
}
