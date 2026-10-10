// Sabotage runner — CLAUDE.md rule 2, as a tool rather than a script rewritten every session.
// The underscore keeps tests/run.mjs away from it.
//
//   node tests/_sabotage.mjs <suite> <sabotages.json>
//
// <suite> is a name ("footballers3d") or a path. <sabotages.json> is an array of
//   [name, exactTextInIndexHtml, replacement]
// Each sabotage is applied to index.html ON ITS OWN, the suite is run, and the line printed
// says which checks went red. A sabotage nothing catches prints "(nothing red)" — that is a
// finding about the CHECK, unless the TARGET COUNT line says the edit never applied.
//
// ⚠️ THE TARGET MUST OCCUR EXACTLY ONCE. A search-and-replace whose target has drifted
// silently no-ops and looks exactly like a check too weak to see the defect; this refuses
// it outright and moves on. Watch for "TARGET COUNT 0" and "TARGET COUNT 2+".
// ⚠️ index.html is backed up to index.html.sabbak and restored in a finally. NEVER commit
// while that backup exists — it means a run died mid-sabotage and index.html may be broken.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const F = join(ROOT, 'index.html'), BAK = F + '.sabbak';
const [suiteArg, sabsArg] = process.argv.slice(2);
if (!suiteArg || !sabsArg){ console.log('usage: node tests/_sabotage.mjs <suite> <sabotages.json>'); process.exit(2); }
if (existsSync(BAK)){ console.log(`${BAK} exists — a previous run died mid-sabotage. Restore it by hand first.`); process.exit(2); }
const suite = suiteArg.endsWith('.mjs') ? resolve(suiteArg) : join(ROOT, 'tests', suiteArg + '.mjs');
const SABS = JSON.parse(readFileSync(resolve(sabsArg), 'utf8'));

copyFileSync(F, BAK); const src = readFileSync(F, 'utf8');
try {
  for (const [name, from, to] of SABS){
    const n = src.split(from).length - 1;
    if (n !== 1){ console.log(`${name}: TARGET COUNT ${n} — not applied`); continue; }
    writeFileSync(F, src.replace(from, to));
    let out = '';
    try { out = execFileSync(process.execPath, [suite], { cwd: ROOT, encoding: 'utf8', timeout: 900000, env: process.env }); }
    catch (e){ out = (e.stdout || '') + (e.stderr || ''); }
    const failed = (out.match(/FAILED: \[([\s\S]*?)\]/) || [])[1];
    const res = (out.match(/RESULT: (\w+( \w+)?)/) || [])[1] || (/\bOK\b|\bPASS\b/.test(out) ? 'OK?' : 'no RESULT line');
    const thrown = !failed && /Error|at .*\.mjs/.test(out) ? ' (THREW — a stack trace is not a named finding)' : '';
    console.log(`${name}: ${res} ${failed ? failed.replace(/\s+/g, ' ').trim() : '(nothing red)'}${thrown}`);
    writeFileSync(F, src);
  }
} finally { writeFileSync(F, src); unlinkSync(BAK); }
console.log('SABOTAGE RUN DONE');
