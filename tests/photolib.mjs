// A HUNDRED SAVED PHOTOS, and a delete you have to mean.
//
// Every photo you import is kept, so a shared device can hold a face per person and
// you pick yours rather than re-taking it. Deleting ARMS first — press Delete, tick
// the ones to go, then confirm — because the tiles are small and close together and a
// delete cannot be undone. That is the replay list's two-press rule applied to a grid
// where you usually want several gone at once, so it is a selection rather than a
// per-tile arm.
//
// Four things are held:
//   1. photos are stored, listed newest first, capped at PHOTOLIB.max, and picking one
//      wears it WITHOUT adding a copy — re-adding on every pick fills a hundred slots
//      with one face;
//   2. ⚠️ the delete flow does nothing until it is confirmed. A single tap in the grid
//      must never remove anything;
//   3. ⚠️ deleting the photo you are WEARING takes it off your face too. A worn photo
//      whose data is gone is a plate with nothing behind it;
//   4. ⚠️ THE UPGRADE DOES NOT EAT YOUR REPLAYS. The photo store arrived as a version
//      bump on the database the replay library already owned, and that handler dropped
//      both replay stores unconditionally — written for a v1→v2 migration, it would
//      have deleted every saved replay on the way to v3. Gated on `oldVersion`, and
//      measured by building a v2 database BY HAND and handing it to the app to upgrade
//      — see the trap note on that block for why the obvious version does not work.
//
// ⚠️ MEASUREMENT TRAP: IndexedDB is asynchronous and `buildPhotoGrid` paints from a
// promise, so reading the DOM straight after an import measures the grid as it was
// before. Everything below awaits the library call itself and then waits for the grid
// to catch up, rather than assuming a frame is enough.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const errors = [], fails = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const p = await b.newPage({ viewport:{ width:900, height:1000 } });
p.on('pageerror', e => errors.push(e.message));
p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear();
  localStorage.setItem('magnetball.firstrun','1'); });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const r = await p.evaluate(async () => {
  const M = window.__magnet; const o = {};
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  const wait = ms => new Promise(res => setTimeout(res, ms));
  // A distinct 1px image per index, so "which photo" is answerable rather than assumed.
  const shot = i => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 8;
    const c = cv.getContext('2d');
    c.fillStyle = `rgb(${(i*20)%256},${(i*7)%256},${(i*3)%256})`; c.fillRect(0,0,8,8);
    return cv.toDataURL('image/png');
  };
  const grid = () => document.getElementById('photoGrid');
  const tiles = () => [...(grid() ? grid().querySelectorAll('.phototile') : [])];
  const headBtns = () => [...(grid() ? grid().querySelectorAll('.photohead button') : [])];
  const btn = re => headBtns().find(x => re.test(x.textContent));
  // ⚠️ Guarded. A build where a plain tap DELETES empties the grid under the test, and
  // an unguarded `tiles()[2].click()` then throws — which fails the run, but as a stack
  // trace rather than as the sentence that says what went wrong. `missed` carries it.
  let missed = 0;
  const tap = i => { const t = tiles()[i]; if (!t){ missed++; return false; } t.click(); return true; };
  // Same guard for the header buttons: an empty grid has no header, so `btn(...)` is
  // undefined and the sabotage that empties it dies on the dot instead of reporting.
  const press = re => { const x = btn(re); if (!x){ missed++; return false; } x.click(); return true; };
  // ⚠️ The grid paints from a promise. Poll for the count rather than waiting a frame.
  const gridSettles = async (want) => {
    for (let i = 0; i < 60; i++){ if (tiles().length === want) return true; await wait(25); }
    return false;
  };

  M.openSection('player');
  M.showSubTab('player', 'photo');
  await wait(100);

  // ---- 1. storing, listing, capping ---------------------------------------
  o.startsEmpty = (await M.photoLibAll()).length;
  for (let i = 0; i < 5; i++) await M.photoLibAdd(shot(i));
  const five = await M.photoLibAll();
  o.stored = five.length;
  // Newest first — the one just added is at the top.
  o.newestFirst = five[0].url === shot(4);
  o.declaredMax = M.PHOTOLIB.max;
  o.maxIsAHundred = M.PHOTOLIB.max === 100;

  M.buildPhotoPane();
  o.gridShows = await gridSettles(5);
  o.tileCount = document.querySelectorAll('#photoGrid .phototile').length;

  // Picking one WEARS it, and does not add a copy.
  const before = (await M.photoLibAll()).length;
  tap(2);
  await wait(200);
  o.wornAfterPick = M.profile.photo === five[2].url;
  o.flagIsPhoto = M.profile.flag === 'photo';
  o.pickAddedNothing = (await M.photoLibAll()).length === before;

  // ---- 2. the delete flow arms, and does nothing until confirmed ----------
  M.buildPhotoPane(); await gridSettles(5);
  o.noDeleteBeforeArming = !!btn(/^Delete…$/);
  // ⚠️ A plain tap in the grid must not remove anything. This is the assertion that
  // catches a one-tap delete, which is what a grid of small tiles makes very easy.
  tap(0); await wait(200);
  o.plainTapDeletesNothing = (await M.photoLibAll()).length === 5;

  press(/^Delete…$/); await wait(120);
  o.armedShowsCancel = !!btn(/^Cancel$/);
  o.armedConfirmIsBlank = !!btn(/^Delete$/);           // nothing ticked yet
  // Ticking is still not deleting.
  tap(0); tap(1); await wait(200);
  o.afterTicking = (await M.photoLibAll()).length;
  o.tickingDeletesNothing = o.afterTicking === 5;
  // ⚠️ The confirm SAYS HOW MANY. "Delete" over a grid you have been tapping is a
  // button whose consequence you have to remember.
  o.confirmSaysCount = !!btn(/^Delete 2$/);
  o.tickedAreMarked = document.querySelectorAll('#photoGrid .phototile.picked').length === 2;

  // Cancelling leaves everything alone.
  press(/^Cancel$/); await wait(200);
  o.afterCancel = (await M.photoLibAll()).length;
  o.cancelKeepsThemAll = o.afterCancel === 5;
  o.cancelClearsTicks = document.querySelectorAll('#photoGrid .phototile.picked').length === 0;

  // ...and confirming removes exactly the ticked ones.
  const listBefore = (await M.photoLibAll()).map(x => x.url);
  press(/^Delete…$/); await wait(120);
  tap(0); tap(3); await wait(200);
  press(/^Delete 2$/); await wait(400);
  const after = await M.photoLibAll();
  o.afterConfirm = after.length;
  o.confirmRemovesTicked = after.length === 3 &&
    !after.some(x => x.url === listBefore[0]) && !after.some(x => x.url === listBefore[3]) &&
    after.some(x => x.url === listBefore[1]) && after.some(x => x.url === listBefore[2]);
  o.disarmedAfter = !!btn(/^Delete…$/);

  // ---- 3. deleting the one you are WEARING takes it off ------------------
  await M.photoLibDel((await M.photoLibAll()).map(x => x.id));
  await M.photoLibAdd(shot(41)); await M.photoLibAdd(shot(42));
  M.buildPhotoPane(); await gridSettles(2);
  tap(0); await wait(250);                 // wear the newest
  o.wearingBeforeDelete = M.profile.photo === shot(42);
  M.buildPhotoPane(); await gridSettles(2);
  press(/^Delete…$/); await wait(120);
  tap(0); await wait(150);                 // tick the one being worn
  press(/^Delete 1$/); await wait(500);
  o.wornCleared = !M.profile.photo;
  o.flagCleared = M.profile.flag !== 'photo';
  o.otherKept = (await M.photoLibAll()).length === 1;

  // ---- 4. the cap ---------------------------------------------------------
  // ⚠️ Over the limit, and the OLDEST goes — the same rule the replay library uses,
  // because nothing else would ever remove one.
  await M.photoLibDel((await M.photoLibAll()).map(x => x.id));
  for (let i = 0; i < M.PHOTOLIB.max + 4; i++) await M.photoLibAdd(shot(100 + i));
  const capped = await M.photoLibAll();
  o.capHeld = capped.length === M.PHOTOLIB.max;
  o.missedTiles = missed;
  o.oldestWentFirst = !capped.some(x => x.url === shot(100)) &&
                       capped.some(x => x.url === shot(100 + M.PHOTOLIB.max + 3));
  await M.photoLibDel(capped.map(x => x.id));
  return o;
});

// ---- 5. the upgrade must not eat the replays --------------------------------
// ⚠️ THE ONE THAT WOULD MATTER. The photo store arrived as a version bump on the
// database the replay library already owned, and that upgrade handler dropped both
// replay stores unconditionally — it was written for a v1→v2 migration where the old
// schema was hours old. Reached from v2 it would have deleted every replay a player
// had saved, silently, on the first launch after the update.
//
// ⚠️ MEASUREMENT TRAP, and the first version of this check fell straight into it:
// IndexedDB is NOT shared between `file://` pages in this harness — verified with a
// bare probe, where a write in one page read back as "store missing" in the next. So
// "save, reload, read it back" measures the harness and nothing else, and it fails
// identically whether the guard is there or not. The v2 database is built BY HAND in
// one page instead, with the old schema and a row in it, and then handed to the app's
// own `repLibOpen` to upgrade.
{
  const q = await b.newPage({ viewport:{ width:900, height:900 } });
  q.on('pageerror', e => errors.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true;
    localStorage.setItem('magnetball.firstrun','1'); });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const up = await q.evaluate(async () => {
    const M = window.__magnet;
    const del = name => new Promise(res => { const r = indexedDB.deleteDatabase(name);
      r.onsuccess = r.onerror = r.onblocked = () => res(); });
    await del(M.REPLIB.db);
    // Build the PREVIOUS schema by hand: the two replay stores, at version 2.
    const seeded = await new Promise((res, rej) => {
      const r = indexedDB.open(M.REPLIB.db, 2);
      r.onupgradeneeded = () => { const db = r.result;
        db.createObjectStore(M.REPLIB.store, { keyPath:'id' });
        db.createObjectStore(M.REPLIB.blobs, { keyPath:'id' }); };
      r.onsuccess = () => { const db = r.result;
        const tx = db.transaction([M.REPLIB.store, M.REPLIB.blobs], 'readwrite');
        tx.objectStore(M.REPLIB.store).put({ id:'old-1', saved:1, field:'classic', mode:'1v1', players:2, frames:3, bytes:9 });
        tx.objectStore(M.REPLIB.blobs).put({ id:'old-1', json:'{}' });
        tx.oncomplete = () => { db.close(); res(true); };
        tx.onerror = () => { db.close(); rej(tx.error); }; };
      r.onerror = () => rej(r.error);
    });
    // ...then let the APP open it, which runs the real upgrade to v3.
    const rows = await M.repLibAll();
    const photos = await M.photoLibAll();
    // ...and the new store genuinely works afterwards.
    await M.photoLibAdd('data:image/png;base64,iVBORw0KGgo=');
    const after = await M.photoLibAll();
    return { seeded, version: M.REPLIB.v, ids: rows.map(x => x.id),
             photosBefore: photos.length, photosAfter: after.length };
  });
  await q.close();
  ok('the fixture built a v2 database', up.seeded && up.version === 3, JSON.stringify(up));
  ok('a saved replay survives the photo-store upgrade', up.ids.includes('old-1'),
     `came back with ${JSON.stringify(up.ids)} — the v3 bump dropped the replay stores, which is every replay the player had`);
  ok('...and the new photo store works after it', up.photosBefore === 0 && up.photosAfter === 1,
     JSON.stringify(up));
}

ok('every tile the suite reached for was there', r.missedTiles === 0,
   `${r.missedTiles} taps found no tile — the grid emptied under the test, which is what a one-tap delete does`);
ok('the library starts empty', r.startsEmpty === 0, String(r.startsEmpty));
ok('photos are stored', r.stored === 5, String(r.stored));
ok('...newest first', r.newestFirst);
ok('...up to a hundred', r.maxIsAHundred, String(r.declaredMax));
ok('the grid shows them', r.gridShows, r.tileCount + ' tiles');
ok('picking one wears it', r.wornAfterPick && r.flagIsPhoto);
ok('...without adding a copy', r.pickAddedNothing,
   're-adding on every pick fills a hundred slots with one face');
ok('a plain tap in the grid deletes nothing', r.plainTapDeletesNothing,
   'a grid of small tiles makes a one-tap delete very easy to hit by accident');
ok('Delete arms rather than deleting', r.noDeleteBeforeArming && r.armedShowsCancel);
ok('...ticking still deletes nothing', r.tickingDeletesNothing, String(r.afterTicking));
ok('...and the confirm says how many', r.confirmSaysCount);
ok('...with the ticked ones marked', r.tickedAreMarked);
ok('Cancel keeps them all', r.cancelKeepsThemAll && r.cancelClearsTicks, String(r.afterCancel));
ok('confirming removes exactly the ticked ones', r.confirmRemovesTicked, String(r.afterConfirm));
ok('...and disarms afterwards', r.disarmedAfter);
ok('the fixture really was wearing one', r.wearingBeforeDelete);
ok('deleting the WORN photo takes it off your face', r.wornCleared && r.flagCleared,
   'a worn photo whose data is gone is a plate with nothing behind it');
ok('...and leaves the others alone', r.otherKept);
ok('the cap holds', r.capHeld);
ok('...and the oldest goes first', r.oldestWentFirst);
ok('no console errors', errors.length === 0, errors.slice(0,3).join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fails.length){ console.log('FAIL photolib\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS photolib');
