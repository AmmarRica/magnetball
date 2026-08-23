// Checkpoint 1 from docs/DETERMINISM-AUDIT.md, standing as a permanent guard.
//
// The audit is CLOSED at "same-engine reproducibility": a pinned seed and the same
// inputs must produce a bit-identical match in the same browser. Cross-engine
// equality is explicitly not a goal (§3b — Math.hypot and friends are
// implementation-approximated, and there are 42 hypot calls on the hot path).
//
// So this asserts exactly the bar that was agreed and no more: hash the WHOLE world
// at frame 3,600 — a full minute of play — across two runs on one seed, and require
// them identical. It also holds the one rule everything rests on: Math.random is
// never reached from inside step().
//
// ⚠️ Hash the whole world, not the score. A suite that compares `score` passes on
// two completely different matches that happened to finish level, which is most of
// them. The hash walks every player, every ball, the clock and the state machine.
//
// ⚠️ Trap the ban with a THROWING stub, not a counter you read afterwards. A counter
// tells you a call happened; it does not tell you where, and a bot that calls it
// once every few hundred steps slips past a short run. Throwing fails the step that
// did it, which is the information you actually want.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(800);

const FRAMES = 3600;   // one minute of play at the fixed 1/60 step

const r = await p.evaluate(async (FRAMES)=>{
  const M=window.__magnet; const o={};

  // A string of every number that describes the match. Fixed precision, because the
  // point is bit-equality of the SIM, not of the last ulp of a float printed twice.
  const hash = w => {
    const n = x => (typeof x === 'number' ? x.toFixed(9) : String(x));
    const parts = [w.state, n(w.stateT), n(w.timeLeft), w.score.join(':'), n(w.matchT)];
    for (const q of w.players) parts.push(n(q.x), n(q.y), n(q.vx), n(q.vy),
      n(q.faceX), n(q.faceY), n(q.chargeT), q.kick?1:0);
    const balls = [w.ball, ...(w.extraBalls||[])];
    for (const bl of balls) parts.push(n(bl.x), n(bl.y), n(bl.vx), n(bl.vy), n(bl.rot||0), bl.banked?1:0);
    if (w.hive) parts.push(w.hive.join(':'));
    // Fold to a single number so a mismatch is reportable rather than 40KB of diff.
    let h = 2166136261;
    const s2 = parts.join('|');
    for (let i=0;i<s2.length;i++){ h ^= s2.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h>>>0).toString(16) + ':' + s2.length;
  };

  const run = (seed, mode) => {
    M.sel.mode = mode; M.sel.kickoffRule='off'; M.sel.field='classic';
    M.setMatchSeed(seed); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    w.players.forEach(q=>{ q.ctrl='bot'; });     // no pads: the AI is the input log
    const marks = {};
    for (let i=1;i<=FRAMES;i++){
      M.step(w);
      if (i===600 || i===1800 || i===FRAMES) marks[i] = hash(w);
    }
    return marks;
  };

  // ---- the bar itself: same seed, same match, twice --------------------------
  const a1 = run(4242, '4v4');
  const a2 = run(4242, '4v4');
  o.at600  = a1[600];
  o.at1800 = a1[1800];
  o.at3600 = a1[FRAMES];
  o.reproducible = JSON.stringify(a1) === JSON.stringify(a2);
  // ...and it is a real match, not a frozen pitch that would match trivially.
  o.matchMoved = a1[600] !== a1[1800] && a1[1800] !== a1[FRAMES];

  // ---- a different seed is a different match --------------------------------
  const c1 = run(4243, '4v4');
  o.seedMatters = c1[FRAMES] !== a1[FRAMES];

  // ---- and it holds in the mode with the most moving parts ------------------
  const k1 = run(77, 'kq'), k2 = run(77, 'kq');
  o.kqAt3600 = k1[FRAMES];
  o.kqReproducible = JSON.stringify(k1) === JSON.stringify(k2);

  // ---- THE RULE: Math.random is never reached from inside step() -------------
  // Throwing, not counting — see the header.
  const real = Math.random;
  M.sel.mode='4v4'; M.setMatchSeed(9); M.startMatch();
  const w = M.world; w.state='play'; w.stateT=2;
  w.players.forEach(q=>{ q.ctrl='bot'; });
  let leak = null;
  Math.random = () => { leak = leak || new Error('Math.random from inside step()').stack; return 0.5; };
  try { for (let i=0;i<1200;i++) M.step(w); } finally { Math.random = real; }
  o.noMathRandomInStep = leak === null;
  o.leak = leak ? String(leak).split('\n').slice(0,4).join(' / ') : null;

  // ⚠️ **AUTOMATIC QUALITY MAY NOT REACH THE SIM, and this is the check that says so.**
  // A slow machine now drops the dot trails and the kick sparks off the measured frame
  // rate — so a value derived from how fast the hardware happens to be running is one
  // branch away from the physics. If it ever got in, a pinned seed would stop reproducing,
  // every saved replay would play back wrong, and two people on one couch would get
  // different results from the same inputs. Same seed, same inputs, both tiers, hashed.
  // ⚠️ `render()` is driven as well as `step()`, because the whole point is that the
  // DRAWING is what changes — a hash taken without rendering would pass on a build that
  // wired quality straight into `integrate`.
  const qhash = (pin) => {
    M.qualityPin(pin);
    M.sel.mode='4v4'; M.sel.autoRec='off';
    M.setMatchSeed(4242); M.startMatch();
    const w2 = M.world; w2.state='play'; w2.stateT=2;
    w2.players.forEach(q=>{ q.ctrl='bot'; });
    for (let i=0;i<900;i++){ M.step(w2); if (i%3===0) M.render(); }
    const n=[+w2.ball.x.toFixed(6), +w2.ball.y.toFixed(6), w2.score[0], w2.score[1]];
    for (const q of w2.players) n.push(+q.x.toFixed(6), +q.y.toFixed(6), q.ms.goals, q.ms.shots);
    return n.join(',');
  };
  o.qualHi = qhash(true);
  o.qualLo = qhash(false);
  o.qualitySameWorld = o.qualHi === o.qualLo;
  o.qualityIsRenderOnly = typeof M.fullQuality === 'function';
  M.qualityPin(null);

  M.sel.mode='1v1'; M.setMatchSeed(null);
  return o;
}, FRAMES);

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.matchMoved, 'the world never changed over 3,600 steps — this suite proved nothing');
ok(r.reproducible, `the same seed gave two different matches: ${r.at3600}`);
ok(r.seedMatters, 'two different seeds gave the identical match — the seed is not reaching the sim');
ok(r.kqReproducible, `Killer Lobsters did not reproduce on one seed: ${r.kqAt3600}`);
ok(r.noMathRandomInStep, `Math.random was called from inside step(): ${r.leak}`);
ok(r.qualityIsRenderOnly, 'fullQuality() is missing — the auto-quality check below is vacuous');
ok(r.qualitySameWorld,
   'AUTO-QUALITY REACHED THE SIM: the same seed gave two different worlds at the two tiers, so a slow machine plays a different match and no replay can reproduce');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify({ ...r, qualHi: r.qualHi.length + ' chars', qualLo: r.qualLo.length + ' chars' }, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ndeterminism OK');
