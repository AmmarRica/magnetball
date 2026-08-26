// ONE PROFILE PER SEAT — the picker that lets you dress the OTHER people on the couch.
//
// Reported as: "I did not see options to customise the rest of the players from the
// settings screen despite being able to play as them." Two independent defects, and
// nothing in the suite touched this feature at all before today.
//
// ⚠️ **1. THE PICKER WAS BUILT ONCE AND NEVER RE-ASKED.** `seatCount()` reads the LIVE
// match, and `buildSeatPick` runs from `buildSettings` — at boot and on an option tap. On a
// machine with no controller the count only becomes 2 the moment a two-player match starts,
// which is after the card was last built, so the picker stayed hidden for exactly the people
// it exists for. With pads it happened to work, because a connected pad is countable before
// anyone kicks off — which is why this survived.
//
// ⚠️ **2. IT COUNTED BODIES, NOT SEATS**, and that is wrong in both directions. Duo hands
// ONE person every body on their side (`mode.duo` sets `ctrl = 'human1'` on all of them), so
// a duo match offered two profiles for one human; and the pad branch added a keyboard seat
// on top of the pads, so two controllers offered three. Both are dead controls — a look you
// can set for somebody who is not there.
//
// ⚠️ **THE PICKER EXISTING IS NOT THE SAME AS IT WORKING**, so this file ends by dressing
// seat two and checking that body on the pitch wears it AND that seat one does not. A build
// that writes every seat at once passes every visibility check above.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors = [];
let bad = 0;
const ok = (name, cond, note = '') => {
  if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); }
};

const page = async (nPads = 0, vw = 1280, vh = 900) => {
  const p = await b.newPage({ viewport:{width:vw, height:vh} });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript((n) => {
    window.__MAGNETDEBUG = true; localStorage.clear();
    window.__pads = Array.from({length:n}, () => ({ axes:[0,0,0,0], buttons:new Array(17).fill(false) }));
    navigator.getGamepads = () => window.__pads.map((pd,i) => ({
      index:i, connected:true, id:'f'+i, mapping:'standard', axes:pd.axes,
      buttons: pd.buttons.map(v => ({ pressed:!!v, value:v?1:0 })) }));
  }, nPads);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(800);
  return p;
};

// What the card is actually showing. ⚠️ The rendered box, never the class — a picker with
// `display:none` and four tiles in it is exactly the bug being tested.
const READ = `() => {
  const wrap = document.getElementById('seatPickWrap');
  const host = document.getElementById('seatPick');
  return {
    count: window.__magnet.seatCount(),
    shown: !!(wrap && wrap.getBoundingClientRect().height > 0),
    tiles: host ? host.children.length : -1,
  };
}`;

// ---------------------------------------------------------------------------------
// 1. THE PICKER APPEARS WHENEVER THERE IS MORE THAN ONE PERSON.
// ---------------------------------------------------------------------------------
const cases = [
  // pads, setup run on the page, expected seats, what it is
  [0, "",                                                    1, 'nobody but you'],
  [2, "",                                                    2, 'two pads at the menu'],
  [4, "",                                                    4, 'four pads at the menu'],
  [1, "M.sel.controllers='on'; M.startMatch();",             1, 'one pad, mid-match'],
  [2, "M.sel.controllers='on'; M.sel.mode='2v2'; M.startMatch();", 2, 'two pads, mid-match'],
  // ⚠️ THE REPORTED CASE: two people on one device, no controller in sight.
  [0, "M.sel.mode='local'; M.startMatch();",                 2, 'a 2-player match, live'],
  [0, "M.sel.mode='local'; M.startMatch(); M.toMenu();",      2, '...and back at the menu'],
  // ⚠️ Duo is ONE person steering two bodies. Counting bodies made it two.
  [0, "M.sel.mode='duo'; M.startMatch();",                   1, 'duo — one person, two bodies'],
  [0, "M.sel.mode='train'; M.startMatch();",                 1, 'training'],
];
for (const [pads, setup, want, what] of cases){
  const p = await page(pads);
  const r = await p.evaluate(({setup, READ}) => {
    const M = window.__magnet;
    eval(setup);
    M.openSection('player');
    return eval(READ)();
  }, {setup, READ});
  ok(`${what}: ${want} seat${want > 1 ? 's' : ''}`, r.count === want,
     `seatCount() says ${r.count}`);
  // ⚠️ Both halves, every time. "It is shown" passes on a build stuck at one tile, and
  // "it has N tiles" passes on a build that renders them into a hidden box — which is
  // precisely what the reported bug looked like from the outside.
  ok(`...and the card ${want > 1 ? 'offers them' : 'stays out of the way'}`,
     r.shown === (want > 1), `shown=${r.shown}`);
  if (want > 1)
    ok(`...one tile each`, r.tiles === want, `${r.tiles} tiles for ${want} seats`);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 2. A PAD ARRIVING OR LEAVING IS RE-ASKED.
// ---------------------------------------------------------------------------------
// ⚠️ The count moves with the hardware, and the card is derived from it — so the one
// place a person plugs a second controller in is a place the picker has to be rebuilt.
{
  const p = await page(1);
  const r = await p.evaluate(({READ}) => {
    const M = window.__magnet;
    M.openSection('player');
    const before = eval(READ)();
    window.__pads.push({ axes:[0,0,0,0], buttons:new Array(17).fill(false) });
    window.dispatchEvent(new Event('gamepadconnected'));
    const after = eval(READ)();
    return { before, after };
  }, {READ});
  ok('one pad offers no picker', !r.before.shown && r.before.count === 1,
     JSON.stringify(r.before));
  ok('...and plugging a second one in brings it up', r.after.shown && r.after.count === 2,
     JSON.stringify(r.after) + ' — the picker is derived from seatCount(), so it has to be ' +
     're-asked wherever that answer can move');
  await p.close();
}

// ---------------------------------------------------------------------------------
// 3. DRESSING SEAT TWO DRESSES SEAT TWO — and nobody else.
// ---------------------------------------------------------------------------------
{
  const p = await page(0);
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    M.sel.mode = 'local'; M.startMatch();
    const w = M.world;
    const p1 = w.players.find(q => q.ctrl === 'human1');
    const p2 = w.players.find(q => q.ctrl === 'human2');
    o.twoPeople = !!(p1 && p2);
    // ⚠️ **NOT THE COLOUR.** Team colour is one shade a side by design and
    // `applyTeamColours` wins over the profile wherever it applies, so a colour check here
    // measures that rule rather than this feature — and reads as seat one changing when
    // nothing about seat one changed. The FACEPLATE and the NAME are a person's own.
    o.p1Before = p1.flag; o.p1NameBefore = p1.name;
    o.p2Before = p2.flag;

    // ⚠️ Seat 0 IS `profile` by object identity — the device owner is not a copy of
    // themselves, which is what keeps the leaderboard, the feed and `isHero` pointing at
    // one record. `ep()` is the one reader.
    M.setEditSeat(0);
    o.seatZeroIsProfile = M.ep() === M.seatProfile(0);

    M.setEditSeat(1);
    o.editSeatMoved = M.editSeat === 1;
    o.seatOneIsNotProfile = M.ep() !== M.seatProfile(0);
    M.ep().flag = 'brazil';
    M.ep().name = 'GUEST';
    M.saveProfile();
    M.syncProfileToWorld();

    o.p1After = p1.flag; o.p1NameAfter = p1.name; o.p2After = p2.flag;
    o.p2Name = p2.name;
    o.dressedSeatTwo = p2.flag === 'brazil' && p2.name === 'GUEST';
    o.leftSeatOneAlone = p1.flag === o.p1Before && p1.name === o.p1NameBefore;
    // ...and it is remembered per seat, not in the owner's own record.
    try {
      const st = JSON.parse(localStorage.getItem('magnetball.profiles') || '{}');
      o.storedSeatTwo = (st['1'] || {}).flag;
      o.ownerRecord = JSON.parse(localStorage.getItem('magnetball.profile') || '{}').flag;
    } catch(e){ o.storedSeatTwo = 'ERR'; }
    return o;
  });
  ok('a 2-player match really has two people', r.twoPeople);
  ok('seat one IS the device owner\'s own profile', r.seatZeroIsProfile,
     'the leaderboard, the feed and isHero all read `profile` — seat 0 must be that object, not a copy');
  ok('picking seat two moves the editor', r.editSeatMoved && r.seatOneIsNotProfile);
  ok('DRESSING SEAT TWO DRESSES PLAYER TWO', r.dressedSeatTwo,
     `player 2 wears ${r.p2After} / "${r.p2Name}", wanted brazil / "GUEST"`);
  ok('...and leaves player one alone', r.leftSeatOneAlone,
     `player 1 went ${r.p1Before}/"${r.p1NameBefore}" → ${r.p1After}/"${r.p1NameAfter}" — a ` +
     'build that writes every seat passes every visibility check above');
  ok('...and it is stored per seat', r.storedSeatTwo === 'brazil',
     `magnetball.profiles seat 1 holds ${r.storedSeatTwo}`);
  ok('...without touching the owner\'s record', r.ownerRecord !== 'brazil',
     `magnetball.profile holds ${r.ownerRecord}`);
  await p.close();
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(bad ? 'FAIL seatprofiles' : 'PASS seatprofiles');
await b.close();
process.exit(bad ? 1 : 0);
