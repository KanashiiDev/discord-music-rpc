import { dom, icons, simpleBars } from "../../core/dom.js";
import { AppState } from "../../core/state.js";
import { createSVG, svg_paths } from "../../utils.js";

export function initTheme() {
  const isGrid = localStorage.getItem("theme-switch") === "true";
  dom.container.classList.toggle("grid", isGrid);
  dom.containerToggle.replaceChildren(isGrid ? icons.single : icons.dual);

  if (isGrid) {
    dom.rightContainer.insertAdjacentElement("afterbegin", dom.musicCard.container);
  } else {
    dom.statusBox.insertAdjacentElement("afterend", dom.musicCard.container);
  }
}

export function handleThemeToggle() {
  if (AppState.toggleTimeout) {
    clearTimeout(AppState.toggleTimeout);
  }

  dom.container.classList.add("switch");

  AppState.toggleTimeout = setTimeout(() => {
    const isNowGrid = dom.container.classList.toggle("grid");
    dom.containerToggle.replaceChildren(isNowGrid ? icons.single : icons.dual);
    localStorage.setItem("theme-switch", isNowGrid);
    if (isNowGrid) {
      dom.rightContainer.insertAdjacentElement("afterbegin", dom.musicCard.container);
    } else {
      dom.statusBox.insertAdjacentElement("afterend", dom.musicCard.container);
    }
    dom.container.classList.remove("switch");
    AppState.toggleTimeout = null;
    Object.values(simpleBars).forEach((sb) => sb?.recalculate());
  }, 300);
}

// Add Expand SVG
document.querySelectorAll("span.arrow").forEach((arrow) => {
  const expandSvg = createSVG(svg_paths.expand);
  arrow.appendChild(expandSvg);
});
