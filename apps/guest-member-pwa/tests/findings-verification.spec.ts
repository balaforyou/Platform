import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Findings Verification (F-009 client-side rendering)', () => {

  test.beforeAll(async () => {
    console.log('Running test database seed...');
    execSync('npx tsx tests/seed-test-data.ts', { cwd: process.cwd() });
  });

  // SKIPPED, NOT DELETED — MVP co-player UI removal.
  //
  // This test drives `#add-co-player-btn` and the participant phone input, both of which were
  // removed from CourtBooking for the MVP (follows F-114). It cannot pass while there is no
  // co-player UI to validate, and deleting it would lose the browser-level coverage of a real
  // logged finding when the UI returns.
  //
  // WHAT THIS COSTS RIGHT NOW, STATED PLAINLY: F-009's client-side coverage lapses for as long as
  // the UI is gone. Its server-side half is unaffected and still tested — `POST /bookings` still
  // rejects malformed co-player phones, asserted in
  // services/slot-engine/src/regression/co-player-and-alignment.regression.ts, which this change
  // does not touch. So the protection still exists and is still proven; only the rendered-error
  // assertion is dormant.
  //
  // Re-enable together with the participant list in CourtBooking.
  test.skip('F-009: Should reject malformed co-player phone number in the UI', async ({ page }) => {
    // SCOPE NOTE: this spec covers ONLY the rendered client-side validation.
    // Two things moved out of this file into slot-engine's regression suite
    // (services/slot-engine/src/regression/co-player-and-alignment.regression.ts)
    // because they were pure API calls that drove no browser at all:
    //   - F-009's server-side half (POST /bookings -> 400 "Invalid co-player
    //     phone number format")
    //   - the entire F-010 unaligned-window suggestion test
    // Re-asserting those here would cost a full browser run per status code.
    // What genuinely needs a browser is below: the rendered red error box.
    console.log('Verifying client-side F-009 validation...');

    // Clear cookies and localStorage to ensure clean login state
    await page.context().clearCookies();
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    await page.fill('input[placeholder="99999 99999"]', '9999999999');
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[placeholder="Enter 4 or 6 digit OTP"]');

    await page.fill('input[placeholder="Enter 4 or 6 digit OTP"]', '123456');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');

    await page.click('#book-court-dashboard-btn');
    await expect(page).toHaveURL('/branches');
    await page.click('[id^="branch-card-22222222-2222-2222-2222-222222222222"]');
    await expect(page).toHaveURL(/\/branches\/22222222-2222-2222-2222-222222222222/);
    await page.click('[id^="court-pool-card-courtpool-e2e-001"]');

    // Select slot card
    await page.click('[id^="slot-card-window-e2e-001"]');
    
    // Add co-player input
    await page.click('#add-co-player-btn');
    await page.fill('input[placeholder="e.g. 9876543210"]', '123456');

    // Try to reserve
    await page.click('#reserve-court-btn');

    // Verify visual error message
    const errorAlert = page.locator('div[class*="bg-red-950"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('is not a valid Indian mobile number');

    // Change to valid phone format
    await page.fill('input[placeholder="e.g. 9876543210"]', '9876543210');
    await page.click('#reserve-court-btn');

    // Verify redirection to payment checkout overlay, which means reservation passed
    await expect(page).toHaveURL(/\/bookings\/[a-f0-9-]+\/pay/);
  });

});
