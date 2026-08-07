/**
 * @badminton/test-harness — shared support for the API-level regression suites.
 *
 * WHY THIS EXISTS: before consolidation, `waitForServer`, a hand-rolled `signJwt`,
 * the spawn/health-poll/kill lifecycle, and `cleanDatabase()` were copy-pasted
 * near-verbatim across identity.test.ts, tenant.test.ts, concurrency.test.ts and
 * payment.test.ts. One canonical copy means a fix to the harness is a fix everywhere.
 *
 * DELIBERATELY NOT A TEST FRAMEWORK. Every suite spawns real Fastify servers on
 * fixed ports (3001-3005) and shares mutable Postgres state across ordered sections,
 * so a parallel-by-default runner (vitest/jest) would fight the design rather than
 * help it. `runSections` below is the whole reporter: ~1 function, zero dependencies.
 */

export * from './process';
export * from './jwt';
export * from './sections';
export * from './assertions';
