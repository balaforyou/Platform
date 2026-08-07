#!/usr/bin/env node
/**
 * Root regression orchestrator — `pnpm test:regression`.
 *
 * WHY A SCRIPT AND NOT A `&&` CHAIN:
 *  1. Every service binds FIXED ports (slot-engine 3001 … notification 3005),
 *     so the five suites cannot run in parallel — they must be strictly serial.
 *  2. A `&&` chain aborts on the first failure, hiding whether later suites
 *     would have passed. That defeats the whole point of "clear pass/fail per
 *     section". This runs all five regardless, then reports a summary table.
 *
 * PRECONDITION: Postgres must already be up (`pnpm db:up`), matching existing
 * practice for every test script in this repo.
 */
import { spawnSync } from 'child_process';

const SUITES = [
  { name: 'identity-auth', filter: '@badminton/identity-auth' },
  { name: 'tenant-management', filter: '@badminton/tenant-management' },
  { name: 'slot-engine', filter: '@badminton/slot-engine' },
  { name: 'payment', filter: '@badminton/payment' },
  { name: 'notification', filter: '@badminton/notification' },
];

function run(command, args) {
  return spawnSync(command, args, { stdio: 'inherit', shell: true });
}

function header(text) {
  console.log(`\n${'#'.repeat(72)}`);
  console.log(`# ${text}`);
  console.log('#'.repeat(72));
}

header('Building services and packages');
const build = run('pnpm', ['-r', 'run', 'build']);
if (build.status !== 0) {
  console.error('\nBuild failed — cannot run the regression suite. Fix the build first.');
  process.exit(1);
}

const results = [];
for (const suite of SUITES) {
  header(`Regression suite: ${suite.name}`);
  const startedAt = Date.now();
  // Deliberately NOT short-circuiting on failure — see the note at the top.
  const result = run('pnpm', ['--filter', suite.filter, 'run', 'test:regression']);
  results.push({
    name: suite.name,
    passed: result.status === 0,
    durationMs: Date.now() - startedAt,
  });
}

header('REGRESSION SUMMARY');
const pad = Math.max(...results.map((r) => r.name.length));
for (const result of results) {
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`  ${status}  ${result.name.padEnd(pad)}  ${(result.durationMs / 1000).toFixed(1)}s`);
}

const failedCount = results.filter((r) => !r.passed).length;
console.log(`\n  ${results.length - failedCount}/${results.length} suites passed`);
if (failedCount > 0) {
  console.log('  Scroll up for the per-section PASS/FAIL detail of each failing suite.');
}
console.log('');

process.exit(failedCount > 0 ? 1 : 0);
