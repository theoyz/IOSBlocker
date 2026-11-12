'use strict';
// Shared jsdom harness: loads the userscript into a fake page and runs it.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'spoiler-blocker.user.js'), 'utf8');

let failures = 0;
let passes = 0;

function check(name, ok) {
  if (ok) { passes++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// url: page URL, html: body markup, config: optional stored settings (merged over defaults by the script)
async function load({ url, html = '', title = '', config = null }) {
  const vc = new VirtualConsole();
  let closed = false;
  vc.on('jsdomError', e => {
    if (closed) return;   // timers still firing after window.close()
    // jsdom can't navigate or parse some modern CSS; those aren't script bugs
    if (!/Not implemented|Could not parse CSS/i.test(e.message)) console.error('  jsdom:', e.message);
  });
  const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`, {
    url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
  });
  const w = dom.window;
  const close = w.close.bind(w);
  w.close = () => { closed = true; close(); };
  if (config) w.localStorage.setItem('ytsb-config', JSON.stringify(config));
  w.eval(SCRIPT);
  await sleep(120);
  return w;
}

const hidden = (w, sel) => {
  const n = w.document.querySelector(sel);
  if (!n) throw new Error('missing element ' + sel);
  return n.hasAttribute('data-ytsb-hidden');
};

function done(file) {
  console.log(`${file}: ${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
}

module.exports = { load, check, hidden, sleep, done };
