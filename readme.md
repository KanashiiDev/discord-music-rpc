# <img align="center" src="assets/icon/icon.png" alt="Extension Icon" width="48" height="48"> Discord Music RPC

<p align="center">
  <a href="https://chromewebstore.google.com/detail/discord-music-rpc-control/mpnijlpiepmpgoamimfmbdmglpdjmoic" target="_blank"><img src="https://img.shields.io/badge/Get%20it%20on-Chrome%20Web%20Store-brightgreen?logo=googlechrome&logoColor=white&style=for-the-badge" alt="Get it on Chrome Web Store"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/discord-music-rpc/" target="_blank"><img src="https://img.shields.io/badge/Get%20it%20on-Firefox%20Addons-orange?logo=firefox-browser&logoColor=white&style=for-the-badge" alt="Get it on Firefox Add-ons"></a>
</p>

**Discord Music RPC** is an open-source project that combines a **Chrome extension** with an **Electron-based desktop application**, allowing users to display their currently playing music from supported websites directly in their Discord status via Rich Presence.

What sets it apart is its **customizable selector system** — no coding required. Users can easily create their own music parsers for any website by simply selecting elements on the page. This makes it possible to support virtually any music platform, even those not officially integrated.

## 📚 Table of Contents

- [Features](#-features)
- [Supported Websites](#-supported-websites)
- [Compatibility](#-compatibility)
- [Setup](#-setup)
- [Troubleshooting](#-troubleshooting)
- [How to Add a New Music Site](#-how-to-add-a-new-music-site)
- [Developer Setup](#-developer-setup)
- [License](#-license)

## 🚀 Features

- Real-time Discord Rich Presence updates
- Support for multiple platforms (e.g., YouTube, YouTube Music, Deezer, SoundCloud)
- Lightweight, modular architecture
- Easy to extend — add support for any music site using the built-in selector system or using userscripts.
- Cross-platform Electron desktop app (Windows / Linux / MacOS)
- Automatic updates with seamless integration between the Electron app and Chrome extension
- Open-source and community-driven project

---

## 💻 Compatibility

**Operating System**:

- **Windows 10/11** Full support with system tray integration and auto-updater.
- **macOS (11+)** Full support for macOS 11+ (Big Sur and later) with native system tray integration via menu bar.
  - **Important:** Drag the App to `/Applications` before first launch to ensure menu bar icon and auto-updates work correctly.
- **Linux (AppImage)** Works on most modern distributions (Ubuntu, Debian, Fedora, Arch, etc).
  - GNOME users must enable the _AppIndicator / KStatusNotifierItem_ extension.
  - **Required packages on some distributions:**
    - `libayatana-appindicator3-1` (or `libappindicator3-1`)
  - **If the tray icon doesn’t appear:**
    - Install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or run once from terminal.
    - If using GNOME on Wayland, switch to an X11 session or ensure AppIndicator support is enabled.
  - **Auto-start note:** Moving the AppImage after first launch may require re-enabling “Run at Startup” in the tray menu.

**Supported Browsers**:

- Chrome
- Firefox
- Chromium-based browsers (Opera, Brave, etc.)

---

## 🎵 Supported Websites

| [<img src="https://www.google.com/s2/favicons?domain=youtube.com" width="20">](https://www.youtube.com) YouTube                      | [<img src="https://www.google.com/s2/favicons?domain=music.youtube.com" width="20">](https://music.youtube.com) YouTube Music      | [<img src="https://www.google.com/s2/favicons?domain=soundcloud.com" width="20">](https://soundcloud.com) SoundCloud       | [<img src="https://www.google.com/s2/favicons?domain=deezer.com" width="20">](https://www.deezer.com) Deezer                       | [<img src="https://www.google.com/s2/favicons?domain=tidal.com" width="20">](https://tidal.com) Tidal             |
| :----------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| [<img src="https://www.google.com/s2/favicons?domain=pandora.com" width="20">](https://www.pandora.com) Pandora                      | [<img src="https://www.google.com/s2/favicons?domain=music.apple.com" width="20">](https://music.apple.com) Apple Music            | [<img src="https://www.google.com/s2/favicons?domain=music.amazon.com" width="20">](https://music.amazon.com) Amazon Music | [<img src="https://www.google.com/s2/favicons?domain=tunein.com" width="20">](https://tunein.com) TuneIn                           | [<img src="https://www.google.com/s2/favicons?domain=iheart.com" width="20">](https://www.iheart.com) iHeartRadio |
| [<img src="https://www.google.com/s2/favicons?domain=onlineradiobox.com" width="20">](https://www.onlineradiobox.com) OnlineRadioBox | [<img src="https://www.google.com/s2/favicons?domain=radioparadise.com" width="20">](https://www.radioparadise.com) Radio Paradise | [<img src="https://www.google.com/s2/favicons?domain=radio.net" width="20">](https://www.radio.net) Radio.net              | [<img src="https://www.google.com/s2/favicons?domain=radio.garden" width="20">](https://radio.garden) Radio Garden                 | [<img src="https://www.google.com/s2/favicons?domain=listen.moe" width="20">](https://listen.moe) Listen.moe      |
| [<img src="https://www.google.com/s2/favicons?domain=gensokyoradio.net" width="20">](https://gensokyoradio.net) Gensokyo Radio       | [<img src="https://www.google.com/s2/favicons?domain=accuRadio.com" width="20">](https://accuRadio.com) accuRadio                  | [<img src="https://www.google.com/s2/favicons?domain=anison.fm" width="20">](https://anison.fm) anison.fm                  | [<img src="https://www.google.com/s2/favicons?domain=asiaDreamRadio.com" width="20">](https://asiaDreamRadio.com) Asia Dream Radio | [<img src="https://www.google.com/s2/favicons?domain=plaza.one" width="20">](https://plaza.one) Plaza One         |

💡 Additional sites can be easily added. Check out the [How to Add a New Music Site](#-how-to-add-a-new-music-site) section.

---

### 🔧 Setup

1. **Install the Extension** <br>
   First, make sure the extension is installed in your browser. It usually appears in the window that opens when you click on the extensions icon (like a puzzle piece) next to the address bar. Click on the extension icon and complete the initial setup.

2. **Install the Application** <br>
   [Download the latest release](https://github.com/KanashiiDev/discord-music-rpc/releases). Run the app — it will appear in your system tray.

   <b>Important:</b> If you run Discord as an administrator, you must also run Discord Music RPC as an administrator. Otherwise, it will not function properly.

3. **Play Music** <br>
   Go to a supported music site (like YouTube Music, Deezer, Soundcloud, etc.) and start playing music.

4. **Check Your Discord Status** <br>
   Open Discord and look at your status — it should now show what you're listening to!

5. **How to Disable It on Certain Pages** <br>
   If you don't want the extension to detect music on a certain website:

   - Click on the extension icon (top-right of your browser)
   - A small popup will appear
   - Use the switch to turn off detection for that page

---

## 🐞 Troubleshooting

**If your status isn't updating:**

- Make sure the local server is running.
- Confirm that the browser extension is active on the music site.
- Make sure the song is playing and not muted.
- Make sure the tab playing music is not minimized.
- Make sure that "Display current activity as a status message" is enabled in Discord.
- If you run Discord as an administrator, you must also run Discord Music RPC as an administrator.
- Check the console for errors and logs. For the server, click on the Tray application and click on “open logs” in the debug section.
- Right-click on the extension icon in your browser and click on the “Toggle Debug Mode” option. Check your browser's developer console for any errors.
- If nothing works and the problem just appeared, reset the extension to factory settings. To do this, right-click on the extension icon in your browser and click 'Reset to Defaults'.

**Linux:**

- **Run Discord Natively**

  - Gentoo: `emerge discord`
  - Debian/Ubuntu: `sudo dpkg -i discord.deb`
  - Arch: `sudo pacman -S discord`

- **Set XDG_RUNTIME_DIR**

  ```bash
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  ```

- **Do Not Run Discord as Root**

  - When run as root, the socket goes under /tmp → RPC doesn't work.
  - Check: `ps aux | grep discord`

- **Check IPC Socket Permissions**

  ```bash
  ls -la $XDG_RUNTIME_DIR/discord-ipc-*
  # expected: "srwxr-xr-x"
  ```

- **Check RuntimePath if You Are Using systemd / elogind**

  - Run: `loginctl show-session $(loginctl | grep $(whoami) | awk '{print $1}') | grep RuntimePath`
  - If this output is empty, it means the systemd session is corrupted.

- **If You Use Flatpak Discord, Grant IPC Permission (mandatory)**

  - `flatpak override --user com.discordapp.Discord --filesystem=/run/user/$(id -u)`

- **If you are using Snap Discord, IPC will not work at all**

  - It is completely isolated, so Discord Music RPC does not work.

- **Additional Package May Be Required for Wayland Users**
  - For some users, IPC is fixed when they install the `xdg-desktop-portal` package.
  - `sudo pacman -S xdg-desktop-portal xdg-desktop-portal-wlr`

---

## 🧩 How to Add a New Music Site

This guide explains how to create and use music parsers that extract song info (title, artist, album image, duration, etc.) from music websites.

You can add a parser in **three ways**:

---

<details>
<summary>Click to view</summary>

## ✨ Option 1: Add Parser with Plugin UI (No Code) (for simple websites)

**You don’t need to write any code. Just follow these steps:**

1. **Click the plugin icon** in your browser.
2. Click **"Add Music Site"**.
3. On the opened section, click the **“+” icon** next to each required element:
   - Title
   - Artist
   - Album Image
   - (Optional) Time Passed / Duration
4. In the **“Most Stable Selector”** section, choose the selector that looks the cleanest and most stable.
5. Click **"Save"** and refresh the page.

**Notes**

- If **“Artist”** or **“Title”** is missing, you can select the same selector for both. The source field will replace the artist field.
- If the song **“Artist”** and **“Title”** are combined, you can add the same selector to both sections. The application will automatically separate them.
- If only **“Duration”** is available, you can still add it. The app will calculate playback time starting from when the song changes until the full duration is reached.
- If **“Time Passed”** and **“Duration”** are combined (e.g., `0:12 / 2:20`), you can use the same selector for both.
- You can add any link you want in the **“Link”** field, or leave it blank. If left blank, the current site’s address will be used automatically.
- To apply your parser to the entire site, simply leave the **regex** field empty.
- You can add multiple regex patterns. There are two ways to do this:
  1. `regex1,regex2`
  2. `[/regex1/, /regex2/]`

---

## 🧩 Option 2: Add Parser Using UserScripts

You can add your own custom music parsers directly from the extension using the built-in **UserScript Manager**.
This allows you to create and manage scripts that extract track data (title, artist, album art, etc.) from any website.

### 📖 How to Add a UserScript

1. **Open the Script Manager**

   - In the extension popup, click **“Open Script Manager”**.
   - A new window will open showing the list of your current user scripts.

2. **Create a New Script**

   - Click the **“+ New Script”** button.
   - Fill in the following fields:

     - **Script Name** – A friendly name for your parser (e.g. “Spotify Parser”).
     - **Description** – A short note about what the script does.
     - **Authors** – Comma-separated list of authors (optional).
     - **Domain** – The website where the script should run (e.g. `musicwebsite.com`).
     - **URL Pattern(s)** – (Optional) Regex patterns to match specific pages (e.g. `player.*`).

3. **Write the Script Code**

   - In the code editor, define the required variables:

     ```js
     const title = "";
     const artist = "";
     const image = "";
     const source = "";
     const songUrl = "";
     const timePassed = null;
     const duration = null;
     ```

   - These variables are **required** for the Discord RPC to detect and display the music status correctly.
   - Use JavaScript to fetch these values from the target webpage (supports async functions).

4. **Save Your Script**

   - Once you’ve filled everything out, click **“Save Script”**.
   - The new script will appear in your list and can be enabled, edited, exported, or deleted anytime.

---

### 🧠 Optional: Using Custom Settings

Each user script can also include **custom settings** that appear in the extension popup.
This allows your parser to have adjustable options (e.g., toggles, custom text inputs, or selectors).

To add them:

1. In the **Script Editor**, scroll to the **“Manage Settings”** section.
2. Click **“Generate Settings”** to create a new variable.
3. Fill in:

   - **Variable Name** – Used in your code (e.g. `mySetting`).
   - **Label** – Display name shown in the popup.
   - **Type** – Choose between `text`, `checkbox`, or `select`.
   - **Default Value** – Starting value.

4. Click **“Create Setting”** to generate it.
5. You can later modify it by clicking **“Edit Settings”**.

---

## 🔧 Option 3: Add Parser Using Code (for more advanced websites)

You can also manually register a parser with JavaScript using the `registerParser()` function.
Create a new file in the `extension/parsers/` directory, named `<yourSite>.js`. Use this template:

```js
registerParser({
  domain: "example.com", // Website domain
  title: "Example", // Display title
  homepage: "https://example.com/homepage", // The page the user will be redirected to when they click on the parser image in the pop-up window (optional)
  urlPatterns: [/.*/], // Only run on specific paths (Regex)
  authors: [""], // Contributors GitHub names for the code to be displayed in the parser's settings (optional)

  fn: function () {
    // To use custom settings in your parser (checkbox, text, or select), include useSetting in the parser function parameters: async function ({ useSetting })
    // Example useSetting Types:
    // const checkboxExample = await useSetting("checkboxVariable", "checkboxLabel", "checkbox", true);
    // const textExample = await useSetting("textVariable", "textLabel", "text", "Default text");
    // const selectExample = await useSetting("selectVariable", "selectLabel", "select", [{ value: "example1", label: "Example Value", selected: true },{ value: "example2", label: "Example Value 2" }]);

    // You can define and use helper functions here if needed
    return {
      title: getText(".now-playing-title"), // Song title (required)
      artist: getText(".now-playing-artist"), // Artist name (required)
      image: getImage("img.album_art"), // Album image (optional)
      timePassed: getText(".time-display-played"), // Played time (optional)
      duration: getText(".time-display-total"), // Total duration (optional)
      source: "Example", // Source label (optional)
      songUrl: "example.com", // Link to song/station (optional)
      buttons: [
        // Buttons (max 2) (optional)
        {
          link: "Example Button Link",
          text: "Example Button Text",
        },
      ],
    };
  },
});
```

---

## 🔧 Available Helpers

### `getText(selector, options?)`

Gets text or attribute from an element.

```js
getText(".title"); // Gets textContent
getText(".link", { attr: "href" }); // Gets attribute
getText(".song", {
  attr: "href",
  transform: (v) => v.slice(1), // Transforms "/song" → "song"
});
```

---

### `getImage(selector)`

Gets image `src` or CSS `background-image` URL from an element.

```js
getImage(".cover img");
```

---

## 📝 Tips

- Always provide `title`, `artist`, and `image` when available.
- Use `urlPatterns` to limit the parser to specific pages.
- If time info is available, include `timePassed`, `duration` to calculate `position`, `progress`, and timestamps.
- Use `getText` and `getImage` to keep your code clean and reliable.
- Use your browser’s developer tools (right-click > Inspect) to find the correct selectors.

</details>

---

## 💻 Developer Setup

To set up the project locally:

```bash
git clone https://github.com/KanashiiDev/discord-music-rpc.git
cd discord-music-rpc
npm install
```

#### Run the server in development mode

```bash
npm start
```

#### Run the app in development mode

```bash
npm start:app
```

---

## 💻 Available NPM Scripts

<details>
<summary>Click to view</summary>

### Start & Development

- **`npm start`**
  Starts the Node.js backend server.

- **`npm run start:app`**
  Launches the Electron application for desktop testing.

---

### Application Build

- **`npm run build:win`**
  Builds a Windows 64-bit Electron application.

- **`npm run build:linux`**
  Builds a Linux Electron application.

- **`npm run build:mac`**
  Builds a macOS Electron application.

- **`npm run pack`**
  Creates the app directory without generating an installer (`--dir` mode).

---

### Browser Extension Build

- **`npm run build:chrome`**
  Builds the Chrome extension using `TARGET=chrome` with `buildExtensions.js`.

- **`npm run build:firefox`**
  Builds the Firefox extension using `TARGET=firefox` with `buildExtensions.js`.

- **`npm run build:extensions`**
  Builds both Chrome and Firefox extensions.

---

### Browser Extension Packaging (ZIP)

- **`npm run pack:chrome`**
  Zips the Chrome extension into a distributable format.

- **`npm run pack:firefox`**
  Zips the Firefox extension into a distributable format.

- **`npm run pack:extensions`**
  Zips both Chrome and Firefox extensions.

---

### Combined Build & Package

- **`npm run build-and-pack`**
  Builds and packages both Chrome and Firefox extensions.

- **`npm run build-and-pack:chrome`**
  Builds and packages only the Chrome extension.

- **`npm run build-and-pack:firefox`**
Builds and packages only the Firefox extension.
</details>

---

## 📄 License

This project is licensed under the MIT License. See the [`LICENSE`](LICENSE) file for details.

---

### 🧱 Built With

#### Core Framework

- [Electron](https://github.com/electron/electron) – Cross-platform desktop application framework
- [Electron Builder](https://github.com/electron-userland/electron-builder) – Complete solution to package and build Electron apps

#### Backend & Storage

- [Express](https://github.com/expressjs/express) – Fast, minimalist web server
- [simple-json-db](https://github.com/nmaggioni/Simple-JSONdb) – Lightweight JSON-based local storage
- [Electron Log](https://github.com/megahertz/electron-log) – Simple logging for Electron applications

#### UI Components

- [CodeMirror](https://github.com/codemirror/codemirror5) – Versatile in-browser code editor
- [simplebar](https://github.com/Grsmto/simplebar) – Custom scrollbar library
- [flatpickr](https://github.com/flatpickr/flatpickr) – Lightweight date and time picker

#### Utilities

- [PostCSS](https://github.com/postcss/postcss) & [Autoprefixer](https://github.com/postcss/autoprefixer) – CSS processing and vendor prefixes
- [pako](https://github.com/nodeca/pako) – High-speed compression library
- [acorn](https://github.com/acornjs/acorn) – JavaScript parser
- [@xhayper/discord-rpc](https://github.com/xhayper/discord-rpc) – Discord Rich Presence integration
