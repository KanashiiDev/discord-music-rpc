document.addEventListener("DOMContentLoaded", async () => {
  try {
    const container = document.getElementById("siteList");
    const searchBox = document.getElementById("searchBox");
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabUrl = new URL(tab.url);
    const tabHostname = normalize(tabUrl.hostname);
    const tabPath = tabUrl.pathname;

    const settings = await browser.storage.sync.get();

    async function getFreshParserList() {
      const { parserList = [] } = await browser.storage.sync.get("parserList");
      return Array.isArray(parserList) ? parserList : [];
    }

    function parseUrlPattern(pattern) {
      if (pattern instanceof RegExp) return pattern;
      if (typeof pattern === "string") {
        const match = pattern.match(/^\/(.*)\/([gimsuy]*)$/);
        if (match) return new RegExp(match[1], match[2]);
        return new RegExp(pattern);
      }
      return /.^/;
    }

    function normalize(str) {
      return str.replace(/^https?:\/\/|^www\./g, "").toLowerCase();
    }

    async function renderList(filteredList = null) {
      const list = filteredList || (await getFreshParserList());
      container.innerHTML = "";

      for (const entry of list) {
        const { id, domain, title, userAdd, urlPatterns = [] } = entry;
        const key = `enable_${id}`;
        const isEnabled = settings[key] !== false;

        const wrapper = document.createElement("div");
        wrapper.className = "parser-entry";

        const label = document.createElement("label");
        label.className = "parser-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isEnabled;
        checkbox.addEventListener("change", async () => {
          const newSetting = {};
          newSetting[key] = checkbox.checked;
          await browser.storage.sync.set(newSetting);
          settings[key] = checkbox.checked;
        });

        const redirectBtn = document.createElement("a");
        redirectBtn.className = "redirect-user-parser";
        redirectBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3h3v3"></path><path d="M21 3l-9 9"></path><path d="M15 3H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9"></path></svg>`;
        redirectBtn.title = "Redirect to the website";
        redirectBtn.addEventListener("click", () => {
          window.open(`https://${domain}`, "_blank").focus();
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(`${title || domain}`));
        wrapper.append(label, redirectBtn);

        if (userAdd) {
          const delBtn = document.createElement("a");
          delBtn.className = "del-user-parser";
          delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>`;
          delBtn.title = "Delete this user parser";
          delBtn.addEventListener("click", async () => {
            const confirmed = confirm(`Do you want to delete "${title}" parser?`);
            if (!confirmed) return;

            const storage = await browser.storage.sync.get(["userParserSelectors", "parserList"]);
            const updatedUserList = (storage.userParserSelectors || []).filter((p) => p.id !== id);
            const updatedParserList = (storage.parserList || []).filter((p) => p.id !== id);

            await browser.storage.sync.remove(`enable_${id}`);
            await browser.storage.sync.set({
              userParserSelectors: updatedUserList,
              parserList: updatedParserList,
            });

            if (Array.isArray(window.parsers?.[domain])) {
              window.parsers[domain] = window.parsers[domain].filter((p) => p.id !== id);
            }

            await renderList(updatedParserList);
          });

          wrapper.appendChild(delBtn);

          if (tabHostname === normalize(domain)) {
            const regexes = urlPatterns.map(parseUrlPattern);
            if (regexes.some((r) => r.test(tabPath))) {
              document.getElementById("openSelector").textContent = "Edit Music Parser";
            }
          }
        }

        container.appendChild(wrapper);
      }
    }

    await renderList();

    searchBox.addEventListener("input", async () => {
      const query = searchBox.value.toLowerCase();
      const list = await getFreshParserList();
      const filtered = list.filter(({ domain, title }) => domain.toLowerCase().includes(query) || (title && title.toLowerCase().includes(query)));
      await renderList(filtered);
    });

    document.getElementById("openSelector").addEventListener("click", async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.sendMessage(tab.id, { action: "startSelectorUI" });
        window.close();
      } catch (e) {
        const button = document.getElementById("openSelector");
        button.textContent = "You can't add this page.";
        console.log("startSelectorUI:", e);
        setTimeout(() => {
          button.textContent = "Add Music Parser";
        }, 3000);
      }
    });
  } catch (error) {
    console.error("Error loading settings:", error);
  }
});
