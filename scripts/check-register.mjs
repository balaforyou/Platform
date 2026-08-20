/**
 * check-register — structural integrity check for docs/findings_register.md.
 *
 * READ-ONLY BY CONSTRUCTION. This script imports `readFileSync` and nothing that writes.
 * That is deliberate and load-bearing: the incident this script exists to prevent involved a
 * script that printed a check-style report while quietly mutating the register, so anything
 * named `check`/`verify` in this project reads and never writes.
 *
 * Run:  pnpm register:check
 *       node scripts/check-register.mjs [--register <path>] [--quiet]
 *
 * Exit codes mirror `generate-flow-diagram.mjs --verify-register` so this can gate a commit
 * the same way: 0 clean, 1 violations found, 2 the file could not be read or parsed.
 *
 * WHAT IT CHECKS, and why each rule earned its place — none of these are hypothetical:
 *
 *  1. Row shape per section. Open rows carry 6 unescaped pipes, Resolved 7. A code span
 *     containing `||` silently splits a row into extra cells; F-038 rendered malformed from
 *     4 Aug 2026 for exactly this reason. Pipes preceded by a backslash are escaped and do
 *     not count — counting raw pipes instead produced four false alarms in one session.
 *  2. No duplicate IDs. The register's own process note records F-018/F-019 being reused
 *     twice, which silently lost the more significant findings under those numbers.
 *  3. Retired IDs stay retired. F-021 and F-089 are retired permanently by that same note;
 *     reissuing either would recreate the collision it documents.
 *  4. No dated note stranded in a column that resolution discards. Open rows have an
 *     Impact/Action column; Resolved rows do not — the Resolution column is written fresh
 *     (30 of 30 historical conversions). A dated correction or evidence note left in
 *     Impact/Action is therefore deleted the moment the finding is resolved. This happened
 *     to F-156's correction note. Such notes belong in Description, which survives. Both note
 *     forms the register uses are recognised — bracketed and bold-keyword — see DATED_NOTE.
 *  5. Every Resolved row carries a resolution date, so "when was this fixed" is answerable.
 *
 * NOTE ON DUPLICATION: the row/section parsing below overlaps `readRegister` in
 * generate-flow-diagram.mjs. That script runs its CLI at module scope, so importing it to
 * share the parser would execute it and write the .drawio as a side effect. Extracting a
 * shared scripts/lib/register.mjs is the cleaner answer and is deliberately deferred — see
 * the note in CLAUDE.md.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { argv, exit } from 'node:process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = argv.indexOf(n); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };

/** Pipes that actually split a markdown cell: a `\|` is escaped and renders as a literal. */
const CELL_PIPE = /(?<!\\)\|/g;
const ROW = /^\|\s*\*{0,2}(F-\d{3})\*{0,2}\s*\|/;

/** Retired permanently by the register's process note of 15 Aug 2026. Must never be reissued. */
const RETIRED_IDS = ['F-021', 'F-089'];

/** Cells that split a well-formed row, by section. Leading/trailing empties included. */
const SHAPE = {
  Open: { pipes: 6, columns: ['ID', 'Found', 'Context', 'Description', 'Impact/Action'] },
  Resolved: { pipes: 7, columns: ['ID', 'Found', 'Resolved', 'Context', 'Description', 'Resolution'] },
};

/**
 * A dated note marker, in either form the register actually uses:
 *   A. bracketed        — "[20 Aug 2026 — correction]"          (F-156, F-044)
 *   B. bold keyword     — "**Update 4 Aug 2026**"                (F-033, F-093, F-077)
 *
 * Form B is anchored on an update keyword *opening* the bold span, deliberately. Scanning the
 * whole register found 13 bold spans containing a date; four of them sit in Impact/Action but
 * open with ordinary prose ("**Now confirmed on the deployed site (19 Aug 2026)…**",
 * "**Resources half CLOSED by SCREEN-002 (15 Aug 2026)…**"). Those are the Impact/Action's own
 * analysis — content the Resolution is *supposed* to supersede — not a note appended about the
 * finding. Matching any bold-plus-date would flag all four and turn a real signal into noise.
 */
const DATE = String.raw`\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}`;
const NOTE_KEYWORD = 'update|correction|corrected|revised|re-?verified|addendum|amended|superseded';
const DATED_NOTE = new RegExp(
  String.raw`\[\s*${DATE}\s*(?:[—-][^\]]{0,60})?\]` +          // form A
  `|` +
  String.raw`\*\*\s*(?:${NOTE_KEYWORD})\b[^*]{0,24}?${DATE}`,  // form B
  'i',
);

function parse(path) {
  const text = readFileSync(path, 'utf8');
  const rows = [];
  let section = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const h = /^##\s+(\S+)/.exec(line);
    if (h) section = h[1];
    const m = ROW.exec(line);
    if (m) rows.push({ id: m[1], section, line, lineNo: i + 1 });
  });
  if (rows.length === 0) throw new Error(`no finding rows parsed from ${path} — wrong file?`);
  return rows;
}

function check(path) {
  const rows = parse(path);
  const violations = [];
  const v = (rule, id, lineNo, detail) => violations.push({ rule, id, lineNo, detail });

  // 1. Row shape per section.
  for (const r of rows) {
    const shape = SHAPE[r.section];
    if (!shape) {
      v('shape', r.id, r.lineNo, `row sits under "## ${r.section}", which has no defined table shape`);
      continue;
    }
    const n = (r.line.match(CELL_PIPE) ?? []).length;
    if (n !== shape.pipes) {
      v('shape', r.id, r.lineNo,
        `${n} unescaped pipes, expected ${shape.pipes} for ${r.section} ` +
        `(${shape.columns.join(' | ')}) — an unescaped || inside a code span is the usual cause`);
    }
  }

  // 2. No duplicate IDs.
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.id)) {
      v('duplicate', r.id, r.lineNo, `already defined at line ${seen.get(r.id)}`);
    } else {
      seen.set(r.id, r.lineNo);
    }
  }

  // 3. Retired IDs stay retired.
  for (const id of RETIRED_IDS) {
    const hit = rows.find((r) => r.id === id);
    if (hit) v('retired', id, hit.lineNo, 'retired permanently by the register process note — must not be reissued');
  }

  // 4. Dated notes must not sit in a column that resolution discards.
  for (const r of rows) {
    if (r.section !== 'Open') continue;
    const cells = r.line.split(CELL_PIPE);
    const impact = cells[5]; // '' | ID | Found | Context | Description | Impact/Action | ''
    if (impact && DATED_NOTE.test(impact)) {
      v('stranded-note', r.id, r.lineNo,
        `a dated note sits in Impact/Action, which is replaced by Resolution when this finding ` +
        `is resolved — move it to Description, which survives the conversion`);
    }
  }

  // 5. Resolved rows carry a resolution date.
  for (const r of rows) {
    if (r.section !== 'Resolved') continue;
    const cells = r.line.split(CELL_PIPE);
    if (!(cells[3] ?? '').trim()) v('missing-date', r.id, r.lineNo, 'Resolved row has an empty Resolved date');
  }

  return { rows, violations };
}

// --- CLI ------------------------------------------------------------------
const registerPath = arg('--register', resolve(REPO_ROOT, 'docs/findings_register.md'));
const quiet = argv.includes('--quiet');

try {
  const { rows, violations } = check(registerPath);
  const open = rows.filter((r) => r.section === 'Open').length;
  const resolved = rows.filter((r) => r.section === 'Resolved').length;

  if (!quiet) {
    console.log(`\nRegister structure check`);
    console.log(`Register: ${registerPath}   rows: ${rows.length}  (Open ${open}, Resolved ${resolved})\n`);
  }

  if (violations.length === 0) {
    console.log(`  PASS  all ${rows.length} rows well-formed: shapes, unique IDs, retired IDs absent, no stranded notes, resolution dates present\n`);
    exit(0);
  }

  // Naming the row and the rule is the point — "the register is malformed" would not tell
  // you whether a pipe needs escaping or a note needs moving.
  for (const x of violations) {
    console.log(`  FAIL  ${x.rule.padEnd(14)} ${x.id}  line ${x.lineNo}  ${x.detail}`);
  }
  console.log(`\n  ${violations.length} violation(s) across ${new Set(violations.map((x) => x.id)).size} row(s).\n`);
  exit(1);
} catch (e) {
  console.error(`check-register: ${e.message}`);
  exit(2);
}
