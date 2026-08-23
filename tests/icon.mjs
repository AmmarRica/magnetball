// THE APP ICON — just a court.
//
// `icon.svg` is the favicon, the apple-touch-icon and the manifest icon: the only logo
// image the project has. It used to carry two player discs and a ball as well, which at
// the size an icon is actually seen — 48px in a tab, 64px on a home screen — was three
// coloured dots sitting on the markings rather than three things anybody could make out.
//
// ⚠️ THE MASKABLE SAFE ZONE IS THE CHECK THAT MATTERS, because it was silently broken and
// nothing would ever have said so. The manifest declares this icon `maskable`, which lets
// Android crop it to a CIRCLE of 80% diameter — radius 204.8 of 512 about the centre. The
// old drawing put the court's corners 252 out and the ends of the goals 213, so on a round
// mask the pitch lost its corners and both goals lost their ends. You only see that on a
// launcher that crops, which is not the one a developer is looking at.
//
// ⚠️ Measured in RENDERED PIXELS rather than read out of the markup: a `viewBox`, a
// transform or a stroke width can move ink without moving any number in the file, and what
// gets cropped is ink.
import { chromium, LAUNCH } from './_browser.mjs';
import { readFileSync } from 'node:fs';

const b = await chromium.launch(LAUNCH);
const fails = [], errors = [];
const ok = (n, c, x) => { if (!c) fails.push(n + (x ? ' — ' + x : '')); };

const svg = readFileSync(process.cwd() + '/icon.svg', 'utf8');
const p = await b.newPage({ viewport: { width: 600, height: 600 } });
p.on('pageerror', e => errors.push(e.message));
await p.setContent('<body style="margin:0"><canvas id="c" width="512" height="512"></canvas></body>');
const r = await p.evaluate(async (src) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej;
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(src); });
  const cv = document.getElementById('c'), c = cv.getContext('2d');
  // ⚠️ Drawn over MAGENTA. The icon's own background is opaque, so "outside the safe zone"
  // has to mean "the icon is drawn there at all", not "something non-transparent is there"
  // — and a transparent-background test would pass on an icon that fills the whole square.
  c.fillStyle = '#ff00ff'; c.fillRect(0, 0, 512, 512);
  c.drawImage(img, 0, 0, 512, 512);
  const d = c.getImageData(0, 0, 512, 512).data;
  const at = (x, y) => { const i = (y * 512 + x) * 4; return [d[i], d[i+1], d[i+2]]; };
  const isBg = (q) => q[0] > 200 && q[1] < 80 && q[2] > 200;          // still magenta
  const isInk = (q) => q[0] > 150 && q[1] > 150 && q[2] > 150;        // the white markings
  const team = (q) => (q[2] > 120 && q[2] > q[0] + 40 && q[1] < q[2]) // blue goal
                   || (q[0] > 120 && q[0] > q[2] + 40 && q[1] < q[0]);// red goal
  const o = { drawn: 0, outside: 0, ink: 0, teamPx: 0, worstR: 0 };
  const R = 512 * 0.4;                       // the maskable safe radius
  // ⚠️ The BACKGROUND is meant to fill the whole square — that is what gives a crop
  // something to show — so only the CONTENT is measured against the safe zone. Counting
  // every non-magenta pixel instead reports 122,557 outside on a perfectly good icon,
  // which is what the first run of this check did.
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++){
    const q = at(x, y);
    if (isBg(q)) continue;                   // nothing of the icon here at all
    o.drawn++;
    const mark = isInk(q) || team(q);
    if (isInk(q)) o.ink++;
    if (team(q)) o.teamPx++;
    if (!mark) continue;                     // the green ground, which may fill the square
    const dist = Math.hypot(x - 255.5, y - 255.5);
    if (dist > R) o.outside++;
    if (dist > o.worstR) o.worstR = dist;
  }
  o.worstR = +o.worstR.toFixed(1);
  // ⚠️ A PLAYER IS A FILLED DISC and a goal is a thin stroke, so what tells them apart is
  // the longest unbroken RUN of team colour down a column: a 34-radius disc is 68 deep,
  // the goals are 18 deep plus their stroke. A pixel COUNT cannot separate them — the two
  // goals' strokes come to about the same area as the two discs did.
  let longest = 0;
  for (let x = 0; x < 512; x++){
    let run = 0;
    for (let y = 0; y < 512; y++){
      if (team(at(x, y))) { run++; if (run > longest) longest = run; }
      else run = 0;
    }
  }
  o.longestTeamRun = longest;
  return o;
}, svg);
await p.close();
await b.close();

ok('the icon draws something at all', r.drawn > 512 * 512 * 0.4 && r.ink > 2000,
   JSON.stringify(r) + ' — every check below passes on a blank file');
ok('NOTHING IS DRAWN OUTSIDE THE MASKABLE SAFE ZONE', r.outside === 0,
   r.outside + ' pixels sit beyond radius 204.8 (the furthest marking is at ' + r.worstR + ') — the manifest says `maskable`, so a launcher may crop this to a circle, and the old drawing lost the court corners and both goal ends to it');
ok('...and it is a COURT, not a court with players on it', r.longestTeamRun > 0 && r.longestTeamRun < 40,
   'longest unbroken run of team colour down a column is ' + r.longestTeamRun +
   'px — a goal is a thin stroke about 30 deep, a player disc was 68. Zero would mean the goals had gone too');

if (errors.length) fails.push('page errors: ' + errors.slice(0, 3).join(' | '));
console.log(JSON.stringify(r, null, 1));
if (fails.length){ console.log('FAIL icon'); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log('PASS icon');
