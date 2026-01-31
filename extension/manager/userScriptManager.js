const $ = (id) => document.getElementById(id);

class UserScriptUI {
  constructor() {
    this.editingId = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.refreshList();
    this.bindCodeEditor();
    this.checkUserScriptsPermission();
    this.initApplyAttrs();
    this.initStorageListener();
  }

  bindEvents() {
    // Main buttons
    $("btnNew").addEventListener("click", () => this.showEditor());
    $("btnCancel").addEventListener("click", () => this.hideEditor(1));
    $("btnSave").addEventListener("click", () => this.saveScript());

    // Import/Export
    $("btnImport").addEventListener("click", () => $("fileInput").click());
    $("fileInput").addEventListener("change", (e) => this.handleImport(e));
    $("btnExport").addEventListener("click", (e) => {
      this.exportMenuClick(e);
    });
    $("inDomain").addEventListener("input", () => this.handlePatternStatus());
    $("inUrlPatterns").addEventListener("input", () => this.handlePatternStatus());

    // List events
    $("scriptList").addEventListener("click", (e) => this.handleListClick(e));
  }

  handlePatternStatus() {
    const domain = $("inDomain").value.trim();
    const status = $("patternStatus");
    const patterns = $("inUrlPatterns").value.split(",");
    const matches = patterns.map((p) => PatternValidator.toChromeMatch(domain, p));
    while (status.firstChild) {
      status.removeChild(status.firstChild);
    }
    matches.forEach((m) => {
      if (m !== "*://*/*") {
        if (m.startsWith("*://")) {
          m = m.slice(4);
        }
        const cont = document.createElement("code");
        cont.textContent = m;
        status.append(cont);
      }
    });
  }

  bindCodeEditor() {
    const lintOptions = {
      esversion: 11, // ES2020
      asi: false, // automatic semicolon insertion
      undef: true, // warn undefined variables
      unused: false, // warnings about unused variables
      browser: true, // It recognizes global variables such as window/document.
      devel: true, // Allows console.log and alert
      predef: ["useSetting"], // recognizes the useSetting global function
    };

    // Init CodeMirror 5
    this.codeEditor = CodeMirror.fromTextArea(document.getElementById("inCode"), {
      mode: "javascript",
      theme: "material-darker",
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      autoCloseBrackets: true,
      matchBrackets: true,
      foldGutter: true,
      styleActiveLine: { nonEmpty: true },
      gutters: ["CodeMirror-linenumbers", "CodeMirror-lint-markers", "CodeMirror-foldgutter"],
      lint: lintOptions,
      lineWrapping: true,
      extraKeys: {
        "Ctrl-/": "toggleComment",
        "Ctrl-F": function (cm) {
          cm.execCommand("openSearchAdvanced");
        },
        Esc: function (cm) {
          cm.execCommand("closeSearchAdvanced");
        },
        "Ctrl-S": function (cm) {
          document.getElementById("btnSave").click();
          cm.preventDefault && cm.preventDefault();
        },
      },
    });

    // Auto-complete
    this.codeEditor.on("inputRead", function (cm, change) {
      if (change.text[0].match(/[a-zA-Z_.]/)) {
        cm.showHint({ completeSingle: false });
      }
    });

    this.codeEditor.on(
      "change",
      function (cm) {
        const isMatch = this.checkSettings(cm);
        if (isMatch && container.getAttribute("activeMode") === "edit") {
          clearContainer();
          this.useSettingEditor.loadFromCode();
        }
      }.bind(this),
    );

    // Async Wrapper
    CodeMirror.registerHelper("lint", "javascript", function (text) {
      const wrapped = "async function __wrapper__() {\n" + text + "\n}";
      const result = JSHINT(wrapped, lintOptions);

      const errors = JSHINT.errors
        .map((err) => {
          if (!err) return null;
          err.line -= 1;
          return err;
        })
        .filter(Boolean);

      return errors.map((err) => ({
        from: CodeMirror.Pos(err.line - 1, err.character - 1),
        to: CodeMirror.Pos(err.line - 1, err.character),
        message: err.reason,
      }));
    });

    // js-beautify Options
    const beautifyOptions = {
      indent_size: 2,
      indent_char: " ",
      indent_with_tabs: false,
      end_with_newline: true,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      space_in_paren: false,
      space_in_empty_paren: false,
      jslint_happy: false,
      space_after_anon_function: true,
      brace_style: "collapse,preserve-inline",
      break_chained_methods: false,
      keep_array_indentation: false,
      unescape_strings: false,
      e4x: false,
      comma_first: false,
      operator_position: "before-newline",
      space_before_conditional: true,
      space_after_named_function: false,
      indent_empty_lines: false,
    };

    // add js-beautify
    document.getElementById("btnFormat").addEventListener("click", () => {
      const code = this.codeEditor.getValue();
      const formatted = js_beautify(code, beautifyOptions);
      this.codeEditor.setValue(formatted);
    });

    this.useSettingEditor = new UseSettingEditor(this.codeEditor, document.getElementById("useSettingsContainer"));
    const editBtn = document.getElementById("editSettingsBtn");
    const createBtn = document.getElementById("createSettingsBtn");
    const container = document.getElementById("useSettingsContainer");

    // Clear Container
    function clearContainer() {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }

    editBtn.addEventListener("click", () => {
      if (container.getAttribute("activeMode") === "edit") {
        clearContainer();
        container.removeAttribute("activeMode");
        editBtn.classList.remove("active");
      } else {
        clearContainer();
        container.setAttribute("activeMode", "edit");
        editBtn.classList.add("active");
        createBtn.classList.remove("active");
        this.useSettingEditor.loadFromCode();
      }
    });

    createBtn.addEventListener("click", () => {
      if (container.getAttribute("activeMode") === "create") {
        clearContainer();
        container.removeAttribute("activeMode");
        createBtn.classList.remove("active");
      } else {
        clearContainer();
        container.setAttribute("activeMode", "create");
        createBtn.classList.add("active");
        editBtn.classList.remove("active");
        this.useSettingEditor.createGeneratorUI(container);
      }
    });
  }

  escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Show/Hide Edit Settings Button
  checkSettings(cm) {
    const useSetRegex = /useSetting\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)"(?:\s*,\s*([\s\S]*?))?\s*\)/g;
    const code = cm.getValue();
    const match = useSetRegex.exec(code);
    if (match === null) {
      document.getElementById("editSettingsBtn").hidden = true;
    } else {
      document.getElementById("editSettingsBtn").hidden = false;
    }
    return match;
  }

  async refreshList() {
    const listResp = await sendAction("listUserScripts");
    if (!listResp || !listResp.ok) {
      logError("List fetch failed", listResp);
      return;
    }

    this.renderList(listResp.list || []);

    await this.restoreContext();
  }

  async restoreContext() {
    const { managerContext } = await browser.storage.local.get("managerContext");
    if (!managerContext) return;
    const { target } = managerContext;
    if (target) {
      const el = document.querySelector(`.btnEdit[data-id="${target}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.click();
    }
    // remove managerContext after restoring
    await browser.storage.local.remove("managerContext");
  }

  async initApplyAttrs() {
    const { styleAttrs } = await browser.storage.local.get("styleAttrs");
    if (styleAttrs) {
      document.body.setAttribute("style", styleAttrs);
    }

    const { theme } = await browser.storage.local.get("theme");
    if (theme) {
      document.body.dataset.theme = theme;
    }
  }

  initStorageListener() {
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

  renderList(list) {
    this.hideEditor();
    const editor = $("editor");
    document.body.appendChild(editor);

    const ul = $("scriptList");
    ul.innerHTML = "";

    if (!list.length) {
      return;
    }

    list.sort((a, b) => a.title.localeCompare(b.title));

    list.forEach((script) => {
      const li = document.createElement("li");
      li.dataset.id = script.id;
      li.dataset.title = script.title;
      li.classList.add("script-item");
      li.classList.toggle("registered", !!script.registered);
      li.classList.toggle("enabled", !!script.enabled);
      li.classList.toggle("disabled", !script.enabled);

      // script-info container
      const info = document.createElement("div");
      info.className = "script-info";

      // script-header
      const header = document.createElement("div");
      header.className = "script-header";

      const title = document.createElement("strong");
      title.className = "script-title";
      title.textContent = this.escapeHtml(script.title);

      // FavIcon
      const favIconContainer = document.createElement("div");
      favIconContainer.className = "parser-icon-container spinner";

      const favIcon = document.createElement("img");
      favIcon.className = "parser-icon hidden-visibility";
      favIcon.title = `Open ${script.title || script.domain}`;
      favIcon.dataset.src = script.domain;
      favIcon.loading = "lazy";
      favIcon.decoding = "async";
      favIconContainer.appendChild(favIcon);

      // Favicon click
      const handleFavIconClick = () => {
        const url = script.homepage || `https://${script.domain}`;
        window.open(url, "_blank", "noopener,noreferrer");
      };
      const listeners = [];
      const addListener = (el, event, handler, options = {}) => {
        if (!el) return;
        el.addEventListener(event, handler, options);
        listeners.push({ el, event, handler, options });
      };
      addListener(favIcon, "click", handleFavIconClick);
      header.prepend(favIconContainer);

      const status = document.createElement("span");
      status.className = "script-status";
      status.classList.toggle("status-active", !!script.registered);
      status.classList.toggle("status-inactive", !script.registered);
      const inactiveStatus = !script.registered && !script.enabled ? "● Inactive" : !script.registered ? "● Unregistered" : null;
      status.textContent = inactiveStatus || "✓ Active";

      header.append(title, status);

      // script-details
      const details = document.createElement("div");
      details.className = "script-details";

      const description = document.createElement("p");
      description.className = "script-description";
      description.textContent = this.escapeHtml(script.description || "");
      details.appendChild(description);

      const domain = document.createElement("small");
      domain.className = "script-domain";
      domain.textContent = `${this.escapeHtml(script.domain || "No domain")} [${this.escapeHtml(this.formatPatterns(script.urlPatterns))}]`;
      details.appendChild(domain);

      // script-meta
      const authors = script.authors && Array.isArray(script.authors) && script.authors.length > 0 ? `${script.authors.length > 1 ? "Authors" : "Author"}: ${script.authors.join(", ")}` : "";
      const updated = script.lastUpdated ? `Updated: ${new Date(script.lastUpdated).toLocaleDateString()}` : "";
      const meta = `${authors}\n${updated}`.trim();
      title.title = meta;
      info.append(header, details);

      // script-actions
      const actions = document.createElement("div");
      actions.className = "script-actions";

      const btnToggle = document.createElement("button");
      btnToggle.classList.add("btnToggle");
      btnToggle.classList.add(script.enabled ? "btn-disable" : "btn-enable");
      btnToggle.title = script.enabled ? "Disable" : "Enable";
      btnToggle.innerHTML = "";
      script.enabled ? btnToggle.appendChild(createSVG(svg_paths.pauseIconPaths)) : btnToggle.appendChild(createSVG(svg_paths.startIconPaths));

      const btnEdit = document.createElement("button");
      btnEdit.className = "btnEdit";
      btnEdit.title = "Edit";
      btnEdit.setAttribute("data-id", script.id);
      btnEdit.appendChild(createSVG(svg_paths.penIconPaths));

      const btnExport = document.createElement("button");
      btnExport.className = "btnExport";
      btnExport.title = "Export";
      btnExport.setAttribute("data-id", script.id);
      btnExport.appendChild(createSVG(svg_paths.exportIconPaths, { strokeWidth: 1.5 }));

      const btnRegister = document.createElement("button");
      btnRegister.className = "btnRegister";
      btnRegister.title = script.registered ? "Unregister" : "Register";
      btnRegister.textContent = script.registered ? "REG" : "UNREG";

      const btnDelete = document.createElement("button");
      btnDelete.className = "btnDelete";
      btnDelete.title = "Delete";
      btnDelete.appendChild(createSVG(svg_paths.trashIconPaths));

      actions.append(btnToggle, btnEdit, btnExport, btnDelete);

      li.append(info, actions);
      ul.appendChild(li);
    });
    // Favicon lazy load
    const allFavIcons = document.querySelectorAll(".parser-icon");
    loadFavIcons(allFavIcons);
  }

  formatPatterns(patterns) {
    if (!patterns || patterns === "*") return ".*";
    if (typeof patterns === "string") patterns = [patterns];
    if (Array.isArray(patterns)) {
      return patterns.map((p) => p.replace(/^\/|\/$/g, "")).join(", ");
    }
    return String(patterns);
  }

  handleListClick(e) {
    const li = e.target.closest("li");
    if (!li) return;

    const id = li.dataset.id;
    const title = li.dataset.title;
    const button = e.target.closest("button");
    if (!button) return;

    if (button.classList.contains("btnEdit")) return this.onEdit(id);
    if (button.classList.contains("btnRegister")) return this.onRegisterToggle(id);
    if (button.classList.contains("btnExport")) return this.exportMenuClick(e);
    if (button.classList.contains("btnDelete")) return this.onDelete(id, title);
    if (button.classList.contains("btnToggle")) return this.onToggle(id);
  }

  showEditor(script = null, insertAfterEl = null) {
    this.editingId = script?.id || null;
    const editor = $("editor");

    const listContainer = $("scriptList");
    if (!editor || !listContainer) return;

    // If it's already visible -> hide it
    const currentSection = script?.id || "new";
    if (editor.getAttribute("current") === currentSection) {
      editor.setAttribute("current", "0");
      this.hideEditor();
      return;
    } else {
      editor.setAttribute("current", currentSection);
    }

    // If insertAfterEl exists -> place it below it
    if (insertAfterEl) {
      insertAfterEl.insertAdjacentElement("afterend", editor);
    } else {
      // New script -> add to the top of the list
      listContainer.prepend(editor);
    }

    $("editorTitle").textContent = script ? `Edit Script [${script.title}]` : "New Script";
    $("inTitle").value = script?.title || "";
    $("inDesc").value = script?.description || "";
    $("inAuthors").value = script?.authors || "";
    $("inAuthorsLinks").value = script?.authorsLinks || "";
    $("inDomain").value = script?.domain || "";
    $("inHomepage").value = script?.homepage || "";
    $("inDebug").checked = script?.debug || false;
    $("inUrlPatterns").value = this.formatPatterns(script?.urlPatterns) || ".*";
    $("inUrlPatterns").dispatchEvent(new Event("input"));
    this.codeEditor.setValue(
      script?.code ||
        `const title = "";
         const artist = "";
         const image = "";
         const source = "";
         const songUrl = "";
         const timePassed = null;
         const duration = null;`,
    );

    this.checkSettings(this.codeEditor);
    if (!script?.code) document.getElementById("btnFormat").click();

    $("editorMsg").textContent = "";
    $("editorMsg").classList = "";
    $("editor").hidden = false;
    this.codeEditor.refresh();

    // Reset useSettings Container
    const container = document.getElementById("useSettingsContainer");
    container.removeAttribute("activeMode");
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const activeContainer = document.querySelector("div.code-notes.useSettings .active");
    if (activeContainer) activeContainer.className = "";
  }

  hideEditor(btn) {
    $("editor").hidden = true;
    $("editorMsg").classList = "";
    this.editingId = null;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("target");
    if (btn && target) {
      params.delete("target");
      const newUrl = window.location.origin + window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.location.replace(newUrl);
    }
  }

  async saveScript() {
    const domain = $("inDomain")
      .value.replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .trim();
    const rawPatterns = $("inUrlPatterns").value.trim() || ".*";
    const { normalizedList } = PatternValidator.processPatterns(rawPatterns);
    $("editor").setAttribute("current", "0");

    function extractSettingsFromCode(code) {
      const regex = /useSetting\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)"(?:\s*,\s*([\s\S]*?))?\s*\)/g;
      const settings = [];
      let match;

      while ((match = regex.exec(code)) !== null) {
        // eslint-disable-next-line prefer-const
        let [, key, label, type, rawDefaultValue] = match;
        let defaultValue = "";

        if (rawDefaultValue !== undefined) {
          rawDefaultValue = rawDefaultValue.trim();

          if (rawDefaultValue.startsWith("[{")) {
            const fixed = rawDefaultValue.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"');

            try {
              defaultValue = JSON.parse(fixed);
            } catch {
              defaultValue = fixed;
            }
          }

          // Process defaultValue
          // JSON array/object
          else if (rawDefaultValue.startsWith("[") || rawDefaultValue.startsWith("{")) {
            try {
              defaultValue = JSON.parse(rawDefaultValue);
            } catch {
              defaultValue = rawDefaultValue;
            }
          }

          // Boolean
          else if (rawDefaultValue === "true") defaultValue = true;
          else if (rawDefaultValue === "false") defaultValue = false;
          // Number
          else if (!isNaN(rawDefaultValue)) defaultValue = Number(rawDefaultValue);
          // String
          else if (/^["'].*["']$/.test(rawDefaultValue)) {
            defaultValue = rawDefaultValue.slice(1, -1);
          } else {
            defaultValue = rawDefaultValue;
          }
        }

        settings.push({
          key,
          label,
          type,
          defaultValue,
          value: defaultValue,
        });
      }

      return settings;
    }

    const script = {
      id: this.editingId || scriptManager.generateScriptId(domain, normalizedList),
      title: $("inTitle").value.trim(),
      description: $("inDesc").value.trim(),
      authors: $("inAuthors")
        .value.trim()
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      authorsLinks: $("inAuthorsLinks")
        .value.trim()
        .split(",")
        .map((a) => a.trim()),
      domain,
      homepage: $("inHomepage").value.trim(),
      urlPatterns: normalizedList,
      lastUpdated: Date.now(),
      runAt: "document_idle",
      code: this.codeEditor.getValue(),
      debug: $("inDebug").checked,
      settings: extractSettingsFromCode(this.codeEditor.getValue()),
    };

    // Validation
    if (!script.title) {
      this.showMessage("Script name is required", "error");
      return;
    }

    if (!script.domain) {
      this.showMessage("Domain is required", "error");
      return;
    }

    if (!script.code) {
      this.showMessage("Script code is required", "error");
      return;
    }

    const validation = this.validateScriptCode(script.code);
    if (!validation.ok) {
      this.showMessage(validation.message, "error");
      return;
    }

    // URL Pattern Validation
    try {
      PatternValidator.normalizePatterns(script.urlPatterns);
    } catch (error) {
      this.showMessage("Invalid URL patterns: " + error.message, "error");
      return;
    }

    this.showMessage("Saving script...", "info");

    const response = await browser.runtime.sendMessage({
      action: "saveUserScript",
      script,
      previousId: this.editingId || null,
    });

    if (response?.ok) {
      this.showMessage("Script saved and registered successfully.", "success");
      await this.refreshList();
    } else {
      this.showMessage("Failed to save script: " + (response?.error || "Unknown error"), "error");
    }
  }

  validateScriptCode(code) {
    const requiredVars = ["title", "artist", "image", "source", "songUrl", "timePassed", "duration"];

    const missing = [];
    const unused = [];

    for (const v of requiredVars) {
      const declPattern = new RegExp(`\\b(const|let|var)\\s+${v}\\b`);

      // Undefined?
      if (!declPattern.test(code)) {
        missing.push(v);
      } else {
        // Defined but not used?
        const valueUsage = new RegExp(`${v}[^\\s=]`);
        if (!valueUsage.test(code)) unused.push(v);
      }
    }

    if (missing.length) {
      return {
        ok: false,
        message: `⚠️ Missing required variable(s): ${missing.join(", ")}`,
      };
    }

    return { ok: true };
  }

  async onEdit(id) {
    const resp = await sendAction("listUserScripts");
    const script = (resp?.list || []).find((x) => x.id === id);
    if (!script) return;

    const li = document.querySelector(`li[data-id="${id}"]`);
    if (li) {
      this.showEditor(script, li);
    }
  }

  async onRegisterToggle(id) {
    const resp = await sendAction("listUserScripts");
    const script = (resp?.list || []).find((x) => x.id === id);

    if (!script) return;

    const action = script.registered ? "unregister" : "register";
    const result = await sendAction(action, { id });

    if (result?.ok) {
      await this.refreshList();
    } else {
      alert(`${action} failed: ${result?.error || "Unknown error"}`);
    }
  }

  async onToggle(id) {
    const resp = await sendAction("listUserScripts");
    const script = (resp?.list || []).find((x) => x.id === id);

    if (!script) return;

    const newState = !script.enabled;
    const result = await sendAction("toggleUserScript", { id, enabled: newState });

    if (result?.ok) {
      await this.refreshList();
    } else {
      alert(`Toggle failed: ${result?.error || "Unknown error"}`);
    }
  }

  async onDelete(id, title) {
    if (!confirm(`Are you sure you want to delete this script? \n[${title}]`)) return;

    const result = await sendAction("deleteUserScript", { id });

    if (result?.ok) {
      await this.refreshList();
    } else {
      alert("Delete failed: " + (result?.error || "Unknown error"));
    }
  }

  exportToRegisterParser(scripts) {
    return scripts
      .map((script) => {
        const codeIndented = script.code
          .split("\n")
          .map((line) => "    " + line)
          .join("\n");

        const urlPatterns = (script.urlPatterns || []).map((p) => (p.startsWith("/") ? p : `/${p}/`)).join(", ");

        return `registerParser({
        domain: "${script.domain}",
        authors: "${script.authors}",
        authorsLinks: "${script.authorsLinks}",
        title: "${script.title}",
        description: "${script.description}",
        lastUpdated: "${script.lastUpdated}",
        urlPatterns: [${urlPatterns}],
        fn: function () {
        ${codeIndented}
        
        return {
        title,
        artist,
        image,
        source,
        songUrl,
        duration,
        timePassed,
        };
        },
      });`;
      })
      .join("\n\n");
  }

  // registerParser.js -> JSON
  importFromRegisterParser(jsText) {
    const regex = /registerParser\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
    const scripts = [];
    let match;

    while ((match = regex.exec(jsText)) !== null) {
      const block = match[1];

      const domain = /domain:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const title = /title:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const description = /description:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const lastUpdated = /lastUpdated:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const homepage = /homepage:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const authors = /authors:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const authorsLinks = /authorsLinks:\s*["'`](.*?)["'`]/.exec(block)?.[1] || "";
      const urlPatternsRaw = /\burlPatterns:\s*\[([\s\S]*?)\]/.exec(block)?.[1] || "";
      const urlPatterns = urlPatternsRaw
        .split(",")
        .map((p) => p.trim().replace(/^\/|\/$/g, ""))
        .filter(Boolean);

      const fnBodyMatch = /fn:\s*function\s*\(\)\s*\{([\s\S]*?)return\s*\{/.exec(block);
      const code = fnBodyMatch ? fnBodyMatch[1].trim() : "";

      scripts.push({
        title,
        description,
        domain,
        homepage,
        authors: authors ? authors.split(",").map((a) => a.trim()) : [],
        authorsLinks: authorsLinks ? authorsLinks.split(",").map((a) => a.trim()) : [],
        urlPatterns,
        code,
        id: `${domain}_${Math.random().toString(36).slice(2, 8)}`,
        lastUpdated,
        runAt: "document_idle",
        registered: false,
      });
    }

    return scripts;
  }

  // Import userScript
  async handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const scripts = file.name.endsWith(".js") ? this.importFromRegisterParser(text) : JSON.parse(text);

      if (!Array.isArray(scripts)) throw new Error("Invalid format: expected array");

      const existingResp = await sendAction("listUserScripts");
      const existing = existingResp?.list || [];

      const duplicates = scripts.filter((s) => existing.some((ex) => ex.urlPatterns === s.urlPatterns && ex.domain === s.domain && ex.title === s.title));
      const newScripts = scripts.filter((s) => !existing.some((ex) => ex.urlPatterns === s.urlPatterns && ex.domain === s.domain && ex.title === s.title));

      const { duplicates: dupChoices, newScripts: newChoices } = await this.showImportModalSelection(duplicates, newScripts, existing);

      await this.refreshList?.();
    } catch (err) {
      alert("Import failed: " + err.message);
    } finally {
      e.target.value = "";
    }
  }

  async showImportModalSelection(duplicates, newScripts, existing) {
    return new Promise((resolve) => {
      // Modal
      const modal = document.createElement("div");
      modal.className = "modal";
      modal.style.display = "flex";

      const content = document.createElement("div");
      content.className = "modal-content";
      modal.appendChild(content);

      const title = document.createElement("h2");
      title.textContent = "Import Script";
      content.appendChild(title);

      const contentWrapper = document.createElement("div");
      contentWrapper.className = "modal-content-wrapper";
      contentWrapper.id = "importModalBody";
      content.appendChild(contentWrapper);

      // List Sections
      const sections = [];

      if (duplicates.length) {
        sections.push({
          header: "Conflicting Scripts",
          list: duplicates,
          prefix: "dup",
          options: [
            ["overwrite", "Overwrite"],
            ["skip", "Skip"],
          ],
        });
      }

      if (newScripts.length) {
        sections.push({
          header: "New Scripts",
          list: newScripts,
          prefix: "new",
          options: [
            ["add", "Add"],
            ["skip", "Skip"],
          ],
        });
      }

      sections.forEach((sec) => {
        const div = document.createElement("div");
        div.className = "section";
        const header = document.createElement("h4");
        header.textContent = sec.header;
        div.appendChild(header);
        sec.list.forEach((s, i) => div.appendChild(this.createSelectItem(s, i, sec.prefix, sec.options)));
        contentWrapper.appendChild(div);
      });

      const duplicateButtons = this.createGroupButtons([
        { text: "overwrite all conflicts", list: duplicates, prefix: "dup", value: "overwrite" },
        { text: "skip all conflicts", list: duplicates, prefix: "dup", value: "skip" },
      ]);

      const newButtons = this.createGroupButtons([
        { text: "add all new scripts", list: newScripts, prefix: "new", value: "add" },
        { text: "skip all new scripts", list: newScripts, prefix: "new", value: "skip" },
      ]);

      if (duplicates.length) {
        content.appendChild(duplicateButtons);
      }
      if (newScripts.length) {
        content.appendChild(newButtons);
      }

      // Result
      let importFinished = true;
      const resultContainer = document.createElement("div");
      resultContainer.className = "result-container";
      content.appendChild(resultContainer);

      // Confirm & Close
      const confirmBtn = this.createButton("Confirm Selections", async () => {
        if (importFinished) {
          importFinished = false;
          confirmBtn.textContent = "Please wait..";
          this.saveUserSelection(duplicates, "dup");
          this.saveUserSelection(newScripts, "new");
          const results = await this.processImport([...duplicates, ...newScripts], existing);
          this.showResults(resultContainer, results);
          confirmBtn.textContent = "Confirm Selections";
          importFinished = true;
          contentWrapper.remove();
        }
      });
      confirmBtn.className = "confirm-button";

      const closeBtn = this.createButton("Close", async () => {
        if (importFinished) {
          modal.remove();
          resolve({ duplicates, newScripts });
        }
      });

      closeBtn.className = "close-button";
      const buttonContainer = document.createElement("div");
      buttonContainer.className = "button-group footer-buttons";
      buttonContainer.append(confirmBtn, closeBtn);
      content.appendChild(buttonContainer);
      document.body.appendChild(modal);
      activateSimpleBar("importModalBody");

      // Close when clicking outside the modal
      window.onclick = (ev) => {
        if (importFinished && ev.target === modal) {
          modal.remove();
          resolve({ duplicates, newScripts });
        }
      };
    });
  }

  async processImport(scripts, existing) {
    const results = [];
    for (const s of scripts) {
      if (!s.title || !s.code) {
        results.push({ ...s, status: "error" });
        continue;
      }
      if (s.choice === "skip") {
        results.push({ ...s, status: "skipped" });
        continue;
      }

      const match = existing.find((ex) => ex.domain === s.domain && ex.title === s.title);
      if (match) s.id = match.id;

      const res = await sendAction("saveUserScript", { script: s });
      results.push({ ...s, status: res?.ok ? "success" : "error" });
      await scriptManager.registerAllScripts();
    }
    return results;
  }

  showResults(container, results) {
    document.querySelectorAll(".section,.button-group:not(.footer-buttons),.confirm-button").forEach((el) => el.remove());
    document.querySelector(".modal h2").textContent = "Results";
    const ul = document.createElement("ul");
    ul.id = "importResultList";

    results.forEach((r) => {
      const li = document.createElement("li");
      li.classList.add(r.status);
      const status = document.createElement("div");
      status.textContent = `${r.status.toUpperCase()}`;
      status.classList.add("status-text");
      const title = document.createElement("div");
      title.textContent = r.title || "(no title)";
      title.classList.add("script-title");
      const domain = document.createElement("div");
      domain.textContent = ` - ${r.domain || ""}`;
      domain.classList.add("script-domain");

      li.append(status, title, domain);
      ul.appendChild(li);
    });
    container.appendChild(ul);
    activateSimpleBar("importResultList");
  }

  createSelectItem(script, index, prefix, options) {
    const wrap = document.createElement("div");
    wrap.className = "import-item";

    const label = document.createElement("span");
    label.className = "import-item-label";
    label.textContent = `${script.title || "(no title)"} (${script.domain || "unknown"})`;

    const select = document.createElement("select");
    select.id = `${prefix}_${index}`;
    options.forEach(([val, text]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = text;
      select.appendChild(opt);
    });

    wrap.append(label, select);
    return wrap;
  }

  saveUserSelection(list, prefix) {
    list.forEach((item, i) => {
      const sel = document.getElementById(`${prefix}_${i}`);
      if (sel) item.choice = sel.value;
    });
  }

  createButton(text, onClick) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.className = "button";
    if (onClick) btn.onclick = onClick;
    return btn;
  }

  createGroupButtons(groups) {
    const container = document.createElement("div");
    container.className = "button-group";
    groups.forEach(({ text, list, prefix, value }) => {
      const btn = this.createButton(text, () => {
        // Update the button's active state
        container.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Apply the selection operation
        this.applyChoiceToAll(list, prefix, value);
      });

      container.appendChild(btn);
    });

    return container;
  }

  applyChoiceToAll(list, prefix, value) {
    list.forEach((item, i) => {
      item.choice = value;
      const sel = document.getElementById(`${prefix}_${i}`);
      if (sel) sel.value = value;
    });
  }

  // Export userScript
  async handleExport(format = "json", options = { type: "all", scriptId: null }) {
    const resp = await sendAction("listUserScripts");
    let scripts = resp?.list || [];

    if (!scripts.length) {
      alert("No scripts to export");
      return;
    }

    // Single export
    if (options.type === "single" && options.scriptId) {
      scripts = scripts.filter((s) => s.id === options.scriptId);
      if (!scripts.length) {
        alert("Script not found");
        return;
      }
    }

    let blob, fileName;

    if (format === "js") {
      const dataStr = this.exportToRegisterParser(scripts);
      blob = new Blob([dataStr], { type: "text/javascript" });
      if (options.type === "single") {
        fileName = `discord-music-rpc-userScript-${scripts[0].title || "script"}.js`;
      } else {
        fileName = `discord-music-rpc-userScripts-${new Date().toISOString().split("T")[0]}.js`;
      }
    } else {
      const dataStr = JSON.stringify(scripts, null, 2);
      blob = new Blob([dataStr], { type: "application/json" });
      if (options.type === "single") {
        fileName = `discord-music-rpc-userScript-${scripts[0].title || "script"}.json`;
      } else {
        fileName = `discord-music-rpc-userScripts-${new Date().toISOString().split("T")[0]}.json`;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Export Menu
  exportMenuClick(e) {
    const oldMenu = document.querySelector(".export-menu");
    if (oldMenu) oldMenu.remove();

    const li = e.target.closest("li.script-item");
    const scriptId = li?.dataset?.id || null;
    const isSingle = !!scriptId;

    // menu container
    const menu = document.createElement("div");
    menu.className = "export-menu";

    // JSON button
    const btnJson = document.createElement("button");
    btnJson.className = "export-option";
    btnJson.dataset.format = "json";
    btnJson.textContent = "JSON";
    btnJson.title = "Export as JSON";

    // JS button
    const btnJs = document.createElement("button");
    btnJs.className = "export-option";
    btnJs.dataset.format = "js";
    btnJs.textContent = "JS";
    btnJs.title = "Export as JavaScript (registerParser format)";

    // click events
    btnJson.addEventListener("click", async () => {
      await this.handleExport("json", isSingle ? { type: "single", scriptId } : { type: "all" });
      menu.remove();
    });
    btnJs.addEventListener("click", async () => {
      await this.handleExport("js", isSingle ? { type: "single", scriptId } : { type: "all" });
      menu.remove();
    });

    // add the buttons to the menu
    menu.appendChild(btnJson);
    menu.appendChild(btnJs);

    // add the menu to the body
    e.target.appendChild(menu);

    // Close the menu when clicking outside
    setTimeout(() => {
      document.addEventListener(
        "click",
        (ev) => {
          if (!menu.contains(ev.target)) menu.remove();
        },
        { once: true },
      );
    }, 0);
  }

  showMessage(message, type = "info") {
    const msgElement = $("editorMsg");
    msgElement.textContent = message;
    msgElement.className = `message ${type}`;
  }
  // If mv3 and the user have not granted userscript permission, show a warning.
  async checkUserScriptsPermission() {
    const manifest = browser.runtime.getManifest();
    const isMV3 = manifest.manifest_version === 3;

    if (isMV3) {
      if (!browser.userScripts) {
        $("mv3Alert").classList.add("active");
        return;
      }
    }
  }
}

// Initialize the UI when the script loads
const userScriptUI = new UserScriptUI();
