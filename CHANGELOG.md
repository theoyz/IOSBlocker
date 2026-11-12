# Changelog

All notable changes to Spoiler Blocker. Each release bumps `@version`,
`VERSION` and `BUILD` in `spoiler-blocker.user.js` together.

## 3.2.3 (Build 12)

First public release on GitHub.

- Hides YouTube videos, playlists, channels, posts, end-screen cards, search
  suggestions and comments that match blocked keywords.
- Hides Reddit posts, comments, sidebar/search links, subreddits and users on
  new Reddit and old.reddit.com.
- Flexible matching: ignores spacing and punctuation ("GTA 6" also catches
  GTA6, #GTA6, GTA-6, gta_6), Unicode variants (Ⅵ → VI) and accents.
- YouTube channel block list (`@handle` or name) and allow list (default
  `@RockstarGames`).
- Reddit block and allow lists (`r/name`, `u/name`).
- Full-screen block screen on matching video, channel, post, subreddit and
  profile pages, with "Go back" and "Show anyway". The tab title is replaced
  so the spoiler title is never shown, and playback is paused.
- Cancels YouTube's autoplay countdown when "Up next" is blocked.
- Optional Shorts hiding; Shorts links open in the normal player.
- Optional "hide all comments" on YouTube.
- iOS 26-style settings panel (🛡️ button or `#ytsb` in the URL) with a
  per-site on/off switch, "On this page" quick block/allow, and JSON
  export/import.
- `@updateURL` / `@downloadURL` so script managers can update automatically.
