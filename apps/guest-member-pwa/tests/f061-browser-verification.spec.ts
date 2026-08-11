import { test, expect } from '@playwright/test';

/**
 * F-061 TIER 1 CLOSURE CONDITION — real rendered evidence for the three paths that
 * Tier 1's work touched but only ever proved at API level.
 *
 * Path 1  Admin Web Resources — booking-rule save, exercising F-068's shared validator.
 * Path 2  Admin Web Refunds — cancel-preview with an admin JWT, exercising F-071's guard.
 * Path 3  Guest PWA CancelBookingModal — cancel-preview + cancel with a user token,
 *         also F-071's guard, on a purpose-seeded booking so nothing real is destroyed.
 *
 * Runs against the LOCAL stack deliberately: the GCP VM does not carry the Tier 1 fixes,
 * so screenshots taken there would evidence the pre-fix code.
 */

const OWNER_PHONE = '9999999999';
const GUEST_PHONE = '9655500011';
const OTP = '123456';
const SHOTS = 'test-results/f061';

async function loginByOtp(page: any, phone: string, appPrefix = '') {
  await page.goto(`${appPrefix}/login?tenant=courtowner1`);
  await page
    .locator('input[placeholder="99999 99999"], input[placeholder="9999999999"]')
    .fill(phone);
  await page.click('button[type="submit"]');
  const otp = page.locator('input[placeholder="Enter 4 or 6 digit OTP"], input[placeholder="123456"]');
  await otp.waitFor();
  await otp.fill(OTP);
  await page.click('button[type="submit"]');
}

test.describe('F-061 browser verification', () => {
  test.setTimeout(180000);

  test('Paths 1 and 2 — Admin Web booking-rule save and refund preview', async ({ page }) => {
    await loginByOtp(page, OWNER_PHONE, '/admin');
    // WHY: must anchor to the END of the path — a loose /\/admin/ also matches
    // /admin/login, so the test would proceed before the session existed and the next
    // navigation would bounce straight back to the login screen.
    await expect(page).toHaveURL(/\/admin\/?(\?tenant=courtowner1)?$/);

    // ---- Path 1: booking-rule save (F-068's shared validator) ----
    await page.goto('/admin/resources?tenant=courtowner1');
    const cutoff = page.locator('label:has-text("Guest Access Cutoff") input');
    await cutoff.waitFor();
    await cutoff.fill('135');

    const savePromise = page.waitForResponse(
      (r: any) => r.url().includes('/booking-rule') && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /Save rule/i }).click();
    const saveRes = await savePromise;
    const saveBody = await saveRes.json();
    console.log('F061_PATH1_SAVE', JSON.stringify({ status: saveRes.status(), body: saveBody }));
    expect(saveRes.status()).toBe(200);
    expect((saveBody.data ?? saveBody).guestAccessCutoffMinutes).toBe(135);

    await page.screenshot({ path: `${SHOTS}/path1-booking-rule-saved.png`, fullPage: true });

    // ---- Path 2: Refunds screen cancel-preview (F-071's guard, admin JWT) ----
    await page.goto('/admin/refunds?tenant=courtowner1');
    await page.locator('label:has-text("Member phone") input').fill('9888888888');
    await page.getByRole('button', { name: /Lookup/i }).click();
    await expect(page.locator('.success-box')).toContainText('+919888888888');

    const previewPromise = page.waitForResponse(
      (r: any) => r.url().includes('/cancel-preview') && r.request().method() === 'GET',
    );
    await page.getByRole('button', { name: /admin-seed-booking-refundable-cancelled/ }).click();
    const previewRes = await previewPromise;
    console.log('F061_PATH2_PREVIEW', JSON.stringify({
      status: previewRes.status(),
      body: await previewRes.json(),
    }));
    expect(previewRes.status()).toBe(200);
    await expect(page.locator('.result-box')).toContainText('Calculated tiered refund');

    await page.screenshot({ path: `${SHOTS}/path2-refund-preview.png`, fullPage: true });
  });

  test('Path 3 — guest cancel modal, purpose-seeded booking', async ({ page }) => {
    await loginByOtp(page, GUEST_PHONE);
    await page.goto('/bookings/my?tenant=courtowner1');

    const cancelBtn = page.locator('[id^="cancel-booking-btn-f061-cancel-booking"]');
    await cancelBtn.waitFor();

    const previewPromise = page.waitForResponse(
      (r: any) => r.url().includes('/cancel-preview') && r.request().method() === 'GET',
    );
    await cancelBtn.click();
    const previewRes = await previewPromise;
    console.log('F061_PATH3_PREVIEW', JSON.stringify({
      status: previewRes.status(),
      body: await previewRes.json(),
    }));
    expect(previewRes.status()).toBe(200);

    // The modal itself, rendered with its real refund figure.
    await page.screenshot({ path: `${SHOTS}/path3-cancel-modal.png`, fullPage: true });

    const cancelPromise = page.waitForResponse(
      (r: any) => r.url().includes('/cancel') && !r.url().includes('preview') && r.request().method() === 'POST',
    );
    await page.click('#confirm-cancellation-btn');
    const cancelRes = await cancelPromise;
    console.log('F061_PATH3_CANCEL', JSON.stringify({
      status: cancelRes.status(),
      body: await cancelRes.json(),
    }));
    expect(cancelRes.status()).toBe(200);

    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/path3-cancelled-result.png`, fullPage: true });
  });
});
