import { test, expect, type CDPSession } from '@playwright/test';
import { TEST_ADMIN_EMAIL, TEST_NONADMIN_EMAIL } from './global-setup';

// End-to-end admin auth against a CDP virtual authenticator — the mechanism the
// step-3 sign-off made a non-optional bar for step 4. Real Chromium, real
// @simplewebauthn/browser, real UI, real identity-auth ceremony. Zero live Google
// (dev-token path only — acceptance criterion 7).

async function addAuthenticator(client: CDPSession): Promise<string> {
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

async function devSignIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Slotflow Admin' })).toBeVisible();
  await page.getByLabel('Seeded admin email').fill(email);
  await page.getByRole('button', { name: 'Dev sign-in' }).click();
}

test('criterion 2 — login screen offers Google only, no phone/OTP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Slotflow Admin' })).toBeVisible();
  await expect(page.getByText(/otp/i)).toHaveCount(0);
  await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  await expect(page.getByText(/phone/i)).toHaveCount(0);
});

test('criterion 1 — installable PWA (manifest + service worker)', async ({ page }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.json');
  const manifest = await page.request.get('/manifest.json');
  expect(manifest.ok()).toBeTruthy();
  const json = await manifest.json();
  expect(json.name).toBe('Slotflow Admin');
  expect(json.display).toBe('standalone');
  expect(json.icons.map((i: any) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  const swReady = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  expect(swReady).toBeTruthy();
});

test('§7 — service worker caches the shell, names the cache by build, and clears stale caches on re-activation', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);

  // 1. Shell cache is populated after first load, and there is exactly one of ours.
  const first = await page.evaluate(async () => {
    // give install()'s addAll() a beat to settle
    await new Promise((r) => setTimeout(r, 300));
    const keys = await caches.keys();
    const ours = keys.filter((k) => k.startsWith('admin-v2-shell-'));
    const entries = ours.length ? await (await caches.open(ours[0])).keys() : [];
    return { ours, entryPaths: entries.map((r) => new URL(r.url).pathname) };
  });
  expect(first.ours).toHaveLength(1);
  // dev server serves the un-stamped sw.js -> SHA falls back to "dev"; a stamped
  // build produces admin-v2-shell-<git-sha> (asserted separately in the build step).
  expect(first.ours[0]).toMatch(/^admin-v2-shell-[\w-]+$/);
  expect(first.entryPaths).toEqual(expect.arrayContaining(['/', '/manifest.json', '/icon-192.png']));

  // 2. Plant a stale cache of ours + an unrelated cache, then force re-activation.
  await page.evaluate(async () => {
    await caches.open('admin-v2-shell-stale0000');
    await caches.open('some-other-app-cache');
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.unregister();
  });
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);

  const after = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 300));
    return caches.keys();
  });
  expect(after).not.toContain('admin-v2-shell-stale0000'); // ours, non-current -> deleted
  expect(after).toContain('some-other-app-cache'); // not ours -> untouched
  expect(after.filter((k: string) => k.startsWith('admin-v2-shell-'))).toHaveLength(1);

  // 3. Both cache and network miss -> a real 503 Response, not a thrown rejection.
  await page.context().setOffline(true);
  const offline = await page.evaluate(async () => {
    try {
      const res = await fetch(`/not-cached-${Date.now()}.json`);
      return { threw: false, status: res.status, body: await res.json() };
    } catch (e) {
      return { threw: true, error: String(e) };
    }
  });
  await page.context().setOffline(false);
  expect(offline.threw).toBe(false);
  expect(offline.status).toBe(503);
  expect(offline.body?.error?.code).toBe('OFFLINE');
});

test('criterion 6 — a non-admin account is rejected with a clear message, no crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await devSignIn(page, TEST_NONADMIN_EMAIL);

  await expect(page.getByText(/doesn.t have an owner or branch-manager role/i)).toBeVisible();
  // Still the login screen, still interactive — not blank, not crashed.
  await expect(page.getByRole('heading', { name: 'Slotflow Admin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dev sign-in' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('criteria 3–5 — enrol a passkey, then use it as the fast path, then fall back cleanly', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  const authenticatorId = await addAuthenticator(client);

  // ── criterion 3: dev-login (stands in for real seeded Gmail) → landing with identity ──
  await devSignIn(page, TEST_ADMIN_EMAIL);

  // ── criterion 4: enrolment prompt appears, is actionable ──
  await expect(page.getByRole('heading', { name: /faster sign-in next time/i })).toBeVisible();
  await page.getByRole('button', { name: 'Enable fingerprint' }).click();
  await expect(page.getByText('Device enrolled.')).toBeVisible();

  // Landed, identity shown.
  await expect(page.locator('#admin-identity-email')).toHaveText(TEST_ADMIN_EMAIL);
  await expect(page.locator('#admin-identity-roles')).toContainText('Owner');

  // A resident credential now exists on the virtual authenticator.
  const { credentials } = await client.send('WebAuthn.getCredentials', { authenticatorId });
  expect(credentials.length).toBe(1);
  expect(credentials[0].isResidentCredential).toBe(true);

  // ── criterion 5a: sign out, then fingerprint fast-path ──
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Slotflow Admin' })).toBeVisible();
  await page.getByRole('button', { name: /fingerprint \/ passkey/i }).click();
  await expect(page.locator('#admin-identity-email')).toHaveText(TEST_ADMIN_EMAIL);
  await expect(page.locator('#admin-identity-roles')).toContainText('Owner');

  // ── criterion 5b: unavailable authenticator falls back to Google cleanly ──
  await page.getByRole('button', { name: 'Sign out' }).click();
  await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.getByRole('button', { name: /fingerprint \/ passkey/i }).click();
  // No crash, still on the login screen, Google/dev path still usable.
  await expect(page.getByRole('heading', { name: 'Slotflow Admin' })).toBeVisible();
  await page.getByLabel('Seeded admin email').fill(TEST_ADMIN_EMAIL);
  await page.getByRole('button', { name: 'Dev sign-in' }).click();
  await expect(page.locator('#admin-identity-email')).toHaveText(TEST_ADMIN_EMAIL);
  expect(errors).toEqual([]);
});
