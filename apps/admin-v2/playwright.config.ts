import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// Resolve DATABASE_URL (exported target wins; otherwise read the repo .env), then
// force a disposable DB — same F-047 discipline as guest-member-pwa's config.
// global-setup spawns identity-auth + tenant-management against this; never the demo DB.
if (!process.env.DATABASE_URL) {
  try {
    const envFile = readFileSync(resolve(here, '../../.env'), 'utf8');
    const line = envFile.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL'));
    if (line) process.env.DATABASE_URL = line.replace(/^DATABASE_URL=/, '').replace(/^"|"$/g, '');
  } catch {
    /* fall through — global-setup will fail loudly if there is no DB */
  }
}
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    /\/badminton_db(\?|$)/,
    '/badminton_db_test$1',
  );
}
for (const k of ['INTERNAL_SERVICE_KEY', 'JWT_SECRET']) {
  if (!process.env[k]) {
    try {
      const envFile = readFileSync(resolve(here, '../../.env'), 'utf8');
      const line = envFile.split(/\r?\n/).find((l) => l.startsWith(k + '='));
      if (line) process.env[k] = line.slice(k.length + 1).replace(/^"|"$/g, '');
    } catch {
      /* optional */
    }
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    // `localhost`, not 127.0.0.1 — WebAuthn RP ID "localhost" must match the page's
    // hostname, and an IP literal is not a subdomain of "localhost".
    baseURL: 'http://localhost:5175',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite --host localhost --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
