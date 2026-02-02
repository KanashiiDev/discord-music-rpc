async function initApplyAttrs() {
  const { styleAttrs } = await browser.storage.local.get("styleAttrs");
  if (styleAttrs) {
    document.body.setAttribute("style", styleAttrs);
  }

  const { theme } = await browser.storage.local.get("theme");
  if (theme) {
    document.body.dataset.theme = theme;
  }
}

function initStorageListener() {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.styleAttrs) {
      const styleString = changes.styleAttrs.newValue || "";
      document.body.setAttribute("style", styleString);
    }
    if (changes.theme) {
      document.body.dataset.theme = changes.theme.newValue || "dark";
    }
  });
}

// LOG helper
function log(msg) {
  const logEl = document.getElementById("log");
  logEl.classList.add("visible");
  logEl.textContent += msg + "\n";
}

function applySectionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sectionParam = params.get("section");

  const sections = document.querySelectorAll("[data-section]");
  const activeSection = document.querySelector(`[data-section="${sectionParam}"]`);

  sections.forEach((el) => {
    el.style.display = el === activeSection ? "" : "none";
  });

  if (activeSection) {
    document.querySelector(".header h3").textContent = `Discord Music RPC - ${activeSection.dataset.sectionHeader}`;
    document.title = `Discord Music RPC - ${activeSection.dataset.sectionHeader}`;
    document.querySelector(".header-desc").textContent = activeSection.dataset.sectionDesc;
  }
}

window.addEventListener("load", async () => {
  initApplyAttrs();
  initStorageListener();
  applySectionFromUrl();
  initFilter();
  initHistoryModal();
});
