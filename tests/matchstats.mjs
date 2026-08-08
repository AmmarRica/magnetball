// The result screen shows the full scoresheet, not just the awards — the numbers
// come from the same per-player tallies the awards are picked from.
//
// ⚠️ WHAT THIS SUITE EXISTS FOR NOW: the scoresheet shipped as EIGHT acronym columns
// (G A SH SV CL KP PST TCH) with the key that decodes them at the very BOTTOM of the
// screen — which on a phone stacks the two team panels and leaves the legend two
// screens below the headings it explains. And most of the grid was noughts: a 4v4 is
// 8 players × 8 columns and 52 of those 64 cells read `0`, so twelve real numbers hid
// among fifty-two zeros. Three SPELLED columns carry the match and the rest is a line
// of prose under the name listing only what a player actually did.
//
// So three things are held here, and they pull against each other on purpose:
//   1. the headings are WORDS — nothing on the screen needs decoding, and there is no
//      key left to decode it with;
//   2. nothing was LOST — every non-zero stat still appears, in words;
//   3. and it FITS a 360px phone without the row overflowing its panel, which is the
//      complaint that started this and the one nothing else in the repo measured.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:800,height:1100} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true; localStorage.clear();});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

// One tally, used by both passes below. The last player is deliberately ALL ZEROES
// except posts, and the fifth has nothing at all in the prose set — those two are what
// prove the line only appears when there is something to say.
const TALLY = [{goals:2,saves:0,assists:1,clears:0,passKey:2,posts:1,hardest:9.4,shots:5,touches:44},
               {goals:1,saves:2,assists:0,clears:4,passKey:0,posts:0,hardest:7.0,shots:2,touches:31},
               {goals:0,saves:5,assists:0,clears:1,passKey:0,posts:0,hardest:6.0,shots:0,touches:22},
               {goals:1,saves:0,assists:2,clears:0,passKey:1,posts:0,hardest:8.1,shots:4,touches:29},
               {goals:0,saves:1,assists:0,clears:0,passKey:0,posts:0,hardest:5.5,shots:0,touches:18},
               {goals:0,saves:0,assists:0,clears:0,passKey:0,posts:2,hardest:0,shots:0,touches:12}];

const r = await p.evaluate((TALLY)=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.setMatchSeed(9); M.sel.mode='3v3'; M.startMatch();
  const w=M.world; w.state='play'; w.stateT=1;
  w.players.forEach((q,i)=>Object.assign(q.ms, TALLY[i]));
  w.score=[4,1];
  M.showOverlay('YOU WIN!','4 – 1', false);
  M.renderMatchStats(w);

  const rows=[...document.querySelectorAll('#ovStats .statsrow')].filter(x=>!x.classList.contains('shead'));
  o.rowPerPlayer = rows.length === w.players.length;
  o.hasHeader = !!document.querySelector('#ovStats .statsrow.shead');
  o.colCount = M.STAT_COLS.length;

  // ---- 1. nothing on screen needs decoding --------------------------------
  // ⚠️ The headings must be WORDS. `G`, `SH`, `PST` are the bug, so the check is on
  // LENGTH — a heading a reader has to look up is not a heading.
  o.heads = M.STAT_COLS.map(c=>c.h);
  o.headsAreWords = o.heads.every(h => h.length >= 5 && /^[A-Z]+$/.test(h));
  // ⚠️ Per PANEL, not per screen — there is one header row per team, so a flat
  // querySelectorAll over #ovStats returns the list twice over.
  o.headsOnScreen = [...document.querySelectorAll('#ovStats .statsrow.shead')].map(h =>
    [...h.querySelectorAll('.snum')].map(s=>s.textContent).join(','));
  o.screenMatchesTable = o.headsOnScreen.length === 2 &&
    o.headsOnScreen.every(h => h === o.heads.join(','));
  // ...and with nothing to decode, the acronym key is gone rather than left stale.
  o.noKey = !document.querySelector('#ovStats .statskey');
  // Three columns, not eight. A phone cannot hold eight and a reader cannot hold eight.
  o.fewColumns = M.STAT_COLS.length <= 4;
  // ⚠️ TOUCHES carries no answer anybody wants after a match, and being the one stat
  // every player always has it put a prose line on EVERY row — including the rows whose
  // whole story is that nothing happened. It must be in neither list.
  o.touchesDropped = !M.STAT_COLS.some(c=>c.k==='touches') &&
                     !M.STAT_MORE.some(c=>c.k==='touches');

  // ---- 2. nothing was lost ------------------------------------------------
  const byName = new Map(w.players.map(q=>[q.ctrl==='bot'?q.name:(q.name||'You'), q]));
  const rowOf = (row) => byName.get(row.querySelector('.swho b').textContent);
  // Every COLUMN equals the tally it came from.
  o.everyNumberMatches = rows.every(row=>{
    const q = rowOf(row); if (!q) return false;
    const nums=[...row.querySelectorAll('.snum')].map(s=>s.textContent);
    return M.STAT_COLS.every((c,i)=> nums[i] === String(q.ms[c.k] ?? 0));
  });
  // ⚠️ And every non-zero stat WITHOUT a column is still on screen, as a number and a
  // word. This is the check that stops "less info" quietly becoming "lost info": the
  // whole justification for cutting five columns is that they moved rather than went.
  o.lines = {};
  o.nothingLost = rows.every(row=>{
    const q = rowOf(row); if (!q) return false;
    const txt = (row.querySelector('.sdid') || {}).textContent || '';
    o.lines[row.querySelector('.swho b').textContent] = txt;
    return M.STAT_MORE.every(s=>{
      const v = q.ms[s.k] || 0;
      if (v === 0) return !new RegExp('\\b'+s.one.split(' ')[0], 'i').test(txt);
      // the count AND the word, so "2" alone or "clearance" alone doesn't pass
      return new RegExp('\\b'+v+'\\s', 'i').test(txt) &&
             new RegExp(s.one.split(' ')[0], 'i').test(txt);
    });
  });
  // ⚠️ A player who did nothing gets NO line — not a line of five zeros, which is both
  // longer and less informative than silence. Player 5 of the tally is that player.
  const quiet = rows.filter(row => { const q=rowOf(row);
    return M.STAT_MORE.every(s=>(q.ms[s.k]||0) === 0); });
  o.quietRows = quiet.length;
  o.quietSaysNothing = quiet.length > 0 && quiet.every(row => !row.querySelector('.sdid'));
  // A zero in a column recedes; a real number does not.
  o.zeroesMarked = rows.every(row => [...row.querySelectorAll('.snum')].every(d =>
    (d.textContent === '0') === d.classList.contains('z')));

  // ---- the rest of the panel, unchanged ------------------------------------
  o.yourRowMarked = rows.filter(x=>x.classList.contains('you')).length === 1;
  o.teamsTagged = rows.every(x=>x.dataset.team==='0' || x.dataset.team==='1');
  o.bothTeamsShown = new Set(rows.map(x=>x.dataset.team)).size === 2;
  o.discsDrawn = rows.every(x=>{ const cv=x.querySelector('canvas'); if(!cv) return false;
    const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n>60; });
  M.showOverlay('Paused','', true);
  o.clearsOnReopen = document.getElementById('ovStats').children.length === 0;
  M.renderMatchStats({ drillMode:true, players:w.players });
  o.noStatsInDrills = document.getElementById('ovStats').children.length === 0;
  return o;
}, TALLY);

// ---- 3. ...and it fits a phone ---------------------------------------------
// ⚠️ A NARROW viewport and a FULL 4v4, which is the worst case: eight players and the
// two panels stacked. Measured as overflow of the row against its own panel — the
// complaint that started this was "looks terrible on mobile", and a row wider than the
// card it sits in is the measurable half of that.
await p.setViewportSize({ width:360, height:720 });
const fit = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  M.setMatchSeed(4); M.sel.mode='4v4'; M.startMatch();
  const w=M.world; w.state='play'; w.stateT=1;
  w.players.forEach((q,i)=>Object.assign(q.ms,
    { goals:i%3, saves:i%2, assists:0, clears:i, passKey:i%2, posts:0, hardest:6, shots:i+2, touches:20+i }));
  w.score=[3,2];
  M.showOverlay('YOU WIN!','3 – 2', false);
  M.renderMatchStats(w);
  const rows=[...document.querySelectorAll('#ovStats .statsrow')];
  o.rows = rows.length;
  // No row may be wider than the panel holding it, and no cell may be clipped.
  o.overflow = rows.map(row=>{
    const pan = row.closest('.tpanel');
    return Math.round(row.scrollWidth - pan.clientWidth);
  }).filter(v=>v>0);
  o.fitsPhone = o.overflow.length === 0;
  // The panels stack rather than sitting side by side at this width.
  const pans=[...document.querySelectorAll('.tpanel')];
  o.stacked = pans.length===2 && pans[1].getBoundingClientRect().top > pans[0].getBoundingClientRect().bottom - 2;
  // Every name is legible rather than ellipsised away by the numbers.
  o.namesClipped = [...document.querySelectorAll('#ovStats .swho b')]
    .filter(n=>n.scrollWidth > n.clientWidth + 1).length;
  // ⚠️ And the whole sheet is SHORTER than the eight-column version, which put a
  // 5-zero row on every player. Measured, because "less info" is the actual request.
  o.heightPx = Math.round(document.getElementById('ovStats').getBoundingClientRect().height);
  return o;
});

const all = { ...r, ...fit };
console.log(JSON.stringify(all,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must=['rowPerPlayer','hasHeader','headsAreWords','screenMatchesTable','noKey','fewColumns',
  'touchesDropped','everyNumberMatches','nothingLost','quietSaysNothing','zeroesMarked',
  'yourRowMarked','teamsTagged','bothTeamsShown','discsDrawn','clearsOnReopen','noStatsInDrills',
  'fitsPhone','stacked'];
const bad = must.filter(k=>all[k]!==true);
if (all.namesClipped > 0) bad.push('namesClipped='+all.namesClipped);
const ok = bad.length===0 && errors.length===0;
if(bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
