import { createSVG } from "../../../utils.js";

export const CAPTURE_PRESETS = [
  { id: "summary-small", label: "Small", i18n: "chart.capture.small", width: 1080, widthVertical: 560, maxLengthWide: 56, maxLengthTall: 57 },
  { id: "summary-medium", label: "Medium", i18n: "chart.capture.medium", width: 1200, widthVertical: 620, maxLengthWide: 68, maxLengthTall: 68 },
  { id: "summary-large", label: "Large", i18n: "chart.capture.large", width: 1320, widthVertical: 680, maxLengthWide: 78, maxLengthTall: 79 },
  { id: "summary-wide", label: "Wide", i18n: "chart.capture.wide", width: 1400, widthVertical: 740, maxLengthWide: 84, maxLengthTall: 90 },
];

let _visible = false;
let _onCapture = null;

export function initCaptureMenu({ onCapture } = {}) {
  _onCapture = onCapture ?? null;
}

export function isCaptureMenuVisible() {
  return _visible;
}

export function toggleCaptureMenu(anchorEl) {
  _visible ? closeCaptureMenu() : openCaptureMenu(anchorEl);
}

export function openCaptureMenu(anchorEl) {
  _visible = true;
  _buildMenu(anchorEl);
}

export function closeCaptureMenu() {
  _visible = false;
  document.getElementById("captureMenu")?.remove();
  document.removeEventListener("pointerdown", _onOutsidePointer, true);
  _applyLayoutPreview();
}

// Private
function _applyLayoutPreview(layout) {
  const twoCol = document.querySelector(".summary-two-column-layout");
  if (twoCol) {
    twoCol.style.display = layout === "tall" ? "block" : "";
    twoCol.classList.toggle("capture-grid", layout === "wide");
  }
}

function _onOutsidePointer(e) {
  const menu = document.getElementById("captureMenu");
  if (!menu || menu.contains(e.target) || e.target.closest(".summary-capture")) return;
  closeCaptureMenu();
}

function _getActiveWidth(preset, layout) {
  return layout === "tall" ? (preset.widthVertical ?? preset.width) : preset.width;
}

function _buildMenu(anchorEl) {
  document.getElementById("captureMenu")?.remove();

  const menu = document.createElement("div");
  menu.id = "captureMenu";
  menu.className = "capture-menu";

  // Layout section
  let selectedLayout = "wide";
  const LAYOUT_OPTIONS = [
    {
      id: "wide",
      label: i18n.t("chart.capture.wide"),
      svgPaths: ["M1 3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3Z", "M15 3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V3Z"],
      svgOptions: { width: 28, height: 22, viewBox: "0 0 26 22", strokeWidth: 1.5 },
    },
    {
      id: "tall",
      label: i18n.t("chart.capture.tall"),
      svgPaths: ["M1 3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3Z", "M1 17a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-6Z"],
      svgOptions: { width: 22, height: 28, viewBox: "0 0 22 28", strokeWidth: 1.5 },
    },
  ];

  const layoutSection = _makeSection(i18n.t("chart.capture.title"));
  const layoutRow = document.createElement("div");
  layoutRow.className = "capture-menu-layout-row";

  for (const option of LAYOUT_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "capture-layout-btn" + (option.id === selectedLayout ? " active" : "");
    btn.dataset.layout = option.id;

    const label = document.createElement("span");
    label.textContent = option.label;

    btn.appendChild(createSVG(option.svgPaths, option.svgOptions));
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      if (selectedLayout === option.id) return;
      selectedLayout = option.id;
      layoutRow.querySelector(".capture-layout-btn.active")?.classList.remove("active");
      btn.classList.add("active");
      _applyLayoutPreview(option.id);

      for (const preset of CAPTURE_PRESETS) {
        const dimsEl = presetList.querySelector(`[data-preset="${preset.id}"] .capture-preset-dims`);
        if (dimsEl) dimsEl.textContent = `${_getActiveWidth(preset, selectedLayout)} × ${i18n.t("chart.capture.auto")}`;
      }
    });

    layoutRow.appendChild(btn);
  }

  layoutSection.appendChild(layoutRow);

  // Resolution section
  let selectedPreset = CAPTURE_PRESETS[0].id;

  const resSection = _makeSection(i18n.t("chart.capture.resolution"));
  const presetList = document.createElement("div");
  presetList.className = "capture-preset-list";

  for (const preset of CAPTURE_PRESETS) {
    const item = document.createElement("button");
    item.className = "capture-preset-item" + (preset.id === selectedPreset ? " active" : "");
    item.dataset.preset = preset.id;

    const name = document.createElement("span");
    name.className = "capture-preset-name";
    name.textContent = preset.label;
    name.dataset.i18n = preset.i18n;

    const dims = document.createElement("span");
    dims.className = "capture-preset-dims";
    dims.textContent = `${preset.width} × ${i18n.t("chart.capture.auto")}`;

    item.append(name, dims);

    item.addEventListener("click", () => {
      if (selectedPreset === preset.id) return;
      selectedPreset = preset.id;
      presetList.querySelector(".capture-preset-item.active")?.classList.remove("active");
      item.classList.add("active");
    });

    presetList.appendChild(item);
  }

  resSection.appendChild(presetList);

  // Footer & Save button
  const footer = document.createElement("div");
  footer.className = "capture-menu-footer";

  const saveBtn = document.createElement("button");
  saveBtn.className = "capture-menu-action-btn";
  saveBtn.textContent = i18n.t("common.save");
  saveBtn.addEventListener("click", () => {
    const preset = CAPTURE_PRESETS.find((p) => p.id === selectedPreset) ?? CAPTURE_PRESETS[0];
    closeCaptureMenu();
    _onCapture?.({ layout: selectedLayout, preset });
  });

  footer.appendChild(saveBtn);
  menu.append(layoutSection, resSection, footer);
  anchorEl.appendChild(menu);

  requestAnimationFrame(() => {
    document.addEventListener("pointerdown", _onOutsidePointer, true);
    _applyLayoutPreview("wide");
    applyTranslations();
  });
}

function _makeSection(title) {
  const section = document.createElement("div");
  section.className = "capture-menu-section";

  const heading = document.createElement("div");
  heading.className = "capture-menu-section-title";
  heading.textContent = title;
  section.appendChild(heading);

  return section;
}

export async function captureSummaryPanel({ layout = "wide", preset = CAPTURE_PRESETS[0] } = {}) {
  const panel = document.getElementById("chartSummaryPanel");
  if (!panel) return;

  try {
    const activeWidth = _getActiveWidth(preset, layout);

    const canvas = await html2canvas(panel, {
      backgroundColor: "null",
      width: activeWidth,
      scale: 1,
      useCORS: true,
      logging: false,
      proxy: `${location.href}/proxy`,

      ignoreElements: (e) => e.classList.contains("summary-capture") || e.id === "captureMenu",

      onclone: (doc) => {
        const original = doc.getElementById("chartSummaryPanel");
        if (!original) return;

        doc.querySelector(".summary-two-column-layout")?.style.setProperty("display", layout === "tall" ? "block" : "");
        doc.querySelector(".summary-two-column-layout")?.classList.toggle("capture-grid", layout === "wide");

        const maxLength = layout === "tall" ? preset.maxLengthTall : preset.maxLengthWide;
        for (const el of doc.querySelectorAll(".summary-title")) {
          const text = el.textContent?.trim() ?? "";
          if (text.length > maxLength) {
            el.textContent = text.slice(0, maxLength) + "…";
          }
        }

        const wrapper = doc.createElement("div");
        wrapper.style.width = activeWidth + "px";
        original.parentNode.insertBefore(wrapper, original);
        wrapper.appendChild(original);
      },
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve));
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `music-rpc-${preset.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Capture failed:", err);
  }
}
