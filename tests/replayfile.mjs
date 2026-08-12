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

await b.close();
if (errors.length) fails.push('console/page errors: ' + errors.slice(0, 4).join(' | '));
if (fails.length){ console.log('FAIL replayfile\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('PASS replayfile');
