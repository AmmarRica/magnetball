// THE /vj ROUTE — the deck surface on its own full-screen page.
//
// ⚠️ THE DECKS DO NOT BUILD IN /settings ANY MORE. They did, and were reported looking
// exactly like what they were: a DJ rig squeezed into a 460px settings column. The /vj
// route is the same one-and-only index.html (the /settings stub mechanism, so the code
// cannot drift), flagged `vj`, and the page strips itself to the VJ card at full width.
// /settings and the in-game card keep a SIGNPOST — a link to the route — instead.
//
// ⚠️ TWO TRAPS THIS ROUTE ALREADY HIT, both pinned here:
//   1. `[data-sec="vj"]` bare matches a JUMP-BAR CHIP before the card — the chips carry
//      data-sec too — so vjOpenView un-collapsed a chip, the card stayed shut, and the
//      route shipped as a heading with nothing under it. `.card[data-sec="vj"]`.
//   2. `initCollapsibles` runs AFTER the view builder at boot and re-collapsed the one
//      card the page consists of. The accordion stands down on this route.
//
// Plus the other ask in the same breath: FIRST TO 3 is the default match length.
import { chromium, LAUNCH } from './_browser.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// The routes are directory stubs that fetch ../index.html, so they need a server —
// file:// cannot fetch. Same reason tests/swupdate.mjs serves a temp site.
const files = {
  '/index.html': readFileSync(process.cwd() + '/index.html'),
  '/vj/index.html': readFileSync(process.cwd() + '/vj/index.html'),
  '/settings/index.html': readFileSync(process.cwd() + '/settings/index.html'),
};
const srv = createServer((q, s) => {
  let path = q.url.split('?')[0];
  if (path.endsWith('/')) path += 'index.html';
  const body = files[path];
  if (!body){ s.writeHead(404); s.end(); return; }
  s.writeHead(200, { 'content-type': 'text/html' }); s.end(body);
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;

// ===================================================== /vj =========================
const pv = await b.newPage({ viewport: { width: 1440, height: 900 } });
pv.on('pageerror', e => errors.push(e.message));
await pv.addInitScript(() => { window.__MAGNETDEBUG = true; });
await pv.goto('http://127.0.0.1:' + port + '/vj/');
await pv.waitForTimeout(1200);
const v = await pv.evaluate(() => {
  const M = window.__magnet, o = {};
  o.vjview = document.body.classList.contains('vjview');
  o.panelToo = document.body.classList.contains('panel');
  o.built = document.getElementById('vjPanel').childElementCount;
  const card = document.querySelector('.card[data-sec="vj"]');
  o.cardOpen = !card.classList.contains('collapsed');
  // ⚠️ Measured as RENDERED BOXES, not classes — the collapsed card had the right
  // classes removed from the wrong element and still drew as a bare heading.
  o.panelH = Math.round(document.getElementById('vjPanel').getBoundingClientRect().height);
  const deckA = [...document.querySelectorAll('#vjPanel h3')].length;
  o.sections = deckA;
  // Full width: the deck surface must not still be sitting in a settings column.
  o.cardW = Math.round(card.getBoundingClientRect().width);
  // Nothing else on the page: every other direct child of #setup renders at zero.
  o.othersShown = [...document.querySelectorAll('#setup > *')]
    .filter(x => x !== card && x.getBoundingClientRect().height > 2).length;
  // The signpost TO /vj is hidden ON /vj — a door painted on the wall of the room.
  const link = document.getElementById('vjOpenBtn');
  o.signpostHidden = !link || link.getBoundingClientRect().height === 0;
  // It is a PANEL: the game must not be running behind it.
  o.noWorld = !M.world;
  return o;
});
await pv.close();
ok('/vj is the deck surface: panel flag, view flag, decks built', v.vjview && v.panelToo && v.built > 10,
   JSON.stringify(v));
ok('...the card is OPEN and has real rendered height', v.cardOpen && v.panelH > 600,
   JSON.stringify({ open: v.cardOpen, panelH: v.panelH }) +
   ' — the first build shipped as a heading with nothing under it, twice: a jump-bar chip stole the class change, then initCollapsibles re-collapsed the card');
ok('...at full width, not a settings column', v.cardW > 900,
   v.cardW + 'px wide on a 1440px window — a DJ rig in a 460px column is the report this route exists to fix');
ok('...and it is the ONLY thing on the page', v.othersShown === 0 && v.signpostHidden,
   JSON.stringify({ others: v.othersShown, signpostHidden: v.signpostHidden }));
ok('...with no game running behind it', v.noWorld, 'a panel that runs a match is two AudioContexts and a fight');

// ===================================================== /settings ===================
const ps = await b.newPage({ viewport: { width: 900, height: 900 } });
ps.on('pageerror', e => errors.push(e.message));
await ps.addInitScript(() => { window.__MAGNETDEBUG = true; });
await ps.goto('http://127.0.0.1:' + port + '/settings/');
await ps.waitForTimeout(1200);
const s = await ps.evaluate(() => {
  const o = {};
  o.decksBuilt = document.getElementById('vjPanel').childElementCount;
  o.vjview = document.body.classList.contains('vjview');
  document.querySelector('.card[data-sec="vj"] > h2').click();
  const link = document.getElementById('vjOpenBtn');
  o.linkThere = !!link;
  o.linkHref = link ? link.getAttribute('href') : '';
  o.linkVisible = link ? link.getBoundingClientRect().height > 10 : false;
  o.linkNewTab = link ? link.target === '_blank' : false;
  // The anchor wears the ghost-button dress — styled for buttons only, it rendered as
  // a default blue hyperlink in the middle of the card.
  o.linkStyled = link ? getComputedStyle(link).borderRadius !== '0px' &&
                        getComputedStyle(link).color !== 'rgb(0, 0, 238)' : false;
  return o;
});
await ps.close();
ok('THE DECKS ARE GONE FROM /settings', s.decksBuilt === 0 && !s.vjview,
   JSON.stringify(s) + ' — removing them from this screen is the ask, in those words');
ok('...and the signpost to /vj is there instead', s.linkThere && s.linkVisible && s.linkHref === 'vj/' && s.linkNewTab,
   JSON.stringify(s) + ' — a card that says the decks moved without saying where is a feature deleted');
ok('...dressed as a button, not a bare hyperlink', s.linkStyled, JSON.stringify(s));

// ===================================================== the game page ===============
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
pg.on('pageerror', e => errors.push(e.message));
await pg.addInitScript(() => { window.__MAGNETDEBUG = true; });
await pg.goto('file://' + process.cwd() + '/index.html');
await pg.waitForTimeout(800);
const g = await pg.evaluate(() => {
  const M = window.__magnet, o = {};
  o.vjview = M.VJVIEW;
  o.decksBuilt = document.getElementById('vjPanel').childElementCount;
  o.linkThere = !!document.getElementById('vjOpenBtn');
  // ⚠️ FIRST TO 3 IS THE DEFAULT MATCH LENGTH — asked for alongside this route. The
  // value is the LENGTHS key 'g3', and it must exist there or startMatch hands
  // `undefined.goals` to the whistle.
  o.defLen = M.defaultSel().length;
  o.lenExists = !!M.LENGTHS[M.defaultSel().length];
  o.lenIsFirstTo3 = (M.LENGTHS[M.defaultSel().length] || {}).goals === 3;
  return o;
});
await pg.close();
ok('the game page keeps the signpost and never the decks', !g.vjview && g.decksBuilt === 0 && g.linkThere,
   JSON.stringify(g));
ok('FIRST TO 3 IS THE DEFAULT MATCH LENGTH', g.defLen === 'g3' && g.lenExists && g.lenIsFirstTo3,
   JSON.stringify({ len: g.defLen, exists: g.lenExists, goals3: g.lenIsFirstTo3 }) +
   ' — and it must be a real LENGTHS key, or a fresh install hands undefined to the whistle');

srv.close();
await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
console.log(JSON.stringify({ v, s, g }, null, 1));
if (fails.length){ console.log('FAIL vjroute'); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('PASS vjroute');
