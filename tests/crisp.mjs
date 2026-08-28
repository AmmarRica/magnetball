// EVERY RASTER IS AUTHORED AT THE PIXELS IT WILL OCCUPY.
//
// Reported as the font looking blurry — "a bit of blur to it that is common with AI
// generated content", which is a good description of what a non-integer rescale of text
// looks like. It was three separate instances of one mistake, and the DOM text sitting
// beside all three was always perfectly crisp, which is what made it read as the *font*
// being soft rather than the page:
//
//   1. THE GAME CANVAS. `resize()` clamped the backing store at 2.5× and floored the
//      product, so on a 3× phone a 390px-wide canvas was rasterised 975 device pixels
//      across and stretched over 1170 — and with `image-rendering: pixelated` on the
//      element that was NEAREST-NEIGHBOUR, so glyph stems came out at uneven widths.
//   2. THE WARM-UP BOARD. `lobbyBoard` bakes the keyboard, shirts and flags into an
//      offscreen canvas sized from `screenPt` coordinates — which are CSS pixels, because
//      the context they were measured in already carries the DPR transform. So the board
//      was baked at 1× and stretched by DPR on the way back in.
//   3. THE MENU CANVASES. Minted at a fixed backing size and displayed at whatever the
//      stylesheet said, with no reference to `devicePixelRatio` at all.
//
// ⚠️ **THE MEASUREMENT HAS TO BE A SCREENSHOT, NOT `getImageData`.** The backing store is
// always crisp — the blur happens in the COMPOSITOR, on the way from the backing store to
// the CSS box. A probe that reads the canvas back sees a perfect image on the broken build
// and reports no problem at all.
//
// ⚠️ **AND THE MENU MUST BE HIDDEN FIRST.** On a phone-shaped viewport `#setup` is a
// full-bleed fixed screen OVER the canvas, so a screenshot without hiding it measures the
// MENU — which is how the first run of this probe reported every single pixel as a soft
// edge.
import { chromium, LAUNCH } from './_browser.mjs';
const b = await chromium.launch(LAUNCH);
const errors = [];
let bad = 0;
const ok = (name, cond, note = '') => {
  if (!cond){ bad++; console.log('  FAIL ' + name + (note ? ' — ' + note : '')); }
};

async function page(dsf, w = 390, h = 844){
  const c = await b.newContext({ viewport:{width:w, height:h}, deviceScaleFactor: dsf });
  const p = await c.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { window.__MAGNETDEBUG = true; });
  await p.goto('file://' + process.cwd() + '/index.html');
  await p.waitForTimeout(900);
  return { c, p };
}

// Soft-edge fraction of a black-and-white image: pixels that are neither ink nor ground,
// over (soft + ink). A crisp glyph has a thin antialiased rim; a rescaled one has a fat
// one. Decoded by a browser so the suite stays dependency-free.
// ⚠️ **A NEAREST-NEIGHBOUR UPSCALE IS BLOCKY, NOT SOFT, SO THE SOFTNESS METRIC CANNOT SEE
// IT — and the first version of the warm-up check was vacuous for exactly that reason.**
// The board is blitted through the main context, which runs with
// `imageSmoothingEnabled = false`, so a board baked at CSS pixels is not blurred on the way
// in: every feature is simply quantised to a multiple of `DPR` device pixels, which is what
// makes letter stems come out at uneven widths. Measured on the sabotage, the CSS-pixel
// bake scored **0.9301** against the fixed build's 0.9578 — *better*, because coarser
// features leave more pixels in the flat bands. It passed the check it existed to fail.
//
// What a 3× nearest upscale cannot fake is a run of one or two pixels: every run of
// identical pixels in it is a multiple of 3. A natively rasterised board has fine detail
// and antialiasing steps at every length. So the discriminator is the fraction of runs
// whose length is NOT divisible by the ratio.
async function runLengths(buf, ratio){
  const c = await b.newContext();
  const pg = await c.newPage();
  const out = await pg.evaluate(async ({b64, ratio}) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    let runs = 0, offGrid = 0;
    for (let y = 0; y < cv.height; y++){
      let len = 1;
      for (let px = 1; px <= cv.width; px++){
        const i = (y*cv.width + px) * 4, j = (y*cv.width + px - 1) * 4;
        const same = px < cv.width && d[i] === d[j] && d[i+1] === d[j+1] && d[i+2] === d[j+2];
        if (same){ len++; continue; }
        runs++; if (len % ratio !== 0) offGrid++;
        len = 1;
      }
    }
    return { runs, offGrid, frac: offGrid / Math.max(1, runs) };
  }, { b64: buf.toString('base64'), ratio });
  await c.close();
  return out;
}

// `adaptive` scores an image whose two tones are whatever the palette painted, by taking
// the ends of its own luminance range rather than assuming black and white.
async function softness(buf, adaptive){
  const c = await b.newContext();
  const pg = await c.newPage();
  const out = await pg.evaluate(async ({b64, adaptive}) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, cv.width, cv.height).data;
    const lum = i => 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
    let lo = 255, hi = 0;
    if (adaptive){
      for (let i = 0; i < d.length; i += 4){ const v = lum(i); if (v < lo) lo = v; if (v > hi) hi = v; }
    } else { lo = 0; hi = 255; }
    const band = (hi - lo) * 0.15;
    let mid = 0, ink = 0;
    for (let i = 0; i < d.length; i += 4){
      const v = lum(i);
      if (v >= hi - band) ink++; else if (v > lo + band) mid++;
    }
    return { mid, ink, frac: mid / Math.max(1, mid + ink) };
  }, { b64: buf.toString('base64'), adaptive: !!adaptive });
  await c.close();
  return out;
}

// ---------------------------------------------------------------------------------
// 1. The game canvas is exactly the device pixels of its CSS box, at every ratio.
// ---------------------------------------------------------------------------------
// ⚠️ 1.5 and 1.75 are ordinary Windows display scalings and are the case a `Math.floor`
// on the backing gets wrong on its own, without any clamp being involved.
for (const dsf of [1, 1.5, 2, 2.5, 3]){
  const { c, p } = await page(dsf);
  const m = await p.evaluate(() => {
    const cv = document.getElementById('game');
    const box = cv.getBoundingClientRect();
    return { backingW: cv.width, backingH: cv.height,
             needW: box.width * window.devicePixelRatio,
             needH: box.height * window.devicePixelRatio,
             dpr: window.devicePixelRatio,
             render: getComputedStyle(cv).imageRendering };
  });
  ok(`the game canvas is 1:1 with the screen at DPR ${dsf}`,
     Math.abs(m.backingW - m.needW) < 1.01 && Math.abs(m.backingH - m.needH) < 1.01,
     `backing ${m.backingW}×${m.backingH} against a box needing ` +
     `${m.needW.toFixed(1)}×${m.needH.toFixed(1)} device px — anything else is a rescale ` +
     'of everything the game draws');
  await c.close();
}

// ---------------------------------------------------------------------------------
// 2. Canvas text really is sharper than it was — measured against a LIVE control.
// ---------------------------------------------------------------------------------
// ⚠️ **THE OLD SIZING IS RE-CREATED IN THE SAME RUN AND MEASURED.** A bare threshold on
// the soft-edge fraction would be a number tuned to this font at this size on this
// rasteriser, and it would go quietly vacuous the first time any of the three changed.
// Putting the clamp back by hand and requiring the shipped sizing to beat it is a claim
// about the CHANGE, and it cannot pass on a build that reverts it.
{
  const { c, p } = await page(3);
  await p.evaluate(() => {
    document.getElementById('setup').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
  });
  const shot = async (clamp) => {
    await p.evaluate((clamp) => {
      const cv = document.getElementById('game');
      const ctx = cv.getContext('2d');
      const d = clamp ? Math.min(window.devicePixelRatio, 2.5) : window.devicePixelRatio;
      cv.width = Math.floor(cv.clientWidth * d); cv.height = Math.floor(cv.clientHeight * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 90);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
      ctx.font = '24px Kenney, system-ui';
      ctx.fillText('HANDGLOVE', 12, 20);
    }, clamp);
    return softness(await p.screenshot({ clip:{x:0, y:0, width:320, height:90} }));
  };
  const clamped = await shot(true);
  const native  = await shot(false);
  console.log(`  DPR 3 text: clamped soft ${clamped.mid}/${clamped.mid+clamped.ink} ` +
              `(${clamped.frac.toFixed(4)})  native soft ${native.mid}/${native.mid+native.ink} ` +
              `(${native.frac.toFixed(4)})`);
  // ⚠️ Paired with "there is real ink", or "the text is sharp" is satisfied by a build
  // that draws nothing at all — which is the shape of vacuous check this repo keeps
  // catching itself writing.
  ok('the text is actually drawn', native.ink > 2000 && clamped.ink > 2000,
     `native ${native.ink} ink pixels, clamped ${clamped.ink} — with no ink the softness ` +
     'comparison below is meaningless');
  ok('native sizing is measurably sharper than the old clamp',
     native.frac < clamped.frac * 0.6,
     `soft-edge fraction ${native.frac.toFixed(4)} against ${clamped.frac.toFixed(4)} — the ` +
     'clamp rasterised 975 device pixels across a 1170-pixel box and let the compositor ' +
     'stretch the difference');
  await c.close();
}

// ---------------------------------------------------------------------------------
// 3. No canvas in the menu is displayed larger than it was drawn.
// ---------------------------------------------------------------------------------
// ⚠️ The count is asserted too. A walk that finds nothing passes "none of them are
// upscaled" perfectly, and every picker is built lazily, so an empty walk is a real
// possibility rather than a hypothetical one.
// ⚠️ **AND THE SUB-PANES HAVE TO BE OPENED, WHICH THE FIRST VERSION DID NOT.** A card
// shows one `.subpane` at a time, so a hidden picker measures ZERO and drops out of the
// walk silently — opening the three cards and looking reached **1 to 2** canvases out of
// several hundred. The count guard above is what caught that; without it this whole block
// would have been green and empty.
for (const dsf of [2, 3]){
  const { c, p } = await page(dsf, 900, 900);
  for (const [sec, groups] of [['player', ['player']], ['match', ['match']],
                               ['options', ['options', 'theme', 'sound', 'feel']]]){
    const m = await p.evaluate(({sec, groups}) => {
      const M = window.__magnet;
      M.openSection(sec);
      const bad = []; let n = 0;
      const walk = () => document.querySelectorAll('#setup canvas').forEach(cv => {
        const r = cv.getBoundingClientRect(); if (!r.width) return;
        n++;
        const need = r.width * window.devicePixelRatio;
        if (cv.width < need - 1)
          bad.push(`${(cv.closest('[id]')||{}).id || '?'} ${cv.width} < ${Math.round(need)}`);
      });
      // ⚠️ A `SUBTABS` entry is a `[key, label]` PAIR, not a bare key. Passing the pair
      // straight to `showSubTab` switches nothing and every walk below sees the same two
      // canvases — which is exactly what the first version did.
      for (const g of groups){
        for (const pane of (M.SUBTABS[g] || [])){
          M.showSubTab(g, Array.isArray(pane) ? pane[0] : pane); walk();
        }
      }
      walk();
      return { n, bad: bad.slice(0, 5), total: bad.length };
    }, {sec, groups});
    ok(`the ${sec} card drew enough canvases to be worth checking at DPR ${dsf}`, m.n >= 20,
       `found ${m.n} — an empty walk passes the upscale check for the wrong reason`);
    ok(`nothing in the ${sec} card is upscaled at DPR ${dsf}`, m.total === 0,
       `${m.total} of ${m.n}: ${m.bad.join(' | ')}`);
  }
  await c.close();
}

// ---------------------------------------------------------------------------------
// 4. The warm-up board is baked at device pixels, not CSS pixels.
// ---------------------------------------------------------------------------------
// ⚠️ Two checks, and they fail on different sabotages: the DIMENSIONS say the bake was
// made at the right size, and the RUN LENGTHS say the pixels on screen really came from
// it. The first alone would be re-deriving the implementation; the second alone would not
// say where the resolution went.
{
  const enterLobby = async (p) => p.evaluate(() => {
    const M = window.__magnet;
    M.sel.lobby = 'on'; M.sel.controllers = 'on'; M.sel.mode = '2v2';
    M.startMatch(); const w = M.world; M.enterWarmup(w);
    for (let i = 0; i < 40; i++) M.step(w);
    M.render();
    document.getElementById('setup').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    const bd = M.lobbyBoardCv;
    return { state: w.state, dpr: M.DPR,
             board: bd ? { w: bd.width, h: bd.height, bw: bd._bw, bh: bd._bh,
                           bx: bd._bx, by: bd._by } : null };
  });

  const readings = {};
  for (const dsf of [1, 3]){
    const { c, p } = await page(dsf, 430, 800);
    const info = await enterLobby(p);
    // ⚠️ **CLIPPED TO THE BOARD'S OWN BOX, AND SCORED ADAPTIVELY.** The first version
    // screenshotted the whole page and ran it through the black-and-white scorer above,
    // which on a green pitch calls **99.6%** of the pixels a soft edge — a reading that is
    // the same on every build and says nothing at all. The board reports the CSS rectangle
    // it occupies, so the crop is exact, and the two tones in it are whatever the palette
    // painted rather than black and white.
    const bd = info.board;
    const clip = bd ? { x: Math.max(0, bd.bx), y: Math.max(0, bd.by),
                        width: Math.min(bd.bw, 430 - Math.max(0, bd.bx)),
                        height: Math.min(bd.bh, 800 - Math.max(0, bd.by)) } : null;
    readings[dsf] = { info, runs: clip ? await runLengths(await p.screenshot({ clip }), 3) : null };
    await c.close();
  }
  const one = readings[1], three = readings[3];
  ok('the warm-up board was actually baked', !!(one.info.board && three.info.board),
     'no bake means the fallback path drew every pad live and this measures nothing');
  if (three.info.board){
    const bd = three.info.board;
    ok('the bake is DPR times its CSS box',
       Math.abs(bd.w - bd.bw * 3) <= 3 && Math.abs(bd.h - bd.bh * 3) <= 3,
       `baked ${bd.w}×${bd.h} for a ${bd.bw}×${bd.bh} CSS box at DPR 3`);
  }
  console.log(`  lobby runs off the 3px grid: DPR 1 ${one.runs.frac.toFixed(3)} ` +
              `(${one.runs.offGrid}/${one.runs.runs})  DPR 3 ${three.runs.frac.toFixed(3)} ` +
              `(${three.runs.offGrid}/${three.runs.runs})`);
  ok('the warm-up board has detail finer than the device ratio',
     three.runs.frac > 0.5,
     `only ${(three.runs.frac*100).toFixed(1)}% of pixel runs are off a 3px grid — a board ` +
     'baked at CSS pixels and blitted with smoothing off quantises every feature to a ' +
     'multiple of DPR, so it cannot produce runs of one or two');
  // ⚠️ The control: a DPR-1 board is 1:1 on every build, so it is what this rasteriser
  // does with this board at its best. Without it a threshold on the line above is a number
  // somebody picked.
  ok('...as much of it as a 1× screen has', three.runs.frac >= one.runs.frac * 0.8,
     `${three.runs.frac.toFixed(3)} against the 1:1 control's ${one.runs.frac.toFixed(3)}`);
  ok('the lobby is in warm-up in both runs',
     one.info.state === 'warmup' && three.info.state === 'warmup',
     `${one.info.state} / ${three.info.state}`);
}

// ---------------------------------------------------------------------------------
// 5. A 1× screen is left exactly as it was.
// ---------------------------------------------------------------------------------
// ⚠️ `uiScale` is clamped at 1 so this can only ever ADD resolution. Most of these
// canvases are authored LARGER than they are shown — a 64px tile in a 40px box — and that
// over-provision is what keeps a desktop sharp. Scaling to the display size
// unconditionally would throw it away, which is making one machine worse to fix another.
{
  const { c, p } = await page(1, 900, 900);
  const m = await p.evaluate(() => {
    const M = window.__magnet;
    M.openSection('player');
    const tile = document.querySelector('#flagPick canvas');
    M.updatePreview(); const a = document.getElementById('pvMini').width;
    M.updatePreview(); const bb = document.getElementById('pvMini').width;
    return { tile: tile && tile.width, scale: M.uiScale(40, 64), once: a, twice: bb };
  });
  ok('a cosmetic tile keeps its authored resolution on a 1× screen', m.tile === 64,
     `backing ${m.tile} — 64 in a 40px box is deliberate over-provision, not waste`);
  ok('uiScale never scales DOWN', m.scale === 1, `uiScale(40, 64) = ${m.scale}`);
  // ⚠️ `uiFit` runs on a REDRAW path, so a version that grew the backing every call would
  // work perfectly in a screenshot and leak until the tab died.
  ok('uiFit is idempotent', m.once === m.twice,
     `pvMini went ${m.once} → ${m.twice} across two redraws`);
  await c.close();
}

ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(bad ? 'FAIL crisp' : 'PASS crisp');
await b.close();
process.exit(bad ? 1 : 0);
