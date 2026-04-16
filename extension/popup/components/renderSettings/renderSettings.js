async function renderSettings() {
  const panel = document.getElementById("settingsPanel");
  if (!panel) return;

  panel.replaceChildren();

  const container = document.createElement("div");
  container.id = "settingsContainer";

  await initLanguageSelect(container);
  await buildThemeMotion(container);
  await buildBackground(container);
  await buildColors(container);
  await buildPortButtons(container);

  panel.appendChild(container);

  applyBackgroundSettings();
}
