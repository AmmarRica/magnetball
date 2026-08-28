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

// ---------------------------------------------------------------------------------
// 4. THE MENU IS THE LAST WORD — including over a name typed in warm-up.
// ---------------------------------------------------------------------------------
// ⚠️ **THREE THINGS OUTRANKED IT AND ALL THREE WERE MEASURED.** A player can spell their
// own name out on the lobby keyboard, and the owner has to be able to change it after.
// Before this:
//   • `p.kbTyped` — the MID-EDIT guard, meant to stop a profile sync putting 'You' back
//     under somebody's feet while they are still typing — stayed raised for the rest of
//     the match. A seat typed `ABC` still read `ABC` with the Your Player card set to
//     `HOST`, with nothing on screen to say why.
//   • a guest's typed name was filed into `sel.names`, the Player NAMES BOX, which
//     `syncProfileToWorld` deliberately lets outrank a profile (that box is how you name
//     a BOT). So the card could not shift it either.
//   • and picking the seat did not even refresh the Name field: with seat two's profile
//     reading `XYZ`, the box showed `You`, the value it was given at page load.
// ⚠️ Driven through the REAL `#pname` input, never `ep().name = …`: the claim on the
// field is that typing in it overrides, and a probe that writes the model directly tests
// none of the wiring that was broken.
{
  const p = await page(2);
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    M.sel.controllers = 'on'; M.sel.lobby = 'on'; M.sel.mode = '2v2';
    M.startMatch();
    const w = M.world;
    const hs = w.players.filter(q => q.ctrl !== 'bot');
    o.twoSeats = hs.length === 2;
    // spell a name out on the lobby keyboard, the way a person does: stand on the key,
    // hold KICK. ⚠️ Two steps per press — one to register, one for the latch.
    const key = ch => w.kb.keys.find(q => q.ch === ch);
    const type = (who, pad, word) => {
      for (const ch of word){
        const k = key(ch);
        for (let i = 0; i < 2; i++){
          who.x = k.x + k.w/2; who.y = k.y + k.h/2; who.vx = who.vy = 0;
          window.__pads[pad].buttons[0] = true; M.step(w);
        }
        window.__pads[pad].buttons[0] = false; M.step(w);
      }
    };
    type(hs[0], 0, 'ABC');
    type(hs[1], 1, 'XYZ');
    M.lobbyKbCommit(w);
    o.typedOnThePitch = hs.map(q => q.name);
    // ⚠️ A typed name is filed under that SEAT, which is what puts it in front of the
    // owner in the very field they would reach for — and keeps it out of the names box.
    o.filedUnderTheSeat = [M.seatProfile(0).name, M.seatProfile(1).name];
    o.namesBoxLeftAlone = M.sel.names === '' || !M.seatNameList().some(Boolean);
    // ⚠️ ...and the mid-edit guard is DOWN once the name is committed.
    o.guardLowered = hs.every(q => !q.kbTyped);

    // Now the owner renames both seats from the card.
    const fld = document.getElementById('pname');
    const rename = (seat, txt) => {
      M.setEditSeat(seat);
      o['fieldShowedSeat' + seat] = fld.value;
      fld.value = txt; fld.dispatchEvent(new Event('input', { bubbles:true }));
    };
    rename(0, 'HOST');
    rename(1, 'GUEST');
    o.menuWins = hs[0].name === 'HOST' && hs[1].name === 'GUEST';
    o.onThePitch = hs.map(q => q.name);
    // ⚠️ Picking a seat has to bring the whole card with it — the field included.
    o.fieldFollowsTheSeat = o.fieldShowedSeat0 === 'ABC' && o.fieldShowedSeat1 === 'XYZ';
    return o;
  });
  ok('a 2v2 with two pads seats two people', r.twoSeats);
  ok('a name spelled out in warm-up lands on the body',
     JSON.stringify(r.typedOnThePitch) === '["ABC","XYZ"]', JSON.stringify(r.typedOnThePitch));
  ok('...and is filed under that SEAT, not in the Player names box',
     JSON.stringify(r.filedUnderTheSeat) === '["ABC","XYZ"]' && r.namesBoxLeftAlone,
     `seats ${JSON.stringify(r.filedUnderTheSeat)}, names box ${JSON.stringify(r.namesBoxLeftAlone)} — ` +
     'filed in the box it would outrank the profile for the rest of the match');
  ok('...and the mid-edit guard comes down at the whistle', r.guardLowered,
     'kbTyped is a guard against a sync landing MID-KEYSTROKE; left raised it makes a ' +
     'warm-up name unchangeable for the whole match');
  ok('PICKING A SEAT SHOWS THAT SEAT\'S NAME', r.fieldFollowsTheSeat,
     `the Name field read "${r.fieldShowedSeat0}" for seat one and "${r.fieldShowedSeat1}" for ` +
     'seat two — a card that says it is dressing player two and shows you player one');
  ok('AND TYPING A NEW NAME OVERRIDES THE ONE THEY SPELLED', r.menuWins,
     `the pitch reads ${JSON.stringify(r.onThePitch)}, wanted ["HOST","GUEST"]`);
  await p.close();
}

// ---------------------------------------------------------------------------------
// 5. A LOOK PICKED IN THE MENU SURVIVES THE SIDE PUTTING A COUNTRY ON.
// ---------------------------------------------------------------------------------
// ⚠️ With a team flag set, `p.flag` is the COUNTRY and `p._ownFlag` is the player's own
// face. `syncProfileToWorld` used to write `p.flag` — which ripped the country off the
// pitch AND left the stash holding the face from before the edit. Measured: with the side
// on Brazil, picking `cat` showed `cat` at once (country gone) and then handed back
// `num1`, the OLD face, the moment the country was switched off. The avatar somebody has
// just chosen has to be the one that comes back.
{
  const p = await page(0);
  const r = await p.evaluate(() => {
    const M = window.__magnet, o = {};
    M.sel.mode = 'local'; M.sel.lobby = 'off'; M.startMatch({ lobby:false });
    const w = M.world;
    const me = w.players.find(q => q.ctrl === 'human1');
    M.setTeamFlag(me.team, 'brazil'); M.applyTeamColours(w.players);
    o.wearsTheCountry = me.flag === 'brazil';
    M.setEditSeat(0); M.ep().flag = 'cat'; M.saveProfile();
    o.countryStays = me.flag === 'brazil';
    M.setTeamFlag(me.team, 'none'); M.applyTeamColours(w.players);
    o.newFaceComesBack = me.flag === 'cat';
    o.faceAfter = me.flag;
    return o;
  });
  ok('a side wearing a country stamps it on the faces', r.wearsTheCountry);
  ok('...and picking an avatar in the menu does not tear it off', r.countryStays,
     'the country is a choice about the SIDE and outranks a face while it is set');
  ok('...but the NEW avatar is what comes back when the country goes', r.newFaceComesBack,
     `the face came back as ${r.faceAfter}, wanted cat — the stash has to follow the edit or ` +
     'the menu hands back the look from before it');
  await p.close();
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(bad ? 'FAIL seatprofiles' : 'PASS seatprofiles');
await b.close();
process.exit(bad ? 1 : 0);
