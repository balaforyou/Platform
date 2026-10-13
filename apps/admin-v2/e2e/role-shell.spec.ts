import { test, expect, type Page } from '@playwright/test';
import { TEST_ADMIN_EMAIL, TEST_MANAGER_ONE_EMAIL, TEST_MANAGER_TWO_EMAIL } from './global-setup';

// S1 - role-aware shell + the global branch switcher. Real Chromium, real UI, real identity-auth
// and tenant-management (dev-token sign-in, no live Google). Slot-engine is NOT started by this
// suite, so screens show their API errors; every assertion here is about the SHELL.
//
// The hiding under test is UI-ONLY: it is not a security boundary (the services still admit a
// scoped manager - F-341, slice S0).

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Slotflow Admin' })).toBeVisible();
  await page.getByLabel('Seeded admin email').fill(email);
  await page.getByRole('button', { name: 'Dev sign-in' }).click();
  // First sign-in offers the passkey prompt; skip it when present.
  // First sign-in on a device offers the passkey prompt (skippable). `isVisible` does not wait, so wait explicitly.
  const skip = page.getByRole('button', { name: 'Skip for now' });
  await skip.waitFor({ state: 'visible', timeout: 8000 }).then(() => skip.click()).catch(() => {});
  await expect(page.getByRole('navigation', { name: 'Primary' }).first()).toBeAttached({ timeout: 15000 });
}

const sidebar = (page: Page) => page.locator('nav.av2-sidebar');
const bottomNav = (page: Page) => page.locator('nav.av2-bottom-nav');
const link = (nav: ReturnType<typeof sidebar>, name: string) => nav.getByRole('button', { name, exact: true });

test.describe('desktop 1280', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('owner sees every destination, including the owner tools', async ({ page }) => {
    await signIn(page, TEST_ADMIN_EMAIL);
    const nav = sidebar(page);
    for (const name of ['Dashboard', 'Communications', 'Ledger', 'Inventory', 'Walk-in', 'Manage Members', 'Manage Court Groups', 'Guest Management', 'Branch Settings']) {
      await expect(link(nav, name)).toBeVisible();
    }
  });

  test('a manager does not see the owner-only entries but keeps the daily tasks', async ({ page }) => {
    await signIn(page, TEST_MANAGER_ONE_EMAIL);
    const nav = sidebar(page);
    for (const name of ['Dashboard', 'Ledger', 'Inventory', 'Walk-in', 'Manage Members', 'Guest Management']) {
      await expect(link(nav, name)).toBeVisible();
    }
    for (const name of ['Communications', 'Manage Court Groups', 'Branch Settings']) {
      await expect(link(nav, name)).toHaveCount(0);
    }
  });

  test('a direct URL to a role-hidden destination lands on the dashboard (UI-only guard)', async ({ page }) => {
    await signIn(page, TEST_MANAGER_ONE_EMAIL);
    for (const path of ['/communications', '/branch-settings', '/court-groups']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/dashboard$/);
    }
    // ...and the owner reaches them.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await signIn(page, TEST_ADMIN_EMAIL);
    await page.goto('/communications');
    await expect(page).toHaveURL(/\/communications$/);
  });

  test('a one-branch manager has no branch switcher (their branch is implied)', async ({ page }) => {
    await signIn(page, TEST_MANAGER_ONE_EMAIL);
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Guest Slot Inventory' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Branch' })).toHaveCount(0);
    // The date picker still shows on a date-scoped screen, and not on a branch-only one.
    await expect(page.locator('.av2-context-date input[type="date"]')).toBeVisible();
    await page.goto('/ledger');
    await expect(page.locator('.av2-context-date')).toHaveCount(0);
  });

  test('a two-branch manager gets a segmented switcher, no "All", and the choice is remembered', async ({ page }) => {
    await signIn(page, TEST_MANAGER_TWO_EMAIL);
    await page.goto('/ledger');
    const group = page.getByRole('group', { name: 'Branch' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('button')).toHaveText(['E2E Branch', 'E2E Branch Two']);
    await expect(group.getByRole('button', { name: 'All' })).toHaveCount(0); // no screen supports All in S1
    await group.getByRole('button', { name: 'E2E Branch Two' }).click();
    await expect(group.getByRole('button', { name: 'E2E Branch Two' })).toHaveAttribute('aria-pressed', 'true');
    // The same branch follows the user to another screen and survives a reload.
    await page.goto('/inventory');
    await expect(page.getByRole('group', { name: 'Branch' }).getByRole('button', { name: 'E2E Branch Two' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('group', { name: 'Branch' }).getByRole('button', { name: 'E2E Branch Two' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a storage error on the remembered-branch key does not break the switcher', async ({ page }) => {
    // Only the switcher's own key (av2.branch.*) throws. Blocking ALL of localStorage crashes the app
    // in code S1 does not own (PwaInstallPrompt reads it unguarded) - described to Chief, not fixed here.
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (k: string) {
        if (k.startsWith('av2.branch.')) throw new Error('SecurityError');
        return get.call(this, k);
      };
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k.startsWith('av2.branch.')) throw new Error('QuotaExceededError');
        return set.call(this, k, v);
      };
    });
    await signIn(page, TEST_MANAGER_TWO_EMAIL);
    await page.goto('/ledger');
    const group = page.getByRole('group', { name: 'Branch' });
    await expect(group).toBeVisible();
    await group.getByRole('button', { name: 'E2E Branch Two' }).click(); // setItem throws; must not break
    await expect(group.getByRole('button', { name: 'E2E Branch Two' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('mobile 390', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('bottom nav carries the daily tasks; owner tools sit behind Apps', async ({ page }) => {
    await signIn(page, TEST_ADMIN_EMAIL);
    const nav = bottomNav(page);
    await expect(nav).toBeVisible();
    for (const name of ['Dashboard', 'Ledger', 'Inventory', 'Walk-in', 'Apps']) {
      await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('button', { name: 'Comms' })).toHaveCount(0);
    await nav.getByRole('button', { name: 'Apps' }).click();
    await expect(page).toHaveURL(/\/apps$/);
    await expect(page.getByRole('button', { name: 'Communications' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Branch Settings' })).toBeVisible();
  });

  test('a manager\'s Apps screen has no owner tools', async ({ page }) => {
    await signIn(page, TEST_MANAGER_ONE_EMAIL);
    await bottomNav(page).getByRole('button', { name: 'Apps' }).click();
    await expect(page).toHaveURL(/\/apps$/);
    await expect(page.getByRole('button', { name: 'Guest Management' })).toBeVisible();
    for (const name of ['Communications', 'Branch Settings', 'Manage Court Groups']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });

  test('no horizontal page scroll with the switcher on a narrow screen', async ({ page }) => {
    await signIn(page, TEST_MANAGER_TWO_EMAIL);
    await page.goto('/inventory');
    await expect(page.getByRole('group', { name: 'Branch' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
