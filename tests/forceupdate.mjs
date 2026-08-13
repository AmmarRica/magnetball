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

// ---- 1b. VERSIONS ARE COMPARED, NOT DIFFED --------------------------------
// ⚠️ THE BRICK THIS FIXES. `r.v !== VERSION` reads as "there is an update" and is not: it
// is also true when the running build is NEWER than the one on record. A player who
// updated past a recorded build, or whose record went stale, was blocked for ever — and
// offline there is no check that could ever clear it. The same bug meant a rollback deploy
// would start a 30-day countdown to install an OLDER build.
{
  const p = await page();
  const r = await p.evaluate((DAY) => {
    const M = window.__magnet, o = {};
    o.parsesOwn = M.verNum(M.VERSION) > 0;
    // ⚠️ The 12-hour clock is where a naive parse goes wrong: 12:01AM is the FIRST minute
    // of a day and 12:01PM is just past noon, so both wrap to hour 0 before the PM shift.
    o.ordersMinutes = M.verNum('20260810.0140AM') < M.verNum('20260810.0141AM');
    o.ordersNoon    = M.verNum('20260810.1159AM') < M.verNum('20260810.1201PM');
    o.ordersMidnight= M.verNum('20260810.1201AM') < M.verNum('20260810.0100AM');
    o.ordersDays    = M.verNum('20260810.1159PM') < M.verNum('20260811.1201AM');
    o.rejectsJunk   = M.verNum('nonsense') === null && M.verNum('') === null;
    o.newerIsStrict = !M.updNewer(M.VERSION) && M.updNewer('20991231.1159PM') &&
                      !M.updNewer('20200101.0100AM') && !M.updNewer('nonsense');
    // A record naming a build we have already passed must NOT lock the game.
    M.updSaveRec({ v:'20200101.0100AM', first: Date.now() - 40*DAY });
    o.olderNeverBlocks = !M.updOverdue();
    // Nor may one we cannot read.
    M.updSaveRec({ v:'nonsense', first: Date.now() - 40*DAY });
    o.junkNeverBlocks = !M.updOverdue();
    // A rollback deploy must not be recorded as something to install.
    M.updSaveRec(null); M.updNote('20200101.0100AM');
    o.rollbackIgnored = M.updRec() === null;
    // ...and a genuinely newer build still does everything it did before.
    M.updNote('20991231.0100AM');
    o.realNewerRecorded = !!M.updRec();
    M.updSaveRec({ v:'20991231.0100AM', first: Date.now() - 40*DAY });
    o.realNewerStillBlocks = M.updOverdue();
    M.updSaveRec(null);
    return o;
  }, DAY);
  ok('the running version parses', r.parsesOwn);
  ok('stamps order by minute', r.ordersMinutes);
  ok('...across noon', r.ordersNoon);
  ok('...across midnight', r.ordersMidnight);
  ok('...and across days', r.ordersDays);
  ok('an unreadable stamp is refused, not guessed', r.rejectsJunk);
  ok('"newer" is strict and one-directional', r.newerIsStrict);
  ok('a build we have PASSED never locks the game', r.olderNeverBlocks,
     'this is the brick: offline, nothing could ever clear it');
  ok('an unreadable record never locks the game', r.junkNeverBlocks);
  ok('a rollback deploy is not offered as an update', r.rollbackIgnored);
  ok('a genuinely newer build is still recorded', r.realNewerRecorded);
  ok('...and still blocks after 30 days', r.realNewerStillBlocks);
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
    // ⚠️ The changelog lives INSIDE the About card. They used to be two cards with a button
    // in About whose only job was to jump to the other, and they answer one question — what
    // am I running, and what changed in it.
    M.openSection('about');
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
      inSearch: M.menuSearchIndex().some(x => x.sec === 'about'),
      // ...and there is no separate card left behind for it.
      noNewsCard: !document.querySelector('#setup .card[data-sec="news"]'),
      // The version and the update check are still in the same place as the notes.
      versionWithIt: !!document.querySelector('#setup .card[data-sec="about"] #ver') &&
                     !!document.querySelector('#setup .card[data-sec="about"] #updCheckBtn') &&
                     !!document.querySelector('#setup .card[data-sec="about"] #newsList'),
    };
  });
  ok('the changelog renders every entry', r.rendered === r.entries && r.entries >= 2,
     r.entries + ' entries, ' + r.rendered + ' rendered');
  ok('every entry is a real version with content', r.shapes);
  ok('the running build is in it, at the top', r.hasCurrent && r.newestFirst);
  ok('your version is marked', /you have this/.test(r.marksYours), r.marksYours);
  ok('bug fixes are one generic line', r.oneFixLine);
  ok('the changelog is IN the About card, not a card of its own', r.noNewsCard && r.versionWithIt,
     JSON.stringify({ noNewsCard: r.noNewsCard, together: r.versionWithIt }) +
     ' — the version, the update check and the release notes are three parts of one answer, and they were two accordion rows, two jump-bar chips and a button whose only job was to hop between them');
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

// ---- 3c. the About card -----------------------------------------------------
// The version and the update check moved here from under the title and the top of the
// menu. Both are things you go looking for once, and neither was worth the two permanent
// lines they cost at the top of every visit.
{
  const p = await page();
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.openSection('about');
    const card = document.querySelector('#setup .card[data-sec="about"]');
    const ver = document.getElementById('ver');
    return {
      card: !!card,
      // ⚠️ Both are INSIDE the card, not merely present somewhere on the page — the ask was
      // to move them, and a duplicate left behind at the top would satisfy a looser check.
      verInside: !!card && card.contains(ver),
      updInside: !!card && !!card.querySelector('#updCheckBtn'),
      verText: ver ? ver.textContent : '',
      verRight: ver && ver.textContent === 'v' + M.VERSION,
      // ...and gone from where they were.
      noLogoVer: !document.querySelector('.logo .ver'),
      noTopUpd: !document.querySelector('#setup > #updCheckBtn'),
      status: (document.getElementById('aboutUpd') || {}).textContent || '',
      inJump: [...document.querySelectorAll('#jumpBar .jumpchip')].map(c => c.dataset.sec).includes('about'),
      inSearch: M.menuSearchIndex().some(x => x.sec === 'about'),
    };
  });
  ok('the About card exists', r.card);
  ok('the version lives in it', r.verInside && r.verRight, r.verText);
  ok('the update check lives in it', r.updInside);
  ok('...and neither is left behind where it was', r.noLogoVer && r.noTopUpd,
     JSON.stringify({ logo:r.noLogoVer, top:r.noTopUpd }));
  ok('it is reachable from the jump bar and the search', r.inJump && r.inSearch);
  // ⚠️ On a file:// page there is no server to ask, so the status must SAY that rather
  // than claim to be up to date — which would be a guess presented as a fact.
  ok('with no server it says so', /no server/.test(r.status), r.status);

  // ---- ⚠️ ONE TAP COPIES THE VERSION -------------------------------------
  // The version is the first thing anybody is asked for in a report, and reading a
  // timestamp off a phone and retyping it is where it gets transcribed wrong — which has
  // already cost a round of "which build are you on".
  {
    const c = await p.evaluate(async () => {
      const M = window.__magnet, o = {};
      { const dm = document.getElementById('dmCollect'); if (dm) dm.click(); }
      M.openLook('about');
      await new Promise(r => setTimeout(r, 200));
      const ai = document.getElementById('aboutInfo');
      o.isATarget = ai.getAttribute('role') === 'button' && ai.tabIndex === 0;
      // ⚠️ Scroll to it FIRST and hit-test its CENTRE. About is the last card, so its box
      // is off-screen otherwise and elementFromPoint returns null — which fails for a
      // reason that has nothing to do with the control. Same trap #lobbyStartBtn hit:
      // `.click()` dispatches at the node and does no hit testing at all, so it would pass
      // over a completely unpressable element.
      ai.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 150));
      const b = ai.getBoundingClientRect();
      o.tall = Math.round(b.height);
      const hit = document.elementFromPoint(b.left + b.width/2, b.top + b.height/2);
      o.pressable = hit === ai || ai.contains(hit);
      o.hitName = hit ? (hit.id || hit.className || hit.tagName) : 'null';
      o.report = M.aboutReport();
      o.hasVersion = o.report.indexOf(M.VERSION) >= 0;
      // ⚠️ Nothing personal goes on a clipboard the player will paste into a bug report.
      o.noProfile = !/data:image|photo/i.test(o.report) &&
                    (!M.profile.name || o.report.indexOf(M.profile.name) < 0);
      // ⚠️ PRESS IT, do not call the function. Calling `copyAbout()` directly exercises the
      // copying and nothing about the wiring — verified: deleting the onclick binding
      // altogether left this green. `.click()` still does no hit testing, which is why
      // `pressable` above is a separate elementFromPoint check; between the two, an
      // unreachable control and an unwired one both fail.
      document.getElementById('aboutCopyHint').textContent = 'Tap to copy';
      ai.click();
      await new Promise(r => setTimeout(r, 250));
      o.saidSo = document.getElementById('aboutCopyHint').textContent;
      o.copied = /copied/i.test(o.saidSo);
      await new Promise(r => setTimeout(r, 2100));
      o.resets = document.getElementById('aboutCopyHint').textContent;
      return o;
    });
    ok('the version block is a press target', c.isATarget, JSON.stringify(c));
    ok('...that is actually pressable', c.pressable,
       `a tap at its centre landed on ${c.hitName} — .click() does no hit testing, so it would pass over a control nothing can reach`);
    ok('...and big enough to hit', c.tall >= 44, `${c.tall}px tall`);
    ok('it copies the running version', c.hasVersion, JSON.stringify(c.report));
    ok('...and nothing personal with it', c.noProfile, JSON.stringify(c.report));
    ok('pressing it copies', c.copied === true,
       `pressing the block left the hint reading ${JSON.stringify(c.saidSo)} — this is the wiring, not the copying: calling copyAbout() by hand passes with the onclick deleted`);
    ok('...and SAYS it worked', /copied/i.test(c.saidSo),
       `hint read ${JSON.stringify(c.saidSo)} — a copy button that does nothing visible reads as broken, which is the Save clip lesson`);
    ok('...then goes back to the invitation', /tap to copy/i.test(c.resets), c.resets);
  }

  // The status follows the record, and counts down with it.
  const live = await p.evaluate((DAY) => {
    const M = window.__magnet;
    M.updSaveRec({ v:'20991231.0100AM', first: Date.now() - 27*DAY });
    M.buildAbout();
    const waiting = document.getElementById('aboutUpd').textContent;
    M.updSaveRec(null); M.buildAbout();
    return { waiting, cleared: document.getElementById('aboutUpd').textContent };
  }, DAY);
  ok('a waiting build is named, with the days left',
     /20991231\.0100AM/.test(live.waiting) && /3 days/.test(live.waiting), live.waiting);
  ok('...and clears when there is nothing waiting', !/available/.test(live.cleared), live.cleared);
  await p.close();
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

// ---- 4c. the library is SPLIT, and that is a performance guarantee --------
// ⚠️ With the frames inline, listing the library structured-cloned every replay in full:
// twenty saved replays measured **68ms** to draw twenty lines of text, on every rebuild of
// the settings screen. Metadata and payload are separate stores now, so the list reads a
// few numbers per row and the frames are fetched only when something is watched.
{
  const p = await page(undefined, 900, 1000);
  const r = await p.evaluate(async () => {
    const M = window.__magnet, o = {};
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=1;
    for (let i=0;i<120;i++) M.step(w);
    M.repOnGoal(w);
    const doc = M.repFileBuild();
    for (let i=0;i<20;i++) await M.repLibAdd(doc);

    const rows = await M.repLibAll();
    o.rows = rows.length;
    // ⚠️ The guarantee, stated as a property rather than a stopwatch: a metadata row must
    // carry NO frames. A timing threshold on a CI box is a flake; this is the actual rule.
    o.metaIsThin = rows.every(x => !('doc' in x) && !('json' in x) && !('frames' in x && Array.isArray(x.frames)));
    o.metaHasWhatTheListNeeds = rows.every(x => x.field && x.mode && x.players > 0 && x.bytes > 0);
    let t = performance.now(); await M.repLibAll(); o.metaMs = performance.now() - t;
    // The payload is still there, on demand, and still a usable replay.
    const one = await M.repLibGet(rows[0].id);
    o.payloadUsable = !!one && one.frames.length > 0 && one.players.length > 0 &&
                      one.format === 'magnetball-replay';
    // ⚠️ Delete has to clear BOTH stores in one go — half a delete leaves a listed replay
    // whose frames are gone, which fails later as a replay that will not play.
    await M.repLibDel(rows[0].id);
    o.metaGone = (await M.repLibAll()).length === 19;
    o.payloadGone = await M.repLibGet(rows[0].id).then(() => false).catch(() => true);
    await M.repLibClear();
    o.clearedBoth = (await M.repLibAll()).length === 0;
    return o;
  });
  ok('twenty replays list', r.rows === 20, String(r.rows));
  ok('a metadata row carries no frames', r.metaIsThin,
     'listing them was 68ms of structured clone for twenty lines of text');
  ok('...but everything the list draws', r.metaHasWhatTheListNeeds);
  ok('reading the whole list is cheap', r.metaMs < 25, r.metaMs.toFixed(1) + 'ms');
  ok('the payload is still there on demand', r.payloadUsable);
  ok('delete clears both stores', r.metaGone && r.payloadGone,
     JSON.stringify({ meta:r.metaGone, payload:r.payloadGone }));
  ok('so does delete-all', r.clearedBoth);
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
