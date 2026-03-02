async function buildThemeMotion(container) {
  // Theme
  const { theme: savedTheme } = await browser.storage.local.get("theme");
  let themeConfig = savedTheme ?? "dark";

  const themeOptions = [
    { value: "dark", text: "Dark" },
    { value: "light", text: "Light" },
  ];

  const themeWrap = createSelectRow(
    "Theme",
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
    { value: "system", text: "System" },
    { value: "always", text: "Enable" },
    { value: "never", text: "Disable" },
  ];

  const motionWrap = createSelectRow("Animations", "motion-wrapper", motionOptions, motionConfig, async (e) => {
    await setMotionPreference(e.target.value);
  });

  container.appendChild(motionWrap);
}
