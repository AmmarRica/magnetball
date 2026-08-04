// The result screen shows the full scoresheet, not just the awards — the numbers
// come from the same per-player tallies the awards are picked from.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:800,height:1100} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true; localStorage.clear();});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(700);

const r = await p.evaluate(()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.setMatchSeed(9); M.sel.mode='3v3'; M.startMatch();
  const w=M.world; w.state='play'; w.stateT=1;
  const tally=[{goals:2,saves:0,assists:1,clears:0,passKey:2,posts:1,hardest:9.4,shots:5,touches:44},
               {goals:1,saves:2,assists:0,clears:4,passKey:0,posts:0,hardest:7.0,shots:2,touches:31},
               {goals:0,saves:5,assists:0,clears:1,passKey:0,posts:0,hardest:6.0,shots:0,touches:22},
               {goals:1,saves:0,assists:2,clears:0,passKey:1,posts:0,hardest:8.1,shots:4,touches:29},
               {goals:0,saves:1,assists:0,clears:2,passKey:0,posts:0,hardest:5.5,shots:1,touches:18},
               {goals:0,saves:0,assists:0,clears:0,passKey:0,posts:2,hardest:0,shots:0,touches:12}];
  w.players.forEach((q,i)=>Object.assign(q.ms, tally[i]));
  w.score=[4,1];
  M.showOverlay('YOU WIN!','4 – 1', false);
  M.renderMatchStats(w);

  const rows=[...document.querySelectorAll('#ovStats .statsrow')].filter(x=>!x.classList.contains('shead'));
  o.rowPerPlayer = rows.length === w.players.length;
  o.hasHeader = !!document.querySelector('#ovStats .statsrow.shead');
  o.hasKey = !!document.querySelector('#ovStats .statskey');
  o.colCount = M.STAT_COLS.length;
  // Every number on screen must equal the tally it came from.
  const byName = new Map(w.players.map(q=>[q.ctrl==='bot'?q.name:(q.name||'You'), q]));
  o.everyNumberMatches = rows.every(row=>{
    const nm = row.querySelector('.swho b').textContent;
    const q = byName.get(nm); if (!q) return false;
    const nums=[...row.querySelectorAll('.snum')].map(s=>s.textContent);
    return M.STAT_COLS.every((c,i)=> nums[i] === String(q.ms[c.k] ?? 0));
  });
  // Your own line is marked, and each row carries its team.
  o.yourRowMarked = rows.filter(x=>x.classList.contains('you')).length === 1;
  o.teamsTagged = rows.every(x=>x.dataset.team==='0' || x.dataset.team==='1');
  o.bothTeamsShown = new Set(rows.map(x=>x.dataset.team)).size === 2;
  // Each disc is drawn, not a blank canvas.
  o.discsDrawn = rows.every(x=>{ const cv=x.querySelector('canvas'); if(!cv) return false;
    const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n>60; });
  // It clears between matches rather than stacking up.
  M.showOverlay('Paused','', true);
  o.clearsOnReopen = document.getElementById('ovStats').children.length === 0;
  // Drills have no scoresheet.
  M.renderMatchStats({ drillMode:true, players:w.players });
  o.noStatsInDrills = document.getElementById('ovStats').children.length === 0;
  return o;
});

console.log(JSON.stringify(r,null,1));
console.log('ERRORS:', errors.length?errors.slice(0,5):'none');
const must=['rowPerPlayer','hasHeader','hasKey','everyNumberMatches','yourRowMarked',
  'teamsTagged','bothTeamsShown','discsDrawn','clearsOnReopen','noStatsInDrills'];
const bad = must.filter(k=>r[k]!==true);
const ok = bad.length===0 && errors.length===0 && r.colCount>=6;
if(bad.length) console.log('FAILED:', bad);
console.log('RESULT:', ok?'ALL PASS':'FAIL');
await b.close(); process.exit(ok?0:1);
