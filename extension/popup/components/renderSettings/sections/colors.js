async function buildColors(container) {
  const COLOR_SETTINGS = getColorSettings();
  const { colorSettings } = await browser.storage.local.get("colorSettings");
  const colorConfig = colorSettings ?? {};

  for (const item of COLOR_SETTINGS) {
    const wrap = document.createElement("div");
    wrap.className = "settings-option color-wrapper";

    const lbl = document.createElement("label");
    lbl.textContent = item.label;

    const control = document.createElement("div");
    control.className = "color-control";

    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    swatch.style.background = colorConfig[item.key] ?? item.default;

    const btnDelete = document.createElement("span");
    btnDelete.appendChild(createSVG(svg_paths.crossIconPaths));
    btnDelete.className = "color-delete-btn button";
    btnDelete.title = "Revert";

    const isDefault = !colorConfig[item.key] || colorConfig[item.key] === item.default;
    btnDelete.classList.toggle("disabled", isDefault);

    // Revert click
    btnDelete.addEventListener("click", async (e) => {
      document.body.style.transition = "none";
      e.stopPropagation();

      const { colorSettings: latest } = await browser.storage.local.get("colorSettings");
      const config = latest ?? {};
      delete config[item.key];
      await browser.storage.local.set({ colorSettings: config });

      const def = getDefaultCSSValue(item);
      swatch.style.background = def;

      await applyColorSettings();
      await applyBackgroundSettings();
      closePicker();

      btnDelete.classList.toggle("disabled", !def || def === item.default);

      setTimeout(() => {
        document.body.style.transition = "";
      }, 50);
    });

    // Swatch click
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      openPickerForSwatch(item, swatch, btnDelete);
    });

    control.appendChild(swatch);
    wrap.appendChild(lbl);
    wrap.appendChild(control);
    wrap.appendChild(btnDelete);
    container.appendChild(wrap);
  }
}
