function createEmptyState(container, isSearch) {
  const el = Object.assign(document.createElement("div"), {
    className: "setup-list-message",
  });

  if (isSearch) {
    el.textContent = "Not Found";
  } else {
    el.append(
      Object.assign(document.createElement("p"), {
        textContent: "Please open a supported website (YouTube, Soundcloud, Deezer etc.) to build the site list.",
      }),
      Object.assign(document.createElement("a"), {
        className: "setup-link",
        href: "https://github.com/KanashiiDev/discord-music-rpc?tab=readme-ov-file#-supported-websites",
        textContent: "Supported Websites",
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    );
  }

  container.appendChild(el);
  updateMinHeight();
}

function createFavIconElement(domain, title, homepage, addListener) {
  const container = Object.assign(document.createElement("div"), {
    className: "parser-icon-container spinner",
  });
  const img = Object.assign(document.createElement("img"), {
    className: "parser-icon hidden-visibility",
    title: `Open ${title ?? domain}`,
    loading: "lazy",
    decoding: "async",
  });
  img.dataset.src = domain;
  addListener(img, "click", () => window.open(homepage || `https://${domain}`, "_blank", "noopener,noreferrer"));
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
      textContent: authors.length > 1 ? "Authors" : "Author",
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

function createDescriptionSection(description) {
  if (!description?.trim()) return null;

  const div = Object.assign(document.createElement("div"), {
    className: "parser-entry-description",
  });
  div.append(Object.assign(document.createElement("h4"), { textContent: "Description" }), Object.assign(document.createElement("p"), { textContent: description }));
  return div;
}

function createDeleteButton(id, title, domain, addListener, onDeleted) {
  const btn = Object.assign(document.createElement("a"), {
    className: "del-user-parser",
    title: "Delete",
  });
  btn.appendChild(createSVG(svg_paths.trashIconPaths));
  Object.assign(btn.dataset, { parserId: id, parserTitle: title, parserDomain: domain });

  addListener(btn, "click", async (e) => {
    e.stopPropagation();
    const { parserId, parserTitle } = e.currentTarget.dataset;
    if (!confirm(`Do you want to delete "${parserTitle}" parser?`)) return;

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
    title: "Edit user script",
  });
  btn.appendChild(createSVG(svg_paths.gearIconPaths));
  btn.dataset.parserId = id;

  addListener(btn, "click", (e) => {
    e.stopPropagation();
    openUserScriptManager(e.currentTarget.dataset.parserId);
  });

  return btn;
}
