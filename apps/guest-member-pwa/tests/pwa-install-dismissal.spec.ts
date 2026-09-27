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
    // F-235 Slice D: guest-pwa's /login lost its phone/OTP form (Gmail-only now) -- prime the
    // session via the same real, unchanged OTP endpoints VerifyPhoneDialog already calls,
    // bypassing the UI. page.request shares the page's cookie jar, so the real refresh_token
    // cookie these calls set lands automatically, picked up by AuthProvider's existing
    // boot-time silent refresh on page.goto.
    await page.request.post('/api/identity/auth/otp/request', {
      data: { phone: '9999999999', tenantId: '11111111-1111-1111-1111-111111111111' },
    });
    await page.request.post('/api/identity/auth/otp/verify', {
      data: { phone: '9999999999', tenantId: '11111111-1111-1111-1111-111111111111', code: '123456' },
    });
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome, member@example.com')).toBeVisible();

    // 2. Ensure dismissal state is clean (remove specific key)
    await page.evaluate(() => localStorage.removeItem('pwa-install-dismissed'));
    await page.reload();
    // Wait for the app to finish silent refresh loading and mount layout (with safe timeout)
    await expect(page.locator('text=Welcome, member@example.com')).toBeVisible({ timeout: 15000 });

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
    await expect(page.locator('text=Welcome, member@example.com')).toBeVisible({ timeout: 15000 });
    
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
    await expect(page.locator('text=Welcome, member@example.com')).toBeVisible({ timeout: 15000 });
    
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as any;
      event.preventDefault = () => {};
      window.dispatchEvent(event);
    });
    await page.waitForTimeout(3500);
    await expect(page.locator('text=Install Elite Courts')).toBeVisible();
  });
});
