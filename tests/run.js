// Smoke test of the userscript against fake Reddit / YouTube DOMs.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'spoiler-blocker.user.js'), 'utf8');

async function run(url, html, check) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(src);
  await new Promise(r => setTimeout(r, 300));
  check(w.document, w);
  w.close();
}

const ok = (c, m) => { if (!c) process.exitCode = 1; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const hidden = n => n && n.hasAttribute('data-ytsb-hidden');

(async () => {
  // Reddit feed
  await run('https://www.reddit.com/', `<html><head><title>Reddit</title></head><body>
    <article id="a1"><shreddit-post post-title="GTA 6 map leaked!!" author="leaker" subreddit-prefixed-name="r/gaming" permalink="/r/gaming/comments/aaa/gta_6_map_leaked/"><a slot="title">GTA 6 map leaked!!</a></shreddit-post></article>
    <article id="a2"><shreddit-post post-title="My cat" author="bob" subreddit-prefixed-name="r/cats" permalink="/r/cats/comments/bbb/my_cat/"><a slot="title">My cat</a></shreddit-post></article>
    <article id="a3"><shreddit-post post-title="Daily thread" author="mod" subreddit-prefixed-name="r/GTA6" permalink="/r/GTA6/comments/ccc/daily_thread/"><a slot="title">Daily thread</a></shreddit-post></article>
    <ul><li id="side1"><a href="/r/pics/comments/ddd/leonida_fan_art/">Leonida fan art</a></li><li id="side2"><a href="/r/pics/comments/eee/sunset/">Sunset</a></li></ul>
  </body></html>`, d => {
    ok(hidden(d.getElementById('a1')), 'reddit: post with keyword hidden');
    ok(!hidden(d.getElementById('a2')), 'reddit: normal post visible');
    ok(hidden(d.getElementById('a3')), 'reddit: post in r/GTA6 hidden (sub name matches keyword)');
    ok(hidden(d.getElementById('side1')), 'reddit: sidebar link with keyword hidden');
    ok(!hidden(d.getElementById('side2')), 'reddit: normal sidebar link visible');
    ok(!!d.getElementById('ytsb-fab'), 'reddit: settings button present');
    ok(!d.getElementById('ytsb-overlay'), 'reddit: home not blocked');
  });

  // Reddit post page with spoiler slug -> overlay, title protected
  await run('https://www.reddit.com/r/gaming/comments/aaa/gta_6_ending_explained/', `<html><head><title>GTA 6 ending explained : r/gaming</title></head><body>
    <shreddit-post post-title="GTA 6 ending explained" author="x" permalink="/r/gaming/comments/aaa/gta_6_ending_explained/"></shreddit-post>
  </body></html>`, d => {
    ok(!!d.getElementById('ytsb-overlay'), 'reddit: spoiler post page blocked');
    ok(d.title === 'Blocked – Reddit', 'reddit: tab title hidden (' + d.title + ')');
    ok(!/ending/i.test(d.getElementById('ytsb-overlay').textContent), 'reddit: overlay does not show title');
  });

  // Reddit comments (new + old)
  await run('https://www.reddit.com/r/cats/comments/bbb/my_cat/', `<html><head><title>My cat</title></head><body>
    <shreddit-post post-title="My cat" author="bob" permalink="/r/cats/comments/bbb/my_cat/"></shreddit-post>
    <shreddit-comment id="c1" author="amy"><div slot="comment">cute!</div>
      <shreddit-comment id="c2" author="joe"><div slot="comment">Lucia Caminos dies in GTA VI</div></shreddit-comment>
    </shreddit-comment>
    <div class="thing comment" id="o1" data-author="z"><div class="entry"><div class="usertext-body">vice city is huge</div></div></div>
  </body></html>`, d => {
    ok(!d.getElementById('ytsb-overlay'), 'reddit: normal post page not blocked');
    ok(!hidden(d.getElementById('c1')), 'reddit: parent comment visible (reply text not counted)');
    ok(hidden(d.getElementById('c2')), 'reddit: spoiler comment hidden');
    ok(hidden(d.getElementById('o1')), 'old reddit: spoiler comment hidden');
  });

  // Reddit subreddit page
  await run('https://www.reddit.com/r/GTA6/', `<html><head><title>r/GTA6</title></head><body></body></html>`, d => {
    ok(!!d.getElementById('ytsb-overlay'), 'reddit: r/GTA6 page blocked');
  });

  // Panel renders on reddit with quick actions
  await run('https://www.reddit.com/r/cats/#ytsb', `<html><head><title>r/cats</title></head><body></body></html>`, d => {
    const p = d.getElementById('ytsb-panel');
    ok(!!p, 'panel opens via #ytsb');
    ok(p && /r\/cats/.test(p.textContent) && /Blocked subreddits/.test(p.textContent), 'panel shows r/cats quick action + reddit lists');
  });

  // YouTube regression
  await run('https://www.youtube.com/', `<html><head><title>YouTube</title></head><body>
    <ytd-rich-item-renderer id="y1"><a href="/watch?v=1">GTA VI leak</a><a href="/@random">random</a></ytd-rich-item-renderer>
    <ytd-rich-item-renderer id="y2"><a href="/watch?v=2">GTA VI Trailer</a><a href="/@RockstarGames">Rockstar Games</a></ytd-rich-item-renderer>
    <ytd-rich-item-renderer id="y3"><a href="/watch?v=3">Minecraft</a></ytd-rich-item-renderer>
  </body></html>`, d => {
    ok(hidden(d.getElementById('y1')), 'youtube: keyword video hidden');
    ok(!hidden(d.getElementById('y2')), 'youtube: allowed Rockstar video visible');
    ok(!hidden(d.getElementById('y3')), 'youtube: normal video visible');
  });
})();
