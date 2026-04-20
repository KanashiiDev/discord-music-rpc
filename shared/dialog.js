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
    if (e.key in handlers) {
      document.removeEventListener("keydown", onKey);
      handlers[e.key]();
    }
  }
  document.addEventListener("keydown", onKey);
}

function _dialog_btn(text, cls) {
  const btn = document.createElement("button");
  btn.className = "dlg-btn " + cls;
  btn.textContent = text;
  return btn;
}

/**
 * @param {object}   cfg
 * @param {string}   cfg.titleId
 * @param {string}   cfg.type          - icon type: "danger" | "warn" | "info" | "edit"
 * @param {string}   cfg.heading
 * @param {string|Node} [cfg.body]
 * @param {Array}    cfg.buttons       - [{ label, cls, value?, handler? }]
 * @param {Array}    [cfg.extraButtons] - [{ label, cls, value }]
 * @param {object}   [cfg.keys]        - { Enter: value, Escape: value }
 * @param {function} [cfg.mount]       - callback(box, done)
 * @returns {Promise<any>}
 */
function _dialog_create({ titleId, type, heading, body, buttons, extraButtons = [], keys = {}, mount } = {}) {
  return new Promise((resolve) => {
    const ov = _dialog_overlay();

    const box = document.createElement("div");
    box.className = "dlg-box";
    box.setAttribute("role", "dialog");

    // Title
    const icon = document.createElement("div");
    icon.className = "dlg-icon " + type;
    icon.textContent = { danger: "✕", warn: "!", info: "✓" }[type] ?? "✎";

    const titleEl = document.createElement("p");
    titleEl.className = "dlg-title";
    titleEl.id = titleId;
    titleEl.textContent = heading;

    const header = document.createElement("div");
    header.className = "dlg-header";
    header.append(icon, titleEl);
    box.appendChild(header);

    // Body
    if (body != null) {
      const p = document.createElement("p");
      p.className = "dlg-body";
      typeof body === "string" ? (p.textContent = body) : p.appendChild(body);
      box.appendChild(p);
    }

    const done = (val) => {
      _dialog_close(ov);
      resolve(val);
    };

    // Actions
    const actions = document.createElement("div");
    actions.className = "dlg-actions";

    if (extraButtons.length) {
      const extraWrap = document.createElement("div");
      extraWrap.className = "dlg-actions-extra";
      for (const def of extraButtons) {
        const btn = _dialog_btn(def.label, def.cls ?? "");
        btn.addEventListener("click", () => done(def.value));
        extraWrap.appendChild(btn);
      }
      actions.appendChild(extraWrap);
    }

    for (const def of buttons) {
      const btn = _dialog_btn(def.label, def.cls ?? "");
      btn.addEventListener("click", def.handler ?? (() => done(def.value)));
      actions.appendChild(btn);
    }

    box.appendChild(actions);

    // Mount
    mount?.(box, done);

    // Overlay click
    ov.addEventListener("click", (e) => {
      if (e.target === ov) done(keys.Escape ?? null);
    });

    // Keyboard
    if (Object.keys(keys).length) {
      _dialog_bindKeys(ov, Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, () => done(v)])));
    }

    _dialog_open(ov, box, actions.firstChild);
  });
}

// Public API

// Alert
async function showAlert(title, body, type = "info", { labelOk = i18n.t("common.ok") } = {}) {
  return _dialog_create({
    titleId: "dlg-a-title",
    type,
    heading: title,
    body,
    buttons: [{ label: labelOk, cls: "primary", value: null }],
    keys: { Enter: null, Escape: null },
  });
}

// Confirm
async function showConfirm(title, { type = "danger", heading, body, labelOk, labelCancel = i18n.t("common.cancel") } = {}) {
  heading ??= type === "danger" ? i18n.t("dialog.confirmDelete") : "";
  body ??= type === "danger" ? i18n.t("dialog.warnDelete") : "";
  labelOk ??= type === "danger" ? i18n.t("common.delete") : i18n.t("common.confirm");

  const bodyNode = (() => {
    if (!title) return body;
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(body));
    frag.appendChild(document.createElement("br"));
    const tag = document.createElement("span");
    tag.className = "dlg-tag";
    tag.textContent = title;
    frag.appendChild(tag);
    return frag;
  })();

  return _dialog_create({
    titleId: "dlg-c-title",
    type,
    heading,
    body: bodyNode,
    buttons: [
      { label: labelCancel, cls: "", value: false },
      { label: labelOk, cls: type, value: true },
    ],
    keys: { Enter: true, Escape: false },
  });
}

// Prompt
async function showPrompt(
  label,
  defaultValue = "",
  { placeholder = "", type = "edit", labelOk = i18n.t("common.save"), labelCancel = i18n.t("common.cancel"), validator = null, extraButtons = [] } = {},
) {
  return _dialog_create({
    titleId: "dlg-p-title",
    type,
    heading: label,
    extraButtons,
    buttons: [
      { label: labelCancel, cls: "", value: null },
      { label: labelOk, cls: "primary", handler: null },
    ],
    keys: { Escape: null },
    mount(box, done) {
      const input = document.createElement("input");
      input.className = "dlg-input";
      input.type = "text";
      input.value = defaultValue;
      input.placeholder = placeholder;
      input.autocomplete = "off";
      input.spellcheck = false;

      const errorEl = document.createElement("span");
      errorEl.className = "dlg-error";

      const actions = box.querySelector(".dlg-actions");
      box.insertBefore(input, actions);
      box.insertBefore(errorEl, actions);

      const trySubmit = () => {
        const v = input.value.trim();
        if (!v) {
          input.focus();
          return;
        }
        if (validator) {
          const err = validator(v);
          if (err) {
            errorEl.textContent = err;
            input.focus();
            return;
          }
          errorEl.textContent = "";
        }
        done(v);
      };

      box.querySelector(".dlg-btn.primary").addEventListener("click", trySubmit);

      input.addEventListener("input", () => {
        if (errorEl.textContent) errorEl.textContent = "";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") trySubmit();
        if (e.key === "Escape") done(null);
      });

      input.focus();
      input.select();
    },
  });
}
