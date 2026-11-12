'use strict';
// YouTube feed: keyword matching, channels, allow list, comments, Shorts.
const { load, check, hidden, done } = require('./helpers');

const item = (id, title, href = '/@someone') =>
  `<ytd-rich-item-renderer id="${id}"><a href="/watch?v=${id}x">${title}</a><a href="${href}">ch</a></ytd-rich-item-renderer>`;

(async () => {
  console.log('run.js – YouTube feed');
  const w = await load({
    url: 'https://www.youtube.com/',
    config: { blockedChannels: ['@SpoilerTV', 'Leak Central'], hideShorts: true },
    html: [
      item('a1', 'GTA 6 trailer breakdown'),
      item('a2', 'New #GTA6 leak!!'),
      item('a3', 'gta_6 map size'),
      item('a4', 'Grand Theft Auto Ⅵ gameplay'),   // Unicode Roman numeral
      item('a5', 'GTA-VI is coming'),
      item('a6', 'Cooking pasta at home'),
      item('a7', 'Minecraft speedrun'),
      item('a8', 'GTA 6 official trailer', '/@RockstarGames'),   // allow list
      item('a9', 'Totally harmless title', '/@SpoilerTV'),        // blocked handle
      item('a10', 'Leak Central weekly'),                          // blocked channel name
      item('a11', 'Vacation in Florida', '/@someone/videos'),
      `<ytd-rich-item-renderer id="s1"><a href="/shorts/abcdefg">funny cat</a></ytd-rich-item-renderer>`,
      `<ytd-comment-thread-renderer id="c1"><span>Lucia is the best character</span></ytd-comment-thread-renderer>`,
      `<ytd-comment-thread-renderer id="c2"><span>Great video, thanks!</span></ytd-comment-thread-renderer>`,
      `<ytd-comment-thread-renderer id="c3"><a href="/@RockstarGames">x</a> <span>GTA 6 hype</span></ytd-comment-thread-renderer>`,
    ].join(''),
  });

  check('"GTA 6" hidden', hidden(w, '#a1'));
  check('"#GTA6" hidden', hidden(w, '#a2'));
  check('"gta_6" hidden', hidden(w, '#a3'));
  check('"Grand Theft Auto Ⅵ" hidden', hidden(w, '#a4'));
  check('"GTA-VI" hidden', hidden(w, '#a5'));
  check('unrelated video visible', !hidden(w, '#a6'));
  check('unrelated video visible (2)', !hidden(w, '#a7'));
  check('allowed channel visible despite keyword', !hidden(w, '#a8'));
  check('blocked @handle hidden', hidden(w, '#a9'));
  check('blocked channel name hidden', hidden(w, '#a10'));
  check('no overlay on home page', !w.document.getElementById('ytsb-overlay'));
  check('shorts flag set when hideShorts is on', w.document.documentElement.hasAttribute('data-ytsb-noshorts'));
  check('comment with keyword hidden', hidden(w, '#c1'));
  check('normal comment visible', !hidden(w, '#c2'));
  check('allow list not applied to comments', hidden(w, '#c3'));
  check('🛡️ button shown', !!w.document.getElementById('ytsb-fab'));
  check('style injected', !!w.document.getElementById('ytsb-style'));

  // dynamically added content is filtered too
  const d = w.document.createElement('div');
  d.innerHTML = item('late', 'Vice City returns');
  w.document.body.appendChild(d.firstChild);
  await new Promise(r => setTimeout(r, 120));
  check('item added later hidden', hidden(w, '#late'));

  // recycled element: text changes to something harmless -> unhidden
  w.document.querySelector('#late a').textContent = 'Baking bread';
  await new Promise(r => setTimeout(r, 120));
  check('recycled element unhidden after content change', !hidden(w, '#late'));

  w.close();
  done('run.js');
})().catch(e => { console.error(e); process.exit(1); });
