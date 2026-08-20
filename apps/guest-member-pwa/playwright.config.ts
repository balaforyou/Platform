import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This package is `"type": "module"`, so the config runs as ESM and `__dirname` does not exist.
const here = dirname(fileURLToPath(import.meta.url));

/**
 * F-047: load the repo `.env` here rather than through a `dotenv-cli` wrapper on the npm script.
 *
 * The script wrapper is this project's convention (every service's `test:regression` uses it), but
 * it only configures `pnpm test:e2e`. `npx playwright test <spec>` is a normal workflow here — it
 * is how a single spec gets run in isolation, which F-046 says is already the practice — and a
 * wrapper leaves that path unconfigured. Loading in the config covers both.
 *
 * `override: false` so an explicitly exported DATABASE_URL still wins; `.env` fills the gap rather
 * than dictating.
 */
loadEnv({ path: resolve(here, '../../.env'), override: false });

/**
 * F-047: and then point the runner at a disposable database of its own.
 *
 * `.env`'s DATABASE_URL is `badminton_db` — the demo database holding JBC. Four specs open a
 * PrismaClient and seed, and loading `.env` without this line would aim them straight at it. Today
 * `test:e2e` fails on a missing DATABASE_URL, and that failure is the only thing standing between
 * the suite and demo data; this replaces that accident with an actual default.
 *
 * `badminton_db_e2e` rather than `badminton_db_test`: the regression suites wipe and reseed
 * `_test`, and they collide with these specs over shared fixture rows — F-046's third recorded
 * occurrence. The name still matches F-101's disposable-name pattern, so the guard accepts it.
 *
 * Only the demo database name is rewritten. Any other explicitly exported target — `_test`, a
 * scratch database, anything — passes through untouched, so this constrains the unsafe case
 * without taking away the ability to aim a run deliberately.
 */
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /\/badminton_db(\?|$)/,
    '/badminton_db_e2e$1',
  );
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Keep workers at 1 to prevent race conditions during DB cleanup/setup in tests
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:8080', // Route through Caddy proxy
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
