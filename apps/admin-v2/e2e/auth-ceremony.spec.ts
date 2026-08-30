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
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg || !!(await navigator.serviceWorker.ready.catch(() => null));
  });
  expect(swReady).toBeTruthy();
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
