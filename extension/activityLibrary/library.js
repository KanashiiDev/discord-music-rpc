const $ = (id) => document.getElementById(id);
const msg = (action, data = {}) => browser.runtime.sendMessage({ action, ...data });

// DOM element cache
const domCache = new Map();
const getElem = (id) => {
  domCache.has(id) || domCache.set(id, document.getElementById(id));
  return domCache.get(id);
};

/** SVG icons helper */
const iconSVG = (key, size = 14) => createSVG(svg_paths[key], { width: size, height: size });

// State
const state = {
  repos: [], // [{ id, url, user, repo, branch, scripts, lastChecked}]
  installed: [], // userScriptsList from storage
  pendingUpdates: [],
  _initialized: false,
  listView: false,
};

// WeakMap cache for generateScriptId - avoids recomputing for same meta object
const scriptIdCache = new WeakMap();

// Pagination
const paginationState = new Map(); // repoId → currentPage
const scriptRowCache = new Map();
const PAGE_SIZE = 20;

// Messaging
const apiCall = async (action, data = {}) => {
  const result = await msg(action, data);
  return result ?? { ok: false, error: "No response" };
};

const listRepos = () => apiCall("store_listRepos");
const addRepo = (url) => apiCall("store_addRepo", { url });
const removeRepo = (repoId) => apiCall("store_removeRepo", { repoId });
const checkUpdates = () => apiCall("store_checkUpdates");
const installScript = (repoId, meta) => apiCall("store_installScript", { repoId, scriptMeta: meta });
const updateScript = (repoId, meta) => apiCall("store_updateScript", { repoId, scriptMeta: meta });
const batchUpdate = (updates) => apiCall("store_batchUpdate", { updates });
const getAutoUpdate = () => apiCall("store_getAutoUpdate");
const setAutoUpdate = (enabled) => apiCall("store_setAutoUpdate", { enabled });

const getInstalledScripts = async () => {
  const result = await browser.storage.local.get("userScriptsList").catch(() => ({}));
  return result.userScriptsList ?? [];
};

// Status Bar
let statusTimer = null;

const showStatus = (text, loading = false, duration = 3000) => {
  const bar = getElem("statusBar");
  const textEl = getElem("statusText");
  if (!bar || !textEl) return;

  bar.hidden = false;

  const spinner = bar.querySelector(".spinner-inline");
  if (loading && !spinner) {
    const s = document.createElement("div");
    s.className = "spinner-inline";
    bar.insertBefore(s, textEl);
  } else if (!loading) {
    spinner?.remove();
  }

  textEl.textContent = text;

  clearTimeout(statusTimer);
  statusTimer = null;
  if (!loading && duration > 0) {
    statusTimer = setTimeout(() => {
      bar.hidden = true;
    }, duration);
  }
};

const hideStatus = () => {
  clearTimeout(statusTimer);
  statusTimer = null;
  const bar = getElem("statusBar");
  if (bar) bar.hidden = true;
};

// Init
const MAIN_REPO_ID = "KanashiiDev__discord-music-rpc-activities__main";
const MAIN_REPO_URL = "https://github.com/KanashiiDev/discord-music-rpc-activities";

const init = async () => {
  if (state._initialized) return;

  await i18n.load("extension").catch(() => {});

  try {
    const { appearanceSettings = {} } = await browser.storage.local.get("appearanceSettings");
    if (appearanceSettings.theme) document.body.setAttribute("data-theme", appearanceSettings.theme);
  } catch {}

  const url = new URL(window.location.href);
  const hasSetup = url.searchParams.get("setup") === "1";

  if (hasSetup) {
    await showAlert(i18n.t("library.setup.header"), i18n.t("library.setup.body"), "tip");
    url.searchParams.delete("setup");
    window.location.replace(url.toString());
    await browser.storage.local.set({ storeServiceSetup: true });
  }

  const perm = await checkUserScriptsPermission();
  if (!perm) return;

  migrateToUserScriptSystem();

  injectHeaderIcons();
  await loadAll();
  await ensureMainRepo();

  bindEvents();
  renderAll();
  applyTranslations("extension");
  initApplyAttrs();
  initStorageListener();
  initMotionPreference();

  state._initialized = true;

  const autoUpdateResult = await getAutoUpdate().catch(() => ({ ok: false }));
  const chkAutoUpdate = getElem("chkAutoUpdate");
  if (chkAutoUpdate) {
    chkAutoUpdate.checked = autoUpdateResult?.enabled ?? false;
    chkAutoUpdate.addEventListener("change", (e) => setAutoUpdate(e.target.checked).catch(() => {}));
  }

  const { libraryListView = false } = await browser.storage.local.get("libraryListView");
  state.listView = libraryListView;
  const label = getElem("btnToggleViewLabel");
  if (label) label.appendChild(createSVG(state.listView ? svg_paths.gridViewIconPaths : svg_paths.listViewIconPaths));
  document.querySelectorAll(".script-list").forEach((el) => {
    el.classList.toggle("list-view", state.listView);
  });
};

const injectHeaderIcons = () => {
  const checkBtn = getElem("btnCheckUpdates");
  checkBtn?.insertBefore(iconSVG("refreshIconPaths", 14), checkBtn.firstChild);

  const toggleBtn = getElem("btnToggleAdvanced");
  if (toggleBtn) {
    const icon = iconSVG("plusIconPaths", 12);
    icon.style.opacity = "0.7";
    toggleBtn.insertBefore(icon, toggleBtn.firstChild);
  }

  const emptyState = getElem("emptyState");
  if (emptyState) {
    const icon = createSVG(svg_paths.emptyCircleIconPaths, {
      width: 40,
      height: 40,
      stroke: "currentColor",
      strokeWidth: 1.4,
      viewBox: "-1 -1 25.5 25.5",
    });
    icon.style.opacity = "0.3";
    emptyState.insertBefore(icon, emptyState.firstChild);
  }

  const exLink = getElem("exampleRepoLink");
  if (exLink) exLink.href = MAIN_REPO_URL;

  const headerRight = document.querySelector(".library-header-right");
  if (headerRight) {
    const wrapper = document.createElement("div");
    wrapper.className = "auto-update-wrapper";

    const labelText = document.createElement("span");
    labelText.className = "auto-update-label";
    labelText.setAttribute("data-i18n", "library.autoUpdate");
    labelText.textContent = "Auto Update";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "chkAutoUpdate";

    const slider = document.createElement("span");
    slider.className = "slider";

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch-label";
    switchLabel.id = "autoUpdateSwitch";
    switchLabel.append(input, slider);

    wrapper.append(labelText, switchLabel);
    headerRight.insertBefore(wrapper, headerRight.firstChild);
  }
};

const ensureMainRepo = async () => {
  if (state.repos.some((r) => r.id === MAIN_REPO_ID)) return;

  const result = await addRepo(MAIN_REPO_URL).catch(() => null);
  if (result?.ok) {
    const [repoRes, installed] = await Promise.all([listRepos().catch(() => ({ ok: true, list: [] })), getInstalledScripts()]);
    state.repos = repoRes.list ?? [];
    state.installed = installed;
  }
};

const loadAll = async () => {
  const [repoRes, installed] = await Promise.all([listRepos().catch(() => ({ ok: true, list: [] })), getInstalledScripts()]);
  state.repos = repoRes.list ?? [];
  state.installed = installed;
  recomputePendingUpdates();
};

// Build a lookup map once and reuse it wherever installedMap is needed
const buildInstalledMap = () => {
  const map = new Map();
  for (const s of state.installed) {
    if (s.id) map.set(s.id, s);
    if (s.storeScriptId) map.set(s.storeScriptId, s);
  }
  return map;
};

const recomputePendingUpdates = () => {
  const installedMap = buildInstalledMap();
  state.pendingUpdates = [];

  for (const repo of state.repos) {
    for (const meta of repo.scripts ?? []) {
      const sid = meta.id ?? generateScriptId(meta);
      const local = installedMap.get(sid);
      if (local?.version && isNewer(meta.version, local.version)) {
        state.pendingUpdates.push({ repoId: repo.id, scriptMeta: meta });
      }
    }
  }
};

// Event Binding
const eventCleanup = new Map();

const bindEvents = () => {
  for (const [elem, { type, handler }] of eventCleanup) {
    elem.removeEventListener(type, handler);
  }
  eventCleanup.clear();

  const on = (id, event, handler) => {
    const el = getElem(id);
    if (!el) return;
    el.addEventListener(event, handler);
    eventCleanup.set(el, { type: event, handler });
  };

  on("btnCheckUpdates", "click", handleCheckUpdates);
  on("btnBatchUpdate", "click", handleBatchUpdate);
  on("btnToggleAdvanced", "click", handleToggleAdvanced);
  on("btnConfirmAddRepo", "click", handleAddRepo);
  on("btnCancelAddRepo", "click", () => toggleAddRepoPanel(false));
  on("btnToggleView", "click", () => {
    state.listView = !state.listView;
    const label = getElem("btnToggleViewLabel");
    if (label) {
      label.replaceChildren();
      label.appendChild(createSVG(state.listView ? svg_paths.gridViewIconPaths : svg_paths.listViewIconPaths));
    }
    document.querySelectorAll(".script-list").forEach((el) => {
      el.classList.toggle("list-view", state.listView);
    });
    browser.storage.local.set({ libraryListView: state.listView }).catch(() => {});
  });

  const urlInput = getElem("repoUrlInput");
  if (urlInput) {
    const kh = (e) => {
      if (e.key === "Enter") handleAddRepo();
      if (e.key === "Escape") toggleAddRepoPanel(false);
    };
    urlInput.addEventListener("keydown", kh);
    eventCleanup.set(urlInput, { type: "keydown", handler: kh });
  }

  const repoList = getElem("repoList");
  if (repoList) {
    const ch = (e) => handleRepoListClick(e);
    const ih = (e) => handleRepoListInput(e);
    repoList.addEventListener("click", ch);
    repoList.addEventListener("input", ih);
    eventCleanup.set(Symbol(), { el: repoList, type: "click", handler: ch });
    eventCleanup.set(Symbol(), { el: repoList, type: "input", handler: ih });
  }
};

const handleToggleAdvanced = () => {
  const panel = getElem("addRepoPanel");
  if (panel) toggleAddRepoPanel(panel.hidden);
};

const toggleAddRepoPanel = (open) => {
  const panel = getElem("addRepoPanel");
  if (!panel) return;
  panel.hidden = !open;
  if (open) {
    const urlInput = getElem("repoUrlInput");
    const errorDiv = getElem("addRepoError");
    if (urlInput) {
      urlInput.value = "";
      urlInput.focus();
    }
    if (errorDiv) errorDiv.textContent = "";
  }
};

const handleAddRepo = async () => {
  const urlInput = getElem("repoUrlInput");
  const errorDiv = getElem("addRepoError");
  const confirmBtn = getElem("btnConfirmAddRepo");
  if (!urlInput || !errorDiv || !confirmBtn) return;

  const url = urlInput.value.trim();
  if (!url) {
    errorDiv.textContent = i18n.t("library.addRepo.errorEmpty");
    return;
  }

  confirmBtn.disabled = true;
  errorDiv.textContent = "";
  showStatus(i18n.t("library.status.addingRepo"), true, 0);

  const result = await addRepo(url).catch((err) => ({ ok: false, error: err.message }));
  confirmBtn.disabled = false;

  if (!result.ok) {
    errorDiv.textContent = result.error ?? i18n.t("library.error.unknown");
    hideStatus();
    return;
  }

  toggleAddRepoPanel(false);
  await loadAll();
  renderAll();
  showStatus(i18n.t("library.status.repoAdded", [result.repo?.scripts?.length ?? 0]), false, 3500);
};

const handleCheckUpdates = async () => {
  const btn = getElem("btnCheckUpdates");
  if (!btn) return;

  btn.disabled = true;
  showStatus(i18n.t("library.status.checkingUpdates"), true, 0);

  const result = await checkUpdates().catch((err) => ({ ok: false, error: err.message }));
  btn.disabled = false;

  if (!result?.ok) {
    showStatus(i18n.t("library.error.prefix") + (result?.error ?? i18n.t("library.error.unknown")), false, 4000);
    return;
  }

  await loadAll();
  renderAll();

  const total = result.totalUpdates ?? 0;
  showStatus(total === 0 ? i18n.t("library.status.allUpToDate") : i18n.t("library.status.updatesFound", [result.totalUpdates ?? 0]), false, 4000);
};

const handleBatchUpdate = async () => {
  const updates = state.pendingUpdates;
  if (!updates.length) return;

  const btn = getElem("btnBatchUpdate");
  if (!btn) return;

  btn.disabled = true;
  showStatus(i18n.t("library.status.updatingBatch", [updates.length]), true, 0);

  const result = await batchUpdate(updates).catch((err) => ({ ok: false, error: err.message }));
  btn.disabled = false;

  if (!result?.ok) {
    showStatus(i18n.t("library.error.prefix") + (result?.error ?? i18n.t("library.error.unknown")), false, 4000);
    return;
  }

  const okCount = result.successful?.length ?? 0;
  const failCount = result.failed?.length ?? 0;
  await loadAll();
  renderAll();
  showStatus(failCount > 0 ? i18n.t("library.status.batchPartial", [okCount, failCount]) : i18n.t("library.status.batchDone", [okCount]), false, 3500);
};

const handleRepoListClick = async (e) => {
  const target = e.target;

  const repoHeader = target.closest(".repo-block-header");
  if (repoHeader && !target.closest(".library-btn, .script-action-btn")) {
    repoHeader.closest(".repo-block")?.classList.toggle("open");
    return;
  }

  // Remove repo
  const removeRepoBtn = target.closest("[data-action='removeRepo']");
  if (removeRepoBtn) {
    const repoId = removeRepoBtn.dataset.repoId;
    if (!repoId) return;

    if (repoId === MAIN_REPO_ID) {
      showStatus(i18n.t("library.error.cannotDeleteMain"), false, 3000);
      return;
    }

    if (!(await showConfirm("", { heading: i18n.t("library.confirm.removeRepo") + `\n[${MAIN_REPO_ID}]`, body: "" }))) return;

    removeRepoBtn.disabled = true;
    showStatus(i18n.t("library.status.removingRepo"), true, 0);
    scriptRowCache.delete(repoId);

    const result = await removeRepo(repoId).catch((err) => ({ ok: false, error: err.message }));
    if (!result?.ok) {
      showStatus(i18n.t("library.error.prefix") + (result?.error ?? i18n.t("library.error.unknown")), false, 4000);
      return;
    }

    state.repos = state.repos.filter((r) => r.id !== repoId);
    recomputePendingUpdates();
    renderUpdateBanner();
    updateRepoBadgeInPlace(repoId);

    document.querySelector(`.repo-block[data-repo-id="${CSS.escape(repoId)}"]`)?.remove();
    if (!state.repos.length) getElem("emptyState").hidden = false;

    showStatus(i18n.t("library.status.repoRemoved"), false, 2500);
    return;
  }

  // Remove script
  const removeScriptBtn = target.closest("[data-action='removeScript']");
  if (removeScriptBtn) {
    const scriptTitle = removeScriptBtn.dataset.scriptTitle + " - " + removeScriptBtn.dataset.scriptAuthor || "";
    const scriptId = removeScriptBtn.dataset.scriptId;
    const repoId = removeScriptBtn.dataset.repoId;
    if (!scriptId) return;
    if (!(await showConfirm("", { heading: i18n.t("userscript.editor.confirm.delete") + `\n[${scriptTitle}]`, body: "" }))) return;

    removeScriptBtn.disabled = true;
    removeScriptBtn.classList.add("loading");
    removeScriptBtn.replaceChildren(iconSVG("spinnerIconPaths", 13));
    showStatus(i18n.t("library.status.removingScript"), true, 0);

    const result = await msg("store_removeScript", { scriptId, repoId }).catch((err) => ({ ok: false, error: err.message }));

    removeScriptBtn.replaceChildren(iconSVG("trashIconPaths", 14));
    removeScriptBtn.classList.remove("loading");
    removeScriptBtn.disabled = false;

    if (!result?.ok) {
      showStatus(i18n.t("library.error.prefix") + (result?.error ?? i18n.t("library.error.unknown")), false, 4000);
      return;
    }

    state.installed = await getInstalledScripts();
    recomputePendingUpdates();
    renderUpdateBanner();

    const row = removeScriptBtn.closest(".script-row");
    if (row) {
      const actualScriptId = row.dataset.scriptId;
      const repo = state.repos.find((r) => r.id === repoId);
      const meta = repo?.scripts?.find((s) => (s.id ?? generateScriptId(s)) === actualScriptId);
      if (meta) updateScriptRowInPlace(row, meta, repoId, buildInstalledMap());
    }

    document.querySelector(`.repo-block[data-repo-id="${CSS.escape(repoId)}"]`);
    const block = document.querySelector(`.repo-block[data-repo-id="${CSS.escape(repoId)}"]`);
    if (block) applyFiltersInPlace(block);

    showStatus(i18n.t("library.status.scriptRemoved"), false, 2500);
    return;
  }

  const actionBtn = target.closest("[data-action='install'], [data-action='update']");
  if (actionBtn) {
    await handleScriptAction(actionBtn, actionBtn.dataset.action);
  }
};

const handleRepoListInput = (e) => {
  const searchInput = e.target.closest(".script-search");
  if (!searchInput) return;
  const repoId = searchInput.dataset.repoId;
  if (!repoId) return;
  const block = document.querySelector(`.repo-block[data-repo-id="${CSS.escape(repoId)}"]`);
  if (block) applyFiltersInPlace(block, true);
};

const handleScriptAction = async (btn, action) => {
  const repoId = btn.dataset.repoId;
  const scriptId = btn.dataset.scriptId;
  if (!repoId || !scriptId) return;

  const repo = state.repos.find((r) => r.id === repoId);
  if (!repo) return;

  const scriptMeta = repo.scripts?.find((s) => (s.id ?? generateScriptId(s)) === scriptId);
  if (!scriptMeta) return;

  btn.disabled = true;
  btn.replaceChildren(iconSVG("spinnerIconPaths", 13));

  const isInstall = action === "install";
  showStatus(i18n.t(isInstall ? "library.status.installing" : "library.status.updating", [scriptMeta.title ?? "Script"]), true, 0);

  const fn = isInstall ? () => installScript(repoId, scriptMeta) : () => updateScript(repoId, scriptMeta);
  const result = await fn().catch((err) => ({ ok: false, error: err.message }));

  btn.replaceChildren(iconSVG(isInstall ? "downloadIconPaths" : "refreshIconPaths", 13));
  btn.disabled = false;

  if (!result?.ok) {
    showStatus(i18n.t("library.error.prefix") + (result?.error ?? i18n.t("library.error.unknown")), false, 5000);
    return;
  }

  showStatus(i18n.t(isInstall ? "library.status.installed" : "library.status.updated", [scriptMeta.title]), false, 3000);

  state.installed = await getInstalledScripts();
  recomputePendingUpdates();
  renderUpdateBanner();

  const installedMap = buildInstalledMap();

  const row = document.querySelector(`.script-row[data-script-id="${CSS.escape(scriptId)}"]`);
  if (row) updateScriptRowInPlace(row, scriptMeta, repoId, installedMap);

  const block = document.querySelector(`.repo-block[data-repo-id="${CSS.escape(repoId)}"]`);
  if (block) applyFiltersInPlace(block);
};

const renderAll = () => {
  const list = getElem("repoList");
  const empty = getElem("emptyState");
  if (!list || !empty) return;

  renderUpdateBanner();

  if (!state.repos.length) {
    empty.hidden = false;
    list.replaceChildren();
    return;
  }
  empty.hidden = true;
  const existingBlocks = new Map([...list.querySelectorAll(".repo-block")].map((b) => [b.dataset.repoId, b]));

  const pendingMap = new Map();
  for (const item of state.pendingUpdates) {
    pendingMap.set(item.repoId, (pendingMap.get(item.repoId) ?? 0) + 1);
  }

  for (const repo of state.repos) {
    scriptRowCache.delete(repo.id);
    let block = existingBlocks.get(repo.id);
    const wasOpen = block?.classList.contains("open") ?? true;

    if (!block) {
      block = document.createElement("div");
      block.className = "repo-block" + (wasOpen ? " open" : "");
      block.dataset.repoId = repo.id;
      list.appendChild(block);
    }

    block.classList.toggle("main-repo", repo.id === MAIN_REPO_ID);

    renderRepoBlock(block, repo, pendingMap.get(repo.id) ?? 0);
    if (wasOpen) block.classList.add("open");
    existingBlocks.delete(repo.id);
  }

  for (const block of existingBlocks.values()) block.remove();
};

const renderUpdateBanner = () => {
  const banner = getElem("updateBanner");
  const textEl = getElem("updateBannerText");
  if (!banner || !textEl) return;

  const count = state.pendingUpdates.length;
  banner.hidden = count === 0;
  if (count > 0) textEl.textContent = i18n.t("library.banner.updatesAvailable", [count]);
};

const renderRepoBlock = (block, repo, precomputedUpdateCount) => {
  const updateCount = precomputedUpdateCount ?? state.pendingUpdates.filter((u) => u.repoId === repo.id).length;
  const scripts = repo.scripts ?? [];

  block.replaceChildren();

  // Header
  const header = document.createElement("div");
  header.className = "repo-block-header";

  const info = document.createElement("div");
  info.className = "repo-block-info";

  const nameEl = document.createElement("a");
  nameEl.className = "repo-block-name";
  nameEl.textContent = repo.id === MAIN_REPO_ID ? i18n.t("library.repo.officialName") : `${repo.user}/${repo.repo}`;
  nameEl.href = repo.url;

  const metaEl = document.createElement("div");
  metaEl.className = "repo-block-meta";
  const lastCheckedText = repo.lastChecked ? ` · ${i18n.t("library.repo.lastChecked")}: ${relativeTime(repo.lastChecked)}` : "";
  metaEl.textContent = `${scripts.length} ${i18n.t("library.repo.scriptCount")}${lastCheckedText}`;

  info.append(nameEl, metaEl);
  header.appendChild(info);

  if (repo.id === MAIN_REPO_ID) {
    const official = document.createElement("span");
    official.className = "repo-badge official";
    official.textContent = i18n.t("library.repo.official");
    header.appendChild(official);
  }

  const badges = document.createElement("div");
  badges.className = "repo-block-badges";
  if (updateCount > 0) {
    const b = document.createElement("span");
    b.className = "repo-badge update";
    b.textContent = `↑ ${updateCount}`;
    badges.appendChild(b);
  }
  header.appendChild(badges);

  if (repo.id !== MAIN_REPO_ID) {
    const actions = document.createElement("div");
    actions.className = "repo-block-actions";
    const removeBtn = document.createElement("button");
    removeBtn.className = "store-btn danger small";
    removeBtn.dataset.action = "removeRepo";
    removeBtn.dataset.repoId = repo.id;
    removeBtn.title = i18n.t("library.repo.removeTitle");
    removeBtn.textContent = i18n.t("library.repo.remove");
    actions.appendChild(removeBtn);
    header.appendChild(actions);
  }

  block.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "repo-block-body";

  const inner = document.createElement("div");
  inner.className = "repo-block-body-inner";

  const filterBar = document.createElement("div");
  filterBar.className = "script-filter-bar";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "script-search";
  searchInput.dataset.repoId = repo.id;
  searchInput.placeholder = i18n.t("parserlist.search_site");
  filterBar.appendChild(searchInput);

  const categorySelect = document.createElement("select");
  categorySelect.className = "script-category-select library-input";
  categorySelect.dataset.repoId = repo.id;

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "all";
  defaultOpt.textContent = i18n.t("common.all") || "All";
  categorySelect.appendChild(defaultOpt);

  const categories = new Set();
  for (const meta of scripts) meta.category?.forEach((c) => categories.add(c));

  for (const cat of [...categories].sort()) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = i18n.t(`parserFilters.category.${cat}`);
    categorySelect.appendChild(opt);
  }

  filterBar.appendChild(categorySelect);

  // Tom Select init
  const tom = new TomSelect(categorySelect, {
    create: false,
    allowEmptyOption: true,
    placeholder: i18n.t("common.all") || "All",
    persist: false,
    controlInput: null,
    maxOptions: 5,
    onChange: (value) => {
      categorySelect.value = !value || value === "all" ? "all" : value;
      applyFiltersInPlace(block, true);
    },
  });

  const chipRow = document.createElement("div");
  chipRow.className = "filter-chip-row";

  const filters = [
    { key: "all", label: i18n.t("library.filter.all") },
    { key: "installed", label: i18n.t("library.filter.installed") },
    { key: "updates", label: i18n.t("library.filter.updates") },
  ];

  for (const f of filters) {
    const chip = document.createElement("button");
    chip.className = "filter-chip" + (f.key === "all" ? " active" : "");
    chip.dataset.filter = f.key;
    chip.dataset.repoId = repo.id;
    chip.textContent = f.label;
    chipRow.appendChild(chip);
  }

  filterBar.appendChild(chipRow);
  inner.appendChild(filterBar);

  chipRow.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    for (const c of chipRow.querySelectorAll(".filter-chip")) c.classList.remove("active");
    chip.classList.add("active");
    applyFiltersInPlace(block, true);
  });

  const scriptListEl = document.createElement("div");
  scriptListEl.className = "script-list";
  scriptListEl.dataset.repoId = repo.id;
  if (state.listView) scriptListEl.classList.add("list-view");
  inner.appendChild(scriptListEl);

  body.appendChild(inner);
  block.appendChild(body);

  buildScriptListStructure(block, repo);
};

const buildScriptListStructure = (block, repo) => {
  const listEl = block.querySelector(`.script-list[data-repo-id="${CSS.escape(repo.id)}"]`);
  if (!listEl) return;

  const installedMap = buildInstalledMap();
  const repoCache = new Map();

  listEl.replaceChildren();

  for (const meta of repo.scripts ?? []) {
    const sid = meta.id ?? generateScriptId(meta);
    const row = renderScriptRow(meta, repo.id, installedMap);
    row.style.display = "none";
    listEl.appendChild(row);
    repoCache.set(sid, row);
  }

  scriptRowCache.set(repo.id, repoCache);
  loadFavIcons(listEl.querySelectorAll(".script-favicon"));
  applyFiltersInPlace(block);
};

const renderPagination = (block, repoId, totalVisible, currentPage) => {
  const existing = block.querySelector(".script-pagination");
  existing?.remove();

  const totalPages = Math.ceil(totalVisible / PAGE_SIZE);
  if (totalPages <= 1) return;

  const nav = document.createElement("div");
  nav.className = "script-pagination";
  nav.dataset.repoId = repoId;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.className = "pagination-btn" + (i === currentPage ? " active" : "");
    btn.textContent = i;
    btn.dataset.page = i;
    btn.addEventListener("click", () => {
      paginationState.set(repoId, i);
      applyFiltersInPlace(block);
    });
    nav.appendChild(btn);
  }

  const inner = block.querySelector(".repo-block-body-inner");
  inner?.appendChild(nav);
};

const applyFiltersInPlace = (block, resetPage = false) => {
  const listEl = block.querySelector(".script-list");
  const searchEl = block.querySelector(".script-search");
  const categorySelect = block.querySelector(".script-category-select");
  const activeChip = block.querySelector(".filter-chip.active");
  if (!listEl) return;

  const filter = activeChip?.dataset.filter ?? "all";
  const search = searchEl?.value.trim().toLowerCase() ?? "";
  const selectedCategory = categorySelect?.value ?? "all";

  const installedMap = buildInstalledMap();
  const repoId = listEl.dataset.repoId;
  const repo = state.repos.find((r) => r.id === repoId);
  const allScripts = repo?.scripts ?? [];
  const repoCache = scriptRowCache.get(repoId);

  // Filter
  const matching = allScripts.filter((meta) => {
    const sid = meta.id ?? generateScriptId(meta);
    const local = findLocal(installedMap, sid, meta);
    const hasUpdate = local?.version && isNewer(meta.version, local.version);

    const matchFilter = (filter !== "installed" || !!local) && (filter !== "updates" || !!hasUpdate);

    let matchSearch = true;
    if (search) {
      const domain = Array.isArray(meta.domain) ? meta.domain.join(" ") : (meta.domain ?? "");
      const haystack = [meta.title ?? "", domain, meta.description ?? "", (meta.tags ?? []).join(" ")].map((s) => s.toLowerCase());
      matchSearch = haystack.some((s) => s.includes(search));
    }

    const matchCategory =
      selectedCategory === "all" || (meta.category?.length ? meta.category.map((c) => c.toLowerCase()).includes(selectedCategory.toLowerCase()) : false);

    return matchFilter && matchSearch && matchCategory;
  });

  if (resetPage) paginationState.set(repoId, 1);
  const currentPage = paginationState.get(repoId) ?? 1;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageSet = new Set(matching.slice(start, end).map((m) => m.id ?? generateScriptId(m)));

  // Display toggling
  if (repoCache) {
    for (const [sid, row] of repoCache) {
      row.style.display = pageSet.has(sid) ? "" : "none";
    }
  }

  if (state.listView) listEl.classList.add("list-view");

  // Empty state
  let emptyMsg = listEl.querySelector(".script-list-empty");
  if (matching.length === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement("div");
      emptyMsg.className = "script-list-empty";
      emptyMsg.textContent = i18n.t("library.filter.noResults");
      listEl.appendChild(emptyMsg);
    }
  } else {
    emptyMsg?.remove();
  }

  renderPagination(block, repoId, matching.length, currentPage);

  const unloadedFavIcons = listEl.querySelectorAll(".script-row:not([style*='display: none']) .script-favicon:not([src])");
  if (typeof loadFavIcons === "function" && unloadedFavIcons.length > 0) loadFavIcons(unloadedFavIcons);
};

// build the install/update/remove action buttons for a script row
const buildScriptActionButtons = (actionsEl, row, meta, sid, repoId, local, hasUpdate) => {
  const localId = local?.id ?? sid;
  actionsEl.replaceChildren();

  if (!local) {
    const btn = makeActionBtn("install", sid, repoId, i18n.t("library.action.install"), "install");
    btn.appendChild(iconSVG("downloadIconPaths", 14));
    actionsEl.appendChild(btn);
  } else if (hasUpdate) {
    const btnUpd = makeActionBtn("update", sid, repoId, i18n.t("library.action.update"), "update-btn");
    btnUpd.appendChild(iconSVG("refreshIconPaths", 14));
    row.classList.add("update-available");
    const updateBadge = document.createElement("span");
    updateBadge.className = "script-category-badge update-available";
    updateBadge.textContent = i18n.t("library.action.update");
    row.querySelector(".script-category-badges").appendChild(updateBadge);
    const btnRem = makeActionBtn("removeScript", localId, repoId, meta, i18n.t("library.action.remove"), "remove-btn");
    btnRem.appendChild(iconSVG("trashIconPaths", 14));
    actionsEl.append(btnUpd, btnRem);
  } else {
    const btnRem = makeActionBtn("removeScript", localId, repoId, meta, i18n.t("library.action.remove"), "remove-btn");
    btnRem.appendChild(iconSVG("trashIconPaths", 14));
    const btnOk = document.createElement("button");
    btnOk.className = "script-action-btn";
    btnOk.title = i18n.t("library.action.upToDate");
    btnOk.disabled = true;
    row.classList.add("installed");
    const installedBadge = document.createElement("span");
    installedBadge.className = "script-category-badge installed";
    installedBadge.textContent = i18n.t("library.filter.installed");
    row.querySelector(".script-category-badges").appendChild(installedBadge);
    btnOk.appendChild(iconSVG("checkIconPaths", 14));
    actionsEl.append(btnRem, btnOk);
  }
};

// Update a script row in place based on the new metadata
const updateScriptRowInPlace = (row, meta, repoId, installedMap) => {
  const sid = meta.id ?? generateScriptId(meta);
  const local = findLocal(installedMap, sid, meta);
  const hasUpdate = local?.version && isNewer(meta.version, local.version);

  row.classList.remove("update-available", "installed");

  const versionEl = row.querySelector(".script-version");
  if (versionEl) {
    versionEl.textContent = `v${meta.version}`;
    versionEl.classList.toggle("outdated", !!hasUpdate);
  }

  row.querySelector(".script-category-badge.installed")?.remove();
  row.querySelector(".script-category-badge.update-available")?.remove();

  const actionsEl = row.querySelector(".script-actions");
  if (actionsEl) buildScriptActionButtons(actionsEl, row, meta, sid, repoId, local, hasUpdate);
};

const updateRepoBadgeInPlace = (repoId) => {
  const block = document.querySelector(`.repo-block[data-repo-id="${CSS.escape(repoId)}"]`);
  if (!block) return;

  const count = state.pendingUpdates.filter((u) => u.repoId === repoId).length;
  const badges = block.querySelector(".repo-block-badges");
  if (!badges) return;

  let badge = badges.querySelector(".repo-badge.update");
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "repo-badge update";
      badges.appendChild(badge);
    }
    badge.textContent = `↑ ${count}`;
  } else {
    badge?.remove();
  }
};

const findLocal = (installedMap, sid, meta) => {
  if (installedMap.has(sid)) return installedMap.get(sid);
  for (const [, script] of installedMap) {
    if (script.storeScriptId === sid) return script;
  }
  if (meta.file) {
    for (const [, script] of installedMap) {
      if (script.storeFilePath === meta.file) return script;
    }
  }
  return null;
};

const renderScriptRow = (meta, repoId, installedMap) => {
  const sid = meta.id ?? generateScriptId(meta);
  const local = findLocal(installedMap, sid, meta);
  const hasUpdate = local?.version && isNewer(meta.version, local.version);
  const isInstalled = !!local;
  const domain = Array.isArray(meta.domain) ? meta.domain[0] : (meta.domain ?? "");
  const primaryDomain = (domain || "").replace(/^\*\./, "");

  const row = document.createElement("div");
  row.className = "script-row";
  row.dataset.scriptId = sid;

  const topDiv = document.createElement("div");
  topDiv.className = "script-top";

  if (domain) {
    const favIconContainer = document.createElement("div");
    favIconContainer.className = "script-favicon-container spinner";

    const img = document.createElement("img");
    img.className = "script-favicon";
    img.dataset.src = primaryDomain;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("click", () => {
      window.open(meta.homepage || `https://${primaryDomain}`, "_blank", "noopener,noreferrer");
    });
    favIconContainer.appendChild(img);

    const placeholder = document.createElement("div");
    placeholder.className = "script-favicon-placeholder";
    placeholder.style.display = "none";
    placeholder.textContent = (meta.title ?? "?")[0];

    topDiv.append(favIconContainer, placeholder);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "script-favicon-placeholder";
    placeholder.textContent = (meta.title ?? "?")[0];
    topDiv.appendChild(placeholder);
  }

  // Info
  const info = document.createElement("div");
  info.className = "script-info";

  const headerDiv = document.createElement("div");
  headerDiv.className = "script-header";

  const headerRightDiv = document.createElement("div");
  headerRightDiv.className = "script-header-right";

  const nameDiv = document.createElement("div");
  nameDiv.className = "script-name-wrap";

  const nameEl = document.createElement("div");
  nameEl.className = "script-name";
  nameEl.textContent = meta.title ?? domain ?? i18n.t("library.script.unknown");
  nameDiv.appendChild(nameEl);
  headerDiv.appendChild(nameDiv);

  const metaEl = document.createElement("div");
  metaEl.className = "script-meta";

  if (meta.version) {
    if (!hasUpdate) {
      const ver = document.createElement("span");
      ver.className = "script-version";
      ver.textContent = `v${meta.version}`;
      metaEl.appendChild(ver);
    } else if (local?.version) {
      const arrow = document.createElement("span");
      arrow.className = "script-version outdated";
      arrow.textContent = `v${local.version} → v${meta.version}`;
      metaEl.appendChild(arrow);
    }
  }

  headerDiv.appendChild(metaEl);
  nameDiv.appendChild(headerRightDiv);
  topDiv.appendChild(headerDiv);
  row.appendChild(topDiv);

  if (meta.category) {
    const catWrap = document.createElement("div");
    catWrap.className = "script-category-badges";

    const categories = Array.isArray(meta.category) ? meta.category : [meta.category];

    for (const c of categories) {
      const cat = document.createElement("span");
      cat.className = "script-category-badge";
      cat.textContent = i18n.t(`parserFilters.category.${c}`);
      catWrap.appendChild(cat);
    }

    headerRightDiv.appendChild(catWrap);
  }
  // Author
  if (meta.authors?.length && meta.authors[0]?.trim() !== "") {
    const authorsContainer = document.createElement("div");
    authorsContainer.className = "script-authors";
    authorsContainer.textContent = "by ";

    for (const [i, author] of meta.authors.entries()) {
      const link = meta.authorsLinks?.[i];

      const authorWrap = document.createElement("div");
      authorWrap.className = `script-author-container${link ? "" : " no-link"}`;

      const authorEl = document.createElement("a");
      authorEl.className = "script-author";
      authorEl.textContent = author;

      if (link) {
        authorEl.href = link;
        authorEl.target = "_blank";
        authorEl.rel = "noopener noreferrer";
      } else {
        authorEl.href = "";
        authorEl.style.pointerEvents = "none";
        authorEl.tabIndex = -1;
      }
      authorWrap.appendChild(authorEl);
      authorsContainer.appendChild(authorWrap);
    }
    metaEl.appendChild(authorsContainer);
  }

  // Description
  if (meta.description) {
    const descEl = document.createElement("div");
    descEl.className = "script-description";
    descEl.textContent = meta.description;
    info.appendChild(descEl);
  }

  row.appendChild(info);

  // Tags
  const tagsEl = document.createElement("div");
  tagsEl.className = "script-tags";
  for (const t of meta.tags ?? []) {
    const tag = document.createElement("span");
    tag.className = "script-tag";
    tag.textContent = t;
    tagsEl.appendChild(tag);
  }
  if (tagsEl.children.length) row.appendChild(tagsEl);

  // Action Buttons
  const actionsEl = document.createElement("div");
  actionsEl.className = "script-actions";
  buildScriptActionButtons(actionsEl, row, meta, sid, repoId, local, hasUpdate);

  headerRightDiv.appendChild(actionsEl);
  return row;
};

const makeActionBtn = (action, scriptId, repoId, meta, title, extraClass = "") => {
  const btn = document.createElement("button");
  btn.className = `script-action-btn${extraClass ? ` ${extraClass}` : ""}`;
  btn.title = title;
  btn.dataset.action = action;
  btn.dataset.scriptId = scriptId;
  btn.dataset.scriptTitle = meta.title || "";
  btn.dataset.scriptAuthor = meta.authors || "";
  btn.dataset.repoId = repoId;
  return btn;
};

const generateScriptId = (meta) => {
  if (scriptIdCache.has(meta)) return scriptIdCache.get(meta);
  const domain = Array.isArray(meta.domain) ? meta.domain[0] : (meta.domain ?? "");
  const patterns = meta.urlPatterns ?? ["/.*/"];
  const id = generateParserKey(domain, patterns, meta.authors);
  scriptIdCache.set(meta, id);
  return id;
};

const isNewer = (remote, local) => {
  if (!remote || !local || remote === local) return false;
  const toNum = (v) =>
    String(v)
      .replace(/[^0-9.]/g, "")
      .split(".")
      .map(Number);
  const r = toNum(remote);
  const l = toNum(local);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
};

function relativeTime(dateValue) {
  if (dateValue == null || dateValue === "") return "—";

  let past = typeof dateValue === "number" ? dateValue : NaN;

  if (isNaN(past)) {
    const asNum = Number(dateValue);
    if (!isNaN(asNum) && asNum > 0) {
      past = asNum;
    } else {
      const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
      past = isNaN(d.getTime()) ? NaN : d.getTime();
    }
  }

  if (!past || isNaN(past)) return "—";

  const s = Math.floor((Date.now() - past) / 1000);
  if (s < 0 || s < 45) return i18n.t("time.just_now");
  if (s < 90) return i18n.t("time.minute_ago", [1]);
  if (s < 3600) return i18n.t("time.minutes_ago", [Math.floor(s / 60)]);

  const mins = Math.floor(s / 60);
  if (mins < 90) return i18n.t("time.hour_ago", [1]);
  if (mins < 1440) return i18n.t("time.hours_ago", [Math.floor(mins / 60)]);

  const days = Math.floor(mins / 1440);
  if (days === 1) return i18n.t("time.yesterday");
  if (days < 7) return i18n.t("time.days_ago", [days]);

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return i18n.t("time.week_ago", [1]);
  if (weeks < 5) return i18n.t("time.weeks_ago", [weeks]);

  const months = Math.floor(days / 30.4);
  if (months < 12) return i18n.t("time.months_ago", [months]);

  return i18n.t("time.years_ago", [Math.floor(months / 12)]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

const migrateToUserScriptSystem = async () => {
  const { userScript_migrationDone_v1 } = await browser.storage.local.get("userScript_migrationDone_v1");
  if (userScript_migrationDone_v1) return;

  const storage = await browser.storage.local.get(null);
  const repoUserMap = new Map();
  const githubStoreRepos = storage.githubStoreRepos ?? {};
  const targetRepo = githubStoreRepos[MAIN_REPO_ID];

  if (targetRepo && targetRepo.scripts) {
    for (const script of targetRepo.scripts) {
      const domain = Array.isArray(script.domain) ? script.domain[0] : (script.domain ?? "");
      const primaryDomain = domain.replace(/^\*\./, "");

      if (primaryDomain && targetRepo.user) repoUserMap.set(primaryDomain, targetRepo.user);
    }
  }

  const resolvePrefix = (oldKey) => repoUserMap.get(oldKey);

  // parserSettings migration
  const parserSettings = storage.parserSettings ?? {};
  const newParserSettings = {};
  const matchedDomains = new Set();

  for (const [key, value] of Object.entries(parserSettings)) {
    if (!key.startsWith("settings_")) {
      newParserSettings[key] = value;
      continue;
    }

    const withoutPrefix = key.replace(/^settings_/, "");
    if (targetRepo?.user && withoutPrefix.startsWith(`${targetRepo.user}_`)) {
      newParserSettings[key] = value;
      continue;
    }

    const oldKey = withoutPrefix;
    const user = resolvePrefix(oldKey);

    if (user) {
      const newKey = `settings_${user}_${oldKey}`;
      newParserSettings[newKey] = value;

      if (oldKey.includes(".")) {
        matchedDomains.add(oldKey);
      }
    } else {
      newParserSettings[key] = value;
    }
  }

  // parserFilters migration
  const parserFilters = storage.parserFilters ?? [];
  const newParserFilters = parserFilters.map((filter) => ({
    ...filter,
    parsers:
      filter.parsers?.map((parser) => {
        if (parser.startsWith("kanashiiDev_")) return parser;
        if (targetRepo?.user && parser.startsWith(`${targetRepo.user}_`)) return parser;

        const user = resolvePrefix(parser);
        if (!user) return parser;
        return `${user}_${parser}`;
      }) ?? [],
  }));

  // Update Local Storage
  await browser.storage.local.set({
    parserSettings: newParserSettings,
    parserFilters: newParserFilters,
    userScript_migrationDone_v1: true,
  });

  if (matchedDomains.size > 0) {
    await autoInstallMatchedScripts(matchedDomains);
  }
};

const autoInstallMatchedScripts = async (matchedDomains) => {
  try {
    const { ok, list: repos } = await listRepos();
    if (!ok || !repos?.length) return;

    const mainRepo = repos.find((r) => r.id === "KanashiiDev__discord-music-rpc-activities__main");
    if (!mainRepo?.scripts?.length) return;

    const installed = await getInstalledScripts();
    const installedIds = new Set(installed.map((s) => s.id ?? s.storeScriptId));

    for (const meta of mainRepo.scripts) {
      const scriptDomain = Array.isArray(meta.domain) ? meta.domain[0] : (meta.domain ?? "");
      const primaryDomain = scriptDomain.replace(/^\*\./, "");

      if (!primaryDomain || !matchedDomains.has(primaryDomain)) continue;

      const scriptId = meta.id ?? generateParserKey(meta.domain, meta.urlPatterns ?? ["/.*/"], meta.authors);
      if (installedIds.has(scriptId)) continue;

      const result = await installScript(mainRepo.id, meta);
      if (result.ok) await handleSaveUserScript(result.scriptObj);
    }
  } catch (err) {
    logError("[Migration] autoInstallMatchedScripts error:", err);
  }
};

window.addEventListener("beforeunload", () => {
  for (const [key, val] of eventCleanup) {
    const elem = val.el ?? (typeof key !== "symbol" ? key : null);
    const type = val.type;
    const handler = val.handler;
    if (elem && typeof elem.removeEventListener === "function") {
      elem.removeEventListener(type, handler);
    }
  }
  eventCleanup.clear();
  domCache.clear();
});
