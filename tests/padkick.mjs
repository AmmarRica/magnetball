// A is the kick button — on every pad, not just the ones that report a standard layout.
//
// ⚠️ THE BUG THIS EXISTS FOR: the shipped default was the literal index `0`, and the
// code read it as an exact button. `0` is A under the STANDARD Gamepad mapping, but a
// pad that reports a non-standard mapping numbers its buttons however it likes — so on
// one of those the kick button pointed at whatever happened to be numbered 0, and the
// kick silently never fired at all. The default is `null` now, meaning "any of the
// usual fire buttons"; a button bound in Controls is still honoured exactly.
//
// ⚠️ And a save carrying the old `0` is folded to `null` — but only if the player did
// not bind it on purpose. Without `kickBound`, binding kick to A stores a 0 that the
// fold would undo on the next load, quietly reversing a choice just made.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:520,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{ window.__MAGNETDEBUG = true; });
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(900);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();

  // A fake pad. `mapping` is what the browser reports, and it is the whole point.
  const pad = (downIdx, mapping) => ({
    mapping: mapping === undefined ? 'standard' : mapping,
    axes: [0,0,0,0],
    buttons: Array.from({length:17}, (_,i)=>({ pressed: downIdx.includes(i), value: downIdx.includes(i)?1:0 })),
  });

  // ---- the shipped default: A kicks, and so do the other fire buttons -------
  M.sel.pad = { up:12, down:13, left:14, right:15, kick:null };
  o.fallback = M.KICK_FALLBACK.slice();
  o.aKicks   = M.padKickHeld(pad([0]));
  o.xKicks   = M.padKickHeld(pad([2]));
  o.rbKicks  = M.padKickHeld(pad([5]));
  o.dpadDoesNot = M.padKickHeld(pad([12])) === false;   // a direction is not a kick
  o.startDoesNot = M.padKickHeld(pad([9])) === false;
  o.nothingHeld = M.padKickHeld(pad([])) === false;
  o.defaultTakesA = o.aKicks && o.xKicks && o.rbKicks && o.dpadDoesNot && o.startDoesNot;

  // ---- a BOUND button is exact -------------------------------------------
  M.sel.pad = { up:12, down:13, left:14, right:15, kick:3, kickBound:true };
  o.boundOnly   = M.padKickHeld(pad([3])) === true && M.padKickHeld(pad([0])) === false;

  // ---- the legacy save is folded, a deliberate bind to A is not -----------
  M.sel.pad = { up:12, down:13, left:14, right:15, kick:0 };      // the old shipped default
  M.normalizeLook();
  o.legacyFolded = M.sel.pad.kick === null;
  o.legacyStillTakesA = M.padKickHeld(pad([0])) === true;
  M.sel.pad = { up:12, down:13, left:14, right:15, kick:0, kickBound:true };  // bound on purpose
  M.normalizeLook();
  o.deliberateKept = M.sel.pad.kick === 0;
  o.deliberateIsExact = M.padKickHeld(pad([0])) === true && M.padKickHeld(pad([2])) === false;

  // ---- and it reaches a real player through the real input path -----------
  // ⚠️ Driven through gamepadPad + applyHumanInput, not by setting p.kick — that gets
  // overwritten on the next step, which is the trap recorded in CLAUDE.md.
  M.sel.pad = { up:12, down:13, left:14, right:15, kick:null };
  const real = navigator.getGamepads;
  let held = [0];
  navigator.getGamepads = () => [pad(held)];
  const gp = M.gamepadPad(0);
  o.padObjectKicks = gp.kick === true;
  held = [];
  o.padObjectReleases = M.gamepadPad(0).kick === false;
  navigator.getGamepads = real;

  // ---- the readout says what an unbound kick actually does ----------------
  M.sel.pad = { up:12, down:13, left:14, right:15, kick:null };
  M.buildPadRows && M.buildPadRows();
  const rows = document.getElementById('padRows');
  o.readout = rows ? rows.textContent.replace(/\s+/g,' ').trim() : '';
  o.readoutExplainsKick = /A \/ X \/ RB \/ RT \/ B/.test(o.readout);

  // ---- resetting the map goes back to the shipped default, not to 0 -------
  M.sel.pad = { up:1, down:2, left:3, right:4, kick:7, kickBound:true };
  M.padResetMap && M.padResetMap();
  o.resetKick = M.sel.pad.kick;
  o.resetTakesA = M.sel.pad.kick === null && M.padKickHeld(pad([0])) === true;

  M.sel.pad = { up:12, down:13, left:14, right:15, kick:null };
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.fallback.length >= 3 && r.fallback[0] === 0, `the fire-button fallback is wrong: ${JSON.stringify(r.fallback)} — A must be first in it`);
ok(r.defaultTakesA, `out of the box A does not kick: ${JSON.stringify({a:r.aKicks,x:r.xKicks,rb:r.rbKicks,dpad:r.dpadDoesNot,start:r.startDoesNot})}`);
ok(r.nothingHeld, 'a pad with nothing held reported a kick');
ok(r.boundOnly, 'a button bound in Controls is not honoured exactly — binding is the one place an exact index belongs');
ok(r.legacyFolded, `a save carrying the old shipped kick:0 was not folded (${r.legacyFolded}) — on a non-standard pad an exact 0 points at whatever is numbered 0 and the kick never fires`);
ok(r.legacyStillTakesA, 'folding the legacy default stopped A kicking, which is the opposite of the point');
ok(r.deliberateKept && r.deliberateIsExact, 'a DELIBERATE bind of kick to A was folded away — the fold would undo a choice the player just made');
ok(r.padObjectKicks && r.padObjectReleases, 'the kick does not reach a pad object through gamepadPad');
ok(r.readoutExplainsKick, `the Controls readout does not say what an unbound kick does: "${r.readout.slice(0,120)}"`);
ok(r.resetTakesA, `resetting the pad map left kick at ${JSON.stringify(r.resetKick)} instead of the shipped default`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\npadkick OK');
