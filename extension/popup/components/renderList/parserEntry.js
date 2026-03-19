async function buildParserEntry({ entry, parserEnabledState, parserSettings, container, tabHostname, tabPath, addListener }) {
  const { id, domain, title, userAdd, userScript, urlPatterns = [], authors, authorsLinks, homepage, description, tags, category } = entry;

  const isEnabled = parserEnabledState[`enable_${id}`] !== false;

  const wrapper = document.createElement("div");
  wrapper.className = "parser-entry";

  const favIconContainer = createFavIconElement(domain, title, homepage, addListener);

  const entryInner = Object.assign(document.createElement("span"), { className: "parser-span" });
  const siteTitle = Object.assign(document.createElement("a"), {
    className: "parser-title",
    textContent: title ?? domain,
  });

  const switchLabel = createToggleSwitch(id, isEnabled, userAdd, userScript, addListener);

  const optionsContainer = Object.assign(document.createElement("div"), {
    id: `options-${id}`,
    className: "parser-options",
  });
  const optionsInner = Object.assign(document.createElement("div"), { className: "parser-options-inner" });
  optionsContainer.appendChild(optionsInner);

  const authorsSection = createAuthorsSection(authors, authorsLinks);
  if (authorsSection) optionsInner.appendChild(authorsSection);

  const descriptionSection = createDescriptionSection(description);
  if (descriptionSection) optionsInner.appendChild(descriptionSection);

  const categoryTagsSection = createCategoryTagsSection(entry.category ?? [], entry.tags ?? []);
  if (categoryTagsSection) optionsInner.appendChild(categoryTagsSection);

  // Patch defaults
  const settingKey = `settings_${id}`;
  parserSettings[settingKey] ??= {};
  const parserOptions = parserSettings[settingKey];
  let settingsDirty = false;

  for (const [key, def] of Object.entries(DEFAULT_PARSER_OPTIONS)) {
    if (parserOptions[key] === undefined) {
      parserOptions[key] = { ...def };
      settingsDirty = true;
    }
  }

  await renderOptions(optionsInner, parserOptions, settingKey, addListener);
  await new Promise((r) => requestAnimationFrame(r));

  if (optionsInner.querySelectorAll(".parser-option").length < 1) {
    optionsInner.appendChild(
      Object.assign(document.createElement("div"), {
        className: "setup-options-message",
        textContent: "First time setup: close and reopen this popup to load settings.",
      }),
    );
  }

  entryInner.append(favIconContainer, siteTitle);
  addListener(entryInner, "click", createEntryClickHandler(container, wrapper, optionsContainer));

  if (userAdd) {
    const delBtn = createDeleteButton(id, title, domain, addListener, (updatedList) => renderList(updatedList));
    entryInner.appendChild(delBtn);

    if (tabHostname === normalizeHost(domain)) {
      const regexes = urlPatterns.map(parseUrlPattern);
      if (regexes.some((r) => r.test(tabPath))) {
        document.getElementById("openSelector").textContent = "Edit Music Site";
      }
    }
  }

  if (userScript) {
    const gearBtn = createEditScriptButton(id, addListener);
    entryInner.appendChild(gearBtn);
  }

  entryInner.append(switchLabel);
  wrapper.append(entryInner, optionsContainer);

  return { wrapper, settingsDirty };
}
