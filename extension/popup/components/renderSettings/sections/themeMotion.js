async function buildThemeMotion(container) {
  // Theme
  const { theme: savedTheme } = await browser.storage.local.get("theme");
  let themeConfig = savedTheme ?? "dark";

  const themeOptions = [
    { value: "dark", text: i18n.t("settings.theme.dark") },
    { value: "light", text: i18n.t("settings.theme.light") },
  ];

  const themeWrap = createSelectRow(
    i18n.t("settings.theme"),
    "theme-wrapper",
    themeOptions,
    themeConfig,
    debounce(async (e) => {
      themeConfig = e.target.value;

      await browser.storage.local.set({ theme: themeConfig });

      document.documentElement.setAttribute("data-theme", themeConfig);
      document.body.setAttribute("data-theme", themeConfig);
      document.body.style = "";

      await browser.storage.local.remove("colorSettings");
      await applyColorSettings();
      await applyBackgroundSettings();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await updateAllSwatchesForTheme();
    }, 300),
  );

  container.appendChild(themeWrap);

  // Motion
  const motionStorage = await browser.storage.local.get(motionKey);
  const motionConfig = motionStorage[motionKey] ?? "always";

  const motionOptions = [
    { value: "system", text: i18n.t("common.system") },
    { value: "always", text: i18n.t("common.enable") },
    { value: "never", text: i18n.t("common.disable") },
  ];

  const motionWrap = createSelectRow(i18n.t("settings.animations"), "motion-wrapper", motionOptions, motionConfig, async (e) => {
    await setMotionPreference(e.target.value);
  });

  container.appendChild(motionWrap);
}
