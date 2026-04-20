function applySectionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sectionParam = params.get("section");

  const sections = document.querySelectorAll("[data-section]");
  const activeSection = document.querySelector(`[data-section="${sectionParam}"]`);

  sections.forEach((el) => {
    el.style.display = el === activeSection ? "" : "none";
  });

  if (activeSection) {
    const currentSection = activeSection?.getAttribute("data-section");
    const currentSectionHeader = `settings.${currentSection}.title`;
    const currentSectionDesc = `settings.${currentSection}.desc`;

    document.querySelector(".header h3").textContent = i18n.t(currentSectionHeader);
    document.title = i18n.t(currentSectionHeader);
    document.querySelector(".header-desc").textContent = i18n.t(currentSectionDesc);
  }
}

function startSettings() {
  applyTranslations();
  initMotionPreference();
  initApplyAttrs();
  initStorageListener();
  applySectionFromUrl();
  initFilter();
  initHistoryModal();
  initBackupButtons();
}

window.addEventListener("load", async () => {
  await i18n.load("extension");

  startSettings();
});
