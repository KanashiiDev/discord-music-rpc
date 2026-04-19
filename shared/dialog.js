// Core
function _dialog_overlay() {
  const ov = document.createElement("div");
  ov.className = "dlg-overlay";
  return ov;
}

function _dialog_open(ov, box, focusEl) {
  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.classList.add("active");
  focusEl?.focus();
}

function _dialog_close(ov) {
  ov.classList.remove("active");
  ov.parentNode?.removeChild(ov);
}

function _dialog_bindKeys(ov, handlers) {
  function onKey(e) {
    if (!ov.classList.contains("active")) return;
    if (handlers[e.key]) {
      document.removeEventListener("keydown", onKey);
      handlers[e.key]();
    }
  }
  document.addEventListener("keydown", onKey);
}

// showConfirm
async function showConfirm(title, options = {}) {
  const {
    heading = i18n.t("dialog.confirmDelete"),
    body = i18n.t("dialog.warnDelete"),
    labelOk = i18n.t("common.remove"),
    labelCancel = i18n.t("common.cancel"),
  } = options;

  return new Promise((resolve) => {
    const ov = _dialog_overlay();

    const box = document.createElement("div");
    box.className = "dlg-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "dlg-c-title");

    const icon = document.createElement("div");
    icon.className = "dlg-icon danger";
    icon.textContent = "✕";

    const titleEl = document.createElement("p");
    titleEl.className = "dlg-title";
    titleEl.id = "dlg-c-title";
    titleEl.textContent = heading;

    const bodyEl = document.createElement("p");
    bodyEl.className = "dlg-body";
    bodyEl.textContent = body;

    const tag = document.createElement("span");
    tag.className = "dlg-tag";
    tag.textContent = title;

    bodyEl.appendChild(document.createElement("br"));
    bodyEl.appendChild(tag);

    const actions = document.createElement("div");
    actions.className = "dlg-actions";

    const btnCancel = document.createElement("button");
    btnCancel.className = "dlg-btn";
    btnCancel.textContent = labelCancel;

    const btnOk = document.createElement("button");
    btnOk.className = "dlg-btn danger";
    btnOk.textContent = labelOk;

    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    box.appendChild(icon);
    box.appendChild(titleEl);
    box.appendChild(bodyEl);
    box.appendChild(actions);

    const done = (val) => {
      _dialog_close(ov);
      resolve(val);
    };

    btnOk.addEventListener("click", () => done(true));
    btnCancel.addEventListener("click", () => done(false));
    ov.addEventListener("click", (e) => {
      if (e.target === ov) done(false);
    });
    _dialog_bindKeys(ov, { Enter: () => done(true), Escape: () => done(false) });

    _dialog_open(ov, box, btnOk);
  });
}

// showPrompt
async function showPrompt(label, defaultValue = "", options = {}) {
  const {
    placeholder = "",
    labelOk = i18n.t("common.save"),
    labelCancel = i18n.t("common.cancel"),
    validator = null,
    extraButtons = [], // [{ label, cls, value }]
  } = options;

  return new Promise((resolve) => {
    const ov = _dialog_overlay();

    const box = document.createElement("div");
    box.className = "dlg-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "dlg-p-title");

    const icon = document.createElement("div");
    icon.className = "dlg-icon info";
    icon.textContent = "✎";

    const titleEl = document.createElement("p");
    titleEl.className = "dlg-title";
    titleEl.id = "dlg-p-title";
    titleEl.textContent = label;

    const input = document.createElement("input");
    input.className = "dlg-input";
    input.type = "text";
    input.value = defaultValue;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;

    const errorEl = document.createElement("span");
    errorEl.className = "dlg-error";
    errorEl.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "dlg-actions";

    const extraWrap = document.createElement("div");
    extraWrap.className = "dlg-actions-extra";

    for (const def of extraButtons) {
      const btn = document.createElement("button");
      btn.className = "dlg-btn " + (def.cls ?? "");
      btn.textContent = def.label;
      btn.addEventListener("click", () => done(def.value));
      extraWrap.appendChild(btn);
    }

    const btnCancel = document.createElement("button");
    btnCancel.className = "dlg-btn";
    btnCancel.textContent = labelCancel;

    const btnOk = document.createElement("button");
    btnOk.className = "dlg-btn primary";
    btnOk.textContent = labelOk;

    actions.appendChild(extraWrap);
    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    box.appendChild(icon);
    box.appendChild(titleEl);
    box.appendChild(input);
    box.appendChild(errorEl);
    box.appendChild(actions);

    const done = (val) => {
      _dialog_close(ov);
      resolve(val);
    };

    const trySubmit = () => {
      const v = input.value.trim();
      if (!v) {
        input.focus();
        return;
      }

      if (validator) {
        const error = validator(v);
        if (error) {
          errorEl.textContent = error;
          input.focus();
          return;
        }
        errorEl.textContent = "";
      }

      done(v);
    };

    input.addEventListener("input", () => {
      if (errorEl.textContent) errorEl.textContent = "";
    });

    btnOk.addEventListener("click", trySubmit);
    btnCancel.addEventListener("click", () => done(null));
    ov.addEventListener("click", (e) => {
      if (e.target === ov) done(null);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") trySubmit();
      if (e.key === "Escape") done(null);
    });

    _dialog_open(ov, box, input);
    input.select();
  });
}

// showAlert
async function showAlert(title, body, type = "info", options = {}) {
  const { labelOk = i18n.t("common.ok") } = options;

  return new Promise((resolve) => {
    const ov = _dialog_overlay();

    const box = document.createElement("div");
    box.className = "dlg-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "dlg-a-title");

    const icon = document.createElement("div");
    icon.className = "dlg-icon " + type;
    icon.textContent = type === "warn" ? "!" : "i";

    const titleEl = document.createElement("p");
    titleEl.className = "dlg-title";
    titleEl.id = "dlg-a-title";
    titleEl.textContent = title;

    const bodyEl = document.createElement("p");
    bodyEl.className = "dlg-body";
    bodyEl.textContent = body;

    const actions = document.createElement("div");
    actions.className = "dlg-actions";

    const btnOk = document.createElement("button");
    btnOk.className = "dlg-btn primary";
    btnOk.textContent = labelOk;

    actions.appendChild(btnOk);

    box.appendChild(icon);
    box.appendChild(titleEl);
    box.appendChild(bodyEl);
    box.appendChild(actions);

    const done = () => {
      _dialog_close(ov);
      resolve();
    };

    btnOk.addEventListener("click", done);
    ov.addEventListener("click", (e) => {
      if (e.target === ov) done();
    });
    _dialog_bindKeys(ov, { Enter: done, Escape: done });

    _dialog_open(ov, box, btnOk);
  });
}
