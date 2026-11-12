const fs = require('fs');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'spoiler-blocker.user.js'), 'utf8');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(`<html><head><title>YouTube</title></head><body>
    <ytd-rich-item-renderer id="y1"><a href="/watch?v=1">GTA VI leak</a></ytd-rich-item-renderer>
  </body></html>`, { url: 'https://www.youtube.com/#ytsb', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  // simulate a GM.addStyle that fails like it would under YouTube's Trusted Types
  w.GM = { getValue: async () => null, setValue: async () => {}, addStyle: () => Promise.reject(new Error('TrustedHTML required')) };
  w.eval(src);
  await sleep(300);

  ok(!!d.getElementById('ytsb-style'), 'own <style> injected even though GM.addStyle fails');
  const p = d.getElementById('ytsb-panel');
  ok(p && p.style.getPropertyValue('background') && p.style.getPropertyPriority('background') === 'important', 'panel background forced inline !important');
  const titles = [...p.querySelectorAll('.ytsb-card-title')].map(n => n.textContent);
  console.log('     cards:', titles.join(' | '));
  ok(titles[titles.length - 1] === 'General', 'General card is last');
  ok(titles.indexOf('YouTube') < titles.indexOf('Reddit'), 'current site (YouTube) card before Reddit');
  const ytCard = [...p.querySelectorAll('.ytsb-card')].find(c => c.querySelector('.ytsb-card-title').textContent === 'YouTube');
  ok(/this site/.test(ytCard.textContent), 'YouTube card has "this site" badge');
  const general = [...p.querySelectorAll('.ytsb-card')].pop();
  ok(/Show 🛡️ button/.test(general.textContent), 'Show button toggle is in General card');
  ok(!/Filter Reddit/.test(p.textContent), 'old "Filter Reddit" row removed');

  ok(d.getElementById('y1').hasAttribute('data-ytsb-hidden'), 'video hidden while YouTube is on');
  const sw = ytCard.querySelector('.ytsb-card-head input.ytsb-switch');
  ok(sw && sw.checked, 'YouTube switch in card header, on');
  sw.checked = false; sw.dispatchEvent(new w.Event('change'));
  await sleep(300);
  ok(!d.getElementById('y1').hasAttribute('data-ytsb-hidden'), 'turning YouTube off un-hides videos');
  ok(!d.documentElement.hasAttribute('data-ytsb-noshorts'), 'turning YouTube off stops Shorts hiding');
  const ytCard2 = [...d.getElementById('ytsb-panel').querySelectorAll('.ytsb-card')].find(c => c.querySelector('.ytsb-card-title').textContent === 'YouTube');
  ok(/Off/.test(ytCard2.querySelector('.ytsb-onoff').textContent) && ytCard2.querySelector('.ytsb-card-body.off'), 'card shows Off and greys out');
  const sw2 = ytCard2.querySelector('.ytsb-card-head input.ytsb-switch');
  sw2.checked = true; sw2.dispatchEvent(new w.Event('change'));
  await sleep(300);
  ok(d.getElementById('y1').hasAttribute('data-ytsb-hidden'), 'turning YouTube back on hides again');
  w.close();
})();
