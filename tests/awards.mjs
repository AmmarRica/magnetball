// End-of-match awards have to state the figure that won them — "Most Saves" alone
// says nothing. Every count is checked against the tally it came from, so a note
// can't drift from the stat that picked the winner.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:900,height:1000} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.sel.mode='3v3'; M.startMatch(); const w=M.world; w.state='play'; w.stateT=1;
  // Deliberately distinct maxima so each award has one unambiguous winner.
  const tally = [
    { goals:3, saves:0, assists:1, clears:0, passKey:2, posts:1, hardest:9.4, shots:5, touches:30 },
    { goals:1, saves:2, assists:0, clears:4, passKey:0, posts:0, hardest:7.0, shots:2, touches:22 },
    { goals:0, saves:5, assists:0, clears:1, passKey:0, posts:0, hardest:6.0, shots:0, touches:18 },
    { goals:2, saves:0, assists:3, clears:0, passKey:0, posts:0, hardest:8.1, shots:4, touches:26 },
    { goals:0, saves:1, assists:0, clears:0, passKey:1, posts:0, hardest:0,   shots:1, touches:12 },
    { goals:0, saves:0, assists:0, clears:0, passKey:0, posts:2, hardest:0,   shots:0, touches:9  },
  ];
  w.players.forEach((q,i)=>Object.assign(q.ms, tally[i]));
  w.score=[4,2]; w.maxDeficit=[2,0];

  const aw = M.computeAwards(w);
  o.count = aw.length;
  o.everyAwardHasNote = aw.every(a => /\S/.test(a.note));
  // Every note quotes a number, and it is the winning value — not a stock phrase.
  o.everyNoteHasDigits = aw.every(a => /\d/.test(a.note));
  const byLabel = Object.fromEntries(aw.map(a=>[a.label, a]));
  const notes = Object.fromEntries(aw.map(a=>[a.label, a.note]));
  o.notes = notes;
  o.goals    = notes['Most Goals']   === '3 goals';
  o.saves    = notes['Most Saves']   === '5 saves';
  o.assists  = notes['Most Assists'] === '3 assists';
  o.wall     = notes['The Wall']     === '4 clearances';
  o.playmkr  = notes['Playmaker']    === '2 key passes';
  o.hat      = notes['Hat Trick']    === '3 goals';
  o.ironBoot = /9\.4 power/.test(notes['Iron Boot']||'');
  o.mvp      = /rating/.test(notes['Golden Boot']||'') && /\d/.test(notes['Golden Boot']||'');
  // The number in the note IS the value that won the award.
  o.notesMatchValues = aw.every(a=>{
    const n = (a.note.match(/\d+(\.\d+)?/)||[])[0];
    if (n == null) return false;
    return Math.abs(parseFloat(n) - a.value) < 0.06 || /from \d/.test(a.note);
  });
  // Winners are still the right players.
  o.savesWinner = byLabel['Most Saves'] && byLabel['Most Saves'].p === w.players[2];
  o.wallWinner  = byLabel['The Wall']   && byLabel['The Wall'].p   === w.players[1];

  // Singular vs plural, so "1 saves" never ships.
  o.plural = M.plural(1,'save')==='1 save' && M.plural(2,'save')==='2 saves' &&
             M.plural(1,'key pass','key passes')==='1 key pass' &&
             M.plural(3,'key pass','key passes')==='3 key passes';
  w.players.forEach(q=>Object.assign(q.ms, { goals:0, saves:0, assists:0, clears:0,
    passKey:0, posts:0, hardest:0, shots:0, touches:0 }));
  w.players[0].ms.saves = 1;
  o.singularShown = (M.computeAwards(w).find(a=>a.label==='Most Saves')||{}).note === '1 save';

  // ...and it reaches the DOM, not just the array.
  w.players.forEach((q,i)=>Object.assign(q.ms, tally[i]));
  // Ribbons live inside each team's panel now, so build the panels and read them
  // from there — same rows, grouped under the side that earned them.
  M.renderAwards(w); M.renderMatchStats(w);
  const rows = [...document.querySelectorAll('#ovStats .tpawards .awrow')].map(x=>x.textContent);
  o.everyRibbonUnderItsTeam = [...document.querySelectorAll('#ovStats .tpanel')]
    .every(pan => [...pan.querySelectorAll('.awrow')].every(r => r.dataset.team === pan.dataset.team));
  o.rowCount = rows.length;
  o.domShowsCounts = rows.length > 0 && rows.every(t=>/\d/.test(t));
  o.domSaysSaves = rows.some(t=>/Most Saves/.test(t) && /5 saves/.test(t));
  return o;
});

console.log(JSON.stringify(r,null,2));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const ok = r.count >= 6 && r.everyAwardHasNote && r.everyNoteHasDigits &&
  r.goals && r.saves && r.assists && r.wall && r.playmkr && r.hat && r.ironBoot && r.mvp &&
  r.notesMatchValues && r.savesWinner && r.wallWinner && r.plural && r.singularShown &&
  r.domShowsCounts && r.domSaysSaves && r.everyRibbonUnderItsTeam && errors.length === 0;
if(!ok) console.log('FAILED:', Object.entries(r).filter(([k,v])=>v===false).map(([k])=>k));
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
