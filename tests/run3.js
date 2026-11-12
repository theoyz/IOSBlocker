'use strict';
// YouTube page blocking, settings panel, import/export and config sanitizing.
const { load, check, sleep, done } = require('./helpers');

const stored = w => JSON.parse(w.localStorage.getItem('ytsb-config') || 'null');
const button = (w, text) => [...w.document.querySelectorAll('#ytsb-panel button')].find(b => b.textContent === text);

(async () => {
  console.log('run3.js – page blocking & settings');

  // ---- blocked watch page ----
  let w = await load({
    url: 'https://www.youtube.com/watch?v=abc',
    title: 'GTA 6 story leak - YouTube',
    html: '<ytd-watch-metadata><h1 id="title">GTA 6 story leak</h1><div id="owner"><a href="/@someone">Someone</a></div></ytd-watch-metadata>',
  });
  const ov = w.document.getElementById('ytsb-overlay');
  check('watch page overlay shown', !!ov);
  check('tab title replaced', w.document.title === 'Blocked – YouTube');
  check('overlay names the match, not the title', ov && /Matched: “gta 6”/.test(ov.textContent) && !/story leak/i.test(ov.textContent));
  w.document.getElementById('ytsb-allow').click();
  await sleep(120);
  check('"Show anyway" removes overlay', !w.document.getElementById('ytsb-overlay'));
  check('"Show anyway" restores title', w.document.title === 'GTA 6 story leak - YouTube');
  w.close();

  // ---- harmless watch page ----
  w = await load({
    url: 'https://www.youtube.com/watch?v=def',
    title: 'Pasta recipe - YouTube',
    html: '<ytd-watch-metadata><h1 id="title">Pasta recipe</h1></ytd-watch-metadata>',
  });
  check('harmless watch page not blocked', !w.document.getElementById('ytsb-overlay'));
  w.close();

  // ---- blocked channel page ----
  w = await load({ url: 'https://www.youtube.com/@SpoilerTV', config: { blockedChannels: ['@SpoilerTV'] } });
  check('blocked channel page overlay shown', !!w.document.getElementById('ytsb-overlay'));
  w.close();

  // ---- page blocking switched off ----
  w = await load({
    url: 'https://www.youtube.com/watch?v=abc', config: { blockPages: false },
    html: '<ytd-watch-metadata><h1 id="title">GTA 6 story leak</h1></ytd-watch-metadata>',
  });
  check('no overlay when page blocking is off', !w.document.getElementById('ytsb-overlay'));
  w.close();

  // ---- settings panel ----
  w = await load({ url: 'https://www.youtube.com/#ytsb' });
  const panel = w.document.getElementById('ytsb-panel');
  check('#ytsb opens the panel', !!panel);
  check('#ytsb removed from the address', w.location.hash === '');
  check('panel shows version and build', /Version 3\.2\.3 · Build \d+/.test(panel.textContent));

  // add a word via the input
  const input = panel.querySelector('input.ytsb-input');
  input.value = 'Hidden Ending, Final Boss';
  button(w, 'Add').click();
  await sleep(50);
  check('added words saved', stored(w).blockedWords.includes('Hidden Ending') && stored(w).blockedWords.includes('Final Boss'));

  // export (no clipboard in jsdom -> falls back to the textarea)
  button(w, 'Copy config').click();
  await sleep(50);
  const exported = JSON.parse(w.document.querySelector('#ytsb-panel .ytsb-ta').value);
  check('export contains app marker and settings', exported.app === 'spoiler-blocker' && exported.blockedWords.includes('Final Boss'));

  // import a malformed config: wrong types, duplicates, bad Reddit entries, overlong entries
  w.document.querySelector('#ytsb-panel .ytsb-ta').value = JSON.stringify({
    blockedWords: ['Spoiler', 'spoiler', 42, null, '  padded  ', 'x'.repeat(500)],
    redditBlocked: ['/r/SomeSub/', 'user/someone', 'not a sub'],
    hideShorts: 'yes',
    redirectShorts: false,
    unknownKey: true,
  });
  button(w, 'Import pasted').click();
  await sleep(50);
  const c = stored(w);
  check('import: non-strings and case duplicates dropped', c.blockedWords.filter(x => x.toLowerCase() === 'spoiler').length === 1 && !c.blockedWords.includes(42));
  check('import: entries trimmed and length-limited', c.blockedWords.includes('padded') && c.blockedWords.every(x => x.length <= 200));
  check('import: Reddit entries canonicalized', JSON.stringify(c.redditBlocked) === JSON.stringify(['r/SomeSub', 'u/someone']));
  check('import: non-boolean flag ignored', c.hideShorts === false);
  check('import: boolean flag applied', c.redirectShorts === false);
  check('import: unknown keys dropped', !('unknownKey' in c));

  // invalid JSON leaves settings alone
  w.document.querySelector('#ytsb-panel .ytsb-ta').value = '{not json';
  button(w, 'Import pasted').click();
  await sleep(50);
  check('invalid JSON rejected with message', /Not valid JSON/.test(w.document.querySelector('#ytsb-panel .ytsb-status').textContent));
  check('invalid JSON keeps settings', stored(w).blockedWords.includes('padded'));

  // reset
  button(w, 'Reset to defaults').click();
  await sleep(50);
  check('reset restores default words', stored(w).blockedWords.includes('GTA VI') && !stored(w).blockedWords.includes('padded'));

  // close
  w.document.querySelector('#ytsb-panel .ytsb-close').click();
  check('close button removes panel', !w.document.getElementById('ytsb-panel'));
  w.close();

  done('run3.js');
})().catch(e => { console.error(e); process.exit(1); });
