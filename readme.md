# <img align="center" src="assets/icon/icon.png" alt="Extension Icon" width="48" height="48"> Discord Music RPC

<p align="center">
  <strong>🎵 Show what you're listening to on Discord — from ANY music website 🎵 </strong>
</p>
<p align="center">
   <a href="https://www.star-history.com/#kanashiiDev/discord-music-rpc&type=date&legend=top-left" target="_blank"><img src="https://img.shields.io/github/stars/KanashiiDev/discord-music-rpc?style=for-the-badge&logo=github&color=yellow&cacheSeconds=3600" alt="GitHub Stars"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases" target="_blank"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgist.githubusercontent.com%2FKanashiiDev%2Faf52962d2844e33de8e0bbbb11040b54%2Fraw%2Fdiscord-music-rpc-stats.json&query=%24.total&style=for-the-badge&label=Downloads&color=blue&cacheSeconds=3600" alt="Total Downloads"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest" target="_blank"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgist.githubusercontent.com%2FKanashiiDev%2Faf52962d2844e33de8e0bbbb11040b54%2Fraw%2Fdiscord-music-rpc-stats.json&query=%24.latest&style=for-the-badge&label=Downloads%40Latest&color=green&cacheSeconds=3600" alt="Latest Release"></a>
</p>
<p align="center">

**Discord Music RPC** is an <ins>open-source</ins> project that pairs a browser extension with a lightweight desktop app to display what you’re listening to on supported websites directly in your Discord Rich Presence. What makes it unique is its **fully customizable selector system**, allowing anyone to add support for almost any music site without coding, complemented by an advanced userscript engine for complex integrations.

## Download

_You need to install both the **browser extension** and the **desktop application** for it to work._

**Browser Extension**

It is required for detecting music on websites and sending the data to the desktop app.

<p>
  <a href="https://chromewebstore.google.com/detail/discord-music-rpc-control/mpnijlpiepmpgoamimfmbdmglpdjmoic" target="_blank"><img src="https://img.shields.io/badge/-Chrome%20Web%20Store-555?logo=googlechrome&logoColor=white&style=for-the-badge&label=%20" alt="Get it on Chrome Web Store"><img src="https://img.shields.io/chrome-web-store/users/mpnijlpiepmpgoamimfmbdmglpdjmoic?style=for-the-badge&label=users&color=4285F4&labelColor=4285F4&cacheSeconds=3600"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/discord-music-rpc/" target="_blank"><img src="https://img.shields.io/badge/-Firefox%20Addons-555?logo=firefox-browser&logoColor=white&style=for-the-badge&label=%20" alt="Get it on Firefox Add-ons"><img src="https://img.shields.io/amo/users/discord-music-rpc?style=for-the-badge&label=users&color=orange&labelColor=orange&cacheSeconds=3600"></a>
</p>

**Desktop App**

It is required for communicating with Discord and displaying the music status.

<p>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-0.9.5-x64-installer.exe">
    <img src="https://img.shields.io/badge/Windows-Installer (x64)-0078D6?logo=windows11&logoColor=white&style=for-the-badge" alt="Windows Installer (x64)"></a>
    <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-0.9.5-x64.zip">
    <img src="https://img.shields.io/badge/%20-ZIP (x64)-0078D6?logo=windows11&logoColor=white&style=for-the-badge" alt="Windows ZIP (x64)">
  </a>
  <br>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/discord-music-rpc-0.9.5-x86_64.AppImage">
    <img src="https://img.shields.io/badge/Linux-AppImage%20(x64)-FCC624?logo=linux&logoColor=black&style=for-the-badge" alt="Linux AppImage x86_64"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/discord-music-rpc-0.9.5-amd64.deb"><img src="https://img.shields.io/badge/%20-DEB%20(x64)-A81D33?logo=debian&logoColor=white&style=for-the-badge" alt="Linux DEB x64"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/discord-music-rpc-0.9.5-x86_64.rpm"><img src="https://img.shields.io/badge/%20-RPM%20(x64)-d12626?logo=redhat&logoColor=white&style=for-the-badge" alt="Linux RPM x64"></a>
  <br>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-0.9.5-universal.dmg">
    <img src="https://img.shields.io/badge/macOS-DMG (Universal)-161616?logo=apple&logoColor=white&style=for-the-badge" alt="macOS DMG (Universal)"></a>
</p>

## 📚 Table of Contents

- [Features](#-features)
- [Supported Websites](#-supported-websites)
- [Compatibility](#-compatibility)
- [Setup](#-setup)
- [Troubleshooting](#-troubleshooting)
- [How to Add a New Music Site](#-how-to-add-a-new-music-site)
- [Filter Management](#-filter-management)
- [Developer Setup](#-developer-setup)
- [License](#-license)

## 🚀 Features

- No login required, works locally
- Support for popular music platforms
- Easy to extend — add support for any music site using the built-in selector system or using userscripts
- Filter management for blocking and modifying songs
- Cross-platform Electron desktop app [Windows / Linux / MacOS](#-compatibility)
- Automatic updates for both the extension and the desktop app
- Customizable settings and options (custom covers, buttons, etc.)
- Support buttons and timestamps
- Open-source and community-driven

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
   First, make sure the extension is installed in your browser. Click on the extension icon and complete the initial setup.

2. **Install the Application** <br>
   Install and Run the app — it will appear in your system tray.

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

## 💻 Compatibility

**Browser Extension**:

- Chrome
- Firefox
- Chromium-based browsers (Opera, Brave, etc.)

**Desktop App**:

- **Windows 10/11** Full support.
- **macOS (11+)** Full support for macOS 11+ (Big Sur and later).
  - **Important:** Drag the App to `/Applications` before first launch to ensure menu bar icon and auto-updates work correctly.
- **Linux (AppImage / DEB / RPM)** Works on most modern distributions (Ubuntu, Debian, Fedora, Arch, etc).
  - GNOME users must enable the _AppIndicator / KStatusNotifierItem_ extension.
  - **Required packages on some distributions:**
    - `libayatana-appindicator3-1` (or `libappindicator3-1`)
  - **If the tray icon doesn’t appear:**
    - Install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or run once from terminal.
    - If using GNOME on Wayland, switch to an X11 session or ensure AppIndicator support is enabled.
  - **Auto-start note:** Moving the AppImage after first launch may require re-enabling “Run at Startup” in the tray menu.

---

## 🐞 Troubleshooting

**If your status isn't updating:**

- Ensure that Discord Music RPC desktop app is running in the system tray.
- Make sure the website you are using is supported.
- Confirm that the browser extension is active on the music site.
- Ensure that a song is playing and not muted.
- The tab playing music should not be minimized.
- **"Share my activity"** must be enabled in Discord. to check this:
  - Go to User Settings (gear icon)
  - Navigate to "Activity Privacy"
  - Ensure "Share my activity" is toggled on.
- If you run Discord as an administrator, you must also run Discord Music RPC as an administrator.
- If nothing works and the problem just appeared, reset the extension to factory settings. To do this, Open extension popup, click settings and click "Factory Reset" at the bottom.
- Check the console for errors and logs:
  - For the server: Click on the Tray application and click on “open logs” in the debug section.
  - For the extension: Open extension popup, click settings, click toggle "Activate Debug Mode" then check your browser's developer console for any errors.

**Linux:**

<details>
<summary>Click to view</summary>

- **Use Automatic Diagnostic Tool (Recommended)**
  - Use the **Tray → Debug → "Run IPC Diagnostic (Linux)"** to automatically check your Discord setup

- **Discord Installation Types**
  - **Native Discord (Recommended)**
    - Install via your distribution's package manager
    - Best compatibility with IPC
  - **Snap Discord**
    - Works with IPC but may need interface connection:
      ```bash
      sudo snap connect discord:discord-ipc
      ```
  - **Flatpak Discord**
    - Requires filesystem override for IPC access:
      ```bash
      flatpak override --user --filesystem=xdg-run/discord-ipc-0 com.discordapp.Discord
      ```

- **Do Not Run Discord as Root**
  - IPC sockets won't be accessible by normal user applications
  - Always start Discord as your regular user (never use `sudo`)

- **XDG_RUNTIME_DIR Issues**
  - Must be set and owned by your user
  - Check with:
    ```bash
    echo $XDG_RUNTIME_DIR
    ls -la $XDG_RUNTIME_DIR
    ```
  - If not set, add to `~/.bashrc`:
    ```bash
    export XDG_RUNTIME_DIR=/run/user/$(id -u)
    ```

- **Wayland Users**
  - Install `xdg-desktop-portal` for proper IPC support:
    ```bash
    sudo apt install xdg-desktop-portal xdg-desktop-portal-gtk  # Debian/Ubuntu
    sudo pacman -S xdg-desktop-portal xdg-desktop-portal-gtk    # Arch
    sudo dnf install xdg-desktop-portal xdg-desktop-portal-gtk  # Fedora
    ```

- **Socket Permission Issues**
  - Usually caused by running Discord as root or wrong XDG_RUNTIME_DIR

- **Manual Socket Check**
  - Check if Discord IPC socket exists:

    ```bash
    ls -la $XDG_RUNTIME_DIR/discord-ipc-0
    ls -la $XDG_RUNTIME_DIR/snap.discord/discord-ipc-0      # Snap
    ls -la $XDG_RUNTIME_DIR/app/com.discordapp.Discord/     # Flatpak
    ```

  - Socket should be owned by your user (not root)
  - If socket doesn't exist, Discord is not running or has issues

</details>

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
  authors: [""], // Contributors names for the code to be displayed in the parser's settings (optional)
  authorsLinks: [""], // Contributors links (optional)
  description: "", // Short description of the parser (optional)

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
      mode: "listen", // Activity Type ("listen" or "watch") (optional)
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
- Use `-1` as the artist value to intentionally hide the artist name and display only the source information.
- Use `urlPatterns` to limit the parser to specific pages.
- If time info is available, include `timePassed`, `duration` to calculate `position`, `progress`, and timestamps.
- Use `getText` and `getImage` to keep your code clean and reliable.
- Use your browser’s developer tools (right-click > Inspect) to find the correct selectors.
- Buttons will not be visible to you on Discord. This is a limitation of Discord itself. To test them, open Discord in a web browser using a different account.

</details>

---

## 📚 Filter Management

The Filter system allows you to block or replace songs. You can create filters that apply to specific parsers or all parsers at once.

To do this, after clicking on Settings in the popup, you can manage the filters by clicking on Manage Filters.

---

<details>
<summary>Click to view</summary>

## Filter Types

### Block Filters

Block filters prevent songs from being displayed. When a song matches your filter criteria, it will be ignored.

### Replace Filters

Replace filters modify song information before sending to Discord. You can change the artist name, title, or both when a song matches your criteria.

## Creating a Filter

1. **Open the Filter Form**
   - Click the "+ Add New Filter" button
   - The form will expand, showing all available options

2. **Choose Filter Mode**
   - **Block**: Prevents matching songs from being displayed
   - **Replace**: Modifies song information before sending to Discord

3. **Add Song Entries**
   - Enter the **Artist** and/or **Title** you want to filter
   - You can leave either field empty to match any value (wildcard)
   - For Replace mode, specify the replacement artist/title
   - Click "Add Entry" to add multiple songs to the same filter

4. **Quick Fill Option**
   - Click "Fill with Current Song" to automatically populate the form with the currently playing song
   - This is useful for quickly blocking or replacing songs you're currently listening to

5. **Select Parsers**
   - Choose which parsers this filter applies to by toggling the switches
   - Enable "Applies to All Parsers" to apply the filter universally
   - When "All Parsers" is enabled, individual parser selections are disabled

6. **Save the Filter**
   - Click "Save" to create your filter
   - Click "Cancel" to discard changes

## Quick Block Current Song

For even faster blocking, use the "Block Current Song" button at the top of the filter section:

- This instantly blocks the currently playing song
- The song is automatically added to an existing block filter for that parser, or creates a new one if needed
- No need to open the filter form

## Filter Matching Rules

- **Wildcard matching**: Leave artist or title empty to match any value
  - Empty artist = matches any artist
  - Empty title = matches any title
  - Both empty = matches all songs (not recommended)

- **Case insensitive**: Matching is not case-sensitive
  - "Artist Name" matches "artist name" and "ARTIST NAME"

- **Partial matching**: Filters match exact strings, not partial matches
  - To block "Remix" versions, you need to specify the full title including "Remix"

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
npm run start:app
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

#### Windows

- **`npm run build:win`**  
  Builds a Windows 64-bit installer.

#### macOS

- **`npm run build:mac`**  
  Builds macOS app (Intel 64-bit).

- **`npm run build:mac:arm64`**  
  Builds macOS app (Apple Silicon).

- **`npm run build:mac:all`**  
  Builds both Intel and Apple Silicon versions.

- **`npm run build:mac:universal`**  
  Builds a universal macOS binary.

#### Linux

- **`npm run build:linux`**  
  Builds Linux app (64-bit, all formats).

- **`npm run build:linux:arm64`**  
  Builds Linux app (ARM64).

- **`npm run build:linux:all`**  
  Builds both x64 and ARM64 versions.

#### Linux Specific Formats

- **`npm run build:appImage`** / **`:arm64`** / **`:all`**  
  Builds AppImage format.

- **`npm run build:deb`** / **`:arm64`** / **`:all`**  
  Builds DEB package (Debian/Ubuntu).

- **`npm run build:rpm`** / **`:arm64`** / **`:all`**  
  Builds RPM package (Fedora/RHEL).

**Shortcuts:**

- `npm run build:ubuntu` = `build:deb`
- `npm run build:debian` = `build:deb`
- `npm run build:fedora` = `build:rpm`

---

### Browser Extension Build

- **`npm run build:chrome`**
  Builds the Chrome extension.

- **`npm run build:firefox`**
  Builds the Firefox extension.

- **`npm run build:extensions`**
  Builds both Chrome and Firefox extensions.

---

### Browser Extension Packaging (ZIP)

- **`npm run pack:chrome`**
  Packages Chrome extension as ZIP.

- **`npm run pack:firefox`**
  Packages Firefox extension as ZIP.

- **`npm run pack:extensions`**
  Packages both Chrome and Firefox extensions.

---

### Combined Build & Package

- **`npm run build-and-pack`**
  Builds and packages both Chrome and Firefox extensions.

- **`npm run build-and-pack:chrome`**
  Builds and packages Chrome extension only.

- **`npm run build-and-pack:firefox`**
  Builds and packages Firefox extension only.

---

### Additional Commands

- **`npm run pack`**  
  Creates unpacked app directory (no installer).

- **`npm run clean`**  
  Removes build artifacts from `dist/` folder.

- **`npm run lint`**  
  Checks code for linting issues.

- **`npm run lint:fix`**  
  Automatically fixes linting issues.

- **`npm run prepare-release`**  
  Builds extensions and prepares release files.

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
- [cors](https://github.com/expressjs/cors) – Middleware for enabling CORS in Express applications
- [simple-json-db](https://github.com/nmaggioni/Simple-JSONdb) – Lightweight JSON-based local storage
- [Electron Log](https://github.com/megahertz/electron-log) – Simple logging for Electron applications
- [electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater) – Auto-update solution for Electron applications
- [archiver](https://github.com/archiverjs/node-archiver) – Streaming interface for for archive generation

#### UI Components

- [CodeMirror](https://github.com/codemirror/codemirror5) – Versatile in-browser code editor
- [simplebar](https://github.com/Grsmto/simplebar) – Custom scrollbar library
- [flatpickr](https://github.com/flatpickr/flatpickr) – Lightweight date and time picker

#### Utilities

- [PostCSS](https://github.com/postcss/postcss) & [Autoprefixer](https://github.com/postcss/autoprefixer) – CSS processing and vendor prefixes
- [pako](https://github.com/nodeca/pako) – High-speed compression library
- [acorn](https://github.com/acornjs/acorn) – JavaScript parser
- [@xhayper/discord-rpc](https://github.com/xhayper/discord-rpc) – Discord Rich Presence integration
