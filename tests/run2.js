'use strict';
// Reddit: new Reddit (shreddit) + old.reddit.com posts, subreddits, users, comments, post page block.
const { load, check, hidden, done } = require('./helpers');

const post = (id, title, sub = 'gaming', author = 'alice') =>
  `<article id="art-${id}"><shreddit-post id="p-${id}" post-title="${title}" permalink="/r/${sub}/comments/${id}/x/" ` +
  `subreddit-prefixed-name="r/${sub}" author="${author}"></shreddit-post></article>`;

(async () => {
  console.log('run2.js – Reddit');
  const cfg = { redditBlocked: ['r/SpoilerSub', 'u/leaker'], redditAllowed: ['r/RockstarOfficial'] };

  // ---- new Reddit feed ----
  let w = await load({
    url: 'https://www.reddit.com/',
    config: cfg,
    html: [
      post('aa1', 'GTA VI release date confirmed'),
      post('aa2', 'My cat sleeping'),
      post('aa3', 'Nice weather', 'SpoilerSub'),
      post('aa4', 'Look at this', 'pics', 'leaker'),
      post('aa5', 'GTA 6 trailer 3', 'RockstarOfficial'),
      `<shreddit-comment id="k1" author="bob"><div slot="comment">Jason dies at the end</div></shreddit-comment>`,
      `<shreddit-comment id="k2" author="carol"><div slot="comment">Cute cat</div></shreddit-comment>`,
      `<shreddit-comment id="k3" author="leaker"><div slot="comment">hello</div></shreddit-comment>`,
      `<ul><li id="l1"><a href="/r/other/comments/zz9/leonida_map/">Leonida map</a></li>` +
      `<li id="l2"><a href="/r/other/comments/zz8/bread/">Bread recipe</a></li>` +
      `<li id="l3"><a href="/r/SpoilerSub/">r/SpoilerSub</a></li></ul>`,
    ].join(''),
  });
  check('keyword post hidden (whole article)', hidden(w, '#art-aa1'));
  check('unrelated post visible', !hidden(w, '#art-aa2'));
  check('blocked subreddit post hidden', hidden(w, '#art-aa3'));
  check('blocked user post hidden', hidden(w, '#art-aa4'));
  check('allowed subreddit post visible', !hidden(w, '#art-aa5'));
  check('keyword comment hidden', hidden(w, '#k1'));
  check('normal comment visible', !hidden(w, '#k2'));
  check('blocked user comment hidden', hidden(w, '#k3'));
  check('sidebar post link hidden', hidden(w, '#l1'));
  check('sidebar harmless link visible', !hidden(w, '#l2'));
  check('community link to blocked sub hidden', hidden(w, '#l3'));
  check('no overlay on home', !w.document.getElementById('ytsb-overlay'));
  w.close();

  // ---- old Reddit ----
  w = await load({
    url: 'https://old.reddit.com/',
    config: cfg,
    html: [
      `<div class="thing link" id="o1" data-subreddit="gaming" data-author="x" data-fullname="t3_o1"><a class="title">Vice City leak</a></div>`,
      `<div class="thing link" id="o2" data-subreddit="gaming" data-author="x" data-fullname="t3_o2"><a class="title">Zelda tips</a></div>`,
      `<div class="thing comment" id="oc1" data-author="y"><div class="entry"><div class="usertext-body">Lucia is great</div></div></div>`,
    ].join(''),
  });
  check('old Reddit keyword post hidden', hidden(w, '#o1'));
  check('old Reddit normal post visible', !hidden(w, '#o2'));
  check('old Reddit keyword comment hidden', hidden(w, '#oc1'));
  w.close();

  // ---- blocked post page ----
  w = await load({
    url: 'https://www.reddit.com/r/gaming/comments/abc123/some_slug/',
    title: 'GTA 6 ending explained : r/gaming',
    config: cfg,
    html: post('abc123', 'GTA 6 ending explained'),
  });
  check('post page overlay shown', !!w.document.getElementById('ytsb-overlay'));
  check('tab title replaced', w.document.title === 'Blocked – Reddit');
  check('overlay does not reveal title', !/ending/i.test(w.document.getElementById('ytsb-overlay').textContent));
  w.document.getElementById('ytsb-allow').click();
  await new Promise(r => setTimeout(r, 120));
  check('"Show anyway" removes overlay', !w.document.getElementById('ytsb-overlay'));
  check('"Show anyway" restores title', /ending explained/.test(w.document.title));
  check('"Show anyway" unhides the main post', !hidden(w, '#art-abc123'));
  w.close();

  // ---- blocked subreddit page ----
  w = await load({ url: 'https://www.reddit.com/r/SpoilerSub/', config: cfg });
  check('blocked subreddit page overlay shown', !!w.document.getElementById('ytsb-overlay'));
  w.close();

  // ---- Reddit switched off ----
  w = await load({ url: 'https://www.reddit.com/', config: { ...cfg, redditEnabled: false }, html: post('off1', 'GTA 6') });
  check('nothing hidden when Reddit is off', !hidden(w, '#art-off1'));
  w.close();

  done('run2.js');
})().catch(e => { console.error(e); process.exit(1); });
