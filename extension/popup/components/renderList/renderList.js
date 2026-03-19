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

  const contWrapper = document.querySelector("#siteList .simplebar-content-wrapper");
  if (contWrapper) contWrapper.style.paddingBottom = "";

  const spinner = Object.assign(document.createElement("div"), { className: "spinner" });
  container.appendChild(spinner);

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabUrl = new URL(tab.url);
  const tabHostname = normalizeHost(tabUrl.hostname);
  const tabPath = tabUrl.pathname;

  const list = filteredList ?? (await getFreshParserList());

  if (!list?.length) {
    spinner.remove();
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
  loadFavIcons(document.querySelectorAll(".parser-icon"));

  parserState.currentRenderCleanup = removeAll;
  spinner.remove();
  return true;
}
