# 🛡️ Spoiler Blocker

A userscript that hides spoilers on **YouTube** and **Reddit**. It's built for
**iPad Safari** with the free [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
app and also works in Tampermonkey on desktop browsers.

The default blocked keywords are about **GTA VI**. You can change them to
anything.

**[⬇️ Install / view raw script](https://raw.githubusercontent.com/theoyz/IOSBlocker/main/spoiler-blocker.user.js)**

## Install

### iPad / iPhone (Safari + Userscripts app)

1. Install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
   (free) from the App Store and open it once.
2. Turn the extension on: **Settings → Apps → Safari → Extensions →
   Userscripts**. Turn on **Allow Extension** and allow **youtube.com** and
   **reddit.com**.
3. Download [`spoiler-blocker.user.js`](https://raw.githubusercontent.com/theoyz/IOSBlocker/main/spoiler-blocker.user.js): long-press the link →
   **Download Linked File**.
4. Open the **Files** app → **Downloads**, long-press
   `spoiler-blocker.user.js` and tap **Copy**.
5. In the **Files** app, go to **On My iPhone** (or **On My iPad**) → open the
   **Userscripts** folder → long-press an empty spot → **Paste**.
6. Reload YouTube or Reddit in Safari. The 🛡️ button appears in the bottom
   right corner.

The file name must end in **`.user.js`**. If it ends in `.txt`, rename it and
remove the `.txt`.

```
On My iPhone / On My iPad
└── Userscripts
    └── spoiler-blocker.user.js
```

### Desktop (Tampermonkey, Violentmonkey, …)

1. Install the Tampermonkey extension for your browser.
2. Open the [raw script](https://raw.githubusercontent.com/theoyz/IOSBlocker/main/spoiler-blocker.user.js).
3. Click **Install**. Tampermonkey stores the script itself, so there's no
   folder to pick.

### Updates

The script declares `@updateURL` and `@downloadURL`, so script managers that
support them pick up new versions from this repo automatically. In the
Userscripts app, use its "check for updates" option, or replace the file in
your scripts folder with the new one.

## Features

**Everywhere**
- Hides videos, posts and comments that match your blocked keywords.
- Matching ignores spacing and punctuation: `GTA 6` also catches `GTA6`,
  `#GTA6`, `GTA-6` and `gta_6`. Roman numerals and other Unicode variants
  (`Ⅵ` → `VI`) and accents are normalized too.
- Matching pages (video, channel, post, subreddit, profile) are covered by a
  full-screen block screen with **Go back** and **Show anyway**. The tab title
  is replaced, so you never see the spoiler title, and playback is paused.

**YouTube**
- Block whole channels by `@handle` or channel name: their videos, channel
  page and comments are hidden.
- An always-allowed list keeps channels visible even when keywords match
  (default: `@RockstarGames`).
- Filters end screens, the "Up next" card and other in-player suggestions, and
  cancels the autoplay countdown when the next video is blocked.
- Optional: hide Shorts everywhere, open Shorts links in the normal player,
  filter comments, or hide all comments.
- Works on the desktop site (Safari's default on iPad) and on m.youtube.com.

**Reddit**
- Works on new Reddit and old.reddit.com.
- Block subreddits and users (`r/name`, `u/name`) and keep an allow list.
- Filters posts, comments (hiding a comment also hides its replies), search
  results and sidebar links.

**Settings panel**
- iOS 26-style panel: tap the 🛡️ button (bottom right) or add `#ytsb` to the
  URL.
- Each site has its own on/off switch.
- An "On this page" card lets you block or always-allow the current channel,
  subreddit or user with one tap.
- Export and import your config as JSON.

## Usage

- Tap the **🛡️ button** (bottom right) to open the settings.
- Add **blocked words** (comma-separated). They apply on both sites.
- Block or always-allow **YouTube channels** and **Reddit subreddits/users**,
  either in the lists or from the "On this page" card.
- Turn features on and off per site.
- **Back up** with "Copy config" or "Download .json". **Restore** by pasting
  into the box and tapping "Import pasted", or with "Import file…". Importing
  replaces your current settings.
- If you hid the button, add `#ytsb` to the address
  (e.g. `youtube.com/#ytsb` or `reddit.com/#ytsb`) to open the panel.

The defaults in the script only apply on first run or after
**Reset to defaults**. After that, your saved settings are used, and editing
`DEFAULTS` in the file has no effect.

## Config format

Exported config is plain JSON. All keys are optional on import; missing or
invalid values fall back to the defaults, unknown keys are dropped, and each
list is limited to 1000 entries of up to 200 characters.

```json
{
  "app": "spoiler-blocker",
  "version": 3,
  "appVersion": "3.2.3",
  "build": 12,

  "blockedWords": ["GTA 6", "GTA VI", "Leonida", "Vice City"],
  "showButton": true,

  "youtubeEnabled": true,
  "blockedChannels": ["@SomeChannel", "Some Channel Name"],
  "allowedChannels": ["@RockstarGames"],
  "hideShorts": false,
  "redirectShorts": true,
  "blockPages": true,
  "filterComments": true,
  "hideAllComments": false,

  "redditEnabled": true,
  "redditBlocked": ["r/GTA6", "u/someone"],
  "redditAllowed": [],
  "redditBlockPages": true,
  "redditFilterComments": true
}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `blockedWords` | string[] | Keywords for both sites. A trailing plural "s" also matches. |
| `showButton` | bool | Show the floating 🛡️ button. |
| `youtubeEnabled` | bool | Master switch for YouTube. |
| `blockedChannels` | string[] | `@handle` (most reliable) or a channel name (matched like a keyword). |
| `allowedChannels` | string[] | `@handle`s that keywords never hide. Comments under them are still filtered. |
| `hideShorts` | bool | Hide Shorts shelves, items, tabs and menu entries. |
| `redirectShorts` | bool | Open `/shorts/…` links in the normal player. |
| `blockPages` | bool | Block screen on matching video and channel pages. |
| `filterComments` | bool | Hide matching YouTube comments. |
| `hideAllComments` | bool | Hide the YouTube comment section completely. |
| `redditEnabled` | bool | Master switch for Reddit. |
| `redditBlocked` | string[] | `r/name` or `u/name`. `/r/name/` and `user/name` are normalized on import. |
| `redditAllowed` | string[] | `r/name` or `u/name` that keywords never hide. Comments are still filtered. |
| `redditBlockPages` | bool | Block screen on matching posts, subreddits and profiles. |
| `redditFilterComments` | bool | Hide matching Reddit comments. |

`app`, `version`, `appVersion` and `build` are informational and ignored on
import. Exports from older versions import fine.

## Limitations

- Works only in Safari (or another browser with a userscript manager), **not
  in the YouTube or Reddit apps**.
- Safari's own "Open in app" banner can't be removed by a script. It only goes
  away if you uninstall the app.
- **Reddit search suggestions** can't be filtered, because they live in a
  closed shadow DOM.
- Allowed YouTube channels can still be hidden where no channel link is shown
  (end screen, some sidebar cards), because the script can't tell who uploaded
  the video there.
- Broad keywords like `Jason` or `Lucia` (in the defaults) also hide unrelated
  content. Remove them if that bothers you.
- YouTube and Reddit change their page markup often, so some spots may slip
  through until the script is updated.

## Privacy

- **No network requests.** The script never contacts any server, and nothing
  is tracked or sent anywhere.
- **No external code.** Everything is in the single `.user.js` file, with no
  libraries and no remote includes.
- Settings are stored **locally** in your script manager's storage (or the
  site's `localStorage` as a fallback). They leave your device only when you
  export them yourself.
- The `@updateURL` / `@downloadURL` checks are done by your script manager,
  not by the script.

## Development

The `tests/` folder has jsdom smoke tests that load the script into fake
YouTube and Reddit pages:

```sh
cd tests
npm install
npm test
```

- `run.js` covers Reddit (feed, sidebar links, post and subreddit block
  screens, title protection, new and old Reddit comments, the panel's quick
  actions) and a YouTube feed check, including the allow list.
- `run2.js` covers the settings panel on YouTube: CSS injection when
  `GM.addStyle` fails (Trusted Types), card order, and the per-site on/off
  switch hiding and unhiding videos.
- `run3.js` covers the YouTube player: end screens, the fullscreen grid,
  unknown card types, the "Up next" card and the autoplay cancel.

Each test uses `../spoiler-blocker.user.js` by default. To test another file,
pass its path: `node run.js path/to/script.user.js`. A failing check prints
`FAIL` and makes `npm test` exit non-zero.

### Releasing

1. Bump `// @version`, `const VERSION` and `const BUILD` together in
   `spoiler-blocker.user.js`. `BUILD` goes up by one on every release.
2. Add an entry to `CHANGELOG.md`.
3. Run the tests.
4. Merge to `main`, then tag and release it as `vX.Y.Z`.

Script managers compare `@version`, so an update is only offered when it
increases.

## License

[MIT](LICENSE)
