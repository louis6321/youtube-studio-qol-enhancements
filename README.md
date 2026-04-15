# YouTube Live Studio QOL — README

A Tampermonkey userscript that improves the YouTube Studio / Live workflow by showing full titles and applying a set of small quality-of-life fixes and UI tweaks.

If you have Tampermonkey installed, click here to install the script: [yt-studio-qol-enhancements.user.js](https://github.com/louis6321/youtube-studio-qol-enhancements/raw/refs/heads/main/yt-studio-qol-enhancements.user.js)

**Summary**
- **Purpose**: Reveal full video titles, add convenient controls (copy URL), improve Live ingestion UI, and provide optional sorting/visibility helpers across YouTube Studio.
- **Script**: `YouTube Live Studio QOL`.
- **Runs on**: `https://studio.youtube.com/*` (see the script `@match` metadata).

**Key Features**
- **Title wrapping / intrinsic width**: Toggle between wrapping long titles (multi-line) or keeping titles inline with intrinsic width so full text is visible.
- **Description handling**: In wrap mode the inline descriptions are hidden; in non-wrap mode descriptions are truncated to a configurable length.
- **Hide "useless" info**: Optionally hide table cells that contain redundant values (for example, `Streaming software` / `None`).
- **Rows per page**: Optionally set the videos table to `50` rows per page automatically.
- **Account switcher alphabetical sort**: Sort channel/account entries alphabetically when account menus open.
- **Visibility warnings**: Small emoji indicators next to visibility labels (Public / Unlisted / Private / Age-restricted) for quick scanning.
- **Copy Stream URL column & compact button**: Adds a compact `Copy Stream URL` icon column (left of the "Type" column) that copies the video watch URL to clipboard with fallback support.
- **Optional stream title sorting (A→Z)**: On `/livestreaming` pages you can enable alphabetical sorting of streams while preserving section groupings (e.g., "Live now" / "Upcoming").
- **Stream key / ingestion sizing**: Always-on fix to widen the ingestion dropdown so the Stream Key isn't truncated.
- **Menu-safe DOM changes**: Avoids re-running DOM mutations while menus/popups are open (prevents menus from auto-closing).
- **Channel "videos/live" overlay**: Shows a warning overlay on unsupported `/channel/.../videos/live` pages with a shortcut to the correct `livestreaming` page and an option to suppress the warning.
- **Persistent settings & menu commands**: Toggle features via the Tampermonkey menu; options persist using GM storage.

**Installation (Tampermonkey)**
1. Install Tampermonkey for your browser (Chrome/Edge/Firefox/Edge Chromium).
2. Direct install (recommended if hosting is available): open the [script URL](https://github.com/louis6321/youtube-studio-qol-enhancements/raw/refs/heads/main/yt-studio-qol-enhancements.user.js) in the browser and let Tampermonkey import it.
3. Manual install: open Tampermonkey → Dashboard → `+` (Add a new script). Copy the entire contents of [yt-studio-qol-enhancements.user.js](yt-studio-qol-enhancements.user.js) and paste into the editor, then `File → Save`.
4. Open YouTube Studio to verify the script is active.

**Usage & Configuration**
- Access the script menu via the Tampermonkey extension icon → the userscript's menu commands.
- Menu entries are labelled with `(ON)` / `(OFF)` to show current state; toggling updates settings immediately.
- Settings persist across sessions using `GM_setValue` / `GM_getValue`.

**Behavior notes**
- The script avoids heavy DOM mutations while menus or popups are open to prevent accidental menu closures.
- It hooks into SPA navigation (history push/replace/popstate) so the UI tweaks re-apply after YouTube's internal navigation.
- Copy button uses the modern Clipboard API with a textarea fallback to support older browser contexts.

**Troubleshooting**
- If a feature does not appear to work: ensure the script is `Enabled` in Tampermonkey and that the page URL matches `studio.youtube.com`.
- Disable other userscripts that may alter the same Studio elements to rule out conflicts.
- Open the browser DevTools Console (F12) and look for errors from the script.

**Compatibility & Maintenance**
- Works on modern browsers supporting Tampermonkey. YouTube Studio's markup changes may break selectors; the script may need updates when that happens.

**Files**
- Script: [yt-studio-qol-enhancements.user.js](yt-studio-qol-enhancements.user.js)