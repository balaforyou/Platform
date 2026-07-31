import { test, expect } from '@playwright/test';

test.describe('PWA Install Prompt Dismissal Expiry (F-002)', () => {
  
  test('should verify 7-day dismissal window logic for custom Android install prompt', async ({ page }) => {
    // Forward browser console logs to E2E test stdout for debugging
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    // 1. Authenticate first (OTP Login) so that the user lands on the dashboard inside the Layout component
    await page.context().clearCookies();
    await page.goto('/login');
    // Clear localStorage to prevent any cached selected_branch_id redirect loops
    await page.evaluate(() => localStorage.clear());
    await page.fill('input[placeholder="99999 99999"]', '9999999999');
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[placeholder="Enter 4 or 6 digit OTP"]');
    await page.fill('input[placeholder="Enter 4 or 6 digit OTP"]', '123456');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible();

    // 2. Ensure dismissal state is clean (remove specific key)
    await page.evaluate(() => localStorage.removeItem('pwa-install-dismissed'));
    await page.reload();
    // Wait for the app to finish silent refresh loading and mount layout (with safe timeout)
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible({ timeout: 15000 });

    // 3. Dispatch the simulated beforeinstallprompt event inside the page
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as any;
      event.preventDefault = () => {};
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });

    // Wait for the 3-second delay to trigger
    await page.waitForTimeout(3500);

    // Verify banner slides up
    await expect(page.locator('text=Install Elite Courts')).toBeVisible();

    // 4. Click "Later" to dismiss
    await page.click('text=Later');

    // Verify banner is hidden
    await expect(page.locator('text=Install Elite Courts')).not.toBeVisible();

    // Verify localStorage has dismissal timestamp
    const dismissedTime = await page.evaluate(() => localStorage.getItem('pwa-install-dismissed'));
    expect(dismissedTime).not.toBeNull();

    // 5. Reload page, wait for load, dispatch event again, verify banner does NOT show up (since < 7 days)
    await page.reload();
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible({ timeout: 15000 });
    
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as any;
      event.preventDefault = () => {};
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(3500);
    await expect(page.locator('text=Install Elite Courts')).not.toBeVisible();

    // 6. Modify localStorage to simulate 8 days ago (expiry)
    await page.evaluate(() => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      localStorage.setItem('pwa-install-dismissed', eightDaysAgo.toString());
    });

    // 7. Reload page, wait for load, dispatch event, verify banner DOES show up again
    await page.reload();
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible({ timeout: 15000 });
    
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as any;
      event.preventDefault = () => {};
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(3500);
    await expect(page.locator('text=Install Elite Courts')).toBeVisible();
  });
});
