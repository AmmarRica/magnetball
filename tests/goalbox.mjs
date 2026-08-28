// The goal box: the net pocket mirrored onto the pitch in front of each goal line.
// Same mouth width, same depth, drawn OPEN (three sides — the goal line closes it)
// and fainter than the pitch lines, so the goal line stays the strongest mark down
// there and the two can't be confused.
//
// All by pixel sampling: the claim is about what you can see, so measuring the draw
// calls would prove nothing.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:620,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  const cv=document.getElementById('game'), c2=cv.getContext('2d');
  const DPR = cv.width / cv.clientWidth;
  const at = (x,y) => { const [sx,sy]=M.screenPt(M.wx(x), M.wy(y));
    const d=c2.getImageData(Math.round(sx*DPR), Math.round(sy*DPR), 1, 1).data; return [d[0],d[1],d[2]]; };
  const dist = (a,c) => Math.abs(a[0]-c[0])+Math.abs(a[1]-c[1])+Math.abs(a[2]-c[2]);

  const clear = () => {
    // ⚠️ THE PALETTE IS PINNED, not inherited. This measures the goal box by sampling
    // pixels, and the default palette is `grass` — whose MOWN STRIPES put ink inside the
    // box region and read as "the box is filled rather than outlined". The suite was
    // silently relying on the old `neon` default; a suite that samples pixels has to say
    // which palette it is sampling.
    M.applyBundle('neon');
    M.sel.mode='2v2'; M.sel.kickoffRule='off'; M.setMatchSeed(3); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2;
    w.players.forEach(q=>{ q.x=620; q.y=620; q.vx=0; q.vy=0; });   // nothing on the pitch
    w.ball.x=620; w.ball.y=620; w.ball.vx=0; w.ball.vy=0;
    M.computeCam(); M.render();
    return w;
  };
  const w = clear();
  const bb = w.bounds, gh = w.field.goal/2, net = bb.net;
  // Bare pitch, well away from every marking, as the reference.
  const bg = at(0, bb.halfL - net - 55);
  const ink = (x,y) => dist(at(x,y), bg);

  // ---- it exists, at BOTH ends, and mirrors the net exactly ----------------
  o.dims = { gh, net };
  o.frontBottom = ink(0,  bb.halfL - net);     // inner line, near goal
  o.frontTop    = ink(0, -(bb.halfL - net));
  o.sideL       = ink(-gh,  bb.halfL - net/2); // the two verticals, mid-depth
  o.sideR       = ink( gh,  bb.halfL - net/2);
  o.bothEnds = o.frontBottom > 20 && o.frontTop > 20;
  o.hasSides = o.sideL > 20 && o.sideR > 20;
  // The mirror is exact: one net-depth further out there is nothing, and one
  // mouth-width further across there is nothing. Off-by-anything shows up here.
  o.beyondDepth = ink(0, bb.halfL - net*2);
  o.beyondWidth = ink(gh + 26, bb.halfL - net/2);
  o.exactlyMirrored = o.beyondDepth < 20 && o.beyondWidth < 20;
  // Outline, not a fill.
  o.middle = ink(0, bb.halfL - net/2);
  o.notFilled = o.middle < 20;

  // ---- fainter than the goal line -----------------------------------------
  o.goalLineInk = ink(0, bb.halfL);
  o.boxInk = o.frontBottom;
  o.boxIsFainter = o.boxInk < o.goalLineInk * 0.6;
  o.alpha = M.GOAL_BOX_A;

  // ---- in FRONT of the line, not behind -----------------------------------
  // Behind the goal line is the net pocket; the box must not have drawn there.
  o.behind = ink(0, bb.halfL + net/2);
  o.boxNotInTheNet = o.behind < o.frontBottom;

  // ---- holds on every field ------------------------------------------------
  // Goal mouths and net depths differ per field; the box must stay on the pitch
  // and keep mirroring, whatever the shape.
  const bad = [];
  for (const key of Object.keys(M.FIELDS)){
    M.sel.field = key;
    const w2 = clear();
    const b2 = w2.bounds, g2 = w2.field.goal/2, n2 = b2.net;
    const ref = at(0, 0);                       // centre spot area as this field's bg
    const front = dist(at(0, b2.halfL - n2), ref);
    const inside = g2 < b2.halfW - 4 && (b2.halfL - n2) > 0;
    if (front <= 15 || !inside) bad.push({ key, front, g2, n2, halfW:b2.halfW });
  }
  o.fieldCount = Object.keys(M.FIELDS).length;
  o.badFields = bad.slice(0, 4);
  o.everyFieldOk = bad.length === 0;
  M.sel.field = 'classic';
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.bothEnds, `no box in front of a goal line (bottom ${r.frontBottom}, top ${r.frontTop})`);
ok(r.hasSides, `the box has no sides (L ${r.sideL}, R ${r.sideR})`);
ok(r.exactlyMirrored, `the box does not mirror the net exactly — ink beyond its depth ${r.beyondDepth}, beyond its width ${r.beyondWidth}`);
ok(r.notFilled, `the box is filled rather than outlined (middle ink ${r.middle})`);
ok(r.goalLineInk > 40, `the goal line barely inks (${r.goalLineInk}) — the faintness check would be vacuous`);
ok(r.boxIsFainter, `the box is not fainter than the goal line: ${r.boxInk} vs ${r.goalLineInk}`);
ok(r.alpha > 0 && r.alpha < 1, `GOAL_BOX_A should be a real transparency, got ${r.alpha}`);
ok(r.boxNotInTheNet, `the box drew behind the goal line as well as in front (${r.behind})`);
ok(r.fieldCount > 8, `only ${r.fieldCount} fields checked`);
ok(r.everyFieldOk, `the box is missing or off-pitch on some field: ${JSON.stringify(r.badFields)}`);
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\ngoalbox OK');
