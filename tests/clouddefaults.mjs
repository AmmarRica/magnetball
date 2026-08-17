// DEFAULT SETTINGS FROM A GOOGLE SHEET — set them once, every device starts there.
//
// ⚠️ IT IS A READ. Sheet WRITES are closed by design here (they need a hosted Apps
// Script), but the leaderboard already reads a public sheet through Google's gviz JSON
// endpoint, so this is the same journey to a different tab. Nothing about the device
// leaves it.
//
// ⚠️ THE ONE PROPERTY THAT MATTERS IS PRECEDENCE, and it is easy to get backwards:
//   built-in defaults  →  the SHEET  →  this device's own saved settings
// A setting somebody has deliberately changed on a device has to win, or "default" is
// the wrong word for the feature. The exception is the sheet's own `managed` row, which
// is how one place locks a cabinet or a venue — and that one goes on LAST.
//
// ⚠️ AND THE SHEET IS NEVER WRITTEN INTO `magnetball.sel`. The absence of that key is
// literally how the game knows you have never changed a setting (`isFirstRun`), and the
// promise in that code is "your settings win forever after". So the sheet stays a LAYER
// re-applied at each boot from a cache, never a save. Check 3 is that, and it is
// sabotage-verified.
//
// ⚠️ MEASUREMENT TRAP: the real endpoint must never be hit from here. `window.fetch` is
// stubbed in `addInitScript`, before the page runs, so the page's own deferred pull hits
// the stub too rather than the network.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

// A gviz reply, wrapper and all — the shape the parser has to survive.
const gviz = (rows) => {
  const cell = v => ({ v });
  return '/*O_o*/\ngoogle.visualization.Query.setResponse(' + JSON.stringify({
    version: '0.6', status: 'ok',
    table: {
      cols: [{ label: 'Setting', type: 'string' }, { label: 'Value', type: 'string' }],
      rows: rows.map(([k, v]) => ({ c: [cell(k), cell(v)] })),
    },
  }) + ');';
};

// `mode` decides what the stubbed fetch does with the gviz URL: serve, fail, hang, or
// answer with the HTML sign-in page a PRIVATE sheet gives you.
const page = async (opts) => {
  const o = opts || {};
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FILE|favicon|manifest|sw\.js|Failed to load|ERR_TUNNEL/i.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(([body, mode, store]) => {
    window.__MAGNETDEBUG = true;
    for (const [k, v] of store || []) localStorage.setItem(k, v);
    const real = window.fetch.bind(window);
    window.__hits = 0;
    window.fetch = (u, init) => {
      const url = String(u);
      if (!/gviz/.test(url)) return real(u, init);
      window.__hits++;
      if (mode === 'fail') return Promise.reject(new Error('offline'));
      if (mode === 'hang') return new Promise(() => {});
      if (mode === 'private') return Promise.resolve(new Response('<html>Sign in</html>', { status: 200 }));
      return Promise.resolve(new Response(body, { status: 200 }));
    };
  }, [o.body || gviz([]), o.mode || 'ok', o.store || []]);
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(o.wait == null ? 800 : o.wait);
  return p;
};

// The gid has to be set for any of this to run at all; the shipped value is blank.
const SHEET = [['gid', '']];

// ===================================================== 1-2. PRECEDENCE ==
// ⚠️ The cache is seeded directly rather than waiting for a network round trip, because
// what is under test here is the ORDER `loadSel` applies things in, not the fetch.
const seed = (rows, managed) => ['magnetball.cloud',
  JSON.stringify({ at: Date.now(), rows, managed: !!managed })];

{
  const p = await page({ store: [seed({ diff: 'hard', field: 'colossus' })] });
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    return { diff: M.sel.diff, field: M.sel.field,
             // the same boot, replayed, so the assertion is about loadSel and not about
             // whatever else the bootstrap happened to do
             builtIn: M.defaultSel().diff };
  });
  ok('a fresh device takes the sheet\'s defaults', r.diff === 'hard' && r.field === 'colossus',
     JSON.stringify(r) + ' — built-in default is ' + r.builtIn);
  await p.close();
}
{
  const p = await page({ store: [seed({ diff: 'hard' }), ['magnetball.sel', JSON.stringify({ diff: 'insane' })]] });
  const r = await p.evaluate(() => ({ diff: window.__magnet.sel.diff }));
  ok('...but a setting changed ON THE DEVICE still wins', r.diff === 'insane',
     `got ${r.diff} — this is the whole safety property: "default" has to mean the thing you get when you have not chosen`);
  await p.close();
}
{
  const p = await page({ store: [seed({ diff: 'hard' }, true), ['magnetball.sel', JSON.stringify({ diff: 'insane' })]] });
  const r = await p.evaluate(() => ({ diff: window.__magnet.sel.diff }));
  ok('MANAGED: the sheet wins, over the device\'s own save', r.diff === 'hard',
     `got ${r.diff} — set once in the sheet, so a cabinet is locked from the same place as everything else`);
  await p.close();
}

// ============================== 3. FIRST RUN IS NOT FORGED ==
// ⚠️ Assert the KEY, never "storage is empty": boot legitimately writes `ui`, `feed`,
// `login` and `lastver` (tests/continents.mjs records this), so an emptiness check would
// pass on a build that had already forged a save.
{
  const p = await page({ store: [seed({ diff: 'hard', 'look.palette': 'tennis' })] });
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    return { applied: M.sel.diff === 'hard' && M.sel.look.palette === 'tennis',
             selKey: localStorage.getItem('magnetball.sel'),
             firstRun: M.isFirstRun ? M.isFirstRun() : null };
  });
  ok('the sheet applied and yet no save was forged', r.applied && r.selKey === null,
     `applied ${r.applied}, magnetball.sel is ${r.selKey === null ? 'absent' : 'PRESENT'} — that key's absence is how the game knows you have never changed a setting`);
  ok('...so a brand-new device is still a first run', r.firstRun !== false,
     'writing the sheet into magnetball.sel would take the first-run lineup away from every new install');
  await p.close();
}

// ============================ 4-5. THE SCHEMA IS THE ALLOWLIST ==
{
  const p = await page({ store: [seed({
    'feel.accel': '52',          // a number
    'look.palette': 'tennis',    // a string
    'teamCol.0': '#e05aa8',      // into an array
    'sprint': 'on',
    'juice': 'no',               // a boolean, spelled the way a person would
  })] });
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    return { accel: M.sel.feel.accel, accelType: typeof M.sel.feel.accel,
             palette: M.sel.look.palette, team0: M.sel.teamCol[0],
             sprint: M.sel.sprint, juice: M.sel.juice, juiceType: typeof M.sel.juice };
  });
  ok('nested paths reach the nested groups', r.accel === 52 && r.palette === 'tennis' && r.team0 === '#e05aa8',
     JSON.stringify(r));
  ok('...and the value is COERCED to the default\'s type', r.accelType === 'number' && r.juiceType === 'boolean' && r.juice === false,
     JSON.stringify(r) + ' — a sheet cell is a string or a number and nothing else, so this is the whole type system');
  await p.close();
}
{
  // ⚠️ Every one of these is a row somebody could really type, or really send.
  const junk = {
    'nonsense': 'x',                       // not a setting at all
    'feel.nonsense': '1',                  // a real group, an unreal leaf
    'feel': '5',                           // a group addressed as a leaf
    'look.palette.deeper': 'x',            // past the end of the schema
    '__proto__.polluted': 'yes',           // prototype, via a path
    'constructor.prototype.polluted': '1', // ...and the other way in
    '': 'x',
  };
  const p = await page({ store: [seed(junk)] });
  const clean = await page({});
  const a = await p.evaluate(() => JSON.stringify(window.__magnet.sel));
  const c = await clean.evaluate(() => JSON.stringify(window.__magnet.sel));
  const poll = await p.evaluate(() => ({
    obj: ({}).polluted, sel: window.__magnet.sel.polluted,
  }));
  ok('junk rows are inert', a === c,
     'a sheet full of unknown paths, over-deep paths and prototype tricks left `sel` different from a no-sheet boot');
  ok('...and nothing was polluted', poll.obj === undefined && poll.sel === undefined,
     JSON.stringify(poll) + ' — own-property checks at every hop are what stop a path walking off into the prototype chain');
  await p.close(); await clean.close();
}

// ⚠️ A REAL SETTING WITH A NONSENSE VALUE IS A DIFFERENT CASE, and it cannot be refused
// by the schema: `diff` holds a string, and "banana" is a string. What has to be true is
// that one bad cell in a shared sheet LOOKS wrong rather than taking the game down on
// every device at once — so every registry lookup off `sel` falls back. `FIELDS`, `BALLS`
// and `look.palette` already did; `MODES`, `LENGTHS` and `DIFF` did not, and an unknown
// `diff` handed the bots `undefined.react` and made every decision NaN.
{
  const p = await page({ store: [seed({ diff: 'banana', mode: 'nope', length: 'x', field: 'gone' })] });
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'off'; M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 300; i++) M.step(w);
    return { ran: isFinite(w.ball.x) && isFinite(w.players[0].x),
             bots: w.players.every(q => isFinite(q.x) && isFinite(q.y)),
             diffName: w.diff && w.diff.name, secs: w.len && w.len.secs };
  });
  ok('one bad cell cannot take the game down', r.ran && r.bots,
     JSON.stringify(r) + ' — an unknown diff used to hand the bots undefined.react and every decision came out NaN');
  ok('...it falls back to something sane', r.diffName === 'Normal' && r.secs > 0, JSON.stringify(r));
  await p.close();
}

// =================================== 6-7. FAILURE IS SILENT ==
{
  const p = await page({ mode: 'fail', store: [seed({ diff: 'hard' })] });
  const r = await p.evaluate(() => ({ diff: window.__magnet.sel.diff, hits: window.__hits }));
  ok('offline, the CACHED copy still applies', r.diff === 'hard',
     `got ${r.diff} — boot reads the cache, never the network, which is also why this works on the downloaded single-file copy`);
  await p.close();
}
{
  const p = await page({ mode: 'fail' });
  const r = await p.evaluate(() => ({ diff: window.__magnet.sel.diff }));
  ok('...and with no cache at all, the built-in defaults do', r.diff === 'normal', String(r.diff));
  await p.close();
}
{
  // ⚠️ A PRIVATE sheet answers 200 with an HTML sign-in page. That is the real-world
  // failure, and the one the parser's own error message names.
  const p = await page({ mode: 'private' });
  const r = await p.evaluate(() => {
    let threw = '';
    try { window.__magnet.cloudParse('<html>Sign in</html>'); } catch(e){ threw = e.message; }
    return { diff: window.__magnet.sel.diff, threw, cached: localStorage.getItem('magnetball.cloud') };
  });
  ok('a private sheet changes nothing', r.diff === 'normal' && r.cached === null,
     JSON.stringify(r));
  ok('...and says so where a person can read it', /private/i.test(r.threw), r.threw);
  await p.close();
}

// ============================================ 8. IT CANNOT HANG BOOT ==
// ⚠️ The only fetch in the file with a timeout, because it is the only one that runs off
// a launch rather than off a button. What is measured is that the game is PLAYABLE while
// the request is still outstanding — not that the request eventually gave up.
{
  const p = await page({ mode: 'hang' });
  const r = await p.evaluate(() => {
    const M = window.__magnet;
    M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 120; i++) M.step(w);
    return { ran: isFinite(w.ball.x), hasTimeout: M.CLOUD.timeout > 0 };
  });
  ok('a request that never settles does not hold up the game', r.ran,
     'boot reads the cache and the pull is deferred, so there is nothing for a hung fetch to block');
  ok('...and it is on a timeout regardless', r.hasTimeout, String(r.hasTimeout));
  await p.close();
}

// ============================== 9-10. THE PULL, AND THE SAVE FILE ==
{
  const p = await page({ body: gviz([['diff', 'pro'], ['managed', 'no']]) });
  const r = await p.evaluate(async () => {
    const M = window.__magnet;
    M.CLOUD.gid = '7';                       // pretend the tab exists
    const got = await M.cloudRefresh(false);
    const rec = M.cloudRec();
    return { got: !!got, rows: rec && rec.rows, at: !!(rec && rec.at),
             // ⚠️ A plain refresh must NOT touch the live game — it refreshes the cache
             // for the next launch. That is what makes boot's read of a cache honest.
             liveUntouched: M.sel.diff === 'normal' };
  });
  ok('the pull reads the sheet and remembers it', r.got && r.rows && r.rows.diff === 'pro' && r.at,
     JSON.stringify(r));
  ok('...without changing the running game', r.liveUntouched,
     'a background pull that reached into a live match would change the rules underneath somebody');
  const live = await p.evaluate(async () => {
    const M = window.__magnet;
    await M.cloudRefresh(true);
    const el = document.getElementById('cloudInfo');
    return { diff: M.sel.diff, info: el ? el.textContent : '' };
  });
  ok('...and the button applies one NOW', live.diff === 'pro', String(live.diff));
  ok('...and the card says where the defaults came from', /from the sheet/.test(live.info),
     `"${live.info}" — "using built-in defaults" and "read an hour ago" are different facts`);
  // ⚠️ The cache is a record of a REMOTE DOCUMENT plus when this device last looked, so it
  // must not travel in a game save — the same argument that keeps `magnetball.upd` out.
  const save = await p.evaluate(() => {
    const M = window.__magnet;
    return { inDoc: 'cloud' in M.buildSaveDoc().data, inSkip: M.SAVEFILE.skip.includes('cloud'),
             inKeys: M.SAVEFILE.keys.includes('cloud') };
  });
  ok('the cache does not travel in a game save', !save.inDoc && save.inSkip && !save.inKeys,
     JSON.stringify(save));
  await p.close();
}

// ==================================== the /settings window does not double-fetch ==
// ⚠️ The reason `updPossible()` excludes the panel: it is the same document with the game
// switched off, and two windows pulling one sheet is one pull too many.
{
  const p = await b.newPage({ viewport: { width: 700, height: 900 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    window.__MAGNETDEBUG = true; window.__MAGNETPANEL = 'settings';
    const real = window.fetch.bind(window);
    window.__hits = 0;
    window.fetch = (u, init) => { if (/gviz/.test(String(u))) { window.__hits++; return new Promise(() => {}); } return real(u, init); };
  });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(2000);
  const hits = await p.evaluate(() => window.__hits);
  ok('the settings window does not pull the sheet as well', hits === 0, `${hits} fetches from the panel`);
  await p.close();
}

// ==================================== the shipped build asks for nothing ==
// ⚠️ `CLOUD.gid` is blank until somebody sets up the tab, and with it blank there must be
// no request at all — a game that phones Google on every launch of a build nobody has
// configured is a surprise, and it would show up as a console error offline.
{
  const p = await page({ mode: 'hang', wait: 2000 });
  const r = await p.evaluate(() => ({ hits: window.__hits, gid: window.__magnet.CLOUD.gid }));
  ok('with no Defaults tab set up, nothing is fetched', r.hits === 0 && r.gid === '',
     `${r.hits} fetches with gid "${r.gid}"`);
  await p.close();
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
if (fails.length){ console.log('FAIL clouddefaults\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS clouddefaults');
