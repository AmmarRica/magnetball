// THE REPLAYS SECTION — pick a saved replay from the menu, watch it, come back.
//
// Loading a replay used to live only on the Watch screen. It now has its own menu card,
// because picking a file is something you do between matches and the round trip has to
// land you back where you started rather than on a bare canvas.
//
// Three things are held here:
//   1. the card exists, is reachable, and says WHERE files are saved — with the filename
//      taken from the real `repFilename()` so the example cannot drift from what is written;
//   2. watching from the menu hides the menu (a phone's `#setup` is a full-bleed fixed
//      screen over the canvas, so the replay would play perfectly and be invisible), and
//      then comes BACK to the card — from the end of the replay and from an early exit
//      alike, because `playReplay` resolves the same way for both;
//   3. it is a section like any other, so show mode hides it and the menu search stops
//      offering it.
//
// ⚠️ MEASUREMENT TRAP, and it cost real time here: `#setup [data-sec="replay"]` matches
// TWO nodes — the card AND its jump-bar chip — and the jump bar sits earlier in the
// document, so `querySelector` returns the CHIP. Every reading was of the chip: it looked
// as though the card was being detached on every rebuild (the chips genuinely are) and
// `getComputedStyle` returned an empty string because the captured chip was orphaned.
// Always qualify with `.card`.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const CARD = '#setup .card[data-sec="replay"]';

const page = async (w, h, mobile) => {
  const p = await b.newPage({ viewport:{ width:w, height:h }, isMobile:!!mobile, hasTouch:!!mobile });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  await p.evaluate(() => { const d = document.getElementById('dmCollect'); if (d) d.click(); });
  return p;
};

// ---- 1. the card, and what it says -----------------------------------------
{
  const p = await page(420, 900, true);
  const r = await p.evaluate((CARD) => {
    const M = window.__magnet;
    M.openSection('replay');
    const card = document.querySelector(CARD);
    return {
      // ⚠️ The trap itself, asserted so nobody "simplifies" the selector back.
      ambiguous: document.querySelectorAll('#setup [data-sec="replay"]').length,
      cards: document.querySelectorAll(CARD).length,
      shown: !!card && getComputedStyle(card).display !== 'none',
      opens: !!card && !card.classList.contains('collapsed'),
      button: !!document.getElementById('repWatchBtn'),
      rows: [...document.querySelectorAll('#repPathInfo .pathrow')]
        .map(x => [x.querySelector('.pathkey').textContent, x.querySelector('.pathval').textContent]),
      hint: (document.getElementById('repSkipHint') || {}).textContent || '',
      realName: M.repFilename(),
      pathHint: M.downloadPathHint(),
      inJumpBar: [...document.querySelectorAll('#jumpBar .jumpchip')].map(c => c.dataset.sec).includes('replay'),
      inSearch: M.menuSearchIndex().some(x => x.sec === 'replay'),
    };
  }, CARD);

  ok('the selector is ambiguous, so the suite qualifies it', r.ambiguous === 2 && r.cards === 1,
     r.ambiguous + ' nodes match the loose selector, ' + r.cards + ' match the qualified one');
  ok('the card is there and opens', r.shown && r.opens);
  ok('it has the pick-a-file button', r.button);
  ok('it is reachable from the jump bar and the search', r.inJumpBar && r.inSearch);

  // ⚠️ It has to SAY where files land — the whole reason the card carries a readout.
  const folder = (r.rows.find(x => /folder/i.test(x[0])) || [])[1] || '';
  const named  = (r.rows.find(x => /named/i.test(x[0])) || [])[1] || '';
  ok('it states the folder', folder.length > 3 && folder === r.pathHint, folder);
  // The kind is in the name now — a goal and a whole match off the same court are otherwise
  // the same filename twice, and one is twenty times the size of the other.
  ok('it states the filename', /^magnetball-(goal|match)-replay-.*\.json$/.test(named), named);
  // ⚠️ Built from the REAL filename, minus the timestamp — an example typed by hand is
  // an example that goes stale the next time the naming changes.
  ok('the example matches what actually gets written',
     named.replace('<date>', '') === r.realName.replace(/-\d[\d-]*\./, '-.'),
     named + ' vs ' + r.realName);
  // ⚠️ And it must not claim to know a real path. A page is never told the download
  // directory, so an absolute path read off the disk would be a fabrication.
  ok('the folder is a hint, not a fabricated absolute path',
     !/^\/(home|Users)\/[a-z]/i.test(folder) || folder.startsWith('~'), folder);
  // ⚠️ NOT per-device any more, and that is the fix rather than a regression. This hint
  // describes the replay you open from the MENU, which has a transport bar — and tapping the
  // pitch there deliberately does nothing, so a mis-tap cannot end something you sat down to
  // watch. "Tap the screen to stop early" was therefore an instruction that did not work.
  // The bar's ✕ is the way out and it is the same on every device.
  ok('the stop wording names the way out', /on the bar/i.test(r.hint), r.hint);
  await p.close();
}

// ---- 2. the round trip -----------------------------------------------------
// ⚠️ Driven by calling `watchReplayFile` with a stub picker, because a real file dialog
// cannot be opened headlessly. What is being measured is the AROUND part — menu out of
// the way, menu back afterwards — not the picker.
{
  const p = await page(420, 900, true);
  const r = await p.evaluate(async () => {
    const M = window.__magnet;
    // Record a real replay to play back.
    M.setMatchSeed(11); M.sel.mode = '3v3'; M.sel.field = 'classic'; M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 1;
    for (let i=0;i<200;i++) M.step(w);
    M.repOnGoal(w);
    const doc = M.repFileParse(JSON.stringify(M.repFileBuild()));
    M.toMenu();
    M.openSection('replay');

    const setupShown = () => !document.getElementById('setup').classList.contains('hidden');
    const o = { menuBefore: setupShown() };

    // The real menu path, with the file dialog stood in for.
    const run = M.watchReplayFile(() => { M.dockOrFull('setup'); M.openSection('replay'); },
                                  async () => doc);
    // Give playback a couple of frames, then look at the screen state.
    await new Promise(res => setTimeout(res, 120));
    o.menuDuring = setupShown();
    o.replayRunning = M.replay.active;
    o.hudHidden = document.getElementById('hud').classList.contains('hidden');
    // ⚠️ Exit early — the same call the tap-anywhere and any-key handlers make.
    M.skipReplay();
    await run;
    o.replayStopped = !M.replay.active;
    o.menuAfter = setupShown();
    return o;
  });
  ok('the menu is up before you start', r.menuBefore);
  ok('watching hides the menu', r.menuDuring === false,
     'the replay would play behind a full-bleed screen and be invisible');
  ok('the HUD is out of the way too', r.hudHidden);
  ok('playback actually ran', r.replayRunning);
  ok('an early exit stops it', r.replayStopped);
  ok('and the menu comes back', r.menuAfter);
  await p.close();
}

// ---- 2b. ...and the END and an EXIT are now DIFFERENT --------------------
// ⚠️ They used to be one code path — `playReplay` resolved the same way for a finished
// replay as for a skipped one, and this block proved it. That is deliberately no longer
// true. A replay you opened from the menu HOLDS on its last frame: reaching the end is not
// a request to leave, and closing took away watching it again, scrubbing back to the goal
// or slowing it down, all of which the transport offers. So only an exit comes back, and
// running to the end must NOT. ⚠️ Which also means `await`ing a finished chosen replay is a
// hang rather than a wait — it cost the suite twenty minutes before this was rewritten.
{
  const p = await page(420, 900, true);
  for (const mode of ['exit']){
    const r = await p.evaluate(async (mode) => {
      const M = window.__magnet;
      M.setMatchSeed(4); M.sel.mode = '1v1'; M.startMatch();
      const w = M.world; w.state='play'; w.stateT=1;
      for (let i=0;i<120;i++) M.step(w);
      M.repOnGoal(w);
      const doc = M.repFileParse(JSON.stringify(M.repFileBuild()));
      M.toMenu();
      let came = null;
      const run = M.watchReplayFile(() => {
        M.dockOrFull('setup'); M.openSection('replay');
        came = { setup: !document.getElementById('setup').classList.contains('hidden'),
                 open: !document.querySelector('#setup .card[data-sec="replay"]').classList.contains('collapsed') };
      }, async () => doc);
      await new Promise(r2 => setTimeout(r2, 100));
      M.skipReplay();
      await run;
      return came;
    }, mode);
    ok(`back to the menu after the ${mode}`, r && r.setup, JSON.stringify(r));
    ok(`...with the Replays card open after the ${mode}`, r && r.open, JSON.stringify(r));
  }
  // ...and running to the END holds instead, with the menu still out of the way.
  {
    const held = await p.evaluate(async () => {
      const M = window.__magnet;
      M.setMatchSeed(4); M.sel.mode = '1v1'; M.startMatch();
      const w = M.world; w.state='play'; w.stateT=1;
      for (let i=0;i<120;i++) M.step(w);
      M.repOnGoal(w);
      const doc = M.repFileParse(JSON.stringify(M.repFileBuild()));
      M.toMenu();
      let cameBack = false;
      M.watchReplayFile(() => { cameBack = true; }, async () => doc);
      // Long enough for a 2-second replay to run out several times over.
      await new Promise(r2 => setTimeout(r2, 5000));
      const o = { ended: M.replay.ended, active: M.replay.active, cameBack,
                  menuUp: !document.getElementById('setup').classList.contains('hidden') };
      M.replayAbort();
      await new Promise(r2 => setTimeout(r2, 150));
      o.leftAfterExit = !M.replay.active;
      // ⚠️ `cameBack` is the CALLBACK having run, not the menu being on screen — this
      // block's `back` deliberately only sets a flag, so asserting on `#setup` here would
      // fail for a reason that has nothing to do with the exit.
      o.calledBack = cameBack;
      return o;
    });
    ok('running to the end HOLDS it', held.ended && held.active,
       JSON.stringify(held) + ' — a chosen replay stays on its last frame so it can be watched again');
    ok('...without going back to the menu on its own', !held.cameBack && !held.menuUp,
       JSON.stringify(held) + ' — closing itself is what took away scrubbing back and slowing it down');
    ok('...and the exit is what returns you', held.leftAfterExit && held.calledBack,
       JSON.stringify(held) + ' — replayAbort has to settle the promise, or the caller\'s finally never runs and the menu never comes back');
  }
  await p.close();
}

// ---- 3. it is a section like any other -------------------------------------
{
  const p = await page(1100, 1000, false);
  const r = await p.evaluate((CARD) => {
    const M = window.__magnet;
    M.sel.showMode = true; M.applyShowMode();
    const on = { display: getComputedStyle(document.querySelector(CARD)).display,
                 inSearch: M.menuSearchIndex().some(x => x.sec === 'replay'),
                 inJump: [...document.querySelectorAll('#jumpBar .jumpchip')].map(c=>c.dataset.sec).includes('replay') };
    M.sel.showMode = false; M.applyShowMode();
    const off = { display: getComputedStyle(document.querySelector(CARD)).display,
                  inSearch: M.menuSearchIndex().some(x => x.sec === 'replay') };
    return { on, off };
  }, CARD);
  ok('show mode hides it', r.on.display === 'none', r.on.display);
  ok('...and the search stops offering it', !r.on.inSearch);
  ok('...and so does the jump bar', !r.on.inJump);
  ok('it comes back when show mode goes off', r.off.display !== 'none' && r.off.inSearch,
     JSON.stringify(r.off));
  await p.close();
}

// ---- 4. a rejected file leaves you where you were --------------------------
// ⚠️ Cancelling the dialog fires no `change` event, so a promise listening only for that
// would hang — and the caller's `finally` is what puts the menu back, which would make a
// cancelled pick a menu that never returns.
{
  const p = await page(420, 900, true);
  const r = await p.evaluate(async () => {
    const M = window.__magnet;
    M.toMenu(); M.openSection('replay');
    let backRan = false;
    await M.watchReplayFile(() => { backRan = true; }, async () => null);
    return { backRan, setup: !document.getElementById('setup').classList.contains('hidden'),
             notPlaying: !M.replay.active };
  });
  ok('a cancelled pick still returns', r.backRan && r.notPlaying, JSON.stringify(r));
  ok('...and leaves the menu up', r.setup);
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL replaysection\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS replaysection');
