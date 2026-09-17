import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Guest Booking Flow E2E', () => {
  
  test.beforeAll(async () => {
    console.log('Running test database seed...');
    execSync('npx tsx tests/seed-test-data.ts', { cwd: process.cwd() });
  });

  test('should execute complete guest booking journey successfully', async ({ page }) => {
    // ==========================================
    // FLOW 1: BOOKING & CANCELLATION (window-e2e-001)
    // ==========================================

    // 1. Authentication (OTP Login)
    // F-235 Slice A fixture fix: 9999999999 is seed-test-data.ts's own OWNER-role member
    // (RoleAssignment role: 'OWNER'), not a genuine guest -- F-206's GUEST_BOOKING
    // module-entitlement gate correctly 403s that admin-role JWT off the guest-facing
    // resource-pools endpoint. Real guest flows in other specs (f023, f043) use a fresh,
    // never-seeded-with-a-role phone number instead, relying on this app's real self-registers-
    // as-GUEST-on-first-verify behavior -- same convention here.
    // F-235 Slice D: guest-pwa's /login lost its phone/OTP form (Gmail-only now) -- prime the
    // session via the same real, unchanged OTP endpoints VerifyPhoneDialog already calls,
    // bypassing the UI. page.request shares the page's cookie jar, so the real refresh_token
    // cookie these calls set lands automatically, picked up by AuthProvider's existing
    // boot-time silent refresh on page.goto.
    await page.request.post('/api/identity/auth/otp/request', {
      data: { phone: '9877712345', tenantId: '11111111-1111-1111-1111-111111111111' },
    });
    await page.request.post('/api/identity/auth/otp/verify', {
      data: { phone: '9877712345', tenantId: '11111111-1111-1111-1111-111111111111', code: '123456' },
    });
    await page.goto('/');

    // Verify redirect to main dashboard
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible();

    // 2. Click "Book Court Now" -- F-235 Slice A: lands directly on the merged /book screen
    // (venue-switcher chip + About badge + booking UI, no more separate /branches routes).
    await page.click('#book-court-dashboard-btn');
    await expect(page).toHaveURL('/book');

    // 3. Open the venue-switcher sheet and pick Coimbatore Main Arena
    await page.click('.gpwa-branchbooking__venue-chip');
    const coimbatoreCard = page.locator('[id^="branch-card-22222222-2222-2222-2222-222222222222"]');
    await expect(coimbatoreCard).toBeVisible();
    await coimbatoreCard.click();

    // 4. Open the About sheet for the same real venue-info content that used to live at
    // /branches/:id/about.
    await page.click('.gpwa-branchbooking__about-badge');
    await expect(page.locator('text=Cafeteria')).toBeVisible();
    await page.click('.gpwa-about-sheet__close');

    // This shared fixture branch actually carries many accumulated test pools (real, pre-existing
    // e2e data-hygiene debt across other spec files -- confirmed 30 real ResourcePool rows under
    // this one branch in badminton_db_e2e, not the single pool this test originally assumed), so
    // the merged screen's real multi-pool chip row renders here -- pick the real e2e pool
    // explicitly, same real UI path the old BranchDashboard click used to exercise.
    await page.click('#court-pool-card-courtpool-e2e-001');

    // Pick the time slot 1
    await page.click('[id^="slot-card-window-e2e-001"]');

    // Co-player collection was removed from this screen for the MVP (follows F-114 — nothing
    // counts heads for pricing or capacity any more). The pool is PER_PERSON at ₹150, so the
    // booker alone is ₹150 where three participants were previously ₹450.
    // The API still accepts coPlayers; only the UI step is gone.

    // Verify computed price
    const priceText = await page.locator('#computed-price-display').textContent();
    expect(priceText).toContain('₹150');
    console.log(`[ASSERT SUCCESS] Verified group size computed price is: ${priceText?.trim()}`);

    // Click Reserve Court / Hold Slot
    await page.click('#reserve-court-btn');

    // 6. Complete payment checkout (Mock Simulation)
    await expect(page).toHaveURL(/\/bookings\/.*\/pay/);
    const amountToPay = await page.locator('#pay-amount-display').textContent();
    expect(amountToPay).toContain('₹150');
    console.log(`[ASSERT SUCCESS] Verified checkout payment page amount is: ${amountToPay?.trim()}`);

    // F-235 Slice B: the pay button is now gated on real terms acceptance -- check the box and
    // wait for it to actually clear the button's disabled state before clicking pay.
    await page.click('#accept-terms-checkbox');
    await expect(page.locator('#simulate-success-pay-btn')).toBeEnabled();

    // Click the local dev simulate payment button
    await page.click('#simulate-success-pay-btn');
    console.log('[STEP] Triggered server-side Razorpay webhook capture simulation...');

    // 7. Verify Confirmation Page (Polls until CONFIRMED)
    await expect(page).toHaveURL(/\/bookings\/.*\/confirmation/);
    await expect(page.locator('#confirmation-title')).toHaveText('Booking Confirmed!', { timeout: 10000 });
    console.log('[ASSERT SUCCESS] Verified booking status transitioned from HELD to CONFIRMED successfully.');

    // 8. Open booking history
    await page.click('#view-my-bookings-confirmation-btn');
    await expect(page).toHaveURL('/bookings/my');

    // 9. Execute Cancellation & Tiered Refund preview
    await page.click('[id^="cancel-booking-btn-"]');
    
    // Verify refund modal loads and calculates refund (1.9 hours before slot = 0% refund = ₹0)
    await expect(page.locator('text=Cancel Your Match')).toBeVisible();
    const refundPreviewText = await page.locator('#refund-preview-display').textContent();
    expect(refundPreviewText).toContain('₹0');
    console.log(`[ASSERT SUCCESS] Verified tiered refund preview for 1.9 hours cutoff computes to: ${refundPreviewText?.trim()}`);

    // Confirm cancel
    await page.click('#confirm-cancellation-btn');
    await expect(page.locator('text=Cancelled')).toBeVisible();
    console.log('[ASSERT SUCCESS] Verified cancellation updates booking status to Cancelled.');

    // ==========================================
    // FLOW 2: SECOND BOOKING & CHECK-IN (window-e2e-002)
    // ==========================================
    
    // Return to Dashboard to start booking 2 by clicking the logo
    await page.click('a[href="/"]');
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible();
    await page.click('#book-court-dashboard-btn');
    await expect(page).toHaveURL('/book');

    // Coimbatore branch is cached (localStorage['selected_branch_id']) -- no venue picker needed
    // this time -- but pool selection isn't persisted across mounts, and this shared fixture
    // branch has many real pools (see the note above), so the chip row appears again.
    await expect(page.locator('text=Coimbatore Main Arena')).toBeVisible();
    await page.click('#court-pool-card-courtpool-e2e-001');

    // Choose Slot 2
    await page.click('[id^="slot-card-window-e2e-002"]');
    
    // Reserve slot directly without adding coplayers
    await page.click('#reserve-court-btn');
    
    // Pay for Booking 2
    await expect(page).toHaveURL(/\/bookings\/.*\/pay/);
    await page.click('#accept-terms-checkbox');
    await expect(page.locator('#simulate-success-pay-btn')).toBeEnabled();
    await page.click('#simulate-success-pay-btn');
    
    // Wait for Confirmation Page
    await expect(page).toHaveURL(/\/bookings\/.*\/confirmation/);
    await expect(page.locator('#confirmation-title')).toHaveText('Booking Confirmed!', { timeout: 10000 });
    
    // View booking history
    await page.click('#view-my-bookings-confirmation-btn');
    await expect(page).toHaveURL('/bookings/my');
    
    // Self Check-in
    await page.click('[id^="check-in-btn-"]');
    await expect(page.locator('text=Checked In')).toBeVisible();
    console.log('[ASSERT SUCCESS] Verified self check-in triggers status update to Checked In.');
  });
});
