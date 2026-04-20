function createEmptyState(container, isSearch) {
  const el = Object.assign(document.createElement("div"), {
    className: "setup-list-message",
  });

  if (isSearch) {
    el.textContent = i18n.t("parserFilters.notFound");
  } else {
    el.append(
      Object.assign(document.createElement("p"), {
        textContent: i18n.t("setup.list.message"),
      }),
      Object.assign(document.createElement("a"), {
        className: "setup-link",
        href: "https://github.com/KanashiiDev/discord-music-rpc?tab=readme-ov-file#-supported-websites",
        textContent: i18n.t("setup.list.title"),
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    );
  }

  container.appendChild(el);
}

function createFavIconElement(domain, title, homepage, addListener) {
  const primaryDomain = Array.isArray(domain) ? domain[0] : domain;
  const container = Object.assign(document.createElement("div"), {
    className: "parser-icon-container spinner",
  });
  const img = Object.assign(document.createElement("img"), {
    className: "parser-icon hidden-visibility",
    title: `Open ${title ?? primaryDomain}`,
    loading: "lazy",
    decoding: "async",
  });
  img.dataset.src = primaryDomain;
  addListener(img, "click", () => window.open(homepage || `https://${primaryDomain}`, "_blank", "noopener,noreferrer"));
  container.appendChild(img);
  return container;
}

function createToggleSwitch(id, isEnabled, userAdd, userScript, addListener) {
  const label = Object.assign(document.createElement("label"), { className: "switch-label" });
  const checkbox = Object.assign(document.createElement("input"), {
    type: "checkbox",
    checked: isEnabled,
  });
  checkbox.dataset.parserId = id;
  checkbox.dataset.isUserScript = userScript ? "true" : "false";

  if (!userAdd && !userScript) label.style.marginLeft = "auto";

  addListener(checkbox, "change", async ({ target }) => {
    const { parserId, isUserScript } = target.dataset;
    const enabled = target.checked;
    const { parserEnabledState: state = {} } = await browser.storage.local.get("parserEnabledState");

    if (enabled) delete state[`enable_${parserId}`];
    else state[`enable_${parserId}`] = false;

    await browser.storage.local.set({ parserEnabledState: state });
    if (isUserScript === "true") await sendAction("toggleUserScript", { id: parserId, enabled });
  });

  label.append(checkbox, Object.assign(document.createElement("span"), { className: "slider" }));
  return label;
}

function createAuthorsSection(authors, authorsLinks) {
  if (!authors?.length || authors[0].trim() === "") return null;

  const div = Object.assign(document.createElement("div"), { className: "parser-entry-authors" });
  div.appendChild(
    Object.assign(document.createElement("h4"), {
      textContent: authors.length > 1 ? i18n.t("parserOptions.author") : i18n.t("parserOptions.authors"),
    }),
  );

  for (const [i, author] of authors.entries()) {
    const link = authorsLinks?.[i];
    const authorContainer = Object.assign(document.createElement("div"), {
      className: `author-container${link ? "" : " no-link"}`,
    });
    authorContainer.appendChild(
      Object.assign(document.createElement("a"), {
        href: link ?? "",
        textContent: author,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    );
    div.appendChild(authorContainer);
  }

  return div;
}

async function createDescriptionSection(description) {
  if (!description) return null;

  const resolvedText = await resolveLabel(description);

  if (!resolvedText) return null;

  const div = Object.assign(document.createElement("div"), {
    className: "parser-entry-description",
  });
  div.append(
    Object.assign(document.createElement("h4"), { textContent: i18n.t("parserOptions.desc") }),
    Object.assign(document.createElement("p"), { textContent: resolvedText }),
  );
  return div;
}

function createCategoryTagsSection(category, tags) {
  const hasCategory = typeof category === "string" && category.trim();
  const hasTags = Array.isArray(tags) && tags.some((tag) => typeof tag === "string" && tag.trim());

  if (!hasCategory && !hasTags) return null;

  const section = document.createElement("div");
  section.className = "parser-tags";

  const fragment = document.createDocumentFragment();

  if (hasCategory) {
    const pill = document.createElement("span");
    pill.className = "parser-tag category";
    pill.textContent = category.trim();
    fragment.appendChild(pill);
  }

  if (hasTags) {
    for (const tag of tags) {
      const text = tag?.trim();
      if (!text) continue;

      const pill = document.createElement("span");
      pill.className = "parser-tag";
      pill.textContent = text;
      fragment.appendChild(pill);
    }
  }

  section.appendChild(fragment);
  return section;
}

function createDeleteButton(id, title, domain, addListener, onDeleted) {
  const btn = Object.assign(document.createElement("a"), {
    className: "del-user-parser",
    title: i18n.t("common.delete"),
  });
  btn.appendChild(createSVG(svg_paths.trashIconPaths));
  Object.assign(btn.dataset, { parserId: id, parserTitle: title, parserDomain: domain });

  addListener(btn, "click", async (e) => {
    e.stopPropagation();
    const { parserId, parserTitle } = e.currentTarget.dataset;

    if (
      !(await showConfirm("", {
        heading: i18n.t("parserList.delete.confirm", { site: parserTitle }),
        body: "",
      }))
    )
      return;

    const [storage, { parserEnabledState: state = {} }] = await Promise.all([
      browser.storage.local.get(["userParserSelectors", "parserList"]),
      browser.storage.local.get("parserEnabledState"),
    ]);

    const updatedUserList = (storage.userParserSelectors ?? []).filter((p) => p.id !== parserId);
    const updatedParserList = (storage.parserList ?? []).filter((p) => p.id !== parserId);

    delete state[`enable_${parserId}`];
    await browser.storage.local.set({
      parserEnabledState: state,
      userParserSelectors: updatedUserList,
      parserList: updatedParserList,
    });

    if (Array.isArray(window.parsers?.[domain])) {
      window.parsers[domain] = window.parsers[domain].filter((p) => p.id !== parserId);
    }

    await onDeleted(updatedParserList);
  });

  return btn;
}

function createEditScriptButton(id, addListener) {
  const btn = Object.assign(document.createElement("a"), {
    className: "edit-user-script",
    title: i18n.t("common.edit"),
  });
  btn.appendChild(createSVG(svg_paths.gearIconPaths));
  btn.dataset.parserId = id;

  addListener(btn, "click", (e) => {
    e.stopPropagation();
    openUserScriptManager(e.currentTarget.dataset.parserId);
  });

  return btn;
}

async function resolveLabel(label) {
  if (!label || typeof label === "string") return label;
  const browserLang = navigator.language.split("-")[0];
  const { lang } = await browser.storage.local.get("lang");
  const currentLang = lang || browserLang || "en";
  return label[currentLang] ?? label["en"] ?? Object.values(label)[0] ?? "";
}
