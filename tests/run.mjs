#!/usr/bin/env node
// Run every suite in this folder and report a summary.
//   node tests/run.mjs               # all suites
//   node tests/run.mjs deck          # only suites whose name contains "deck"
//   MB_JOBS=1 node tests/run.mjs     # force serial (debugging a flake)
//
// Each suite is a standalone script that exits non-zero on failure, so they can also be
// run one at a time when you're iterating on a single area.
//
// ⚠️ SUITES RUN IN PARALLEL, and the wall-clock case is not subtle: each one drives a
// headless browser and then spends most of its life waiting on that browser, so a serial
// run leaves most of the machine idle for ~9 minutes. The pool is sized off the CPU count
// and capped, because every worker is a Chromium.
//
// ⚠️ OUTPUT IS ORDERED, NOT INTERLEAVED. Results arrive in whatever order they finish, so
// a line is printed only once every suite before it has been printed — otherwise the log
// is unreadable and a re-run lists the same suites in a different order, which makes two
// runs impossible to diff.
//
// ⚠️ THE TIMING SUITES ARE RUN LAST, ON THEIR OWN. `ball3d` and `replayfile` assert on how
// long something takes ("a small ball costs less than a big one"), and under a full pool
// they measure CPU contention instead — both went red six-up and green serially, which is
// a runner reporting load as a bug. They are not exempted from the suite, they are just
// not run against six competitors.
// ⚠️ `updatecheck` is here for a related but distinct reason: it does not assert on a
// duration, it WAITS on real infrastructure — it serves the page over HTTP, registers the
// real service worker, edits the file underneath it and reloads. Its internal waits are
// generous but finite, and adding one more suite to the pool was enough to push a loaded
// machine past them (red once, green on a re-run with nothing else changed). A suite that
// goes red because the machine was busy is a runner reporting load as a bug, which is the
// whole point of this list.
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const filter = process.argv[2] || '';

// Suites whose assertions are about DURATION. See the note above.
// ⚠️ `swatchcache` joined this set after flaking in a busy pool: it asserts that a cached
// swatch row rebuilds in single-digit MILLISECONDS, and six browsers sharing the machine
// is exactly the condition that makes a 1.4ms operation measure as 12. It passes alone
// every time — which is the signature of a timing suite, not of a bug.
// ⚠️ `clipshape` joined for the plainest reason of the four: half of it drives the
// REAL-TIME recorder, and `MediaRecorder` is wall-clock bound by construction — it stamps
// frames when they ARRIVE, which is exactly why the offline encoder exists. Three browsers
// sharing the machine make a recording come up short, so it went red in a busy pool and
// passed alone every time.
const TIMING = new Set(['ball3d', 'replayfile', 'updatecheck', 'swatchcache', 'clipshape']);

const all = readdirSync(here)
  .filter(f => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_'))   // _ = shared helper
  .filter(f => f.includes(filter))
  .sort();

if (!all.length){ console.error(`no suites match "${filter}"`); process.exit(1); }

const name = f => f.replace('.mjs', '');
const parallel = all.filter(f => !TIMING.has(name(f)));
const timed    = all.filter(f =>  TIMING.has(name(f)));

// One Chromium per worker, so this is memory as much as CPU. `MB_JOBS` overrides for a
// machine that wants something else — or `MB_JOBS=1` to reproduce a flake serially.
const JOBS = Math.max(1, Math.min(
  +process.env.MB_JOBS || Math.max(2, Math.min(6, (cpus() || []).length - 1)),
  parallel.length || 1));

const run = file => new Promise(resolve => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [join(here, file)], { cwd: root });
  let out = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => out += d);
  child.on('error', e => resolve({ file, code: 1, out: String(e && e.message || e), ms: Date.now() - t0 }));
  child.on('close', code => resolve({ file, code, out, ms: Date.now() - t0 }));
});

const results = new Map();
const width = Math.max(14, ...all.map(f => name(f).length));
function report(r){
  const n = name(r.file);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${n.padEnd(width)} ${(r.ms / 1000).toFixed(1)}s`);
  if (r.code !== 0) console.log(r.out.split('\n').slice(-25).map(l => '      ' + l).join('\n'));
}

// Run `list` with at most `jobs` in flight, printing in list order as soon as each
// prefix is complete. A worker takes the next index off a shared cursor — no chunking,
// so one slow suite cannot leave a whole worker's share queued behind it.
async function sweep(list, jobs){
  let next = 0, printed = 0;
  const flush = () => {
    while (printed < list.length && results.has(list[printed])){
      report(results.get(list[printed])); printed++;
    }
  };
  const worker = async () => {
    for (;;){
      const i = next++;
      if (i >= list.length) return;
      const r = await run(list[i]);
      results.set(list[i], r);
      flush();
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
  flush();
}

const t0 = Date.now();
if (parallel.length) console.log(`running ${all.length} suites, ${JOBS} at a time\n`);
await sweep(parallel, JOBS);
// ...then the duration-sensitive ones, alone, so they measure the thing they name.
if (timed.length){
  if (parallel.length) console.log(`\n— timing-sensitive, run alone —`);
  await sweep(timed, 1);
}

const out = all.map(f => results.get(f)).filter(Boolean);
const failed = out.filter(r => r.code !== 0);
console.log(`\n${out.length - failed.length}/${out.length} suites passed  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
if (failed.length) console.log('failed: ' + failed.map(r => name(r.file)).join(', '));
process.exit(failed.length ? 1 : 0);
