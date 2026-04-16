# <img align="center" src="app/assets/icon/icon.png" alt="Extension Icon" width="48" height="48"> Discord Music RPC

<p align="center">
  <strong>🎵 Show what you're listening to on Discord — from ANY music website 🎵 </strong>
</p>
<p align="center">
   <a href="https://www.star-history.com/#kanashiiDev/discord-music-rpc&type=date&legend=top-left" target="_blank"><img src="https://img.shields.io/github/stars/KanashiiDev/discord-music-rpc?style=for-the-badge&logo=github&color=yellow&cacheSeconds=3600" alt="GitHub Stars"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases" target="_blank"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgist.githubusercontent.com%2FKanashiiDev%2Faf52962d2844e33de8e0bbbb11040b54%2Fraw%2Fdiscord-music-rpc-stats.json&query=%24.total&style=for-the-badge&label=Downloads&color=blue&cacheSeconds=3600" alt="Total Downloads"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest" target="_blank"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgist.githubusercontent.com%2FKanashiiDev%2Faf52962d2844e33de8e0bbbb11040b54%2Fraw%2Fdiscord-music-rpc-stats.json&query=%24.latest&style=for-the-badge&label=Downloads%40Latest&color=green&cacheSeconds=3600" alt="Latest Release"></a>
</p>
<p align="center">

**Discord Music RPC** is an <ins>open-source</ins> project that combines a browser extension with a lightweight desktop application to display what you’re listening to on websites directly in your Discord Rich Presence. What makes it unique is its **fully customizable selector system**, which allows anyone to add support for almost any music site without coding, along with an advanced userscript engine for more complex integrations.

## Download

_You must install both the **browser extension** and the **desktop application** for the app to work._

**Browser Extension**

Required to detect music on supported websites and send playback data to the desktop app.

<p>
  <a href="https://chromewebstore.google.com/detail/discord-music-rpc-control/mpnijlpiepmpgoamimfmbdmglpdjmoic" target="_blank"><img src="https://img.shields.io/badge/-Chrome%20Web%20Store-555?logo=googlechrome&logoColor=white&style=for-the-badge&label=%20" alt="Get it on Chrome Web Store"><img src="https://img.shields.io/chrome-web-store/users/mpnijlpiepmpgoamimfmbdmglpdjmoic?style=for-the-badge&label=users&color=4285F4&labelColor=4285F4&cacheSeconds=3600"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/discord-music-rpc/" target="_blank"><img src="https://img.shields.io/badge/-Firefox%20Addons-555?logo=firefox-browser&logoColor=white&style=for-the-badge&label=%20" alt="Get it on Firefox Add-ons"><img src="https://img.shields.io/amo/users/discord-music-rpc?style=for-the-badge&label=users&color=orange&labelColor=orange&cacheSeconds=3600"></a>
</p>

**Desktop App**

Required to communicate with Discord and display your music status.

<p>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-1.6.0-x64-installer.exe">
    <img src="https://img.shields.io/badge/Windows-Installer (x64)-0078D6?logo=windows11&logoColor=white&style=for-the-badge" alt="Windows Installer (x64)"></a>
    <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-1.6.0-x64.zip">
    <img src="https://img.shields.io/badge/%20-ZIP (x64)-0078D6?logo=windows11&logoColor=white&style=for-the-badge" alt="Windows ZIP (x64)">
  </a>
  <br>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/discord-music-rpc-1.6.0-x86_64.AppImage">
    <img src="https://img.shields.io/badge/Linux-AppImage%20(x64)-FCC624?logo=linux&logoColor=black&style=for-the-badge" alt="Linux AppImage x86_64"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/discord-music-rpc-1.6.0-amd64.deb"><img src="https://img.shields.io/badge/%20-DEB%20(x64)-A81D33?logo=debian&logoColor=white&style=for-the-badge" alt="Linux DEB x64"></a>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/discord-music-rpc-1.6.0-x86_64.rpm"><img src="https://img.shields.io/badge/%20-RPM%20(x64)-d12626?logo=redhat&logoColor=white&style=for-the-badge" alt="Linux RPM x64"></a>
  <br>
  <a href="https://github.com/KanashiiDev/discord-music-rpc/releases/latest/download/Discord-Music-RPC-1.6.0-universal.dmg">
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

- No login required, works entirely locally
- Prebuilt integrations for a wide range of music platforms
- Easy to extend — add support for almost any music site using the built-in selector system or UserScripts
- Filter management for blocking or modifying songs
- Cross-platform Electron desktop app (Windows / Linux / macOS)
- Automatic updates for both the browser extension and the desktop app
- Customizable settings and options (custom covers, buttons, etc.)
- Open-source and community-driven

---

## 🎵 Supported Websites

These are the prebuilt integrations included with the extension. Additional sites can be easily added using the built-in selector system or the UserScript manager — see the [How to Add a New Music Site](#-how-to-add-a-new-music-site) section.

| [<img src="https://www.google.com/s2/favicons?domain=youtube.com" width="20">](https://www.youtube.com) YouTube                      | [<img src="https://www.google.com/s2/favicons?domain=music.youtube.com" width="20">](https://music.youtube.com) YouTube Music | [<img src="https://www.google.com/s2/favicons?domain=soundcloud.com" width="20">](https://soundcloud.com) SoundCloud       | [<img src="https://www.google.com/s2/favicons?domain=deezer.com" width="20">](https://www.deezer.com) Deezer                       | [<img src="https://www.google.com/s2/favicons?domain=tidal.com" width="20">](https://tidal.com) Tidal        |
| :----------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| [<img src="https://www.google.com/s2/favicons?domain=pandora.com" width="20">](https://www.pandora.com) Pandora                      | [<img src="https://www.google.com/s2/favicons?domain=music.apple.com" width="20">](https://music.apple.com) Apple Music       | [<img src="https://www.google.com/s2/favicons?domain=music.amazon.com" width="20">](https://music.amazon.com) Amazon Music | [<img src="https://www.google.com/s2/favicons?domain=vk.com" width="20">](https://www.vk.com) VK                                   | [<img src="https://www.google.com/s2/favicons?domain=tunein.com" width="20">](https://tunein.com) TuneIn     |
| [<img src="https://www.google.com/s2/favicons?domain=onlineradiobox.com" width="20">](https://www.onlineradiobox.com) OnlineRadioBox | [<img src="https://www.google.com/s2/favicons?domain=iheart.com" width="20">](https://www.iheart.com) iHeartRadio             | [<img src="https://www.google.com/s2/favicons?domain=radio.net" width="20">](https://www.radio.net) Radio.net              | [<img src="https://www.google.com/s2/favicons?domain=radio.garden" width="20">](https://radio.garden) Radio Garden                 | [<img src="https://www.google.com/s2/favicons?domain=listen.moe" width="20">](https://listen.moe) Listen.moe |
| [<img src="https://www.google.com/s2/favicons?domain=gensokyoradio.net" width="20">](https://gensokyoradio.net) Gensokyo Radio       | [<img src="https://www.google.com/s2/favicons?domain=accuRadio.com" width="20">](https://accuRadio.com) accuRadio             | [<img src="https://www.google.com/s2/favicons?domain=anison.fm" width="20">](https://anison.fm) anison.fm                  | [<img src="https://www.google.com/s2/favicons?domain=asiaDreamRadio.com" width="20">](https://asiaDreamRadio.com) Asia Dream Radio | [<img src="https://www.google.com/s2/favicons?domain=plaza.one" width="20">](https://plaza.one) Plaza One    |

---

### 🔧 Setup

1. **Install the Extension**  
   Install the browser extension and complete the initial setup.

2. **Install the Desktop App**  
   Install and run the app — it will appear in your system tray.

   **Important:** If Discord runs as administrator, Discord Music RPC must also run as administrator.

3. **Play Music**  
   Go to a supported music site (YouTube Music, Deezer, SoundCloud, etc.) and start playing.

4. **Check Your Discord Status**  
   Open Discord and look at your status — it should now show what you're listening to!

5. **Disable on Specific Pages**  
   To disable detection on certain websites:
   - Click the extension icon (top-right of browser)
   - Toggle the switch to turn off detection for that page

---

## 💻 Compatibility

### Browser Extension

Chrome, Firefox, and Chromium-based browsers (Opera, Brave, Edge, etc.)

### Desktop App

| Platform          | Support          | Notes                                           |
| ----------------- | ---------------- | ----------------------------------------------- |
| **Windows 10/11** | Full support     | -                                               |
| **macOS 11+**     | Full support     | Drag app to `/Applications` before first launch |
| **Linux**         | AppImage/DEB/RPM | See Linux-specific notes below                  |

<details>
<summary><strong>Linux Installation Notes</strong></summary>

**GNOME Users:**  
Enable the _AppIndicator / KStatusNotifierItem_ extension.

**Required packages on some distributions:**

```bash
sudo apt install libayatana-appindicator3-1  # Debian/Ubuntu
```

**If tray icon doesn't appear:**

- Install [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) or run from terminal once
- On GNOME + Wayland: Switch to X11 session or enable AppIndicator support

**Auto-start note:**  
Moving the AppImage after first launch requires re-enabling "Run at Startup" in tray menu.

</details>

---

## 🐞 Troubleshooting

### Activity Not Showing in Discord?

<details>
<summary><strong>Click to view common solutions</strong></summary>

- Desktop app is running in system tray
- Website is supported and extension is enabled
- A song is actually playing (not paused or muted)
- The music tab is not minimized
- **"Share my activity"** is enabled in Discord:
  - User Settings (gear icon) → Activity Privacy → Toggle on
- If Discord runs as administrator, run Discord Music RPC as administrator too
- Check logs for errors:
  - **Server logs:** Tray app → "Open logs" (Debug section)
  - **Extension logs:** Extension popup → Settings → Toggle "Activate Debug Mode" → Check browser console

---

</details>

### Browser Related Issues

Modern browsers use methods such as freezing background tabs and restricting JavaScript to save resources. This can cause issues with RPC updates.

<details>
<summary><strong>Chrome</strong></summary>

#### Disable Memory Saver and Energy Saver

1. Open:

   ```
   chrome://settings/performance
   ```

2. Turn **OFF "Memory Saver"**

3. Turn **OFF "Energy Saver"**

---

#### Add Site Exception

1. Open:

   ```
   chrome://settings/performance
   ```

2. Click **"Add"** next to:

   ```
   Always keep these sites active
   ```

3. Add your music site.

---

#### Disable Background Throttling & Window Occlusion

Chrome sometimes slows down background tabs. If your site is not updating properly, you can apply advanced settings:

#### Windows

You can run a pre-made Registry file and restart Chrome.
[**[Click here to download Registry file]**](scripts/chrome-occlusion-disable.reg)

This file sets the following registry keys:

```reg
[HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome]
"IntensiveWakeUpThrottlingEnabled"=dword:0
"WindowOcclusionEnabled"=dword:0

[HKEY_CURRENT_USER\Software\Policies\Google\Chrome]
"IntensiveWakeUpThrottlingEnabled"=dword:0
"WindowOcclusionEnabled"=dword:0
```

What this does:
Stops Chrome from slowing down background tabs. Prevents "window occlusion" from pausing tabs when they're hidden.

---

#### Linux

> **Note:** If you are using **Chromium** instead of Google Chrome, replace the path with:
> `/etc/chromium/policies/managed/`

1. Open the terminal (Ctrl+Alt+T on most distributions).
2. Create the managed policies folder if it doesn't exist:

```bash
sudo mkdir -p /etc/opt/chrome/policies/managed/
```

3. Create the policy file:

```bash
sudo nano /etc/opt/chrome/policies/managed/background_throttle.json
```

4. Paste this content into the file:

```json
{
  "IntensiveWakeUpThrottlingEnabled": false,
  "WindowOcclusionEnabled": false
}
```

5. Save the file (`Ctrl+O` in nano) and exit (`Ctrl+X`).
6. Restart Chrome.

---

#### macOS

1. Open **Terminal** (`Applications → Utilities → Terminal`)

2. Create the managed policies folder if it doesn't exist:

```bash
sudo mkdir -p "/Library/Managed Preferences/"
```

3. Create the policy file:

```bash
sudo nano "/Library/Managed Preferences/com.google.Chrome.plist"
```

4. Paste this content into the file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>IntensiveWakeUpThrottlingEnabled</key>
    <false/>
    <key>WindowOcclusionEnabled</key>
    <false/>
</dict>
</plist>
```

5. Save the file (`Ctrl+O` in nano) and exit (`Ctrl+X`).

6. Restart Chrome.

> **Note:** If policies are not applying, try placing the file in the user-specific folder instead:
> `/Library/Managed Preferences/<your_username>/com.google.Chrome.plist`

---

</details>

<details>
<summary><strong>Firefox</strong></summary>

#### About Config Method

1. Open:

   ```
   about:config
   ```

2. Click **Accept the Risk**

3. Search and set the following values to **false**:

   ```
   dom.suspend_inactive.enabled
   widget.windows.window_occlusion_tracking.enabled
   widget.windows.window_occlusion_tracking_display_state.enabled
   widget.windows.window_occlusion_tracking_session_lock.enabled
   ```

4. Search and set the following values to **0**:

   ```
   dom.min_background_timeout_value
   dom.timeout.background_throttling_max_budget
   dom.min_background_timeout_value_without_budget_throttling
   ```

---

#### Performance Settings

1. Open:

   ```
   about:preferences
   ```

2. Scroll to **Performance**

3. Uncheck:

   ```
   Use recommended performance settings
   ```

---

</details>

### Linux-Specific Issues

<details>
<summary><strong>Click to view Linux troubleshooting</strong></summary>

#### Quick Diagnostic (Recommended)

Use **Tray → Debug → "Run IPC Diagnostic (Linux)"** to auto-check your setup.

#### Discord Installation Types

| Type                     | IPC Support    | Setup                                                                               |
| ------------------------ | -------------- | ----------------------------------------------------------------------------------- |
| **Native** (Recommended) | Best           | Install via package manager                                                         |
| **Snap**                 | Needs config   | `sudo snap connect discord:discord-ipc`                                             |
| **Flatpak**              | Needs override | `flatpak override --user --filesystem=xdg-run/discord-ipc-0 com.discordapp.Discord` |

#### Common Issues

**Do Not Run Discord as Root**  
IPC sockets won't be accessible. Always start Discord as regular user (never `sudo`).

**XDG_RUNTIME_DIR Issues**

```bash
# Check if set correctly
echo $XDG_RUNTIME_DIR
ls -la $XDG_RUNTIME_DIR

# If not set, add to ~/.bashrc:
export XDG_RUNTIME_DIR=/run/user/$(id -u)
```

**Wayland Users**  
Install `xdg-desktop-portal`:

```bash
sudo apt install xdg-desktop-portal xdg-desktop-portal-gtk  # Debian/Ubuntu
sudo pacman -S xdg-desktop-portal xdg-desktop-portal-gtk    # Arch
sudo dnf install xdg-desktop-portal xdg-desktop-portal-gtk  # Fedora
```

**Manual Socket Check**

```bash
# Check if Discord IPC socket exists
ls -la $XDG_RUNTIME_DIR/discord-ipc-0
ls -la $XDG_RUNTIME_DIR/snap.discord/discord-ipc-0      # Snap
ls -la $XDG_RUNTIME_DIR/app/com.discordapp.Discord/     # Flatpak

# Socket should be owned by your user (not root)
```

</details>

---

## 🧩 How to Add a New Music Site

This guide explains how to create parsers that extract song info (title, artist, album image, duration, etc.) from music websites.

You can add a parser in **three ways**:

<details>
<summary><strong>Option 1: UI Method (No Code)</strong></summary>

You don't need to write any code. Just follow these steps:

1. **Click the plugin icon** in your browser.
2. Click **"Add Music Site"**.
3. On the opened section, click the **"+" icon** next to each required element:
   - Title
   - Artist
   - Album Image
   - (Optional) Time Passed / Duration
4. In the **"Most Stable Selector"** section, choose the selector that looks the cleanest and most stable.
5. Click **"Save"** and refresh the page.

#### Notes

- If **"Artist"** or **"Title"** is missing, you can select the same selector for both. The source field will replace the artist field.
- If the song **"Artist"** and **"Title"** are combined, you can add the same selector to both sections. The application will automatically separate them.
- If only **"Duration"** is available, you can still add it. The app will calculate playback time starting from when the song changes until the full duration is reached.
- If **"Time Passed"** and **"Duration"** are combined (e.g., `0:12 / 2:20`), you can use the same selector for both.
- You can add any link you want in the **"Link"** field, or leave it blank. If left blank, the current site's address will be used automatically.
- To apply your parser to the entire site, simply leave the **regex** field empty.
- You can add multiple regex patterns. There are two ways to do this:
  1. `regex1,regex2`
  2. `[/regex1/, /regex2/]`

---

</details>

<details>
<summary><strong>Option 2: UserScript Method</strong></summary>

You can add your own custom music parsers directly from the extension using the built-in **UserScript Manager**.
This allows you to create and manage scripts that extract track data (title, artist, album art, etc.) from any website.

#### How to Add a UserScript

1. **Open the Script Manager**
   - In the extension popup, click **"Open Script Manager"**.
   - A new window will open showing the list of your current user scripts.

2. **Create a New Script**
   - Click the **"+ New Script"** button.
   - Fill in the following fields:
     - **Script Name** – A friendly name for your parser (e.g. "Spotify Parser").
     - **Description** – A short note about what the script does.
     - **Authors** – Comma-separated list of authors (optional).
     - **Domain** – The website where the script should run (e.g. `musicwebsite.com`).
     - **URL Pattern(s)** – (Optional) Regex patterns to match specific pages (e.g. `player.*`).

3. **Write the Script Code**
   - In the code editor, define the required variables:

```js
let title = "";
let artist = "";
let image = "";
let source = "";
let songUrl = "";
let timePassed = null;
let duration = null;
```

- These variables are **required** for the Discord RPC to detect and display the music status correctly.
- Use JavaScript to fetch these values from the target webpage (supports async functions).

4. **Save Your Script**
   - Once you've filled everything out, click **"Save Script"**.
   - The new script will appear in your list and can be enabled, edited, exported, or deleted anytime.

#### Optional: Using Custom Settings

Each user script can also include **custom settings** that appear in the extension popup.
This allows your parser to have adjustable options (e.g., toggles, custom text inputs, or selectors).

To add them:

1. In the **Script Editor**, scroll to the **"Manage Settings"** section.
2. Click **"Generate Settings"** to create a new variable.
3. Fill in:
   - **Variable Name** – Used in your code (e.g. `mySetting`).
   - **Label** – Display name shown in the popup.
   - **Type** – Choose between `text`, `checkbox`, or `select`.
   - **Default Value** – Starting value.

4. Click **"Create Setting"** to generate it.
5. You can later modify it by clicking **"Edit Settings"**.

---

</details>

<details>
<summary><strong>Option 3: Build Method (Developers)</strong></summary>

This method lets you write a JavaScript parser directly into the extension's source code. It's the most powerful approach and gives you access to advanced helper functions not available in the other options.

---

### Step 1 — Create Your Parser File

Inside the project folder, navigate to `extension/parsers/` and create a new file named after the site you're adding (e.g., `myMusicSite.js`).

---

### Step 2 — Register the Parser

Your file must call `registerParser()` with a configuration object. Here's a clean, minimal template to get started:

```js
registerParser({
  // --- Required ---
  domain: "example.com", // The website's domain. Can also be an array: ["example.com", "www.example.com"]
  title: "Example", // Display name shown in the extension UI
  category: "platform", // One of: "radio", "platform", "aggregator"

  // --- Optional ---
  homepage: "https://example.com", // Link opened when the user clicks your parser's icon
  description: "My parser for Example Music.", // Short description of the parser. Can also be multilingual: { en: "My parser" }
  authors: ["yourName"], // Contributors names for the code to be displayed in the parser's settings
  authorsLinks: ["https://github.com/yourName"], // Contributors links
  tags: ["rock", "community"], // Descriptive tags for the parser's content type
  urlPatterns: [/.*/], // Regex patterns — limits the parser to specific URL paths. [/.*/] means "run on all pages of this domain".
  mode: "listen", // "listen" or "watch"

  // --- Main function ---
  // This runs periodically to extract the currently playing song's data.
  // Use the built-in helper functions (getText, getImage) to grab info from the page.
  fn: async function ({ accessWindow, useSetting, iframeData }) {
    return {
      title: getText(".now-playing-title"), // Required — song title
      artist: getText(".now-playing-artist"), // Required — artist name
      image: getImage("img.album_art"), // Album art URL
      timePassed: getText(".time-display-played"), // Current playback time (e.g. "1:23")
      duration: getText(".time-display-total"), // Total song duration  (e.g. "3:45")
      source: "Example", // Source label
      songUrl: "https://example.com/song", // Direct link to the song or station
      isPlaying: Boolean(document.querySelector("#pauseSongButton")), // Any truthy value indicating active playback; used for cast support
      buttons: [
        // Up to 2 clickable buttons on the Discord status
        { text: "Listen Along", link: "https://example.com/song" },
      ],
    };
  },
});
```

---

### Step 3 — Use Advanced Features (Optional)

<details>
<summary><strong>Custom Settings (useSetting)</strong></summary>

You can expose configurable options (toggles, text inputs, dropdowns) that appear in the extension popup for your parser.

```js
fn: async function ({ useSetting }) {
  // Checkbox toggle
  const showArtist = await useSetting("showArtist", { en: "Show Artist Name" }, "checkbox", true);

  // Text input
  const customLabel = await useSetting("customLabel", { en: "Custom Source Label" }, "text", "My Station");

  // Dropdown select
  const quality = await useSetting("quality", { en: "Stream Quality" }, "select", [
    { value: "high", label: { en: "High" },   selected: true },
    { value: "medium", label: { en: "Medium" } },
  ]);

  return {
    source: showArtist ? customLabel : "",
    // ...
  };
},
```

Each call to `useSetting(variableName, label, type, defaultValue)` creates a setting that the user can change from the popup.

</details>

<details>
<summary><strong>Accessing JavaScript Variables on the Page (accessWindow)</strong></summary>

Some sites store playback data in JavaScript variables (e.g., `window.player.currentTrack`) rather than in the HTML. Use `accessWindow` to safely read these.

```js
fn: async function ({ accessWindow }) {
  // Read a property from the page's window object
  const track = await accessWindow("player.getCurrentAudio");
  const config = await accessWindow("ap.config.settings");

  // Call a function that takes arguments
  const data = await accessWindow("api.fetch", { args: ["songs", { limit: 10 }] });

  // Fetch multiple values in parallel
  const [audio, playlist] = await Promise.all([
    accessWindow("player.getCurrentAudio"),
    accessWindow("player.getPlaylist"),
  ]);

  return {
    title:  audio?.title  ?? "",
    artist: audio?.artist ?? "",
  };
},
```

> `accessWindow` returns `null` if the property doesn't exist or throws an error — always handle this gracefully.

</details>

<details>
<summary><strong>Reading Data from Iframes (iframeFn)</strong></summary>

If the music player is embedded inside an `<iframe>` (a separate page within the page), you need `iframeFn` to extract data from it.

**How it works:**

- `iframeFn` runs **inside** the iframe and returns data.
- `fn` receives that data via the `iframeData` parameter.

```js
registerParser({
  domain: "example.com",
  title: "Example",
  category: "platform",

  // Optional: only accept data from iframes on this domain
  iframeOrigins: ["player.example.com"],

  fn: async function ({ iframeData }) {
    if (!iframeData) return {}; // iframe hasn't loaded yet

    return {
      title: iframeData.title,
      isPlaying: iframeData.isPlaying,
      timePassed: String(iframeData.currentTime),
      duration: String(iframeData.duration),
    };
  },

  // This function runs inside the iframe
  iframeFn: function () {
    const video = document.querySelector("video");
    return {
      title: document.querySelector(".track-title")?.textContent ?? "",
      isPlaying: !video?.paused,
      currentTime: video?.currentTime,
      duration: video?.duration,
    };
  },
});
```

**Tip:** If the iframe contains a `<video>` element, you can use the built-in shorthand:

```js
iframeFn: function () {
  return getVideoInfo();
  // Returns: { duration, currentTime, paused, playing }
},
```

> `iframeData.lastValidValues` holds the last non-null values for each field — useful as a fallback when data is temporarily unavailable.

</details>

---

### Available Helper Functions

These functions are available inside `fn` to make extracting data easier.

<details>
<summary><strong>getText(selector, options?)</strong></summary>
 
Reads the text content (or an attribute) of a DOM element matching the given CSS selector.
 
**Parameters:**
 
| Parameter | Type | Description |
|---|---|---|
| `selector` | `string` | CSS selector (e.g., `".now-playing-title"`) |
| `options.attr` | `string` | Read an attribute instead of text (e.g., `"href"`, `"title"`) |
| `options.transform` | `function` | A function to modify the result before returning it |
| `options.root` | `Element` | Search within a specific element instead of the whole page |
 
**Returns:** `string` — the extracted text, or `""` if nothing was found.
 
```js
// Basic usage — reads the text inside .now-playing-title
getText(".now-playing-title");
// → "Bohemian Rhapsody"
 
// Read an attribute instead of text content
getText(".song-link", { attr: "href" });
// → "https://example.com/song/123"
 
// Transform the result (e.g., remove a leading slash)
getText(".song-link", {
  attr: "href",
  transform: (v) => v.replace(/^\//, ""),
});
// → "song/123"
 
// Search inside a specific container
getText(".subtitle", { root: document.querySelector(".player-widget") });
```
 
> Returns `""` if the element is not found, the attribute doesn't exist, or the transform function throws an error. Whitespace is trimmed automatically.
 
</details>
 
<details>
<summary><strong>getImage(selector, root?)</strong></summary>
 
Extracts an image URL from a DOM element. Works with `<img>` tags, CSS `background-image`, or a child `<img>` inside the matched element.
 
**Parameters:**
 
| Parameter | Type | Description |
|---|---|---|
| `selector` | `string` | CSS selector |
| `root` | `Element` _(optional)_ | Search within a specific element instead of the whole page |
 
**Returns:** `string \| null` — the image URL, or `null` if not found.
 
```js
getImage(".album-cover img");    // → "https://example.com/cover.jpg"
getImage(".hero-banner");        // → reads background-image CSS property
getImage(".track-card");         // → finds the first <img> inside .track-card
```
 
**Search priority:** direct `<img>` src → CSS `background-image` → first child `<img>` src.
 
</details>
 
<details>
<summary><strong>getTextAll(selector, options?)</strong></summary>
 
Same as `getText`, but returns an array of results for **all** matching elements.
 
**Parameters:**
 
| Parameter | Type | Description |
|---|---|---|
| `selector` | `string` | CSS selector (e.g., `".track-list .title"`) |
| `options.attr` | `string` | Read an attribute instead of text (e.g., `"href"`, `"title"`) |
| `options.transform` | `function` | A function to modify each result before returning it |
| `options.root` | `Element` | Search within a specific element instead of the whole page |
 
**Returns:** `string[]` — empty strings are automatically filtered out.
 
```js
getTextAll(".track-list .title");
// → ["Song 1", "Song 2", "Song 3"]
 
getTextAll(".nav a", { attr: "href", transform: (v) => new URL(v).pathname });
// → ["/home", "/about", "/contact"]
```
 
</details>
 
<details>
<summary><strong>getImageAll(selector, root?)</strong></summary>
 
Same as `getImage`, but returns an array of image URLs for **all** matching elements.
 
```js
getImageAll(".playlist-item img");
// → ["cover1.jpg", "cover2.jpg", "cover3.jpg"]
```
 
**Returns:** `string[]` — `null` values are automatically filtered out.
 
</details>

---

### Tips

- Always return at least `title` and `artist` — these are required for the Discord status to display.
- Set `artist` to `-1` to intentionally hide the artist and show only the `source` label instead.
- Use `urlPatterns` to prevent your parser from running on pages where it isn't needed (e.g., exclude the homepage and only run on `/player`).
- Include `timePassed` and `duration` whenever available — they enable the progress bar and timestamps in Discord.
- Use your browser's **DevTools** (F12 → Elements tab) to inspect the page and find the right CSS selectors.
- Discord desktop does **not** show your parser's buttons. To test them, open Discord in a browser on a separate account.

</details>

---

## 📚 Filter Management

The Filter system allows you to block or replace songs. You can create filters that apply to specific parsers or all parsers at once.

**To access:** Settings (in popup) → **Manage Filters**

<details>
<summary><strong>Filter Types</strong></summary>

### Block Filters

Prevent songs from being displayed. When a song matches your filter criteria, it will be ignored.

### Replace Filters

Modify song information before sending to Discord. You can change the artist name, title, or both when a song matches your criteria.

---

</details>

<details>
<summary><strong>Creating a Filter</strong></summary>

### Step 1: Open the Filter Form

- Click the **"+ Add New Filter"** button
- The form will expand, showing all available options

### Step 2: Choose Filter Mode

- **Block** – Prevents matching songs from being displayed
- **Replace** – Modifies song information before sending to Discord

### Step 3: Add Song Entries

- Enter the **Artist** and/or **Title** you want to filter
- Leave either field empty to match any value (wildcard)
- For Replace mode, specify the replacement artist/title
- Click **"Add Entry"** to add multiple songs to the same filter

**Quick Fill Option:**
Click **"Fill with Current Song"** to automatically populate the form with the currently playing song.

### Step 4: Select Parsers

- Choose which parsers this filter applies to by toggling the switches
- Enable **"Applies to All Parsers"** to apply the filter universally
- When "All Parsers" is enabled, individual parser selections are disabled

### Step 5: Save the Filter

- Click **"Save"** to create your filter
- Click **"Cancel"** to discard changes

---

</details>

<details>
<summary><strong>Quick Block Current Song</strong></summary>

For faster blocking, use the **"Block Current Song"** button at the top of the filter section:

- Instantly blocks the currently playing song
- The song is automatically added to an existing block filter for that parser, or creates a new one if needed
- No need to open the filter form

---

</details>

<details>
<summary><strong>Filter Matching Rules</strong></summary>

| Rule                  | Behavior                                       | Example                                                                      |
| --------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| **Wildcard matching** | Leave artist or title empty to match any value | Empty artist = matches any artist                                            |
| **Case insensitive**  | Matching ignores case                          | "Artist Name" matches "artist name" and "ARTIST NAME"                        |
| **Exact matching**    | Filters match exact strings, not partial       | To block "Song (Remix)", you must specify the full title including "(Remix)" |

</details>

---

## 💻 Developer Setup

```bash
git clone https://github.com/KanashiiDev/discord-music-rpc.git
cd discord-music-rpc
npm install
```

- **Start backend server**

  ```bash
  npm start
  ```

- **Start Electron app**

  ```bash
  npm run start:app
  ```

---

## 💻 Available NPM Scripts

<details>
<summary>Click to view</summary>

### Start & Development

- **`npm start`**<br>
  Starts the Node.js backend server.

- **`npm run start:app`**<br>
  Launches the Electron application for desktop testing.

---

### Application Build

#### Windows

- **`npm run build:win`**<br>
  Builds a Windows 64-bit installer.

#### macOS

- **`npm run build:mac`**<br>
  Builds macOS app (Intel 64-bit).

- **`npm run build:mac:arm64`**<br>
  Builds macOS app (Apple Silicon).

- **`npm run build:mac:all`**<br>
  Builds both Intel and Apple Silicon versions.

- **`npm run build:mac:universal`**<br>
  Builds a universal macOS binary.

#### Linux

- **`npm run build:linux`**<br>
  Builds Linux app (64-bit, all formats).

- **`npm run build:linux:arm64`**<br>
  Builds Linux app (ARM64).

- **`npm run build:linux:all`**<br>
  Builds both x64 and ARM64 versions.

#### Linux Specific Formats

- **`npm run build:appImage`** / **`:arm64`** / **`:all`**<br>
  Builds AppImage format.

- **`npm run build:deb`** / **`:arm64`** / **`:all`**<br>
  Builds DEB package (Debian/Ubuntu).

- **`npm run build:rpm`** / **`:arm64`** / **`:all`**<br>
  Builds RPM package (Fedora/RHEL).

- `npm run build:ubuntu` = `build:deb`
- `npm run build:debian` = `build:deb`
- `npm run build:fedora` = `build:rpm`

---

### Browser Extension Build

- **`npm run build:chrome`**<br>
  Builds the Chrome extension.

- **`npm run build:firefox`**<br>
  Builds the Firefox extension.

- **`npm run build:extensions`**<br>
  Builds both Chrome and Firefox extensions.

---

### Browser Extension Packaging (ZIP)

- **`npm run pack:chrome`**<br>
  Packages Chrome extension as ZIP.

- **`npm run pack:firefox`**<br>
  Packages Firefox extension as ZIP.

- **`npm run pack:extensions`**<br>
  Packages both Chrome and Firefox extensions.

---

### Combined Build & Package

- **`npm run build-and-pack`**<br>
  Builds and packages both Chrome and Firefox extensions.

- **`npm run build-and-pack:chrome`**<br>
  Builds and packages Chrome extension only.

- **`npm run build-and-pack:firefox`**<br>
  Builds and packages Firefox extension only.

---

### Additional Commands

- **`npm run pack`**<br>
  Creates an unpacked Electron application directory (no installer).

- **`npm run clean`**<br>
  Removes build artifacts from `dist/` folder.

* **`npm run lint`**<br>
  Runs ESLint across the entire project to detect code quality issues.

* **`npm run lint:fix`**<br>
  Automatically fixes ESLint issues where possible.

* **`npm run lint:strict`**<br>
  Runs ESLint and fails if **any warnings** are found.

* **`npm run prettier:check`**<br>
  Checks code formatting using Prettier without making changes.

* **`npm run prettier:write`**<br>
  Formats all supported files using Prettier.

- **`npm run prepare-release`**<br>
  Builds extensions and prepares release files.

</details>

---

## 🧱 Built With

### Core Framework

- **[Electron](https://github.com/electron/electron)** - Cross-platform desktop application framework
- **[Electron Builder](https://github.com/electron-userland/electron-builder)** - Complete solution for packaging and distributing Electron applications

### System & Services

- **[Node.js](https://nodejs.org/)** - JavaScript runtime powering the backend services and build tooling
- **[Express](https://github.com/expressjs/express)** - Lightweight web server used for local RPC and extension communication
- **[cors](https://github.com/expressjs/cors)** - Middleware for enabling Cross-Origin Resource Sharing
- **[electron-updater](https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater)** - Auto-update solution for Electron applications
- **[electron-log](https://github.com/megahertz/electron-log)** - Persistent logging for Electron applications
- **[simple-json-db](https://github.com/nmaggioni/Simple-JSONdb)** - Lightweight JSON-based local storage for configuration and state

### Discord Integration

- **[@xhayper/discord-rpc](https://github.com/xhayper/discord-rpc)** - Discord Rich Presence client implementation

### UI Components

- **[CodeMirror](https://github.com/codemirror/codemirror5)** - In-browser code editor for advanced scripting
- **[SimpleBar](https://github.com/Grsmto/simplebar)** - Custom, cross-browser scrollbars
- **[Flatpickr](https://github.com/flatpickr/flatpickr)** - Lightweight date and time picker

### Build & Packaging

- **[Archiver](https://github.com/archiverjs/node-archiver)** - ZIP archive generation
- **[PostCSS](https://github.com/postcss/postcss)** & **[Autoprefixer](https://github.com/postcss/autoprefixer)** - CSS processing and automatic vendor prefixing
- **[Acorn](https://github.com/acornjs/acorn)** - JavaScript parser
- **[Pako](https://github.com/nodeca/pako)** - High-performance compression library

---

## 📄 License

This project is licensed under the MIT License. See the [`LICENSE`](LICENSE) file for details.
