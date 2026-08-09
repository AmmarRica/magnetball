// FORCED UPDATES, THE CHANGELOG, AND DELETING REPLAYS.
//
// Four things shipped together and they lean on each other, so they are held together:
//   1. an update check on every launch and every return to the app;
//   2. a persisted 30-day deadline, after which the game STOPS until it is updated;
//   3. a player-facing changelog, shown once after an update and any time from the menu;
//   4. a replay LIBRARY, because deleting a downloaded file is impossible for a web page.
//
// ⚠️ WHY (4) EXISTS AT ALL. Once a Blob has gone to the Downloads folder it belongs to the
// operating system: no web API can list it, move it or remove it. "Delete a replay" is only
// meaningful for a copy the page owns, so saving writes BOTH — the file to send or keep, and
// an IndexedDB entry to watch and delete.
//
// ⚠️ TRAP THIS SUITE CAUGHT, and it is the reason it exists in this shape: the deadline gate
// and the changelog were wired BELOW `if (!updPossible()) return;` in the boot block. That
// guard is correct for the network check and wrong for these two — neither needs a server —
// and on a `file://` page, which is where every suite here runs, it meant they never fired
// at all. Both are asserted from a plain file:// load for exactly that reason.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };
const DAY = 86400000;

const page = async (seed, w = 900, h = 1000) => {
  const p = await b.newPage({ viewport:{ width:w, height:h } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  if (seed) await p.addInitScript(seed);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(1000);
  await p.evaluate(() => { const d = document.getElementById('dmCollect'); if (d) d.click(); });
  return p;
};

// ---- 1 + 2. the deadline ---------------------------------------------------
{
  const p = await page();
  const r = await p.evaluate((DAY) => {
    const M = window.__magnet, o = {};
    o.cleanStart = M.updRec() === null && !M.updOverdue();
    // A newer build appears: the clock starts now.
    M.updNote('20991231.0100AM');
    o.recorded = !!M.updRec() && M.updRec().v === '20991231.0100AM';
    o.startsAtZero = M.updWaitingDays() === 0 && M.updDaysLeft() === 30 && !M.updOverdue();
    // ⚠️ Seeing the SAME build again must not restart it, or a player who opens the game
    // daily would never reach the deadline.
    M.updSaveRec({ v:'20991231.0100AM', first: Date.now() - 10*DAY });
    M.updNote('20991231.0100AM');
    o.sameVersionKeepsClock = M.updWaitingDays() === 10 && M.updDaysLeft() === 20;
    // ⚠️ A DIFFERENT build restarts it — each release gets its own thirty days.
    M.updNote('20991231.0200AM');
    o.newVersionResets = M.updWaitingDays() === 0 && M.updRec().v === '20991231.0200AM';
    // ⚠️ Offline (`null` — could not reach the server) must NOT clear the record, or going
    // offline would reset the deadline on every launch and the gate would never arrive.
    M.updSaveRec({ v:'20991231.0200AM', first: Date.now() - 31*DAY });
    M.updNote(null);
    o.offlineKeepsClock = M.updOverdue();
    // 30 days up: the game stops.
    M.startMatch();
    o.enforced = M.updEnforce();
    o.gateUp = !document.getElementById('updBlock').classList.contains('hidden');
    o.stopped = !M.running;
    // ⚠️ No way round it. A "Later" here would make the whole thing a suggestion.
    o.noLater = !document.querySelector('#updBlock #updLater') &&
                document.querySelectorAll('#updBlock button').length === 1;
    o.saysWhy = /Required/.test(document.getElementById('updBlockVers').textContent) &&
                /31 days/.test(document.getElementById('updBlockVers').textContent);
    // ⚠️ And it lets go the moment the update actually lands — without needing the network
    // to confirm it, which is what `r.v !== VERSION` buys.
    M.updNote(M.VERSION);
    o.releasedOnUpdate = M.updRec() === null && !M.updOverdue();
    return o;
  }, DAY);

  ok('a clean install has no deadline', r.cleanStart);
  ok('a newer build starts the clock', r.recorded && r.startsAtZero);
  ok('seeing the same build again does not restart it', r.sameVersionKeepsClock);
  ok('a different build does restart it', r.newVersionResets);
  ok('going offline does not reset the deadline', r.offlineKeepsClock);
  ok('past 30 days the game stops', r.enforced && r.gateUp && r.stopped,
     JSON.stringify({ e:r.enforced, g:r.gateUp, s:r.stopped }));
  ok('the gate has no way round it', r.noLater);
  ok('the gate says what is required and for how long', r.saysWhy);
  ok('installing the update releases it', r.releasedOnUpdate);
  await p.close();
}

// ---- 2b. the gate fires from a STORED record on a bare load ----------------
// ⚠️ From boot, on file://, with no network call at all — the case the `updPossible()`
// guard silently broke. A player who has been offline for a month is still stopped.
{
  const p = await page(() => {
    localStorage.setItem('magnetball.upd', JSON.stringify({ v:'20991231.0300AM', first: Date.now() - 45*86400000 }));
  });
  const r = await p.evaluate(() => ({
    gateUp: !document.getElementById('updBlock').classList.contains('hidden'),
    overdue: window.__magnet.updOverdue(),
    days: window.__magnet.updWaitingDays(),
  }));
  ok('an overdue record blocks at boot with no server', r.gateUp && r.overdue && r.days === 45,
     JSON.stringify(r));
  await p.close();
}

// ---- 2c. ...and a deadline still in the future does not ---------------------
{
  const p = await page(() => {
    localStorage.setItem('magnetball.upd', JSON.stringify({ v:'20991231.0400AM', first: Date.now() - 3*86400000 }));
  });
  const r = await p.evaluate(() => ({
    gateUp: !document.getElementById('updBlock').classList.contains('hidden'),
    left: window.__magnet.updDaysLeft(),
  }));
  ok('a fresh deadline does not block', !r.gateUp && r.left === 27, JSON.stringify(r));
  await p.close();
}

// ---- 3. the changelog ------------------------------------------------------
{
  const p = await page();
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.openSection('news');
    const blocks = [...document.querySelectorAll('#newsList .relblock')];
    return {
      entries: M.CHANGELOG.length,
      rendered: blocks.length,
      // ⚠️ Every `v` must be a real version string, and the running build must be IN the
      // list — a changelog that does not mention the version you are on is a stale one.
      shapes: M.CHANGELOG.every(e => /^\d{8}\.\d{4}(AM|PM)$/.test(e.v) && e.title &&
                                     (e.added || e.changed) && e.fixed),
      hasCurrent: M.CHANGELOG.some(e => e.v === M.VERSION),
      newestFirst: M.CHANGELOG[0].v === M.VERSION,
      marksYours: (blocks[0].querySelector('.relver') || {}).textContent || '',
      // ⚠️ ONE line for the bug fixes, every release. The rule is that a player does not
      // care which flex column was centring its overflow.
      oneFixLine: M.CHANGELOG.every(e => typeof e.fixed === 'string' && !/\n/.test(e.fixed)),
      // ...and nothing in it reads like an internal note.
      noJargon: !M.CHANGELOG.some(e => JSON.stringify(e).match(
        /flex|css|querySelector|IndexedDB|localStorage|refactor|TDZ|regex|z-index|predicate/i)),
      inSearch: M.menuSearchIndex().some(x => x.sec === 'news'),
    };
  });
  ok('the changelog renders every entry', r.rendered === r.entries && r.entries >= 2,
     r.entries + ' entries, ' + r.rendered + ' rendered');
  ok('every entry is a real version with content', r.shapes);
  ok('the running build is in it, at the top', r.hasCurrent && r.newestFirst);
  ok('your version is marked', /you have this/.test(r.marksYours), r.marksYours);
  ok('bug fixes are one generic line', r.oneFixLine);
  ok('nothing in it is written for a developer', r.noJargon,
     'a changelog that itemises internals is one nobody reads twice');
  ok('the card is findable in the menu search', r.inSearch);
  await p.close();
}

// ---- 3b. shown once after an update, never to a new player -----------------
{
  const fresh = await page();
  const a = await fresh.evaluate(() => ({
    modal: !document.getElementById('newsModal').classList.contains('hidden'),
    stored: localStorage.getItem('magnetball.lastver'),
  }));
  // ⚠️ A brand new player has nothing to catch up on — "what's new" as the first thing you
  // ever see is a changelog for a game you have not played. But the version is RECORDED, or
  // the next launch would show it as though something had changed.
  ok('a first-ever visit shows nothing but records the version',
     !a.modal && a.stored && a.stored.length > 4, JSON.stringify(a));
  await fresh.close();

  const upd = await page(() => localStorage.setItem('magnetball.lastver', '20260101.0100AM'));
  const c = await upd.evaluate(() => ({
    shown: !document.getElementById('newsModal').classList.contains('hidden'),
    blocks: document.querySelectorAll('#newsBody .relblock').length,
    lines: document.querySelectorAll('#newsBody .rellist li').length,
    says: document.getElementById('newsVers').textContent,
  }));
  ok('coming from an older version shows it', c.shown, JSON.stringify(c));
  // ⚠️ Just the release you landed on, not the whole history — a wall of every release is
  // not what anybody wants after a reload.
  ok('and only the release you landed on', c.blocks === 1 && c.lines >= 2, JSON.stringify(c));
  ok('it says which version', /Updated to v/.test(c.says), c.says);
  const d = await upd.evaluate(() => {
    document.getElementById('newsOk').click();
    return { hidden: document.getElementById('newsModal').classList.contains('hidden'),
             stored: localStorage.getItem('magnetball.lastver'),
             ver: window.__magnet.VERSION };
  });
  ok('dismissing records the version so it fires once', d.hidden && d.stored === d.ver,
     JSON.stringify(d));
  await upd.close();
}

// ---- 4. the replay library, and DELETE ------------------------------------
{
  const p = await page(undefined, 480, 950);
  const r = await p.evaluate(async () => {
    const M = window.__magnet, o = {};
    M.setMatchSeed(3); M.sel.mode = '3v3'; M.startMatch();
    const w = M.world; w.state='play'; w.stateT=1;
    for (let i=0;i<150;i++) M.step(w);
    M.repOnGoal(w);
    const doc = M.repFileBuild();
    await M.repLibAdd(doc); await M.repLibAdd(doc); await M.repLibAdd(doc);
    M.toMenu(); M.openSection('replay');
    await M.buildReplayList();

    const rows = () => [...document.querySelectorAll('#repList .reprow')];
    o.listed = rows().length;
    o.sub = document.getElementById('repListSub').textContent;
    o.labelled = rows()[0].querySelector('.reptxt b').textContent;
    // ⚠️ Three buttons per row, one of which deletes, side by side on a phone: 44px each.
    o.taps = [...rows()[0].querySelectorAll('.repbtn')]
      .map(x => Math.round(Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height)));
    o.labels = [...rows()[0].querySelectorAll('.repbtn')].map(x => x.getAttribute('aria-label'));
    o.rowFits = rows()[0].scrollWidth <= rows()[0].clientWidth + 1;

    // ⚠️ DELETE TAKES TWO PRESSES. Irreversible, and a stray thumb on a phone is exactly
    // how somebody loses the goal they saved.
    const del = rows()[0].querySelector('.repbtn.del');
    del.click();
    o.afterOnePress = (await M.repLibAll()).length;
    o.armed = /sure/i.test(del.textContent);
    del.click();
    await new Promise(res => setTimeout(res, 200));
    o.afterTwoPresses = (await M.repLibAll()).length;

    // Delete all, also two presses.
    const bulk = document.getElementById('repClearAll');
    o.bulkOffered = getComputedStyle(bulk).display !== 'none';
    bulk.click();
    o.bulkAfterOne = (await M.repLibAll()).length;
    bulk.click();
    await new Promise(res => setTimeout(res, 200));
    o.bulkAfterTwo = (await M.repLibAll()).length;
    await M.buildReplayList();
    o.emptyMessage = !!document.querySelector('#repList .mvempty');
    o.bulkHiddenWhenEmpty = getComputedStyle(bulk).display === 'none';

    // ⚠️ Saving writes BOTH copies. The file is what a page can never delete, which is the
    // whole reason the library exists; the library entry is what delete acts on.
    // ⚠️ A live match is needed first: `toMenu()` above sets `world = null`, and
    // `repFileBuild` correctly refuses without one — so re-record rather than measuring a
    // refusal and calling it a bug.
    M.setMatchSeed(5); M.sel.mode = '1v1'; M.startMatch();
    const w2 = M.world; w2.state='play'; w2.stateT=1;
    for (let i=0;i<120;i++) M.step(w2);
    M.repOnGoal(w2);
    let downloaded = null;
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { downloaded = blob.size; return realCreate.call(URL, blob); };
    const okSave = M.saveReplayFile();
    URL.createObjectURL = realCreate;
    await new Promise(res => setTimeout(res, 250));
    o.saveWroteFile = okSave && downloaded > 1000;
    o.saveWroteLibrary = (await M.repLibAll()).length === 1;

    // A cap, or the store grows for ever.
    o.cap = M.REPLIB.max;
    return o;
  });

  ok('saved replays are listed', r.listed === 3, String(r.listed));
  ok('the list says how many and how big', /3 replays · \d+ KB/.test(r.sub), r.sub);
  ok('a row names its court and mode', /Classic · 3v3/.test(r.labelled), r.labelled);
  ok('every row button is a 44px target', r.taps.every(t => t >= 44), r.taps.join());
  ok('the buttons are labelled for a screen reader', r.labels.every(Boolean), JSON.stringify(r.labels));
  ok('a row fits without overflowing', r.rowFits);
  ok('one press arms delete, it does not delete', r.afterOnePress === 3 && r.armed,
     r.afterOnePress + ' left, armed=' + r.armed);
  ok('the second press deletes', r.afterTwoPresses === 2, String(r.afterTwoPresses));
  ok('delete-all is offered when there is something to delete', r.bulkOffered);
  ok('delete-all also takes two presses', r.bulkAfterOne === 2 && r.bulkAfterTwo === 0,
     r.bulkAfterOne + ' → ' + r.bulkAfterTwo);
  ok('an empty library explains itself', r.emptyMessage && r.bulkHiddenWhenEmpty);
  ok('saving writes the FILE and the library entry', r.saveWroteFile && r.saveWroteLibrary,
     JSON.stringify({ file:r.saveWroteFile, lib:r.saveWroteLibrary }));
  ok('the library is capped', r.cap > 0 && r.cap <= 100, String(r.cap));
  await p.close();
}

// ---- 4b. a library entry plays through the same path as a file ------------
{
  const p = await page(undefined, 480, 950);
  const r = await p.evaluate(async () => {
    const M = window.__magnet;
    M.setMatchSeed(7); M.sel.mode = '1v1'; M.startMatch();
    const w = M.world; w.state='play'; w.stateT=1;
    for (let i=0;i<120;i++) M.step(w);
    M.repOnGoal(w);
    await M.repLibAdd(M.repFileBuild());
    M.toMenu(); M.openSection('replay');
    await M.buildReplayList();
    const play = document.querySelector('#repList .reprow .repbtn');
    play.click();
    await new Promise(res => setTimeout(res, 150));
    const o = { menuHidden: document.getElementById('setup').classList.contains('hidden'),
                playing: M.replay.active };
    M.skipReplay();
    await new Promise(res => setTimeout(res, 250));
    o.menuBack = !document.getElementById('setup').classList.contains('hidden');
    o.stopped = !M.replay.active;
    return o;
  });
  ok('Watch on a library row hides the menu and plays', r.menuHidden && r.playing,
     JSON.stringify(r));
  ok('...and comes back like the file path does', r.menuBack && r.stopped, JSON.stringify(r));
  await p.close();
}

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL forceupdate\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS forceupdate');
