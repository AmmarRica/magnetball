#!/usr/bin/env node
// Run every suite in this folder and report a summary.
//   node tests/run.mjs            # all suites
//   node tests/run.mjs deck       # only suites whose name contains "deck"
// Each suite is a standalone script that exits non-zero on failure, so they can
// also be run one at a time when you're iterating on a single area.
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const suites = readdirSync(here)
  .filter(f => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_'))   // _ = shared helper
  .filter(f => f.includes(filter))
  .sort();

if (!suites.length){ console.error(`no suites match "${filter}"`); process.exit(1); }

const run = file => new Promise(resolve => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [join(here, file)], { cwd: join(here, '..') });
  let out = '';
  child.stdout.on('data', d => out += d);
  child.stderr.on('data', d => out += d);
  child.on('close', code => resolve({ file, code, out, ms: Date.now() - t0 }));
});

const results = [];
for (const f of suites){                       // serial: each suite drives a browser
  const r = await run(f);
  results.push(r);
  const name = f.replace('.mjs', '');
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} ${(r.ms/1000).toFixed(1)}s`);
  if (r.code !== 0) console.log(r.out.split('\n').slice(-25).map(l => '      ' + l).join('\n'));
}

const failed = results.filter(r => r.code !== 0);
console.log(`\n${results.length - failed.length}/${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
