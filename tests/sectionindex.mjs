// The section index at the top of index.html, kept honest.
//
// The file is one IIFE and 14,000-odd lines, so navigating it is the main tax on every
// change. The index is the cheap fix — but a map that has drifted from the territory is
// worse than no map, and nothing else in this repo would ever notice it drifting.
//
// ⚠️ THE WHOLE REASON IT LISTS STRINGS AND NOT LINE NUMBERS: a line number is wrong the
// moment anybody edits above it, and it is wrong SILENTLY. A marker string can be
// checked, which is what this does — every quoted marker in the index must appear
// exactly once in the rest of the file.
//
// No browser: this is a text check, so it runs in milliseconds.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'index.html'), 'utf8');

const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); };

const START = 'SECTION INDEX';
const END = '──────────────────────────────────────────────────────────────────────── */';
const i = src.indexOf(START), j = src.indexOf(END, i);
ok(i > 0 && j > i, 'index.html has no SECTION INDEX block at all');

const r = {};
if (i > 0 && j > i) {
  const block = src.slice(i, j);
  const rest = src.slice(0, i) + src.slice(j);
  const markers = [...block.matchAll(/"([^"]{6,})"/g)].map(m => m[1]);
  r.markers = markers.length;

  const missing = [], dupes = [];
  for (const m of markers) {
    const n = rest.split(m).length - 1;
    if (n === 0) missing.push(m);
    else if (n > 1) dupes.push([m, n]);
  }
  r.missing = missing; r.dupes = dupes;

  ok(markers.length >= 40,
     `only ${markers.length} markers in the index — a map of a 14,000-line file that lists a handful of places is not a map`);
  ok(missing.length === 0,
     `the index points at markers that no longer exist: ${JSON.stringify(missing)} — a stale map is worse than none`);
  ok(dupes.length === 0,
     `these markers appear more than once, so searching one lands you somewhere ambiguous: ${JSON.stringify(dupes)}`);

  // ⚠️ And it must not have quietly grown a line number. That is the failure mode the
  // whole design avoids, and it is the one a reviewer would wave through.
  const nums = [...block.matchAll(/(?:^|\s)(?:line\s*)?(\d{3,5})\s*(?::|$)/gim)].map(m => m[1]);
  r.lineNumbers = nums;
  ok(nums.length === 0,
     `the index has started quoting line numbers (${JSON.stringify(nums)}) — those are wrong the moment anybody edits above them, and wrong silently`);

  // The index also promises where the test documentation lives; hold that too.
  r.pointsAtTests = /tests\/README\.md/.test(block);
  ok(r.pointsAtTests, 'the index no longer points at tests/README.md');
}

r.lines = src.split('\n').length;
console.log(JSON.stringify(r, null, 1));
if (fail.length) { console.error('\nFAIL\n' + fail.join('\n')); process.exit(1); }
console.log('\nsectionindex OK');
