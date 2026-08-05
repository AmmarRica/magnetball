// Rating a map at the size you played it.
//
// The load-bearing idea: the tally is keyed on (field, players per side), NOT the
// field alone. Huge is a lonely trudge 1v1 and a proper match 6v6, so the pair is
// the thing being rated and the two must never merge. Everything here exists to
// hold that line, plus the fact that the count comes from the bodies actually
// fielded rather than the mode — the warm-up lobby can put six a side on a 4v4.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const p = await b.newPage({ viewport:{width:1280,height:900} });
const errors=[]; p.on('pageerror',e=>errors.push(e.message));
p.on('console',m=>{ if(m.type()==='error') errors.push(m.text()); });
await p.addInitScript(()=>{window.__MAGNETDEBUG=true;});
await p.goto('file://' + process.cwd() + '/index.html');
await p.waitForTimeout(600);

const r = await p.evaluate(async ()=>{
  const M=window.__magnet; const o={};
  const dm=document.getElementById('dmCollect'); if(dm) dm.click();
  M.saveMapVotes({});                                  // start from nothing
  const box = () => document.querySelector('#ovVote .votebox');
  const btns = () => [...document.querySelectorAll('#ovVote .votebtn')];
  const finish = (field, mode) => {
    M.sel.field=field; M.sel.mode=mode; M.sel.autoReplay=false;
    M.setMatchSeed(6); M.startMatch();
    const w=M.world; w.state='play'; w.stateT=2; w.score=[2,1];
    M.endMatch(w); M.finishMatch(w);
    return w;
  };

  // ---- the key is (map, size), and the size is what was FIELDED ------------
  const w1 = finish('classic','1v1');
  o.key1 = M.mapVoteKey(w1);
  const w2 = finish('classic','4v4');
  o.key4 = M.mapVoteKey(w2);
  o.keysDiffer = o.key1 !== o.key4;
  o.keyNamesTheSize = /1v1/.test(o.key1) && /4v4/.test(o.key4);
  // Same mode, but the lobby fielded a bigger side: the key must follow the bodies.
  const w3 = finish('classic','4v4');
  const proto = w3.players.find(q=>q.ctrl==='bot');
  for (let i=0;i<2;i++){
    for (const t of [0,1]){ const c=JSON.parse(JSON.stringify(proto)); c.team=t; c.ctrl='bot'; c.name='X'+t+i; w3.players.push(c); }
  }
  o.key6 = M.mapVoteKey(w3);
  o.sizeFollowsBodies = o.key6 === 'classic@6v6';

  // ---- the prompt, and one press ------------------------------------------
  const w4 = finish('big','2v2');
  o.promptShown = !!box();
  o.promptNamesPair = /Big/i.test(box().textContent) && /2v2/.test(box().textContent);
  o.twoButtons = btns().length === 2;
  btns()[0].click();                                   // 👍
  o.afterVoteNoButtons = btns().length === 0;          // one vote per match
  o.afterVoteShowsTally = /1/.test(document.querySelector('#ovVote .votetally').textContent);
  o.stored = M.loadMapVotes()['big@2v2'];

  // ---- votes accumulate on the pair, and pairs stay separate ---------------
  finish('big','2v2'); btns()[0].click();              // 👍 again, same pair
  finish('big','2v2'); btns()[1].click();              // 👎, same pair
  finish('big','1v1'); btns()[1].click();              // 👎 on a DIFFERENT size
  const all = M.loadMapVotes();
  o.pairTally = all['big@2v2'];
  o.otherPairTally = all['big@1v1'];
  o.accumulates = all['big@2v2'].up === 2 && all['big@2v2'].down === 1;
  o.sizesStaySeparate = all['big@1v1'].up === 0 && all['big@1v1'].down === 1;

  // ---- the career readout --------------------------------------------------
  M.buildMapVotes();
  const rows = [...document.querySelectorAll('#mapVoteList .mvrow')];
  o.rowKeys = rows.map(x=>x.dataset.key);
  o.listsBothPairs = o.rowKeys.includes('big@2v2') && o.rowKeys.includes('big@1v1');
  o.bestFirst = o.rowKeys[0] === 'big@2v2';            // net +1 beats net -1
  o.rowShowsCounts = /2/.test(rows[0].querySelector('.mvup').textContent) &&
                     /1/.test(rows[0].querySelector('.mvdown').textContent);
  o.tableNets = M.mapVoteTable().map(x=>[x.key, x.net]);

  // ---- persistence and hygiene --------------------------------------------
  o.persisted = JSON.parse(localStorage.getItem('magnetball.mapvotes'))['big@2v2'].up === 2;
  // Not offered where there's no map to rate.
  M.startDrill && M.startDrill(Object.keys(M.DRILLS)[0]);
  M.renderMapVote(M.world);
  o.noneInDrills = !box();
  // Empty state reads as empty, not as a broken list.
  M.saveMapVotes({}); M.buildMapVotes();
  o.emptyState = !!document.querySelector('#mapVoteList .mvempty') &&
                 document.querySelectorAll('#mapVoteList .mvrow').length === 0;
  return o;
});

const fail=[];
const ok=(c,m)=>{ if(!c) fail.push(m); };
ok(r.keysDiffer, `the same map at two sizes shares one key: ${r.key1} / ${r.key4}`);
ok(r.keyNamesTheSize, `the key does not carry the player count: ${r.key1} / ${r.key4}`);
ok(r.sizeFollowsBodies, `the size came from the mode, not the bodies fielded: ${r.key6}`);
ok(r.promptShown, 'no vote prompt on the result screen');
ok(r.promptNamesPair, 'the prompt does not say which map and size is being rated');
ok(r.twoButtons, `expected a like and a dislike, got ${r.twoButtons}`);
ok(r.afterVoteNoButtons, 'you can vote more than once on the same match');
ok(r.afterVoteShowsTally, 'voting does not show the running tally back');
ok(r.stored && r.stored.up === 1, `the vote was not stored: ${JSON.stringify(r.stored)}`);
ok(r.accumulates, `votes on a pair do not accumulate: ${JSON.stringify(r.pairTally)}`);
ok(r.sizesStaySeparate, `a vote leaked between sizes of the same map: ${JSON.stringify(r.otherPairTally)}`);
ok(r.listsBothPairs, `the career list is missing a pairing: ${JSON.stringify(r.rowKeys)}`);
ok(r.bestFirst, `the list is not ranked best-first: ${JSON.stringify(r.tableNets)}`);
ok(r.rowShowsCounts, 'a career row does not show its up/down counts');
ok(r.persisted, 'votes do not survive a reload');
ok(r.noneInDrills, 'the vote prompt appeared in a drill, which has no map to rate');
ok(r.emptyState, 'the empty career list does not say it is empty');
ok(errors.length===0, 'console errors: '+errors.join(' | '));

console.log(JSON.stringify(r, null, 1));
await b.close();
if (fail.length){ console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nmapvote OK');
