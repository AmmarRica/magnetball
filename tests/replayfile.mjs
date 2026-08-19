// SAVING A REPLAY TO DISK — plain `.json`.
//
// "Save clip" writes a VIDEO: right for sending someone, wrong for keeping. It is
// large, baked at whatever size the window happened to be, and nothing can ever be
// done with it again. A replay file is the replay ITSELF — the positions — so it re-renders
// at your screen's size, in your theme, at any speed, in a few tens of KB of JSON.
//
// ⚠️ THE ONE THING THAT MAKES OR BREAKS THE FORMAT IS SELF-CONTAINMENT. `drawReplayFrame`
// reads the field geometry and every player's colour, flag and eyes off the LIVE world,
// so a file carrying only frames can be watched back in the match it came from and
// nowhere else — which is to say never, because by then the replay is already in memory.
// So the sharpest check here loads a file into a page that has never played that match:
// a different field, a different mode, a fresh world. If the format is missing anything,
// that is where it shows.
//
// ⚠️ The extension is plain `.json` on purpose (it shipped for one commit as an invented
// `.mbr`, which already means Master Boot Record and bought nothing). That makes the
// `format` magic string LOAD-BEARING rather than decorative — the picker will hand us any
// JSON on the disk — so the guard tests below are the ones protecting a menu from a
// stack trace when somebody picks a package.json.
//
// Also held: the magic/version guard (a JSON file that merely parses is not a replay),
// the frame-length guard (a short row indexes past the end and fails as a BLANK SCREEN
// rather than as an error anybody can read), and that playback puts the live world back
// exactly as it found it — the loader swaps the global `world`, which is only safe
// because `loop()` yields while a replay is active.
import { chromium, LAUNCH } from './_browser.mjs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const page = async () => {
  const p = await b.newPage({ viewport:{ width:900, height:1000 } });
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; localStorage.clear(); });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(700);
  return p;
};

// ---- record a real goal, then build the file -------------------------------
const p = await page();
const made = await p.evaluate(() => {
  const M = window.__magnet;
  const dm = document.getElementById('dmCollect'); if (dm) dm.click();
  M.setMatchSeed(11); M.sel.mode = '3v3'; M.sel.field = 'classic'; M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 1;
  // Play far enough to fill the rolling buffer, then freeze it the way a goal does.
  for (let i=0;i<400;i++) M.step(w);
  M.repOnGoal(w);
  const doc = M.repFileBuild();
  return {
    hasDoc: !!doc,
    format: doc && doc.format, v: doc && doc.v,
    field: doc && doc.field, mode: doc && doc.mode,
    players: doc && doc.players.length,
    frames: doc && doc.frames.length,
    fps: doc && doc.fps,
    // Everything needed to DRAW a player has to be in there — this is the whole point.
    player0: doc && doc.players[0],
    rowLen: doc && doc.frames[0].length,
    bytes: doc && JSON.stringify(doc).length,
    filename: M.repFilename(),
    look: doc && doc.look,
    build: doc && !!doc.build, saved: doc && !!doc.saved,
    json: doc && JSON.stringify(doc),
  };
});

ok('a file is produced', made.hasDoc);
ok('it is stamped and versioned', made.format === 'magnetball-replay' && made.v === 1,
   made.format + ' v' + made.v);
ok('it names its field and mode', made.field === 'classic' && made.mode === '3v3',
   made.field + ' / ' + made.mode);
ok('it holds the whole buffer at full rate', made.frames >= 300 && made.fps === 60,
   made.frames + ' frames @ ' + made.fps + 'fps');
// ⚠️ Against the SHEET payload, which is capped at 120 frames for one cell. A file on
// disk has no such limit, and the shared encoder has to honour both.
ok('a file keeps more than the sheet payload does', made.frames > 120, made.frames + ' frames');
ok('every row carries ball + all six players', made.rowLen === 2 + 6*3, 'row is ' + made.rowLen);
ok('players carry what it takes to draw them',
   made.player0 && ['team','name','color','cap','flag','eyes','r'].every(k => made.player0[k] !== undefined),
   JSON.stringify(made.player0));
// ⚠️ Mid-play state must NOT be in there: velocity, AI scratch and match stats mean
// nothing in a recording and `ms` alone would double the file.
ok('and nothing else', made.player0 && !('vx' in made.player0) && !('ms' in made.player0) && !('aiTarget' in made.player0),
   Object.keys(made.player0 || {}).join());
ok('it is small', made.bytes < 200000, made.bytes + ' bytes');
// ⚠️ The KIND is in the name: a goal and a whole match off the same court are otherwise
// the same filename twice, and one of them is twenty times the size of the other.
ok('the filename is safe on every OS, and says which kind', /^magnetball-(goal|match)-replay-classic-[\d-]+\.json$/.test(made.filename) && !made.filename.includes(':'),
   made.filename);
ok('the look is recorded', made.look && typeof made.look === 'object');
ok('it stamps the build and the date', made.build && made.saved);
await p.close();

// ---- ...and now open it somewhere that has never seen that match ------------
// ⚠️ THE REAL TEST. Fresh page, different field, different mode, different theme —
// nothing about the recorded match is in memory. Anything the format forgot to carry
// fails here and only here.
{
  const q = await page();
  const played = await q.evaluate(async (json) => {
    const M = window.__magnet;
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();
    M.applyBundle('neon');                       // a real palette key — 'classic' is not one
    M.sel.mode = '1v1'; M.sel.field = 'giant'; M.startMatch();
    const before = M.world;
    const beforeField = before.fieldKey, beforePlayers = before.players.length;

    const doc = M.repFileParse(json);
    // The world the loader builds from the file alone.
    const rw = M.repFileWorld(doc);
    const o = {
      parsed: !!doc,
      builtField: rw.fieldKey,
      builtPlayers: rw.players.length,
      // ⚠️ Geometry through buildGeometry, not a copied bounds object — the walls and
      // posts are what drawPitch paints the court from.
      hasBounds: !!(rw.bounds && rw.bounds.halfW > 0 && rw.bounds.halfL > 0),
      hasWalls: Array.isArray(rw.walls) && rw.walls.length > 0,
      hasPosts: Array.isArray(rw.posts),
      colorsKept: rw.players.map(p => p.color).join() === doc.players.map(p => p.color).join(),
      // Frames decode back to the shape playReplay wants.
      decoded: (() => { const d = M.repDecodeFrames(doc.frames, doc.players.length);
        return d.length === doc.frames.length && d[0].p.length === doc.players.length &&
               isFinite(d[0].bx) && isFinite(d[0].p[0].x); })(),
    };
    // ---- does the file's world actually DRAW? --------------------------------
    // ⚠️ Measured by painting the canvas a known colour and counting what covers it,
    // NOT by "the canvas differs from before". The first version of this check did the
    // latter and was vacuous: `playReplayFile` calls `render()` on the way out, so the
    // live match repaints and the pixels differ whether or not a single replay frame
    // was ever drawn. Deleting the playback call outright still passed it.
    const cv = document.getElementById('game'), c2 = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const cover = (fn) => {
      c2.save(); c2.setTransform(1,0,0,1,0,0);
      c2.fillStyle = '#ff00ff'; c2.fillRect(0,0,W,H);      // a colour nothing here paints
      c2.restore();
      fn();
      const d = c2.getImageData(0,0,W,H).data;
      let n = 0;
      for (let i=0; i<d.length; i+=4*37)                    // sparse stride: this is 1000s of px
        if (!(d[i]>240 && d[i+1]<40 && d[i+2]>240)) n++;
      return n / (d.length/(4*37));
    };
    const prevW = M.world;
    M.world = rw; M.computeCam();
    const dec = M.repDecodeFrames(doc.frames, doc.players.length);
    // A world rebuilt from the file alone has to paint a court...
    o.coverage = cover(() => M.drawReplayFrame(dec[10]));
    // ...and the frame data has to DRIVE it. ⚠️ "Two different frames look different"
    // is not enough: `drawReplayFrame` reads the ball and the players from separate
    // fields, so pinning the players at the origin and ignoring their recorded
    // positions entirely STILL passes that — the ball moved, so the picture changed.
    // Each is therefore varied while the other is held still, which is the only way a
    // half-wired frame reader shows up.
    const f0 = dec[0], fN = dec[dec.length-1];
    const shot = (f) => { cover(() => M.drawReplayFrame(f));
                          return c2.getImageData(0,0,W,H).data.slice().join(); };
    // Same ball, different players → only the discs can account for a difference.
    o.playersMove = shot({ bx:f0.bx, by:f0.by, p:f0.p }) !== shot({ bx:f0.bx, by:f0.by, p:fN.p });
    // Same players, different ball → likewise for the ball.
    o.ballMoves   = shot({ bx:f0.bx, by:f0.by, p:f0.p }) !== shot({ bx:fN.bx, by:fN.by, p:f0.p });
    // ⚠️ And the fixture has to actually contain movement, or both checks above are
    // asserting that two identical pictures are identical.
    o.recordedMovement = Math.hypot(fN.bx-f0.bx, fN.by-f0.by) > 20 &&
                         f0.p.some((q,i) => Math.hypot(fN.p[i].x-q.x, fN.p[i].y-q.y) > 20);
    M.world = prevW; M.computeCam();

    // Then the real flow, end to end.
    await M.playReplayFile(doc, 40);
    // ⚠️ And the live match has to be exactly where it was. The loader swaps the GLOBAL
    // world; a throw or an early return that skipped the restore would leave the game
    // holding a replay's world, which is a broken match rather than a broken replay.
    o.restored = M.world === before && M.world.fieldKey === beforeField &&
                 M.world.players.length === beforePlayers;
    o.notStuck = !M.replay.active;
    return o;
  }, made.json);

  ok('a fresh page parses it', played.parsed);
  ok('the recorded field is rebuilt, not the live one', played.builtField === 'classic', played.builtField);
  ok('all six players come back on a 1v1 page', played.builtPlayers === 6, String(played.builtPlayers));
  ok('geometry is built from the file', played.hasBounds && played.hasWalls && played.hasPosts,
     JSON.stringify({ b:played.hasBounds, w:played.hasWalls, p:played.hasPosts }));
  ok('every player keeps its own colour', played.colorsKept);
  ok('frames decode', played.decoded);
  ok('the file\'s own world paints a court', played.coverage > 0.5,
     Math.round((played.coverage||0)*100) + '% of the canvas covered');
  ok('the recording contains movement to measure', played.recordedMovement,
     'the fixture stopped exercising this');
  ok('recorded PLAYER positions drive the picture', played.playersMove);
  ok('recorded BALL positions drive the picture', played.ballMoves);
  ok('the live match is put back untouched', played.restored);
  ok('and playback releases the canvas', played.notStuck);
  await q.close();
}

// ---- the guards -------------------------------------------------------------
// ⚠️ Each of these has a silent failure mode without the check: a stack trace on a
// menu, or a replay that plays to a blank screen and looks like a rendering bug.
{
  const q = await page();
  const guards = await q.evaluate((json) => {
    const M = window.__magnet;
    const why = (t) => { try { M.repFileParse(t); return 'ACCEPTED'; } catch(e){ return e.message; } };
    const doc = JSON.parse(json);
    const bad = (mut) => { const d = JSON.parse(json); mut(d); return why(JSON.stringify(d)); };
    return {
      good:      why(json) === 'ACCEPTED',
      notJson:   why('<html>nope</html>'),
      // ⚠️ The realistic accident now that the extension is plain `.json`: the picker
      // offers every JSON on the disk, so this is the one guard doing real work.
      otherJson: why('{"name":"my-app","version":"1.0.0","dependencies":{}}'),
      newer:     bad(d => { d.v = 99; }),
      noFrames:  bad(d => { d.frames = []; }),
      noPlayers: bad(d => { d.players = []; }),
      badField:  bad(d => { d.field = 'nosuchfield'; }),
      // A row one player short: the exact shape that renders blank instead of throwing.
      shortRow:  bad(d => { d.frames[5] = d.frames[5].slice(0, -3); }),
      // Extra trailing data is fine — a longer row is a newer writer, not a broken one.
      longRow:   bad(d => { d.frames[5] = d.frames[5].concat([0,0,0]); }),
    };
  }, made.json);

  ok('the good file is accepted', guards.good);
  ok('non-JSON is refused', /not a replay file/.test(guards.notJson), guards.notJson);
  ok('unrelated JSON is refused', /not a Magnetball replay/.test(guards.otherJson), guards.otherJson);
  ok('a newer version says so', /newer build/.test(guards.newer), guards.newer);
  ok('empty frames refused', /no frames/.test(guards.noFrames), guards.noFrames);
  ok('empty players refused', /no players/.test(guards.noPlayers), guards.noPlayers);
  ok('unknown field refused, by name', /unknown field/.test(guards.badField) && /nosuchfield/.test(guards.badField),
     guards.badField);
  ok('a short row refused BEFORE playback', /player count/.test(guards.shortRow), guards.shortRow);
  ok('a longer row is tolerated', guards.longRow === 'ACCEPTED', guards.longRow);
  // ⚠️ Every message has to be something a person can act on — "undefined" and
  // "[object Object]" are the two that creep in from a thrown non-Error.
  const msgs = Object.entries(guards).filter(([k]) => k !== 'good' && k !== 'longRow').map(([,v]) => v);
  ok('every refusal explains itself', msgs.every(m => m && m.length > 8 && !/undefined|\[object/.test(m)),
     msgs.join(' | '));
  await q.close();
}

// ---- nothing to save is not a crash ----------------------------------------
{
  const q = await page();
  const empty = await q.evaluate(() => {
    const M = window.__magnet;
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();
    return { noDoc: M.repFileBuild() === null, noSave: M.saveReplayFile() === false };
  });
  ok('no replay yet → no file, no throw', empty.noDoc && empty.noSave, JSON.stringify(empty));
  await q.close();
}

// ============================================================
//  THE WHOLE MATCH, and the two kinds kept apart
// ============================================================
// A goal replay is the last few seconds; a match replay is kickoff to the whistle. They come
// out of two different buffers on purpose — the goal one wants every frame of a few seconds,
// the match one wants a watchable record of several minutes without carrying a quarter of a
// million objects to get it — but they are the same format and the same code path from
// `saveReplayFile` down, so a file of either kind loads the same way.
{
  const q = await b.newPage({ viewport:{ width:1000, height:700 } });
  const qerr = []; q.on('pageerror', e => qerr.push(e.message));
  q.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|Failed to load/.test(m.text())) qerr.push(m.text()); });
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);

  const m = await q.evaluate(() => {
    const M = window.__magnet; const o = {};
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.kickoffRule = 'off';
    M.setMatchSeed(21); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 3600; i++) M.step(w);        // a minute of match

    const doc = M.repMatchFileBuild(), goalDoc = M.repFileBuild();
    o.kinds = [goalDoc && goalDoc.kind, doc && doc.kind];
    o.frames = doc.frames.length; o.fps = doc.fps;
    // ⚠️ The length is checked against the STEPS taken, not against the frame count on its
    // own: a buffer that recorded a tenth of the match would still have "some frames".
    o.seconds = +(doc.frames.length / doc.fps).toFixed(1);
    o.coversTheMatch = Math.abs(o.seconds - 3600/60) < 1.5;
    // Every goal is marked, and the count agrees with the score — the one cross-check that
    // does not read the same number twice.
    o.goals = (doc.goals || []).length;
    o.scoreTotal = doc.score[0] + doc.score[1];
    o.goalsMatchScore = o.goals === o.scoreTotal && o.goals > 0;
    o.goalsInRange = (doc.goals || []).every(g => g >= 0 && g < doc.frames.length);
    // A match file is much bigger than a goal file, which is the whole reason they are
    // separate buttons — and a check that they are not accidentally the same buffer.
    o.matchBytes = JSON.stringify(doc).length;
    o.goalBytes = goalDoc ? JSON.stringify(goalDoc).length : 0;
    o.goalSeconds = goalDoc ? +(goalDoc.frames.length / goalDoc.fps).toFixed(1) : 0;
    // ⚠️ Compared on TIME COVERED, not on bytes. A minute of match at 30Hz is only about
    // four times a 7.6-second goal at 60Hz in size, so a byte-ratio threshold is really a
    // statement about how long the test match happened to be.
    o.matchIsBigger = o.seconds > o.goalSeconds * 3;
    o.rowsEqual = new Set(doc.frames.map(r => r.length)).size === 1;
    o.parses = (() => { try { M.repFileParse(JSON.stringify(doc)); return true; }
                        catch(e){ return 'ERR ' + e.message; } })();

    // ⚠️ A ROSTER CHANGE mid-match must not break the file. `w.players` grows when a
    // controller drops in and evenUpSides adds a bot to match, so a row captured after that
    // is longer than one captured before — and a file whose rows disagree with its own
    // player count either fails to parse (the good outcome) or indexes past the end of a
    // row and fails as a BLANK SCREEN. Driven by actually adding a body and stepping on.
    const before = M.repMatchBuf.length;
    const joiner = M.mkPlayer(0, 'Late', '#ffffff', 'none', 'bot', 'none', 'googly');
    joiner.x = 0; joiner.y = 200; w.players.push(joiner);
    for (let i = 0; i < 600; i++) M.step(w);
    const doc2 = M.repMatchFileBuild();
    o.grew = M.repMatchBuf.length > before;
    o.afterRowsEqual = new Set(doc2.frames.map(r => r.length)).size === 1;
    o.afterRowLen = doc2.frames[0].length;
    o.afterPlayers = doc2.players.length;
    o.rowFitsPlayers = o.afterRowLen === 2 + o.afterPlayers * 3;
    o.afterParses = (() => { try { M.repFileParse(JSON.stringify(doc2)); return true; }
                             catch(e){ return 'ERR ' + e.message; } })();
    // The back-fill keeps the WHOLE match, not just the part after the join.
    o.afterSeconds = +(doc2.frames.length / doc2.fps).toFixed(1);
    o.keptTheStart = o.afterSeconds > o.seconds;
    window.__matchDoc = doc2;
    return o;
  });

  ok('a goal file and a match file say which they are', JSON.stringify(m.kinds) === '["goal","match"]',
     JSON.stringify(m.kinds));
  ok('the match file covers the whole match', m.coversTheMatch,
     `${m.frames} frames at ${m.fps}fps is ${m.seconds}s of a 60s match`);
  ok('every goal is marked, and the count agrees with the score', m.goalsMatchScore,
     `${m.goals} marks against a score totalling ${m.scoreTotal} — a progress line through five goals that marks only the first is worse than one that marks none`);
  ok('...and every mark is inside the recording', m.goalsInRange, JSON.stringify(m.goals));
  ok('a match file covers far more than a goal file', m.matchIsBigger,
     `${m.seconds}s against ${m.goalSeconds}s (${Math.round(m.matchBytes/1024)}KB against ${Math.round(m.goalBytes/1024)}KB) — if they were close, both buttons are saving the same buffer`);
  ok('every row is the same length', m.rowsEqual);
  ok('and it parses', m.parses === true, String(m.parses));

  ok('a body joining mid-match still produces a valid file', m.afterParses === true, String(m.afterParses));
  ok('...with every row the same length', m.afterRowsEqual);
  ok('...matching its own player count', m.rowFitsPlayers,
     `rows are ${m.afterRowLen} long for ${m.afterPlayers} players — a file whose rows disagree either fails to parse or indexes past the end of a row, which fails as a blank screen rather than as an error anybody can read`);
  ok('...and the start of the match is still in it', m.keptTheStart,
     `${m.afterSeconds}s after the join against ${m.seconds}s before it — back-filling the new slot is what keeps the whole match instead of restarting at the substitution`);

  // ⚠️ PAST THE CAP IT HALVES ITS OWN RATE rather than stopping. A "first to 5" match has no
  // time limit at all, so a buffer that simply stopped would save the first few minutes of a
  // long match and call it the match — and every check above would still pass, because a
  // truncated recording is a valid file covering a shorter match. Driven by lowering the cap
  // so the path is actually taken, and measured as "does it still cover the elapsed time".
  const cap = await q.evaluate(() => {
    const M = window.__magnet; const o = {};
    const was = M.REPMATCH.max;
    M.REPMATCH.max = 400;                       // reached after 800 steps at 30Hz
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.kickoffRule = 'off';
    M.setMatchSeed(31); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    const STEPS = 6000;
    let peak = 0;
    for (let i = 0; i < STEPS; i++){ M.step(w); peak = Math.max(peak, M.repMatchBuf.length); }
    const doc = M.repMatchFileBuild();
    o.peak = peak; o.cap = 400;
    o.neverExceeded = peak <= 400;
    o.every = M.repMatchEvery;
    o.halved = M.repMatchEvery > M.REPMATCH.every;
    o.seconds = +(doc.frames.length / doc.fps).toFixed(1);
    o.wantSeconds = STEPS/60;
    // The whole point: coarser, but still the WHOLE match.
    o.stillCoversIt = Math.abs(o.seconds - o.wantSeconds) < o.wantSeconds*0.1;
    o.goalsInRange = (doc.goals || []).every(g => g >= 0 && g < doc.frames.length);
    o.goals = (doc.goals || []).length;
    M.REPMATCH.max = was;
    return o;
  });
  ok('the buffer never exceeds its cap', cap.neverExceeded, `peaked at ${cap.peak} against a cap of ${cap.cap}`);
  ok('...and the rate actually halved', cap.halved,
     `sampling every ${cap.every} steps — if it never halved, the check below is testing an ordinary short recording`);
  ok('...while still covering the whole match', cap.stillCoversIt,
     `${cap.seconds}s recorded of a ${cap.wantSeconds}s match — a buffer that STOPPED at the cap would save the first part and call it the match, and every other check here would still pass because a truncated recording is a perfectly valid file`);
  ok('...with the goal marks carried across the halving', cap.goalsInRange,
     `${cap.goals} marks, some outside the recording — the indices have to be rescaled with the buffer or they point at the wrong moment`);

  // ⚠️ PLAYBACK HONOURS THE RECORDED RATE. `fps` has been in every payload since the sheet
  // ones were capped at 120 frames and nothing ever read it, so a decimated replay played
  // back at however many times too fast its decimation was. A match file is 30Hz by design,
  // so it ran at double speed. Measured as frames consumed against wall-clock.
  const paced = await q.evaluate(async () => {
    const M = window.__magnet;
    const doc = window.__matchDoc;
    // ⚠️ Clear any replay the stepping above set off first. `playReplayFile` returns
    // immediately when one is already active, and stepping through several goals starts an
    // auto-replay for each — so without this both runs come back at 0ms and the comparison
    // is between two numbers that never measured anything.
    M.skipReplay();
    await new Promise(r => setTimeout(r, 120));
    const run = (fps) => new Promise(res => {
      const d = { ...doc, fps, frames: doc.frames.slice(0, 30) };
      const t0 = performance.now();
      M.playReplayFile(d, 1).then(() => res(performance.now() - t0));
      setTimeout(() => { M.skipReplay(); }, 3000);   // never hang the suite
    });
    const fast = await run(60), slow = await run(30);
    return { fast: Math.round(fast), slow: Math.round(slow), wasActive: M.replay.active };
  });
  ok('the pacing probe actually played something', paced.fast > 60,
     `the fps-60 run finished in ${paced.fast}ms for 30 frames, which is 0.5s of replay — anything much less means playReplayFile bailed and the comparison below is between two zeroes`);
  ok('playback runs at the rate the file was recorded at', paced.slow > paced.fast * 1.6,
     `30 frames took ${paced.fast}ms at fps 60 and ${paced.slow}ms at fps 30 — the same frames at half the rate must take twice as long, or a 30Hz match replay plays at double speed`);

  if (qerr.length) fails.push('match-replay page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}

// ============================================================
//  WHERE THE BUTTONS ARE
// ============================================================
// ⚠️ Save clip is END OF MATCH ONLY. Recording one plays the replay back through
// MediaRecorder for its whole length, which mid-match is several seconds of the game being
// unavailable while you are still playing it — and a video is the thing you send someone,
// which is an end-of-match errand. The two REPLAY saves both live on the result screen and
// are different things: one goal, or the whole match.
{
  const q = await b.newPage({ viewport:{ width:1000, height:800 } });
  const qerr = []; q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);

  const ui = await q.evaluate(() => {
    const M = window.__magnet; const o = {};
    const dm = document.getElementById('dmCollect'); if (dm) dm.click();
    const bar = document.getElementById('replayBar');
    o.barExists = !!bar;
    o.barButtons = bar ? [...bar.querySelectorAll('button')].map(b => b.textContent.trim()) : [];
    o.noClipOnTheBar = !document.querySelector('#replayBar #clipBtn');
    // ...and the bar still offers the goal save, or removing the clip took the wrong one.
    o.barSavesTheGoal = !!document.getElementById('repSaveBtn');

    // The result screen, built by the real path.
    M.sel.mode = '2v2'; M.sel.lobby = 'off'; M.sel.kickoffRule = 'off';
    M.setMatchSeed(7); M.startMatch();
    const w = M.world; w.state = 'play'; w.stateT = 2;
    for (let i = 0; i < 900; i++) M.step(w);
    M.endMatch(w); M.finishMatch(w);
    const ov = document.getElementById('overlay');
    o.resultButtons = [...ov.querySelectorAll('button')].map(b => b.textContent.trim());
    const has = (t) => o.resultButtons.some(x => x.indexOf(t) >= 0);
    o.clipAtTheEnd = has('Save clip');
    o.goalAtTheEnd = has('Save goal replay');
    o.matchAtTheEnd = has('Save match replay');
    o.twoDistinctSaves = o.goalAtTheEnd && o.matchAtTheEnd;
    return o;
  });

  ok('the replay bar exists to test', ui.barExists);
  ok('SAVE CLIP IS NOT ON THE IN-MATCH REPLAY BAR', ui.noClipOnTheBar,
     `the bar carries ${JSON.stringify(ui.barButtons)} — recording a clip plays the replay back through MediaRecorder for its whole length, which mid-match is the game being unavailable while you are still playing it`);
  ok('...but the bar still saves the goal', ui.barSavesTheGoal,
     `the bar carries ${JSON.stringify(ui.barButtons)} — removing the clip must not take the replay save with it`);
  ok('Save clip IS on the result screen', ui.clipAtTheEnd,
     `the result screen carries ${JSON.stringify(ui.resultButtons)} — moving it off the bar is only right if it turns up where there is nothing to interrupt`);
  ok('...next to TWO different replay saves', ui.twoDistinctSaves,
     `the result screen carries ${JSON.stringify(ui.resultButtons)} — a goal and a whole match are different things and each needs its own button, or one of them is unreachable`);

  if (qerr.length) fails.push('button-placement page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}

// ============================================================================
//  ⚠️ A REPLAY THAT OUTLIVES ITS WORLD STRANDS THE WHOLE FEATURE
// ============================================================================
// `toMenu()` sets `world = null`, and leaving a match mid-celebration is an ordinary thing
// to do. The pending tick of a live auto-replay then read `world.field` off null and threw
// — and a throw inside a rAF callback is SILENT: `finish()` never ran, so `replay.active`
// stayed true for the rest of the page. After that, `playReplayFile` returned at its very
// first line, so opening a saved .json from the menu played nothing and dropped you straight
// back on the menu you started from, with no error and nothing on screen to say why.
// `loop()` checks the same flag, so the game itself was frozen behind it too.
//
// Measured on a PHONE viewport, because that is where it was reported and where `toMenu()`
// takes the branch that nulls the world (on a desktop-sized window the menu is a left dock
// and the match keeps playing).
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  const qerr = [];
  q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);

  const o = await q.evaluate(async () => {
    const M = window.__magnet, o = {};
    M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.autoReplay=true;
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<400;i++) M.step(w);
    w.ball.x=0; w.ball.y=-w.bounds.halfL+4; w.ball.vy=-14; w.ball.lastKicker=w.players[0];
    for (let i=0;i<120;i++) M.step(w);
    const doc = M.repFileBuild();
    o.builtAFile = !!(doc && doc.frames && doc.frames.length);

    // Leave the match. On this viewport that nulls the world.
    M.toMenu();
    await new Promise(r => setTimeout(r, 300));
    o.worldIsGone = M.world === null;
    // ⚠️ THE ASSERTION. Nothing may be left holding the replay flag.
    o.flagIsClear = M.replay.active === false;

    // Now watch a saved file, the way the Replays card does.
    let ink = 0, sawActive = false;
    const c = document.getElementById('game');
    const done = M.watchReplayFromMenu(async () => doc);
    const t0 = Date.now();
    while (Date.now() - t0 < 4000){
      await new Promise(r => setTimeout(r, 50));
      if (M.replay.active){
        sawActive = true;
        const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
        let n = 0; for (let i=0;i<d.length;i+=4*97) if (d[i]+d[i+1]+d[i+2] > 40) n++;
        ink = Math.max(ink, n);
        o.menuGotOutOfTheWay = document.getElementById('setup').classList.contains('hidden');
      }
    }
    // ⚠️ LEAVE IT DELIBERATELY. A replay opened from the menu now HOLDS on its last frame
    // instead of closing itself, so this promise does not resolve until something exits —
    // which is the point of that change, and which makes a bare `await done` here a hang
    // rather than a wait. (It hung this suite for twenty minutes before the abort was added.)
    M.replayAbort();
    await done;
    o.itPlayed = sawActive;
    o.drewTheCourt = ink;
    o.cameBack = !document.getElementById('setup').classList.contains('hidden');
    return o;
  });

  // ⚠️ TWO INDEPENDENT GUARDS, so removing EITHER one alone still passes here — the tick's
  // `if (!world)` and `toMenu`'s `replayAbort()` each fix it on their own. That is not a weak
  // test: with both removed the block below fails on the flag, on the ink, and with the real
  // "Cannot read properties of null (reading 'field')" page error. Verified that way round.
  ok('a file was built to watch', o.builtAFile);
  ok('leaving the match really did take the world away', o.worldIsGone,
     'if the world survived, the check below passes without exercising anything');
  ok('...and left NOTHING holding the replay flag', o.flagIsClear,
     'replay.active stayed true after toMenu() — the pending tick threw on a null world, which is silent inside a rAF, so finish() never ran. Everything downstream then quietly does nothing');
  ok('a saved replay actually plays', o.itPlayed,
     'playReplayFile returns at its first line while replay.active is set, so this is the symptom: press Watch, nothing happens');
  ok('...and DRAWS THE COURT', o.drewTheCourt > 200,
     `only ${o.drewTheCourt} lit samples — "it played" is also true of a blank canvas, which is exactly what a throw in drawReplayFrame leaves behind`);
  ok('...with the menu out of the way while it does', o.menuGotOutOfTheWay === true,
     'on a phone #setup is a full-bleed fixed screen over the canvas, so a replay under it is invisible however well it renders');
  ok('...and the menu back afterwards', o.cameBack,
     'the caller\'s finally is what restores it');
  if (qerr.length) fails.push('replay-outlives-world page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}

// ============================================================================
//  THE REPLAY LEAD-IN IS A DIAL
// ============================================================================
// Six seconds was a constant, and a replay that starts mid-move shows the shot without the
// build-up that made it. ⚠️ The ring buffer is sized FROM the dial — a build that only fed
// it to the playback would replay the same six seconds however the slider was set, and
// every "the setting exists" check would still pass.
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  const qerr = [];
  q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const o = await q.evaluate(() => {
    const M = window.__magnet, o = {};
    const run = (secs) => {
      M.sel.repSecs = secs;
      M.sel.mode='1v1'; M.sel.lobby='off'; M.setMatchSeed(3); M.startMatch();
      const w = M.world; w.state='play'; w.stateT=2;
      for (let i=0;i<900;i++) M.step(w);        // well past any cap
      return { cap: M.repMaxFrames(), held: M.repBuf.length };
    };
    o.short = run(2); o.def = run(6); o.long = run(15);
    M.sel.repSecs = -5; o.clampLow  = M.repSecs();
    M.sel.repSecs = 99; o.clampHigh = M.repSecs();
    M.sel.repSecs = null; o.defaults = M.repSecs();
    M.sel.repSecs = 6;
    o.hasSlider  = !!document.querySelector('#setup .subpane[data-pane="camera"] #repSecs');
    o.findable   = M.menuSearchIndex().some(x => /replay starts/i.test(x.t));
    return o;
  });
  ok('the dial really sizes the buffer', o.short.held < o.def.held && o.def.held < o.long.held,
     `${o.short.held} / ${o.def.held} / ${o.long.held} frames held at 2s / 6s / 15s — if these match, the slider is decoration and the replay is the same length whatever it says`);
  ok('...to about the seconds it promises', Math.abs(o.def.held - 6*60) < 130,
     `${o.def.held} frames for 6s + the tail`);
  ok('it clamps both ends and has a default', o.clampLow === 2 && o.clampHigh === 15 && o.defaults === 6,
     JSON.stringify({ low:o.clampLow, high:o.clampHigh, def:o.defaults }));
  ok('the control is in Game Feel -> Camera', o.hasSlider);
  ok('...and the search reaches it', o.findable);
  if (qerr.length) fails.push('replay-lead page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}

// ============================================================================
//  SAVE CLIP HAS TO SAY WHAT IT DID
// ============================================================================
// ⚠️ Every exit in `recordAndShareClip` was a bare `return` or a swallowed `catch`, and
// `saveClip` wrote its status to `$('clipBtn')` — the in-match bar's button, which was
// DELETED when Save clip moved to the result screen. So on a browser with no recorder the
// button played the goal back, saved nothing, and said nothing: indistinguishable from a
// dead button, which is how it was reported.
{
  const q = await b.newPage({ viewport:{ width:1280, height:800 } });
  const qerr = [];
  q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);
  const o = await q.evaluate(async () => {
    const M = window.__magnet, o = {};
    // There is no #clipBtn any more — that is the whole reason the status went nowhere.
    o.noStaleButton = !document.getElementById('clipBtn');
    // With nothing to record with, it must return a REASON rather than nothing.
    const realMR = window.MediaRecorder;
    delete window.MediaRecorder;
    const btn = document.createElement('button'); btn.textContent = 'Save clip';
    const reason = await M.recordAndShareClip(btn);
    o.reportsNoSupport = typeof reason === 'string' && reason.length > 0;
    o.reasonText = reason;
    o.pointsSomewhere = /save replay/i.test(reason || '');
    window.MediaRecorder = realMR;
    // ...and with no goal at all, saveClip must tell the button it was handed.
    M.sel.mode='1v1'; M.sel.lobby='off'; M.startMatch();
    const before = btn.textContent;
    await M.saveClip(btn);
    o.wroteToTheButtonPassedIn = btn.textContent !== before;
    o.buttonText = btn.textContent;
    // The result screen's own button hands itself in, or none of the above reaches a player.
    o.resultPassesItself = /saveClip\s*\(\s*sh\s*\)/.test(M.renderAwards.toString());
    // mp4 is asked for FIRST, so any browser that can encode one gets one.
    // ⚠️ Was a check on `repMime`'s SOURCE TEXT — that the literal 'video/mp4' appeared
    // before 'webm' in it. That asserts nothing about behaviour, breaks on any refactor,
    // and had become wrong as a claim: a BARE `video/mp4` is now deliberately last,
    // because Chrome answers it with VP9 inside an MP4 container. What is preferred is a
    // REAL mp4, named by its H.264 codec.
    const ix = m => M.REPCODECS.indexOf(m);
    o.prefersMp4 = ix('video/mp4;codecs=avc1.4d002a') === 0 &&
                   ix('video/mp4;codecs=avc1.4d002a') < ix('video/webm;codecs=vp9');
    // A clip is named per-goal, not one fixed name that overwrites itself.
    o.namesAreUnique = M.repClipName('mp4') !== 'magnetball-goal.mp4' &&
                       /magnetball-clip-.*\.mp4$/.test(M.repClipName('mp4'));
    return o;
  });
  ok('the stale #clipBtn really is gone', o.noStaleButton,
     'if it still existed the old lookup would work and this would all pass for the wrong reason');
  ok('no recorder produces a REASON, not silence', o.reportsNoSupport,
     `returned ${JSON.stringify(o.reasonText)} — a bare return here is a button that does nothing and says nothing`);
  ok('...and points at what does work', o.pointsSomewhere,
     `${JSON.stringify(o.reasonText)} — Save replay is on the same screen and always works`);
  ok('saveClip reports to the button it is HANDED', o.wroteToTheButtonPassedIn,
     `button still reads ${JSON.stringify(o.buttonText)} — it used to look up an element that no longer exists, so every message went to null`);
  ok('...and the result screen hands its own in', o.resultPassesItself,
     'otherwise saveClip falls back to the missing #clipBtn and the player sees nothing');
  ok('a REAL mp4 is preferred over webm', o.prefersMp4,
     'a bare video/mp4 is not an mp4 preference — Chrome answers it with VP9 in an MP4 container');
  ok('clips are named per goal', o.namesAreUnique,
     'one fixed filename means each clip overwrites the last in the downloads folder');
  if (qerr.length) fails.push('save-clip page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}

// ============================================================================
//  A REPLAY YOU CHOSE TO WATCH IS NOT AN INTERRUPTION
// ============================================================================
// Two things follow from that and both were wrong. It HELD nothing at the end — reaching
// the last frame closed it and dropped you back on the menu, taking away watching it again,
// scrubbing back, or slowing it down, all of which the transport already offers. And it drew
// "REPLAY" across the middle of the pitch, which exists to explain the goal replay cutting
// in by itself; on one you opened deliberately it is a word sitting on top of the thing you
// came to look at.
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  const qerr = [];
  q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);

  // Build a short replay and stash it, without holding a live promise across the boundary.
  await q.evaluate(async () => {
    const M = window.__magnet;
    M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.autoReplay=false; M.sel.autoRec='off';
    M.setMatchSeed(3); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<400;i++) M.step(w);
    w.ball.x=0; w.ball.y=-w.bounds.halfL+4; w.ball.vy=-14; w.ball.lastKicker=w.players[0];
    for (let i=0;i<200;i++) M.step(w);
    window.__doc = M.repFileBuild();
    M.toMenu();
  });
  await q.waitForTimeout(300);
  await q.evaluate(() => { window.__magnet.watchReplayFromMenu(async () => window.__doc); });
  await q.waitForTimeout(700);

  // ⚠️ Measured as a DIFFERENCE between the same frame drawn both ways, not as an absolute
  // count. The pitch's own markings — the halfway line, the centre circle — are drawn in a
  // colour close to the accent and sit exactly where the caption would, so "few accent
  // pixels in the middle band" is false on a correct build too: it read 103 with the label
  // already gone. Drawing one frame with `controls` on and the same frame with it off
  // isolates the caption and nothing else.
  const mid = await q.evaluate(() => {
    const M = window.__magnet;
    const c = document.getElementById('game');
    const band = () => {
      const d = c.getContext('2d').getImageData(0, Math.round(c.height*0.40), c.width,
                                                Math.round(c.height*0.20)).data;
      let n = 0;
      for (let i=0;i<d.length;i+=4) if (d[i]+d[i+1]+d[i+2] > 150) n++;
      return n;
    };
    // ⚠️ A DARK PALETTE, PINNED. `band()` counts pixels brighter than 150 summed across
    // RGB, which on `grass` — the default now — is satisfied by the turf itself: both
    // readings saturated at exactly 49,341 and the caption's own pixels vanished into
    // them. The guard below caught it, which is what it is for. A suite that samples
    // pixels has to say which palette it is sampling.
    M.applyBundle('neon');
    const f = M.lastReplay.frames[Math.floor(M.lastReplay.frames.length/2)];
    const was = M.replay.controls;
    M.replay.controls = true;  M.drawReplayFrame(f); const chosen = band();
    M.replay.controls = false; M.drawReplayFrame(f); const interrupted = band();
    M.replay.controls = was;
    return { active: M.replay.active, controls: was, chosen, interrupted };
  });

  await q.waitForTimeout(6000);
  const end = await q.evaluate(() => ({
    ended: window.__magnet.replay.ended,
    stillActive: window.__magnet.replay.active,
    transportUp: !document.getElementById('repCtl').classList.contains('hidden'),
    menuCameBack: !document.getElementById('setup').classList.contains('hidden'),
    pauseLabel: document.getElementById('repPause').getAttribute('aria-label'),
  }));
  await q.evaluate(() => window.__magnet.repTogglePause());
  await q.waitForTimeout(400);
  const again = await q.evaluate(() => ({ ended: window.__magnet.replay.ended,
                                          active: window.__magnet.replay.active }));
  await q.evaluate(() => window.__magnet.replayAbort());
  await q.waitForTimeout(200);
  const gone = await q.evaluate(() => ({ active: window.__magnet.replay.active,
                                         barGone: document.getElementById('repCtl').classList.contains('hidden') }));

  ok('the chosen replay actually played', mid.active && mid.controls, JSON.stringify(mid));
  ok('the caption IS drawn when a replay interrupts you', mid.interrupted > mid.chosen + 400,
     'the goal replay drew ' + mid.interrupted + ' lit pixels against ' + mid.chosen + ' for a chosen one — if the caption is off in both, the check below passes for the wrong reason');
  ok('...and NOT over one you chose to watch', mid.chosen < mid.interrupted * 0.75,
     mid.chosen + ' lit pixels against ' + mid.interrupted + ' — the caption explains an interruption, and a replay you opened deliberately is not one');
  ok('it HOLDS at the end', end.ended && end.stillActive && !end.menuCameBack,
     JSON.stringify(end) + ' — reaching the last frame is not a request to leave, and closing itself takes away watching it again or scrubbing back');
  ok('...with the transport still up', end.transportUp, JSON.stringify(end));
  ok('...and the button offering another watch', end.pauseLabel === 'Watch again',
     'button reads ' + JSON.stringify(end.pauseLabel) + ' — there is nothing left to un-pause, so pressing it would look like it did nothing');
  ok('pressing it starts over', again.ended === false && again.active, JSON.stringify(again));
  ok('the bar exit is what leaves', gone.active === false && gone.barGone, JSON.stringify(gone));
  if (qerr.length) fails.push('watch-hold page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}

// ============================================================================
//  AUTO-RECORD, NAMES, AND THE TWO TABS
// ============================================================================
{
  const q = await b.newPage({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true });
  const qerr = [];
  q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await q.goto('file://' + process.cwd() + '/index.html');
  await q.waitForTimeout(700);

  const o = await q.evaluate(async () => {
    const M = window.__magnet, o = {};
    o.defaultsOff = M.defaultSel().autoRec === 'off';
    o.tiles = Object.keys(M.AUTORECOPT).length;
    // ⚠️ `autoRec` used to be a THIRD state, `all`, that also kept the whole match — one
    // dial answering "save goals?" and "keep the match?" at once, which is why its own
    // comment had to explain the second half was gated separately on size. That half is
    // `keepMatches` now, and a stored `all` folds to goals-on plus five kept matches.
    o.foldsAll = (() => { const was = M.sel.autoRec, wasK = M.sel.keepMatches;
      M.sel.autoRec = 'all'; M.sel.keepMatches = null; M.normalizeAutoRec();
      const r = M.sel.autoRec + '/' + M.matchKeepN();
      M.sel.autoRec = was; M.sel.keepMatches = wasK; return r; })();
    // ...and a value no picker offers cannot silently mean "on" through `!== 'off'`.
    o.foldsJunk = (() => { const was = M.sel.autoRec;
      M.sel.autoRec = 'zzz'; M.normalizeAutoRec();
      const r = M.sel.autoRec; M.sel.autoRec = was; return r; })();

    // ---- OFF saves nothing, which is what makes the ON check mean anything ----
    // ⚠️ The match KEEPER has to be off for this too, or the "nothing was saved" reading
    // counts the whole-match replay this build now keeps by default and the check fails
    // for a reason that has nothing to do with auto-record.
    M.sel.keepMatches = '0';
    M.sel.autoRec = 'off'; M.sel.mode='1v1'; M.sel.lobby='off';
    M.sel.autoReplay = false;
    M.setMatchSeed(3); M.startMatch();
    let w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<900;i++) M.step(w);
    await new Promise(r=>setTimeout(r,400));
    o.offSaved = (await M.repLibAll()).length;
    o.offScored = w.score[0] + w.score[1];

    // ---- ON saves every goal, unasked ----
    M.sel.autoRec = 'goals';
    M.setMatchSeed(3); M.startMatch();
    w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<900;i++) M.step(w);
    await new Promise(r=>setTimeout(r,500));
    const rows = await M.repLibAll();
    o.onSaved = rows.length;
    o.onScored = w.score[0] + w.score[1];
    o.allGoals = rows.every(r => r.kind === 'goal');
    o.named = rows.every(r => r.name && /\d+-\d+/.test(r.name));
    o.sampleName = rows[0] && rows[0].name;

    // ---- renaming sticks, and leads the row ----
    const id = rows[0].id;
    await M.repLibRename(id, 'The good one');
    const after = (await M.repLibAll()).find(r => r.id === id);
    o.renamed = after.name === 'The good one';
    o.renameLeadsTheRow = M.repLibLabel(after).title === 'The good one';
    o.nameInFilename = /The-good-one/.test(M.repFilename('classic', 'goal', 'The good one'));
    o.noNameStillFine = /magnetball-goal-replay/.test(M.repFilename('classic', 'goal', ''));

    // ---- the two panes are filled by KIND ----
    M.openLook('replay');
    await M.buildReplayList();
    o.goalsInGoalsPane = document.querySelectorAll('#repList .reprow').length === rows.length;
    o.noMatchesYet = document.querySelectorAll('#repMatchList .reprow').length === 0;

    // ---- the keeper keeps the whole match, with no auto-record involved ----
    // ⚠️ `autoRec` is left where it is and only `keepMatches` moves, which is the whole
    // point of the split: keeping matches is not a stronger setting of "record goals".
    M.sel.keepMatches = '5';
    M.setMatchSeed(4); M.startMatch();
    w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<400;i++) M.step(w);
    M.endMatch(w); M.finishMatch(w);
    await new Promise(r=>setTimeout(r,500));
    o.matchSaved = (await M.repLibAll()).some(r => r.kind === 'match');
    await M.buildReplayList();
    o.matchRowsNow = document.querySelectorAll('#repMatchList .reprow').length;
    o.goalPaneHasNoMatches = [...document.querySelectorAll('#repList .reprow')]
      .every(r => !/^Final/.test(r.querySelector('b').textContent));
    // ⚠️ And the two caps are SEPARATE. A pooled cap let a run of goals evict the matches
    // somebody was keeping — measured here by filling the goal side well past a count of
    // three and requiring every kept match to survive it.
    M.sel.keepMatches = '3';
    M.sel.autoRec = 'goals';
    for (let m = 0; m < 3; m++){
      M.setMatchSeed(30 + m); M.startMatch();
      w = M.world; w.state='play'; w.stateT=2;
      for (let i=0;i<700;i++) M.step(w);
      M.endMatch(w); M.finishMatch(w);
      await new Promise(r=>setTimeout(r,300));
    }
    const lib = await M.repLibAll();
    o.keptMatches = lib.filter(r => r.kind === 'match').length;
    o.keptGoals = lib.filter(r => r.kind !== 'match').length;
    M.sel.autoRec = 'off'; M.sel.keepMatches = '5';
    return o;
  });

  ok('auto-record defaults OFF', o.defaultsOff, 'it writes to storage on every goal, so it has to be asked for');
  ok('...with two states, goals only', o.tiles === 2,
     o.tiles + ' — keeping whole matches is its own setting now, because it is a different question and twenty times the size');
  ok('a stored "all" folds to goals + kept matches', o.foldsAll === 'goals/5',
     o.foldsAll + ' — nobody may lose the behaviour they had when a dial is split in two');
  ok('...and an unknown value falls back to off', o.foldsJunk === 'off',
     o.foldsJunk + ' — autoRecOn() tests `!== "off"`, so an unrecognised value silently means ON');
  ok('OFF really saves nothing', o.offSaved === 0 && o.offScored > 0,
     o.offSaved + ' saved from ' + o.offScored + ' goals — if nothing was scored, the ON check below proves nothing either');
  ok('ON saves every goal unasked', o.onSaved > 0 && o.onSaved === o.onScored,
     o.onSaved + ' saved from ' + o.onScored + ' goals');
  ok('...all of them goals', o.allGoals);
  ok('...each with a findable name', o.named, 'e.g. ' + JSON.stringify(o.sampleName));
  ok('renaming sticks', o.renamed);
  ok('...and leads the row', o.renameLeadsTheRow,
     'the point of naming one is to find it, so the name has to be the title rather than a suffix');
  ok('...and reaches the filename', o.nameInFilename && o.noNameStillFine,
     'a downloads folder is exactly where you go looking for a replay you named');
  ok('goals fill the Goals pane', o.goalsInGoalsPane && o.noMatchesYet,
     JSON.stringify({ goals:o.goalsInGoalsPane, matches:o.noMatchesYet }));
  ok('the keeper keeps the whole match', o.matchSaved && o.matchRowsNow > 0,
     'the goals alone are a highlight reel; the match is what somebody asks to see afterwards');
  ok('...in the Matches pane, not the Goals one', o.goalPaneHasNoMatches,
     'forty rows of both interleaved is the thing the tabs exist to stop');
  ok('the two caps are separate', o.keptMatches === 3 && o.keptGoals > 3,
     JSON.stringify({ matches:o.keptMatches, goals:o.keptGoals }) +
     ' — matches held at their own count of 3 while goals ran well past it; one pooled cap let a busy session of goals delete the matches somebody was keeping');
  if (qerr.length) fails.push('auto-record page errors: ' + qerr.slice(0,3).join(' | '));
  await q.close();
}


// ============================================================
//  THE VIDEO EXPORT — the codec, the bitrate, and the whole match
// ============================================================
// ⚠️ **A BARE `video/mp4` IS A TRAP, measured not guessed.** Ask Chrome for one and it
// answers `video/mp4;codecs=vp9` — an MP4 CONTAINER WITH VP9 INSIDE. That is legal and
// almost nothing plays it: QuickTime, iOS Photos and most editors refuse it outright, and
// the game handed it over named `.mp4` because the container said mp4. That was the whole
// of "the export doesn\'t produce good quality video".
// ⚠️ The bitrate matters and the ASK IS A CEILING: on a deliberately busy picture, asking
// 8Mbps produced 1.8 and asking 40 produced 3.2, because the encoder spends it only where
// the picture changes. So asking high is close to free, which is why it asks high.
// ⚠️ Its own page: the suite's first one is closed a long way above this.
const vpage = await page();
const vid = await vpage.evaluate(async () => {
  const M = window.__magnet, o = {};
  o.mime = M.repMime();
  o.notBareMp4 = o.mime !== 'video/mp4' || !MediaRecorder.isTypeSupported('video/webm;codecs=vp9');
  o.mimeIsClean = !M.repBadMux(o.mime);
  // The trap itself, both ways round.
  o.spotsTheTrap = M.repBadMux('video/mp4;codecs=vp9') && M.repBadMux('video/mp4;codecs=vp8');
  o.allowsRealMp4 = !M.repBadMux('video/mp4;codecs=avc1.4d002a') && !M.repBadMux('video/webm;codecs=vp9');
  // ⚠️ H.264 comes BEFORE VP9 in the list, and the bare type is LAST — the order is the
  // fix, so it is the thing pinned. VP8 is below VP9 because it measured at a sixth of
  // VP9\'s bitrate for the same request.
  const ix = m => M.REPCODECS.indexOf(m);
  o.orderIsRight = ix('video/mp4;codecs=avc1.4d002a') === 0 &&
                   ix('video/webm;codecs=vp9') < ix('video/webm;codecs=vp8') &&
                   ix('video/mp4') === M.REPCODECS.length - 2;
  // ⚠️ And what came BACK is checked, because asking is not getting.
  const rec = M.repMakeRecorder(document.getElementById('game').captureStream(60));
  o.builtMime = rec ? rec.mimeType : '';
  o.builtIsClean = !!rec && !M.repBadMux(rec.mimeType);
  // ⚠️ The extension follows the CODEC, not just the container.
  o.extMp4 = M.repClipExt('video/mp4;codecs=avc1.4d002a');
  o.extTrap = M.repClipExt('video/mp4;codecs=vp9');
  o.extWebm = M.repClipExt('video/webm;codecs=vp9');
  o.namesByCodec = o.extMp4 === 'mp4' && o.extTrap === 'webm' && o.extWebm === 'webm';
  const cv = document.getElementById('game');
  o.bps = M.repBitrate();
  o.bitrateIsReal = o.bps >= 12e6 && o.bps >= cv.width * cv.height * 60 * 0.3;
  // A goal clip and a match clip are named apart, or a downloads folder is a pile.
  o.goalName = M.repClipName('mp4');
  o.matchName = M.repClipName('mp4', 'match');
  o.namedApart = o.goalName !== o.matchName && /match/.test(o.matchName);
  return o;
});

ok('the export never asks for a bare video/mp4', vid.notBareMp4 && vid.mimeIsClean,
   `repMime() = ${vid.mime} — a bare ask gets VP9 inside an MP4 container, which QuickTime, iOS and most editors refuse`);
ok('...and it knows that combination when it sees it', vid.spotsTheTrap && vid.allowsRealMp4);
ok('...H.264 first, VP9 before VP8, the bare type last', vid.orderIsRight,
   JSON.stringify(vid.mime) + ' — VP8 measured at a sixth of VP9 bitrate for the same request');
ok('the recorder that actually gets built is checked too', vid.builtIsClean,
   `built ${vid.builtMime} — asking is not getting`);
ok('the file is named for its CODEC, not just its container', vid.namesByCodec,
   `${vid.extMp4} / ${vid.extTrap} / ${vid.extWebm}`);
ok('a real bitrate is asked for', vid.bitrateIsReal,
   `${(vid.bps/1e6).toFixed(1)}Mbps — left to itself MediaRecorder picks ~2.5, and flat colour with hard edges is the worst case for that`);
ok('a match video is named apart from a goal clip', vid.namedApart,
   `${vid.goalName} vs ${vid.matchName}`);

// ============================================================
//  A REPLAY IS DRAWN BETWEEN ITS FRAMES
// ============================================================
// ⚠️ A match replay is sampled at 30Hz by design and HALVES itself past `REPMATCH.max`, so
// a long one is held at 15 — and stepping a recording frame by frame at a rate you can
// afford to store is what makes a replay read as a stutter. Same argument the drill ghosts
// are built on, same fix. Slow motion gets it too: even a 60Hz goal recording repeats
// frames when it is played at 0.55x.
// ⚠️ Measured as the number of DISTINCT drawn positions over a real playback, not by
// reading `repTween` back — the pure function is checked below as well, but on its own it
// proves only that a helper exists and says nothing about whether playback calls it.
const tween = await vpage.evaluate(async () => {
  const M = window.__magnet, o = {};
  // Exact arithmetic first: a helper that is wrong makes everything below meaningless.
  const a = { bx:0, by:0, p:[{x:0,y:0,k:false}] }, b = { bx:100, by:40, p:[{x:20,y:8,k:true}] };
  const mid = M.repTween(a, b, 0.5);
  o.mathOK = mid.bx === 50 && mid.by === 20 && mid.p[0].x === 10;
  o.zeroIsTheFrame = M.repTween(a, b, 0) === a;      // no allocation, and no drift at k=0
  o.noNextIsTheFrame = M.repTween(a, null, 0.7) === a;
  // ⚠️ A kick is an EVENT, not a quantity — taken from whichever frame is nearer.
  o.kickIsNotBlended = M.repTween(a, b, 0.2).p[0].k === false && M.repTween(a, b, 0.8).p[0].k === true;

  // Now the real thing: a 4Hz recording, played at 1x, sampled as fast as the browser will
  // draw. Stepping gives one position per recorded frame; drawing between them gives many.
  M.sel.mode = '1v1'; M.sel.lobby = 'off'; M.setMatchSeed(3); M.startMatch();
  const w = M.world; w.state = 'play'; w.stateT = 2;
  // ⚠️ NOT on y = 0. That is the halfway LINE, which is white and spans the whole pitch, so
  // "the brightest pixel in the row" is the line wherever the ball happens to be — the first
  // run of this reported 2 positions for that reason and not because nothing moved. The
  // bodies are parked off the row too, for the same reason.
  const BY = 140;
  const frames = [];
  for (let i = 0; i < 5; i++)
    frames.push({ bx: -180 + i*90, by: BY, p: w.players.map(() => ({ x:0, y:-320, k:false })) });
  const cv = document.getElementById('game'), cx = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth;
  const seen = new Set();
  const sample = () => {
    // Where is the ball? The brightest pixel in its row — it is white on a green pitch.
    const y = Math.round(M.wy(BY) * dpr);
    const d = cx.getImageData(0, y, cv.width, 1).data;
    let best = -1, bestV = 0;
    for (let x = 0; x < cv.width; x++){
      const v = d[x*4] + d[x*4+1] + d[x*4+2];
      if (v > bestV){ bestV = v; best = x; }
    }
    if (best >= 0) seen.add(best);
  };
  M.lastReplay = { players: w.players.length, frames, goalAt: -1, goals: null, fps: 4 };
  const play = M.playReplay(1);
  const t0 = performance.now();
  await new Promise(done => {
    const spin = () => { sample();
      if (performance.now() - t0 > 900) { done(); return; }
      requestAnimationFrame(spin); };
    requestAnimationFrame(spin);
  });
  M.replayAbort();
  await play;
  o.distinct = seen.size;
  o.recorded = frames.length;
  o.positions = Array.from(seen).sort((x, y2) => x - y2);
  // ⚠️ Comfortably more than one position per recorded frame. A stepping build can only
  // ever produce as many distinct positions as it has frames.
  o.drawsBetween = o.distinct > o.recorded * 2;
  return o;
});

ok('a tween is exact arithmetic', tween.mathOK && tween.zeroIsTheFrame && tween.noNextIsTheFrame);
ok('...and a kick is an event, not a quantity', tween.kickIsNotBlended,
   'blending a boolean would flicker the wind-up ring through a whole tween');
// ============================================================
//  THE WHOLE MATCH, AS A VIDEO
// ============================================================
// ⚠️ Asked for alongside the quality fix. It goes through the SAME recorder as a goal clip
// — same codec list, same bitrate — and differs only in what is played while it runs, which
// is why `recordAndShareClip` takes the playback as an argument rather than hard-coding
// `playReplay`. A second copy of the recorder wiring is a second place for the codec trap
// to come back.
// ⚠️ Driven end to end on a deliberately SHORT match: the export plays the match back in
// full to film it, so a real one would take as long as the match did.
const mv = await vpage.evaluate(async () => {
  const M = window.__magnet, o = {};
  const blobs = []; const realURL = URL.createObjectURL;
  URL.createObjectURL = (b2) => { blobs.push(b2); return realURL.call(URL, b2); };
  const realClick = HTMLAnchorElement.prototype.click; let named = null;
  HTMLAnchorElement.prototype.click = function(){ if (this.download) named = this.download; };
  try {
    M.sel.mode='1v1'; M.sel.lobby='off'; M.sel.autoReplay=false; M.setMatchSeed(9); M.startMatch();
    const w = M.world; w.state='play'; w.stateT=2;
    for (let i=0;i<240;i++) M.step(w);
    M.endMatch(w); M.finishMatch(w);
    o.reason = await M.saveMatchClip(null);
    o.blobs = blobs.length;
    o.bytes = blobs.length ? blobs[0].size : 0;
    o.type = blobs.length ? blobs[0].type : '';
    o.name = named;
    // ⚠️ And the live world came BACK. `playReplayFile` swaps `world` for one rebuilt from
    // the document; a throw mid-recording that skipped the restore would strand the game
    // holding a replay's world, which is the bug `replayAbort` exists for one layer down.
    o.worldRestored = !!(M.world && M.world.players && M.world.players.length);
  } finally {
    HTMLAnchorElement.prototype.click = realClick; URL.createObjectURL = realURL;
  }
  o.made = o.reason === '' && o.blobs === 1 && o.bytes > 20000;
  o.namedMatch = /magnetball-match-/.test(o.name || '') && !M.repBadMux(o.type);
  return o;
});

ok('the whole match exports as a video', mv.made,
   `${JSON.stringify(mv.reason)}, ${Math.round(mv.bytes/1024)}KB of ${mv.type}`);
ok('...named apart from a goal clip, and not a container lying about its codec', mv.namedMatch, mv.name);
ok('...and the live match is put back afterwards', mv.worldRestored,
   'playReplayFile swaps the world for one rebuilt from the document');

ok('a replay is DRAWN BETWEEN its frames', tween.drawsBetween,
   `${tween.distinct} distinct ball positions from a ${tween.recorded}-frame recording — a stepping build cannot exceed its own frame count, and a match replay is sampled at 30Hz and halves past the cap`);
await vpage.close();

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL replayfile\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS replayfile');
