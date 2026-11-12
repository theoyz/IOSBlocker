// ==UserScript==
// @name         Spoiler Blocker
// @namespace    spoiler-blocker
// @version      3.2.3
// @description  Spoiler blocker for YouTube and Reddit. Hides videos, channels, posts, subreddits, users and comments matching your blocked words (GTA VI by default), blocks matching pages without revealing titles, and removes YouTube Shorts. Settings panel with import/export.
// @homepageURL  https://github.com/theoyz/IOSBlocker
// @supportURL   https://github.com/theoyz/IOSBlocker/issues
// @updateURL    https://raw.githubusercontent.com/theoyz/IOSBlocker/main/spoiler-blocker.user.js
// @downloadURL  https://raw.githubusercontent.com/theoyz/IOSBlocker/main/spoiler-blocker.user.js
// @license      MIT
// @match        *://*.youtube.com/*
// @match        *://*.reddit.com/*
// @run-at       document-start
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.setClipboard
// @grant        GM.addStyle
// @grant        GM.registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  /* ======================= DEFAULT SETTINGS =======================
     Only used on first run. After that, change everything in the
     settings panel (🛡️ button, bottom right). */
  const DEFAULTS = {
    // ---- shared by all sites ----
    blockedWords: [
      'GTA 6', 'GTA6', 'GTA VI', 'GTAVI',
      'Grand Theft Auto 6', 'GrandTheftAuto6', 'Grand Theft Auto VI', 'GrandTheftAutoVI',
      'Leonida', 'Vice City', 'ViceCity',
      'Jason Duval', 'JasonDuval', 'Lucia Caminos', 'LuciaCaminos',
      'Jason', 'Lucia',   // broad: also hides other videos/posts with these names
    ],
    showButton: true,

    // ---- YouTube ----
    youtubeEnabled: true,
    blockedChannels: [],                 // "@handle" or channel name
    allowedChannels: ['@RockstarGames'], // never hidden by keywords
    hideShorts: false,
    redirectShorts: true,
    blockPages: true,
    filterComments: true,
    hideAllComments: false,

    // ---- Reddit ----
    redditEnabled: true,
    redditBlocked: [],                   // "r/subreddit" or "u/user"
    redditAllowed: [],                   // never hidden by keywords
    redditBlockPages: true,
    redditFilterComments: true,
  };
  /* ================================================================ */

  // ---- version info (keep in sync with @version above) ----
  const VERSION = '3.2.3';
  const BUILD = 12;            // increases with every release

  const SITE = /(^|\.)reddit\.com$/i.test(location.hostname) ? 'reddit' : 'youtube';

  const STORE_KEY = 'ytsb-config';
  const ATTR = 'data-ytsb-hidden';
  const BLOCKED_TITLE = SITE === 'reddit' ? 'Blocked – Reddit' : 'Blocked – YouTube';
  const MAX_ENTRIES = 1000;           // per list
  const MAX_ENTRY_LEN = 200;          // characters per entry
  const MAX_IMPORT_BYTES = 512 * 1024;

  const LIST_KEYS = ['blockedWords', 'blockedChannels', 'allowedChannels', 'redditBlocked', 'redditAllowed'];
  const BOOL_KEYS = ['showButton', 'youtubeEnabled', 'hideShorts', 'redirectShorts', 'blockPages', 'filterComments',
    'hideAllComments', 'redditEnabled', 'redditBlockPages', 'redditFilterComments'];

  let cfg = clone(DEFAULTS);

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // "r/GTA6", "/r/GTA6/", "u/name", "/user/name" -> "r/GTA6" / "u/name"; otherwise null
  function canonReddit(s) {
    const m = String(s).trim().match(/^\/?(r|u|user)\/([\w-]{2,})\/?$/i);
    return m ? (m[1].toLowerCase() === 'r' ? 'r/' : 'u/') + m[2] : null;
  }

  // ---------- storage (GM storage if available, else localStorage) ----------
  const hasGM = typeof GM !== 'undefined' && GM && typeof GM.getValue === 'function';

  function sanitize(obj) {
    const out = clone(DEFAULTS);
    if (!obj || typeof obj !== 'object') return out;
    for (const k of LIST_KEYS) {
      if (!Array.isArray(obj[k])) continue;
      let vals = obj[k].filter(v => typeof v === 'string').map(v => v.trim().slice(0, MAX_ENTRY_LEN));
      if (k.startsWith('reddit')) vals = vals.map(canonReddit);
      // limits keep a malformed/huge import from freezing the page
      const seen = new Set();
      out[k] = vals.filter(v => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()))
        .slice(0, MAX_ENTRIES);
    }
    for (const k of BOOL_KEYS) if (typeof obj[k] === 'boolean') out[k] = obj[k];
    return out;
  }

  async function loadConfig() {
    let raw = null;
    try { raw = hasGM ? await GM.getValue(STORE_KEY, null) : localStorage.getItem(STORE_KEY); } catch (_) {}
    if (raw) { try { cfg = sanitize(JSON.parse(raw)); } catch (_) {} }
  }

  async function saveConfig() {
    const s = JSON.stringify(cfg);
    try { if (hasGM) await GM.setValue(STORE_KEY, s); else localStorage.setItem(STORE_KEY, s); } catch (_) {}
  }

  // ---------- matching ----------
  const norm = s => (s || '')
    .normalize('NFKD')                       // "Ⅵ" -> "VI", "é" -> "e"
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ');       // "gta_6_leak" -> "gta 6 leak"
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isHandle = c => c.trim().startsWith('@');
  const dec = s => { try { return decodeURIComponent(s); } catch (_) { return s; } };

  let ytWordRe = null, rdWordRe = null, blockHandleRe = null, allowHandleRe = null;
  let rBlock = new Set(), rAllow = new Set();
  let cache = new WeakMap();

  function mkWordRe(list) {
    const p = list.map(w => norm(w).trim()).filter(Boolean)
      .map(w => w.split(' ').map(esc).join(' ?'));   // "gta 6" also matches "gta6"
    return p.length ? new RegExp('(?:^| )(?:' + p.join('|') + ')s?(?= |$)') : null;
  }
  function mkHandleRe(list) {
    const h = list.filter(isHandle).map(c => c.trim().slice(1).toLowerCase()).filter(Boolean);
    return h.length ? new RegExp('/@(?:' + h.map(esc).join('|') + ')(?![\\w.-])', 'i') : null;
  }

  function compile() {
    ytWordRe = mkWordRe([...cfg.blockedWords, ...cfg.blockedChannels.filter(c => !isHandle(c))]);
    rdWordRe = mkWordRe(cfg.blockedWords);
    blockHandleRe = mkHandleRe(cfg.blockedChannels);
    allowHandleRe = mkHandleRe(cfg.allowedChannels);
    rBlock = new Set(cfg.redditBlocked.map(v => v.toLowerCase()));
    rAllow = new Set(cfg.redditAllowed.map(v => v.toLowerCase()));
    cache = new WeakMap();
    const de = document.documentElement;
    const yt = SITE === 'youtube' && cfg.youtubeEnabled;
    de.toggleAttribute('data-ytsb-noshorts', yt && cfg.hideShorts);
    de.toggleAttribute('data-ytsb-nocomments', yt && cfg.hideAllComments);
  }

  function wordHit(re, text) {
    if (!re) return null;
    const m = norm(text).match(re);
    return m ? '“' + m[0].trim() + '”' : null;
  }

  // YouTube: returns null (ok) or a short reason string
  function ytVerdict(text, hrefs, useAllow) {
    const h = dec(hrefs);
    if (useAllow && allowHandleRe && allowHandleRe.test(h)) return null;
    if (blockHandleRe && blockHandleRe.test(h)) return 'blocked channel';
    return wordHit(ytWordRe, text);
  }

  // Reddit: sub = "GTA6" / "r/GTA6", author = "name" / "u/name"
  function rVerdict(text, sub, author, useAllow) {
    const ids = [];
    if (sub) ids.push('r/' + String(sub).replace(/^\/?r\//i, '').toLowerCase());
    if (author) ids.push('u/' + String(author).replace(/^\/?(u|user)\//i, '').toLowerCase());
    if (useAllow && ids.some(i => rAllow.has(i))) return null;
    const b = ids.find(i => rBlock.has(i));
    if (b) return 'blocked ' + b;
    return wordHit(rdWordRe, text);
  }

  function textOf(el) {
    let t = el.textContent || '';
    if (el.getAttribute) t += ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '');
    for (const n of el.querySelectorAll('[aria-label],[title]')) {
      t += ' ' + (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('title') || '');
    }
    return t;
  }
  function hrefsOf(el) {
    let h = '';
    for (const a of el.querySelectorAll('a[href]')) h += ' ' + a.getAttribute('href');
    return h;
  }

  // Sites recycle elements, so cache per element + current content.
  function cached(el, key, fn) {
    const c = cache.get(el);
    if (c && c.key === key) return c.hit;
    const hit = !!fn();
    cache.set(el, { key, hit });
    return hit;
  }

  function toggle(el, hide) {
    if (hide) { if (!el.hasAttribute(ATTR)) el.setAttribute(ATTR, ''); }
    else if (el.hasAttribute(ATTR)) el.removeAttribute(ATTR);
  }

  function unhideAll() {
    for (const n of document.querySelectorAll('[' + ATTR + ']')) n.removeAttribute(ATTR);
  }

  /* =============================== YOUTUBE =============================== */

  const YT_ITEM_SEL = [
    // desktop site (iPad Safari default)
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
    'ytd-compact-video-renderer', 'yt-lockup-view-model',
    'ytd-playlist-renderer', 'ytd-compact-playlist-renderer',
    'ytd-radio-renderer', 'ytd-compact-radio-renderer',
    'ytd-channel-renderer', 'ytd-playlist-panel-video-renderer',
    'ytd-reel-item-renderer', 'ytd-universal-watch-card-renderer',
    'ytd-post-renderer', 'ytd-backstage-post-thread-renderer',
    'ytd-notification-renderer', 'ytd-movie-renderer',
    // player end screens / autoplay card
    '.ytp-videowall-still', '.ytp-modern-videowall-still', '.ytp-ce-element',
    '.ytp-autonav-endscreen-upnext-container', '.ytp-suggestion-set',
    // search suggestions
    '.ytSearchboxComponentSuggestionsContainer [role="option"]', '.sbsb_c',
    // mobile site (m.youtube.com)
    'ytm-video-with-context-renderer', 'ytm-compact-video-renderer',
    'ytm-rich-item-renderer', 'ytm-playlist-renderer', 'ytm-compact-playlist-renderer',
    'ytm-radio-renderer', 'ytm-compact-radio-renderer', 'ytm-compact-channel-renderer',
    'ytm-video-card-renderer', 'ytm-media-item', 'ytm-backstage-post-thread-renderer',
  ].join(',');

  // comments: matched by text AND by author (blocked channels), allow-list not applied
  const YT_COMMENT_SEL = [
    'ytd-comment-thread-renderer', 'ytd-comment-view-model', 'ytd-comment-renderer',
    'ytm-comment-thread-renderer', 'ytm-comment-renderer',
  ].join(',');

  const YT_CHIP_SEL = 'yt-chip-cloud-chip-renderer, ytm-chip-cloud-chip-renderer, chip-shape';

  function ytIsBlocked(el, useAllow) {
    const t = textOf(el), h = hrefsOf(el);
    return cached(el, (useAllow ? '1' : '0') + t + '\u0000' + h, () => ytVerdict(t, h, useAllow));
  }

  // Shorts redirect
  function redirectShorts() {
    if (SITE !== 'youtube' || !cfg.youtubeEnabled || !cfg.redirectShorts) return;
    const m = location.pathname.match(/^\/shorts\/([\w-]{5,})/);
    if (m) location.replace('/watch?v=' + m[1]);
  }

  if (SITE === 'youtube') {
    document.addEventListener('click', e => {
      if (!cfg.youtubeEnabled || !cfg.redirectShorts || !(e.target instanceof Element)) return;
      const a = e.target.closest('a[href*="/shorts/"]');
      if (!a) return;
      const m = a.getAttribute('href').match(/\/shorts\/([\w-]{5,})/);
      if (!m) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      location.href = '/watch?v=' + m[1];
    }, true);
  }

  function ytPageInfo() {
    const p = location.pathname;
    if (p === '/watch') {
      const title = document.querySelector(
        'ytd-watch-metadata #title, ytd-watch-metadata h1, h1.title, ' +
        '.slim-video-information-title, .slim-video-metadata-title');
      const owner = document.querySelector(
        'ytd-watch-metadata #owner, #upload-info, ytm-slim-owner-renderer, .slim-owner-icon-and-title');
      const t = title ? textOf(title) : fallbackTitle();
      return { text: t + ' ' + (owner ? textOf(owner) : ''), hrefs: owner ? hrefsOf(owner) : '' };
    }
    if (/^\/(@|channel\/|c\/|user\/)/.test(p)) {
      const header = document.querySelector(
        '#page-header, yt-page-header-renderer, ytd-c4-tabbed-header-renderer, ' +
        'ytm-c4-tabbed-header-renderer, .page-header-view-model-wiz');
      return { text: header ? header.textContent : '', hrefs: p };
    }
    return null;
  }

  function ytCurrentChannel() {
    const p = location.pathname;
    let m = p.match(/^\/@([^/?#]+)/);
    if (m) {
      const n = document.querySelector(
        '#page-header h1, yt-page-header-renderer h1, .page-header-view-model-wiz__page-header-title, ' +
        'ytd-c4-tabbed-header-renderer #channel-name #text, ytm-c4-tabbed-header-renderer h1');
      return { handle: '@' + dec(m[1]), name: n ? n.textContent.trim() : '' };
    }
    if (p === '/watch') {
      const a = document.querySelector(
        'ytd-watch-metadata #owner a[href^="/@"], #owner a[href^="/@"], ytm-slim-owner-renderer a[href^="/@"]');
      m = a && a.getAttribute('href').match(/^\/@([^/?#]+)/);
      if (m) {
        const n = document.querySelector(
          'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, .slim-owner-channel-name');
        return { handle: '@' + dec(m[1]), name: n ? n.textContent.trim() : '' };
      }
    }
    return null;
  }

  // Video player end screen, "up next" card, fullscreen grid, pause overlay, info cards …
  // Any video link inside the player is checked, so YouTube renaming classes doesn't matter.
  const YT_PLAYER_LINK_SEL = '.html5-video-player a[href*="watch?v="], .html5-video-player a[href*="/shorts/"]';
  const YT_PLAYER_CARD_SEL = [
    '.ytp-modern-videowall-still', '.ytp-videowall-still', '.ytp-fullscreen-grid-still',
    '.ytp-ce-element', '.ytp-autonav-endscreen-upnext-container', '.ytp-suggestion-set',
    '.ytp-suggestion-link', '.ytp-cards-teaser', '.iv-card',
  ].join(',');
  const YT_PLAYER_SKIP_SEL = '.ytp-title, .ytp-title-link, .ytp-title-channel, .ytp-chrome-top-buttons';

  let lastCancelledUpNext = '';

  function scanYouTube() {
    const marks = new Map();
    const mark = (n, hit) => marks.set(n, (marks.get(n) || false) || hit);

    for (const n of document.querySelectorAll(YT_ITEM_SEL)) mark(n, ytIsBlocked(n, true));
    for (const a of document.querySelectorAll(YT_PLAYER_LINK_SEL)) {
      if (a.closest(YT_PLAYER_SKIP_SEL)) continue;   // the current video's own title bar
      const card = a.closest(YT_PLAYER_CARD_SEL) || a;
      mark(card, ytIsBlocked(card, true) || ytIsBlocked(a, true));
    }
    for (const n of document.querySelectorAll(YT_COMMENT_SEL)) mark(n, cfg.filterComments && ytIsBlocked(n, false));
    for (const n of document.querySelectorAll(YT_CHIP_SEL)) {
      mark(n, cfg.hideShorts && /^shorts$/i.test((n.textContent || '').trim()));
    }
    for (const [n, hit] of marks) toggle(n, hit);

    // don't autoplay into a spoiler: cancel the countdown when "up next" is blocked
    const up = document.querySelector('.ytp-autonav-endscreen-upnext-container');
    if (up && up.hasAttribute(ATTR)) {
      const player = up.closest('.html5-video-player');
      const key = textOf(up);
      if (player && player.classList.contains('ended-mode') && key !== lastCancelledUpNext) {
        const cancel = up.querySelector('.ytp-autonav-endscreen-upnext-cancel-button') ||
          (player && player.querySelector('.ytp-autonav-endscreen-upnext-cancel-button'));
        if (cancel) { cancel.click(); lastCancelledUpNext = key; }
      }
    }
  }

  /* =============================== REDDIT =============================== */
  // New Reddit ("shreddit", iPad default) + old.reddit.com

  const postId = s => { const m = String(s || '').match(/\/comments\/(\w+)/); return m ? m[1] : null; };
  const subFromHref = s => { const m = String(s || '').match(/\/r\/([\w-]+)/); return m ? m[1] : ''; };

  function redditMainPost(id) {
    for (const p of document.querySelectorAll('shreddit-post')) {
      if (postId(p.getAttribute('permalink')) === id) {
        return { title: p.getAttribute('post-title') || '', author: p.getAttribute('author') || '' };
      }
    }
    const old = document.querySelector('.thing.link[data-fullname="t3_' + id + '"]');
    if (old) {
      const t = old.querySelector('a.title');
      return { title: t ? t.textContent : '', author: old.getAttribute('data-author') || '' };
    }
    return null;
  }

  function redditPageInfo() {
    const p = location.pathname;
    const id = postId(p);
    if (id) {
      const main = redditMainPost(id);
      const title = main && main.title ? main.title : fallbackTitle();
      return { text: p + ' ' + title, sub: subFromHref(p), author: main ? main.author : '' };
    }
    let m = p.match(/^\/r\/([\w-]+)/);
    if (m) return { text: p, sub: m[1], author: '' };
    m = p.match(/^\/(?:u|user)\/([\w-]+)/);
    if (m) return { text: p, sub: '', author: m[1] };
    return null;   // home, popular, search … filtered per post instead
  }

  function scanReddit() {
    const marks = new Map();
    const mark = (el, hit) => marks.set(el, (marks.get(el) || false) || hit);
    const curId = postId(location.pathname);
    const mainAllowed = curId && allowedPages.has(pageKey());

    // posts – new Reddit
    for (const p of document.querySelectorAll('shreddit-post, shreddit-ad-post')) {
      const perm = p.getAttribute('permalink') || '';
      const text = (p.getAttribute('post-title') || '') + ' ' + p.textContent + ' ' + perm +
        ' ' + (p.getAttribute('content-href') || '');
      const sub = p.getAttribute('subreddit-prefixed-name') || p.getAttribute('subreddit-name') || subFromHref(perm);
      const author = p.getAttribute('author') || '';
      let hit = cached(p, text + '\u0000' + sub + '\u0000' + author, () => rVerdict(text, sub, author, true));
      if (mainAllowed && postId(perm) === curId) hit = false;   // "Show anyway" on this post
      mark(p.closest('article') || p, hit);
    }

    // posts – old Reddit
    for (const t of document.querySelectorAll('.thing.link')) {
      const title = t.querySelector('a.title');
      const exp = t.querySelector('.expando');
      const text = (title ? title.textContent : '') + ' ' + (exp ? exp.textContent : '') + ' ' +
        (t.getAttribute('data-permalink') || '') + ' ' + (t.getAttribute('data-url') || '');
      const sub = t.getAttribute('data-subreddit') || '';
      const author = t.getAttribute('data-author') || '';
      let hit = cached(t, text + '\u0000' + sub + '\u0000' + author, () => rVerdict(text, sub, author, true));
      if (mainAllowed && t.getAttribute('data-fullname') === 't3_' + curId) hit = false;
      mark(t, hit);
    }

    // comments (own text + author; hiding one also hides its replies)
    for (const c of document.querySelectorAll('shreddit-comment')) {
      if (!cfg.redditFilterComments) { mark(c, false); continue; }
      const body = c.querySelector(':scope > [slot="comment"]');
      const text = body ? body.textContent : '';
      const author = c.getAttribute('author') || '';
      mark(c, cached(c, text + '\u0000' + author, () => rVerdict(text, '', author, false)));
    }
    for (const c of document.querySelectorAll('.thing.comment')) {
      if (!cfg.redditFilterComments) { mark(c, false); continue; }
      const body = c.querySelector(':scope > .entry .usertext-body');
      const text = body ? body.textContent : '';
      const author = c.getAttribute('data-author') || '';
      mark(c, cached(c, text + '\u0000' + author, () => rVerdict(text, '', author, false)));
    }

    // any other link to a post: search results, sidebars, "related", recent …
    for (const a of document.querySelectorAll('a[href*="/comments/"]')) {
      if (a.closest('shreddit-post, shreddit-ad-post, shreddit-comment, .thing, #ytsb-panel, #ytsb-overlay')) continue;
      const href = a.getAttribute('href') || '';
      if (mainAllowed && postId(href) === curId) continue;
      const text = textOf(a) + ' ' + href;
      const hit = cached(a, text, () => rVerdict(text, subFromHref(href), '', true));
      mark(a.closest('[data-testid="search-post-unit"], li, article') || a, hit);
    }

    // community / user links in search results and sidebars
    for (const a of document.querySelectorAll('a[href^="/r/"], a[href^="/user/"], a[href^="/u/"]')) {
      if (a.closest('shreddit-post, shreddit-ad-post, shreddit-comment, .thing, #ytsb-panel, #ytsb-overlay, nav, header')) continue;
      const href = a.getAttribute('href') || '';
      if (/\/comments\//.test(href)) continue;
      const um = href.match(/^\/(?:u|user)\/([\w-]+)/);
      const sm = href.match(/^\/r\/([\w-]+)\/?$/);
      if (!um && !sm) continue;
      const ids = sm ? 'r/' + sm[1].toLowerCase() : 'u/' + um[1].toLowerCase();
      if (rBlock.has(ids)) mark(a.closest('[data-testid="search-community"], li') || a, true);
    }

    for (const [el, hit] of marks) toggle(el, hit);
  }

  function redditQuickTargets() {
    const out = [];
    const t = v => ({ label: v, blockKey: 'redditBlocked', allowKey: 'redditAllowed', blockVals: [v], allowVals: [v] });
    const p = location.pathname;
    let m = p.match(/^\/r\/([\w-]+)/);
    if (m) out.push(t('r/' + m[1]));
    m = p.match(/^\/(?:u|user)\/([\w-]+)/);
    if (m) out.push(t('u/' + m[1]));
    const id = postId(p);
    if (id) {
      const main = redditMainPost(id);
      if (main && main.author && !/^\[?deleted\]?$/i.test(main.author)) out.push(t('u/' + main.author));
    }
    return out;
  }

  /* ================================ CSS ================================ */

  const S = 'html[data-ytsb-noshorts] ';
  const shortsPlain = [
    'ytd-reel-shelf-renderer', 'ytd-rich-shelf-renderer[is-shorts]', 'ytd-reel-item-renderer',
    'ytm-reel-shelf-renderer', 'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]', 'yt-tab-shape[tab-title="Shorts"]',
  ];
  const shortsHas = [
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
    'ytd-rich-shelf-renderer:has(ytm-shorts-lockup-view-model)',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
    'ytd-shelf-renderer:has(a[href*="/shorts/"])',
    'ytd-rich-item-renderer:has(a[href*="/shorts/"])',
    'ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model)',
    'ytd-video-renderer:has(a[href*="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href*="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href*="/shorts/"])',
    'yt-lockup-view-model:has(a[href*="/shorts/"])',
    'ytm-video-with-context-renderer:has(a[href*="/shorts/"])',
    'ytm-rich-item-renderer:has(a[href*="/shorts/"])',
    'ytm-rich-item-renderer:has(ytm-shorts-lockup-view-model)',
    'ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
    'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
  ];
  const C = 'html[data-ytsb-nocomments] ';
  const commentsAll = [
    'ytd-comments', '#comments', 'ytm-comments-entry-point-header-renderer',
    'ytm-comment-section-renderer', 'ytd-engagement-panel-section-list-renderer[target-id*="comment"]',
  ];

  const css = `
    [${ATTR}] { display: none !important; }
    ${shortsPlain.map(s => S + s).join(',\n')} { display: none !important; }
    ${shortsHas.map(s => S + s + ' { display: none !important; }').join('\n')}
    ${commentsAll.map(s => C + s).join(',\n')} { display: none !important; }

    /* ======================= iOS 26 "Liquid Glass" look ======================= */
    #ytsb-panel, #ytsb-overlay, #ytsb-fab {
      --ytsb-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
      /* light */
      --ytsb-sheet: rgba(246, 246, 250, .72);
      --ytsb-cell: rgba(255, 255, 255, .72);
      --ytsb-cell-head: rgba(255, 255, 255, .9);
      --ytsb-label: #000;
      --ytsb-secondary: rgba(60, 60, 67, .62);
      --ytsb-sep: rgba(60, 60, 67, .16);
      --ytsb-fill: rgba(120, 120, 128, .14);
      --ytsb-fill-strong: rgba(120, 120, 128, .22);
      --ytsb-edge: rgba(255, 255, 255, .75);
      --ytsb-blue: #007aff;
      --ytsb-green: #34c759;
      --ytsb-red: #ff3b30;
      --ytsb-shadow: 0 24px 60px rgba(0, 0, 0, .22), 0 2px 8px rgba(0, 0, 0, .08);
    }
    @media (prefers-color-scheme: dark) {
      #ytsb-panel, #ytsb-overlay, #ytsb-fab {
        --ytsb-sheet: rgba(28, 28, 30, .7);
        --ytsb-cell: rgba(58, 58, 62, .52);
        --ytsb-cell-head: rgba(72, 72, 76, .6);
        --ytsb-label: #fff;
        --ytsb-secondary: rgba(235, 235, 245, .6);
        --ytsb-sep: rgba(255, 255, 255, .1);
        --ytsb-fill: rgba(120, 120, 128, .28);
        --ytsb-fill-strong: rgba(120, 120, 128, .4);
        --ytsb-edge: rgba(255, 255, 255, .16);
        --ytsb-blue: #0a84ff;
        --ytsb-green: #30d158;
        --ytsb-red: #ff453a;
        --ytsb-shadow: 0 24px 60px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .3);
      }
    }

    /* ---------- block screen ---------- */
    #ytsb-overlay {
      position: fixed !important; inset: 0 !important; z-index: 2147483646 !important;
      /* dark + heavy blur so nothing behind it is readable */
      background: rgba(0, 0, 0, .82) !important; opacity: 1 !important;
      -webkit-backdrop-filter: blur(50px) saturate(160%); backdrop-filter: blur(50px) saturate(160%);
      display: flex; align-items: center; justify-content: center; padding: 20px;
      font: 17px/1.35 var(--ytsb-font); color: #fff !important; text-align: center;
      -webkit-font-smoothing: antialiased;
    }
    #ytsb-overlay .ytsb-box {
      max-width: 400px; width: 100%; padding: 32px 26px 22px; border-radius: 34px;
      background: rgba(58, 58, 62, .5); border: .5px solid rgba(255, 255, 255, .16);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14), 0 30px 80px rgba(0, 0, 0, .5);
      -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%);
    }
    #ytsb-overlay .ytsb-icon { font-size: 52px; line-height: 1; }
    #ytsb-overlay .ytsb-h { font-size: 22px; font-weight: 700; letter-spacing: -.01em; margin: 14px 0 6px; }
    #ytsb-overlay .ytsb-p { color: rgba(235, 235, 245, .6); font-size: 15px; margin: 0 0 22px; }
    #ytsb-overlay button {
      display: block; width: 100%; font: 600 17px/1 var(--ytsb-font); border: 0; cursor: pointer;
      border-radius: 999px; padding: 15px 20px; margin: 8px 0 0;
      -webkit-tap-highlight-color: transparent; transition: transform .12s, filter .12s;
    }
    #ytsb-overlay button:active { transform: scale(.97); filter: brightness(1.15); }
    #ytsb-back  { background: #0a84ff; color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25); }
    #ytsb-allow { background: rgba(120, 120, 128, .32); color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1); }

    /* ---------- floating button (glass circle) ---------- */
    #ytsb-fab {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      width: 50px; height: 50px; border-radius: 50%; padding: 0; cursor: pointer;
      font-size: 22px; line-height: 50px; text-align: center; color: #fff;
      background: rgba(60, 60, 67, .38); border: .5px solid rgba(255, 255, 255, .28);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .35), 0 8px 24px rgba(0, 0, 0, .3);
      -webkit-backdrop-filter: blur(20px) saturate(180%); backdrop-filter: blur(20px) saturate(180%);
      -webkit-tap-highlight-color: transparent; transition: transform .15s;
    }
    #ytsb-fab:active { transform: scale(.92); }

    /* ---------- settings sheet ---------- */
    #ytsb-panel {
      position: fixed !important; top: 10px !important; right: 10px !important; bottom: 10px !important;
      width: min(420px, calc(100vw - 20px)) !important; z-index: 2147483647 !important;
      background: var(--ytsb-sheet, rgba(28, 28, 30, .94)) !important; opacity: 1 !important;
      color: var(--ytsb-label, #fff) !important;
      -webkit-backdrop-filter: blur(40px) saturate(180%); backdrop-filter: blur(40px) saturate(180%);
      border: .5px solid var(--ytsb-edge); border-radius: 34px;
      box-shadow: inset 0 1px 0 var(--ytsb-edge), var(--ytsb-shadow);
      overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
      padding: 18px 16px 10px;
      font: 17px/1.3 var(--ytsb-font); text-align: left; -webkit-font-smoothing: antialiased;
    }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      #ytsb-panel { background: rgb(28, 28, 30) !important; }
    }
    #ytsb-panel * { box-sizing: border-box; }

    #ytsb-panel .ytsb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 4px 4px 0; }
    #ytsb-panel .ytsb-title { font-size: 30px; font-weight: 700; letter-spacing: -.02em; line-height: 1.1; }
    #ytsb-panel .ytsb-ver { font-size: 13px; color: var(--ytsb-secondary); margin-top: 4px; }
    #ytsb-panel .ytsb-status { color: var(--ytsb-green); font-size: 13px; font-weight: 500; min-height: 18px; margin: 6px 4px 0; }

    /* grouped, inset sections like the Settings app */
    #ytsb-panel .ytsb-card {
      background: var(--ytsb-cell); border-radius: 26px; margin: 12px 0 18px; overflow: hidden;
      box-shadow: inset 0 .5px 0 var(--ytsb-edge);
    }
    #ytsb-panel .ytsb-card-head {
      display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 10px 16px;
      background: var(--ytsb-cell-head); border-bottom: .5px solid var(--ytsb-sep);
    }
    #ytsb-panel .ytsb-card-head::before {
      content: ''; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent, var(--ytsb-blue));
    }
    #ytsb-panel .ytsb-card-title { font-size: 17px; font-weight: 600; }
    #ytsb-panel .ytsb-badge {
      font-size: 12px; font-weight: 600; color: var(--accent, var(--ytsb-blue));
      background: var(--ytsb-fill); border-radius: 999px; padding: 3px 9px;
    }
    #ytsb-panel .ytsb-spacer { flex: 1; }
    #ytsb-panel .ytsb-onoff { display: none; }
    #ytsb-panel .ytsb-card-body { padding: 0 16px; transition: opacity .2s; }
    #ytsb-panel .ytsb-card-body.off { opacity: .4; }
    #ytsb-panel .ytsb-card-body > .ytsb-sec:first-child { border-top: 0; }
    #ytsb-panel .ytsb-sec { border-top: .5px solid var(--ytsb-sep); padding: 12px 0; }
    #ytsb-panel .ytsb-sec-h { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
    #ytsb-panel .ytsb-hint { color: var(--ytsb-secondary); font-size: 13px; line-height: 1.35; margin-top: 8px; }
    #ytsb-panel .ytsb-row { display: flex; gap: 8px; flex-wrap: wrap; }

    #ytsb-panel .ytsb-toggle {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      min-height: 44px; padding: 4px 0; cursor: pointer;
    }
    #ytsb-panel .ytsb-toggle + .ytsb-toggle { border-top: .5px solid var(--ytsb-sep); }

    /* fields */
    #ytsb-panel .ytsb-input, #ytsb-panel .ytsb-ta {
      flex: 1; min-width: 0; border: 0; outline: 0; border-radius: 12px;
      background: var(--ytsb-fill); color: var(--ytsb-label);
      padding: 10px 12px; font: 16px/1.3 var(--ytsb-font);
    }
    #ytsb-panel .ytsb-input::placeholder, #ytsb-panel .ytsb-ta::placeholder { color: var(--ytsb-secondary); }
    #ytsb-panel .ytsb-input:focus, #ytsb-panel .ytsb-ta:focus { box-shadow: 0 0 0 2px var(--ytsb-blue); }
    #ytsb-panel .ytsb-ta { width: 100%; min-height: 96px; font: 13px/1.4 ui-monospace, "SF Mono", monospace; }

    /* capsule buttons */
    #ytsb-panel .ytsb-btn {
      border: 0; border-radius: 999px; padding: 10px 16px; cursor: pointer;
      font: 600 15px/1 var(--ytsb-font); color: var(--ytsb-blue); background: var(--ytsb-fill);
      -webkit-tap-highlight-color: transparent; transition: transform .12s, filter .12s;
    }
    #ytsb-panel .ytsb-btn:active { transform: scale(.96); filter: brightness(1.1); }
    #ytsb-panel .ytsb-btn.primary { background: var(--ytsb-blue); color: #fff; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .25); }
    #ytsb-panel .ytsb-btn.danger { color: var(--ytsb-red); background: var(--ytsb-fill); }
    #ytsb-panel .ytsb-close {
      flex: none; width: 36px; height: 36px; padding: 0; border-radius: 50%;
      font-size: 15px; line-height: 36px; text-align: center; color: var(--ytsb-secondary);
      background: var(--ytsb-fill-strong); box-shadow: inset 0 .5px 0 var(--ytsb-edge);
    }

    /* chips */
    #ytsb-panel .ytsb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    #ytsb-panel .ytsb-chip {
      display: inline-flex; align-items: center; gap: 2px; font-size: 14px;
      background: var(--ytsb-fill); border-radius: 999px; padding: 5px 4px 5px 12px;
    }
    #ytsb-panel .ytsb-chip button {
      background: none; border: 0; color: var(--ytsb-secondary); font-size: 13px;
      width: 24px; height: 24px; border-radius: 50%; padding: 0; cursor: pointer;
    }
    #ytsb-panel .ytsb-chip button:active { background: var(--ytsb-fill-strong); }

    /* iOS switch */
    #ytsb-panel input.ytsb-switch {
      -webkit-appearance: none; appearance: none; flex: none; margin: 0; cursor: pointer;
      width: 52px; height: 32px; border-radius: 999px; background: var(--ytsb-fill-strong);
      position: relative; transition: background .25s; -webkit-tap-highlight-color: transparent;
    }
    #ytsb-panel input.ytsb-switch::before {
      content: ''; position: absolute; top: 2px; left: 2px; width: 28px; height: 28px; border-radius: 50%;
      background: #fff; box-shadow: 0 3px 8px rgba(0, 0, 0, .15), 0 1px 1px rgba(0, 0, 0, .16);
      transition: transform .25s cubic-bezier(.3, 1.4, .5, 1), width .15s;
    }
    #ytsb-panel input.ytsb-switch:active::before { width: 34px; }
    #ytsb-panel input.ytsb-switch:checked { background: var(--ytsb-green); }
    #ytsb-panel input.ytsb-switch:checked::before { transform: translateX(20px); }
    #ytsb-panel input.ytsb-switch:checked:active::before { transform: translateX(14px); }

    #ytsb-panel .ytsb-about { color: var(--ytsb-secondary); font-size: 12px; text-align: center; padding: 0 0 12px; }
  `;

  // Own <style> via textContent works with YouTube's Trusted Types.
  // GM.addStyle is only a fallback for sites whose CSP blocks inline styles.
  let gmStyleTried = false;
  function injectCSS() {
    let style = document.getElementById('ytsb-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ytsb-style';
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
    if (!style.sheet && !gmStyleTried && typeof GM !== 'undefined' && typeof GM.addStyle === 'function') {
      gmStyleTried = true;
      try { Promise.resolve(GM.addStyle(css)).catch(() => {}); } catch (_) {}
    }
  }

  // inline !important styles survive any site CSS that wins over ours
  function forceStyle(node, props) {
    for (const [k, v] of Object.entries(props)) node.style.setProperty(k, v, 'important');
  }

  // ---------- small DOM helper (no innerHTML: YouTube enforces Trusted Types) ----------
  function el(tag, props = {}, kids = []) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const k of kids) if (k) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    return n;
  }

  /* ===================== page blocking (titles never shown) ===================== */

  const allowedPages = new Set();
  let overlay = null;
  let savedTitle = null;

  function pageKey() {
    if (SITE === 'reddit') { const id = postId(location.pathname); if (id) return 'rp:' + id; }
    return location.pathname + location.search;
  }

  function fallbackTitle() {
    return document.title === BLOCKED_TITLE ? (savedTitle || '') : document.title;
  }

  function pauseAll() {
    const vids = [...document.querySelectorAll('video')];
    for (const p of document.querySelectorAll('shreddit-player, shreddit-player-2')) {
      if (p.shadowRoot) vids.push(...p.shadowRoot.querySelectorAll('video'));
    }
    for (const v of vids) { try { v.pause(); } catch (_) {} }
    try { if (navigator.mediaSession) navigator.mediaSession.metadata = null; } catch (_) {}
  }

  function protectTitle() {
    if (document.title !== BLOCKED_TITLE) {
      savedTitle = document.title;
      document.title = BLOCKED_TITLE;     // keeps the spoiler out of Safari's tab bar
    }
  }

  function showOverlay(key, reason) {
    pauseAll();
    protectTitle();
    if (overlay) {
      overlay.dataset.key = key;
      overlay.querySelector('.ytsb-p').textContent = 'Matched: ' + reason;
      return;
    }
    const back = el('button', { id: 'ytsb-back', textContent: 'Go back' });
    const allow = el('button', { id: 'ytsb-allow', textContent: 'Show anyway' });
    overlay = el('div', { id: 'ytsb-overlay' }, [
      el('div', { className: 'ytsb-box' }, [
        el('div', { className: 'ytsb-icon', textContent: '🛡️' }),
        el('div', { className: 'ytsb-h', textContent: 'Blocked to avoid spoilers' }),
        el('div', { className: 'ytsb-p', textContent: 'Matched: ' + reason }),
        back, allow,
      ]),
    ]);
    overlay.dataset.key = key;
    forceStyle(overlay, { position: 'fixed', inset: '0', 'z-index': '2147483646', background: 'rgba(0, 0, 0, .82)', opacity: '1' });
    back.addEventListener('click', () => {
      if (history.length > 1) history.back(); else location.href = '/';
    });
    allow.addEventListener('click', () => {
      allowedPages.add(overlay.dataset.key);
      hideOverlay(true);
      cache = new WeakMap();
      schedule();
    });
    (document.body || document.documentElement).appendChild(overlay);
  }

  function hideOverlay(restoreTitle) {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (restoreTitle && savedTitle && document.title === BLOCKED_TITLE) document.title = savedTitle;
    savedTitle = null;
  }

  document.addEventListener('play', e => {
    if (overlay && e.target instanceof HTMLMediaElement) e.target.pause();
  }, true);

  function pageVerdict() {
    if (allowedPages.has(pageKey())) return null;
    if (SITE === 'youtube') {
      if (!cfg.youtubeEnabled || !cfg.blockPages) return null;
      const i = ytPageInfo();
      return i ? ytVerdict(i.text, i.hrefs, true) : null;
    }
    if (!cfg.redditEnabled || !cfg.redditBlockPages) return null;
    const i = redditPageInfo();
    return i ? rVerdict(i.text, i.sub, i.author, true) : null;
  }

  function checkPage() {
    const reason = pageVerdict();
    if (reason) showOverlay(pageKey(), reason);
    else hideOverlay(false);
  }

  /* ====================== floating button & settings panel ====================== */

  let fab = null, panel = null, status = '';

  function updateFab() {
    if (!document.body) return;
    if (cfg.showButton && !fab) {
      fab = el('button', { id: 'ytsb-fab', textContent: '🛡️', title: 'Spoiler blocker settings' });
      fab.addEventListener('click', () => (panel ? closePanel() : openPanel()));
      document.body.appendChild(fab);
    } else if (!cfg.showButton && fab) { fab.remove(); fab = null; }
    else if (fab && !fab.isConnected) document.body.appendChild(fab);
  }

  function openPanel() {
    if (!document.body) return;
    if (!panel) {
      panel = el('div', { id: 'ytsb-panel' });
      forceStyle(panel, { background: 'var(--ytsb-sheet, rgba(28, 28, 30, .94))', color: 'var(--ytsb-label, #fff)', opacity: '1', position: 'fixed', 'z-index': '2147483647' });
      panel.addEventListener('keydown', e => e.stopPropagation()); // keep site shortcuts out
      document.body.appendChild(panel);
    }
    renderPanel();
  }
  function closePanel() { if (panel) { panel.remove(); panel = null; } }

  async function commit(msg) {
    cfg = sanitize(cfg);
    await saveConfig();
    compile();
    status = msg || 'Saved';
    updateFab();
    if (panel) renderPanel();
    schedule();
  }

  const has = (key, v) => cfg[key].some(x => x.toLowerCase() === v.toLowerCase());
  function addTo(key, values) { for (const v of values) if (!has(key, v)) cfg[key].push(v); }
  function removeFrom(key, values) {
    const low = values.map(v => v.toLowerCase());
    cfg[key] = cfg[key].filter(x => !low.includes(x.toLowerCase()));
  }

  function switchFor(key, label) {
    const cb = el('input', { type: 'checkbox', className: 'ytsb-switch', checked: !!cfg[key] });
    cb.setAttribute('role', 'switch');
    cb.setAttribute('aria-label', label);
    cb.addEventListener('change', () => { cfg[key] = cb.checked; commit(label + (cb.checked ? ' on' : ' off')); });
    return cb;
  }

  function toggleRow(label, key) {
    return el('label', { className: 'ytsb-toggle' }, [el('span', { textContent: label }), switchFor(key, label)]);
  }

  const SITES = {
    youtube: { name: 'YouTube', accent: '#ff3d3d', enabledKey: 'youtubeEnabled' },
    reddit:  { name: 'Reddit', accent: '#ff6a1a', enabledKey: 'redditEnabled' },
  };

  // card with the site name + its master on/off switch in the header
  function card({ name, accent, enabledKey, current }, kids) {
    const on = enabledKey ? !!cfg[enabledKey] : true;
    const head = el('div', { className: 'ytsb-card-head' }, [
      el('span', { className: 'ytsb-card-title', textContent: name }),
      current && el('span', { className: 'ytsb-badge', textContent: 'this site' }),
      el('span', { className: 'ytsb-spacer' }),
      enabledKey && el('span', { className: 'ytsb-onoff', textContent: on ? 'On' : 'Off' }),
      enabledKey && switchFor(enabledKey, name + ' filter'),
    ]);
    const c = el('div', { className: 'ytsb-card' }, [
      head,
      el('div', { className: 'ytsb-card-body' + (on ? '' : ' off') }, kids),
    ]);
    c.style.setProperty('--accent', accent);
    return c;
  }

  function siteCard(site, kids) {
    return card({ ...SITES[site], current: SITE === site }, kids);
  }

  function listEditor(title, key, placeholder, hint, transform) {
    const input = el('input', { type: 'text', className: 'ytsb-input', placeholder });
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    const add = () => {
      const raw = input.value.split(',').map(s => s.trim()).filter(Boolean);
      if (!raw.length) return;
      const vals = transform ? raw.map(transform).filter(Boolean) : raw;
      if (!vals.length) { status = '⚠️ Use the format r/name or u/name'; renderPanel(); return; }
      addTo(key, vals);
      const bad = raw.length - vals.length;
      commit('Added ' + vals.length + (bad ? ` (${bad} skipped – use r/name or u/name)` : ''));
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const chips = cfg[key].map(v => el('span', { className: 'ytsb-chip' }, [
      v,
      el('button', { textContent: '✕', title: 'Remove', onclick: () => { removeFrom(key, [v]); commit('Removed'); } }),
    ]));
    return el('div', { className: 'ytsb-sec' }, [
      el('div', { className: 'ytsb-sec-h', textContent: `${title} (${cfg[key].length})` }),
      el('div', { className: 'ytsb-row' }, [input, el('button', { className: 'ytsb-btn primary', textContent: 'Add', onclick: add })]),
      hint && el('div', { className: 'ytsb-hint', textContent: hint }),
      el('div', { className: 'ytsb-chips' }, chips),
    ]);
  }

  function quickTargets() {
    if (SITE === 'reddit') return redditQuickTargets();
    const ch = ytCurrentChannel();
    return ch ? [{
      label: ch.handle, blockKey: 'blockedChannels', allowKey: 'allowedChannels',
      blockVals: [ch.handle, ch.name].filter(Boolean), allowVals: [ch.handle],
    }] : [];
  }

  function quickSection() {
    const targets = quickTargets();
    if (!targets.length) return null;
    const s = SITES[SITE];
    return card({ name: 'On this page', accent: s.accent }, [el('div', { className: 'ytsb-sec' }, [
      el('div', { className: 'ytsb-hint', style: 'margin:0 0 10px', textContent: s.name + (SITE === 'reddit' ? ' subreddit / user' : ' channel') }),
      ...targets.map(t => {
        const blocked = has(t.blockKey, t.blockVals[0]);
        const allowed = has(t.allowKey, t.allowVals[0]);
        return el('div', { className: 'ytsb-row', style: 'align-items:center;margin-bottom:8px' }, [
          el('span', { textContent: t.label, style: 'flex:1;min-width:120px;word-break:break-all' }),
          el('button', {
            className: 'ytsb-btn danger',
            textContent: blocked ? 'Unblock' : 'Block',
            onclick: () => {
              if (blocked) { removeFrom(t.blockKey, t.blockVals); commit('Unblocked ' + t.label); }
              else { addTo(t.blockKey, t.blockVals); removeFrom(t.allowKey, t.allowVals); commit('Blocked ' + t.label); }
            },
          }),
          el('button', {
            className: 'ytsb-btn',
            textContent: allowed ? 'Un-allow' : 'Always allow',
            onclick: () => {
              if (allowed) { removeFrom(t.allowKey, t.allowVals); commit('Removed from allowed'); }
              else { addTo(t.allowKey, t.allowVals); removeFrom(t.blockKey, t.blockVals); commit('Allowed ' + t.label); }
            },
          }),
        ]);
      }),
    ])]);
  }

  function youtubeCard() {
    return siteCard('youtube', [
      el('div', { className: 'ytsb-sec' }, [
        toggleRow('Hide Shorts', 'hideShorts'),
        toggleRow('Open Shorts links in normal player', 'redirectShorts'),
        toggleRow('Block matching video & channel pages', 'blockPages'),
        toggleRow('Filter comments', 'filterComments'),
        toggleRow('Hide ALL comments', 'hideAllComments'),
      ]),
      listEditor('Blocked channels', 'blockedChannels', '@handle or channel name',
        'Hides all their videos, their channel page and their comments. @handle is most reliable.'),
      listEditor('Always allowed channels', 'allowedChannels', '@handle',
        'Their videos are never hidden by keywords. Comments under them are still filtered.'),
    ]);
  }

  function redditCard() {
    return siteCard('reddit', [
      el('div', { className: 'ytsb-sec' }, [
        toggleRow('Block matching posts, subreddits & profiles', 'redditBlockPages'),
        toggleRow('Filter comments', 'redditFilterComments'),
      ]),
      listEditor('Blocked subreddits & users', 'redditBlocked', 'r/GTA6, u/someone',
        'Hides all their posts and comments and blocks their page. r/ = subreddit, u/ = user.', canonReddit),
      listEditor('Always allowed subreddits & users', 'redditAllowed', 'r/name or u/name',
        'Their posts are never hidden by keywords. Comments are still filtered.', canonReddit),
    ]);
  }

  function exportJSON() {
    return JSON.stringify({ app: 'spoiler-blocker', version: 3, appVersion: VERSION, build: BUILD, ...cfg }, null, 2);
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (_) {}
    try { if (typeof GM !== 'undefined' && GM.setClipboard) { await GM.setClipboard(t); return true; } } catch (_) {}
    return false;
  }

  function importJSON(text) {
    if (typeof text !== 'string' || text.length > MAX_IMPORT_BYTES) {
      status = '⚠️ Import too large'; renderPanel(); return;
    }
    let obj;
    try { obj = JSON.parse(text); } catch (_) { status = '⚠️ Not valid JSON'; renderPanel(); return; }
    cfg = sanitize(obj);
    allowedPages.clear();
    commit('Imported ✓');
  }

  function renderPanel() {
    if (!panel) return;
    const scroll = panel.scrollTop;
    panel.textContent = '';
    const add = n => n && panel.appendChild(n);

    add(el('div', { className: 'ytsb-head' }, [
      el('div', {}, [
        el('div', { className: 'ytsb-title', textContent: 'Spoiler Blocker' }),
        el('div', { className: 'ytsb-ver', textContent: `Version ${VERSION} · Build ${BUILD}` }),
      ]),
      el('button', { className: 'ytsb-btn ytsb-close', textContent: '✕', title: 'Close', ariaLabel: 'Close', onclick: closePanel }),
    ]));
    add(el('div', { className: 'ytsb-status', textContent: status }));
    status = '';

    add(quickSection());

    add(card({ name: 'All sites', accent: '#3ea6ff' }, [
      listEditor('Blocked words', 'blockedWords', 'e.g. GTA 6, Leonida',
        'Used on YouTube and Reddit. Comma-separated. Spacing/punctuation is flexible: "GTA 6" also catches GTA6, #GTA6, GTA-6, gta_6.'),
    ]));

    // current site's card first
    (SITE === 'reddit' ? [redditCard(), youtubeCard()] : [youtubeCard(), redditCard()]).forEach(add);

    // export / import
    const ta = el('textarea', { className: 'ytsb-ta', placeholder: 'Paste exported config here to import…' });
    const fileIn = el('input', { type: 'file', accept: '.json,application/json,text/plain' });
    fileIn.style.display = 'none';
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      if (f.size > MAX_IMPORT_BYTES) { status = '⚠️ File too large'; renderPanel(); return; }
      importJSON(await f.text());
    });
    add(card({ name: 'Backup', accent: '#9e9e9e' }, [el('div', { className: 'ytsb-sec' }, [
      el('div', { className: 'ytsb-sec-h', textContent: 'Export / Import' }),
      el('div', { className: 'ytsb-row' }, [
        el('button', {
          className: 'ytsb-btn', textContent: 'Copy config',
          onclick: async () => {
            const json = exportJSON();
            if (await copyText(json)) { status = 'Copied to clipboard ✓'; renderPanel(); }
            else { ta.value = json; ta.select(); }
          },
        }),
        el('button', {
          className: 'ytsb-btn', textContent: 'Download .json',
          onclick: () => {
            const url = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
            const a = el('a', { href: url, download: 'spoiler-blocker-config.json' });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          },
        }),
      ]),
      el('div', { className: 'ytsb-row', style: 'margin-top:8px' }, [ta]),
      el('div', { className: 'ytsb-row', style: 'margin-top:8px' }, [
        el('button', { className: 'ytsb-btn primary', textContent: 'Import pasted', onclick: () => importJSON(ta.value) }),
        el('button', { className: 'ytsb-btn', textContent: 'Import file…', onclick: () => fileIn.click() }),
        fileIn,
      ]),
      el('div', { className: 'ytsb-hint', textContent: 'Importing replaces your current settings. Older exports work too.' }),
    ])]));

    // general settings at the bottom
    add(card({ name: 'General', accent: '#9e9e9e' }, [
      el('div', { className: 'ytsb-sec' }, [
        toggleRow('Show 🛡️ button', 'showButton'),
        el('div', { className: 'ytsb-hint', textContent: 'Button hidden? Add #ytsb to the address (e.g. youtube.com/#ytsb or reddit.com/#ytsb).' }),
      ]),
      el('div', { className: 'ytsb-sec' }, [
        el('button', {
          className: 'ytsb-btn danger', textContent: 'Reset to defaults',
          onclick: () => { cfg = clone(DEFAULTS); allowedPages.clear(); commit('Reset ✓'); },
        }),
      ]),
    ]));

    add(el('div', { className: 'ytsb-about', textContent: `Spoiler Blocker ${VERSION} (Build ${BUILD})` }));

    panel.scrollTop = scroll;
  }

  /* ================================ main loop ================================ */

  let siteWasOn = true;

  function scan() {
    injectCSS();
    redirectShorts();
    if (!document.body) return;

    const siteOn = SITE === 'youtube' ? cfg.youtubeEnabled : cfg.redditEnabled;
    if (siteOn) { (SITE === 'youtube' ? scanYouTube : scanReddit)(); siteWasOn = true; }
    else if (siteWasOn) { unhideAll(); siteWasOn = false; }

    checkPage();
    updateFab();
    if (location.hash === '#ytsb' && !panel) {
      history.replaceState(null, '', location.pathname + location.search);
      openPanel();
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    const run = () => { queued = false; scan(); };
    // before next paint when visible (no flash); timer when in a background tab
    if (document.hidden) setTimeout(run, 50); else requestAnimationFrame(run);
  }

  (async () => {
    injectCSS();
    await loadConfig();
    compile();
    redirectShorts();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
    });
    window.addEventListener('yt-navigate-finish', schedule);
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
    document.addEventListener('DOMContentLoaded', schedule);
    setInterval(schedule, 1000); // safety net for in-app navigation
    try {
      if (typeof GM !== 'undefined' && GM.registerMenuCommand) {
        GM.registerMenuCommand('Spoiler Blocker settings', openPanel);
      }
    } catch (_) {}
    schedule();
  })();
})();
