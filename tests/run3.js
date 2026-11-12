const fs = require('fs');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'spoiler-blocker.user.js'), 'utf8');
const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const H = n => n && n.hasAttribute('data-ytsb-hidden');
(async () => {
  const dom = new JSDOM(`<html><head><title>Minecraft - YouTube</title></head><body>
  <div id="movie_player" class="html5-video-player ended-mode">
    <div class="ytp-chrome-top"><div class="ytp-title"><a class="ytp-title-link" href="https://www.youtube.com/watch?v=cur">Minecraft update</a></div></div>
    <div class="html5-endscreen ytp-player-content videowall-endscreen">
      <a id="e1" class="ytp-videowall-still" href="https://www.youtube.com/watch?v=a1" aria-label="GTA6 gameplay leak 12 minutes"><span class="ytp-videowall-still-info-title">GTA6 gameplay leak</span></a>
      <a id="e2" class="ytp-videowall-still" href="https://www.youtube.com/watch?v=a2"><span class="ytp-videowall-still-info-title">Minecraft redstone</span></a>
    </div>
    <div class="ytp-fullscreen-grid"><div id="m1" class="ytp-modern-videowall-still"><a href="/watch?v=b1"><div>Lucia's story explained</div></a></div>
      <div id="m2" class="ytp-new-unknown-card"><a id="m2a" href="/watch?v=b2" title="Vice City map tour">x</a></div>
      <div id="m3" class="ytp-modern-videowall-still"><a href="/watch?v=b3"><div>Outer Wilds OST</div></a></div></div>
    <div class="ytp-autonav-endscreen-upnext-container" id="up">
      <div class="ytp-autonav-endscreen-upnext-title">GTA VI ending explained</div>
      <button class="ytp-autonav-endscreen-upnext-cancel-button" id="cancel">Cancel</button>
    </div>
  </div></body></html>`, { url: 'https://www.youtube.com/watch?v=cur', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  let cancelled = 0;
  d.getElementById('cancel').addEventListener('click', () => cancelled++);
  w.eval(src);
  await new Promise(r => setTimeout(r, 400));
  ok(H(d.getElementById('e1')), 'classic end screen: GTA6 video hidden');
  ok(!H(d.getElementById('e2')), 'classic end screen: normal video visible');
  ok(H(d.getElementById('m1')), 'new grid: "Lucia" video hidden');
  ok(H(d.getElementById('m2a')), 'unknown card type: link with keyword still hidden');
  ok(!H(d.getElementById('m3')), 'new grid: normal video visible');
  ok(!H(d.querySelector('.ytp-title-link')), "current video's title bar untouched");
  ok(H(d.getElementById('up')), '"Up next" spoiler card hidden');
  ok(cancelled === 1, 'autoplay countdown cancelled once (' + cancelled + ')');
  ok(!d.getElementById('ytsb-overlay'), 'current (normal) video not blocked');
  w.close();
})();
