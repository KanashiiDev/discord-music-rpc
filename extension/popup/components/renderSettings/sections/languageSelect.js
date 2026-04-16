const initLanguageSelect = async (container) => {
  if (!container) return;

  try {
    const url = browser.runtime.getURL("locales/languages.json");
    const response = await fetch(url);
    const data = await response.json();

    const extensionLanguages = Object.fromEntries(Object.entries(data).filter(([key, lang]) => key && lang.extension === true));

    const { lang } = (await browser.storage.local.get("lang")) || Object.keys(extensionLanguages)[0];

    const wrapper = document.createElement("div");
    wrapper.className = "settings-option";

    const label = document.createElement("label");
    label.className = "setting-label";
    label.textContent = "Language";
    label.dataset.i18n = "settings.language";

    const select = document.createElement("select");
    select.id = "languageSelect";

    Object.entries(extensionLanguages).forEach(([key, value]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = value.label;
      select.appendChild(option);
    });

    if (lang && data[lang]) {
      select.value = lang;
    }

    wrapper.append(label, select);

    container.appendChild(wrapper);

    new TomSelect(select, {
      controlInput: null,
      sortField: false,
      onChange: async () => {
        await browser.storage.local.set({ lang: select.value });
        window.location.reload();
      },
      onDropdownOpen: (dropdown) => {
        const list = dropdown.querySelector(".ts-dropdown-content");
        if (!list) return;

        const tryInit = async (attempts = 0) => {
          if (list.offsetHeight === 0 && attempts < 15) {
            requestAnimationFrame(() => tryInit(attempts + 1));
            return;
          }
          await destroySimplebar(list);
          await activateSimpleBar(list);
        };

        requestAnimationFrame(() => tryInit());
      },
    });
  } catch (err) {
    console.log("Error loading languages.json:", err);
  }
};
