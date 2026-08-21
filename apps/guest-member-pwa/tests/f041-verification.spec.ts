import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { PrismaClient } from '@badminton/database';
import { assertDisposableDatabase } from '@badminton/test-harness';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

// Save screenshots inside the workspace directory
const WORKSPACE_DIR = 'd:/apps/Platform';
const SCREENSHOT_DIR = path.join(WORKSPACE_DIR, 'test-results');

const ownerPhone = '9999999999';
const memberPhone = '9422222222'; // Pending member phone
const verificationDate = new Date().toISOString().slice(0, 10);

test.describe('F-041 Independent Verification', () => {

  test.beforeAll(async () => {
    // F-101 guard (Change B): refuse a run aimed at a database that is not provably
    // disposable. F-047's config rewrite only catches the literal `badminton_db`; an
    // explicitly exported target of any other name reaches these deletes unguarded.
    assertDisposableDatabase('f041-verification.spec.ts');

    // F-046: seed before logging in, not after.
    //
    // This spec signs in as `ownerPhone` but seeded nothing, so identity-auth's dev-mode
    // self-registration created that user with a generated UUID. `seed-test-data.ts` then could
    // not create its own row for the same phone and tenant — `User` is unique on
    // `(phone, tenantId)` while the seed upserts on `id` — and took `guest-booking` and
    // `findings-verification` down with it. Proven live: a fresh database ran f023, then this
    // spec, and was left holding `24d849ba-…` for `+919999999999`.
    //
    // Running the shared seed here is the fix rather than giving this spec a private number: it
    // needs an OWNER, and a private phone would self-register a GUEST with no admin rights and
    // break the admin login below.
    console.log('Running test database seed...');
    execSync('npx tsx tests/seed-test-data.ts', { cwd: process.cwd() });

    // Delete all bookings for f041-member-pending to clean up from previous test runs
    // and restore the pending confirmation state.
    console.log('Cleaning up all bookings for f041-member-pending...');
    await prisma.booking.deleteMany({
      where: {
        userId: 'f041-member-pending',
      },
    });
    await prisma.$disconnect();

    // Ensure the output folder exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('executes full verification sequence and captures screenshots', async ({ page }) => {
    // -------------------------------------------------------------
    // STEP 1: Login to Admin Web as Owner and view Overview
    // -------------------------------------------------------------
    console.log('Logging in to Admin Web as Owner...');
    await page.goto('/admin/login');
    
    await page.fill('input[placeholder="9999999999"]', ownerPhone);
    await page.click('button:has-text("Send OTP")');
    await page.waitForSelector('input[placeholder="123456"]');
    await page.fill('input[placeholder="123456"]', '123456');
    await page.click('button:has-text("Verify OTP")');

    await expect(page).toHaveURL(/\/admin\/?$/);
    console.log('Admin login successful. Selecting branch and date...');

    // Select Coimbatore Main Arena for today's F-041 fixture date.
    await page.selectOption('select:near(label:has-text("Branch"))', 'admin-seed-branch-coimbatore');
    await page.fill('input[type="date"]', verificationDate);
    
    // Wait for data load
    await page.waitForTimeout(2000);

    // Capture overall overview showing both Guest Occupancy and Member Attendance
    const mainScreenshotPath = path.join(SCREENSHOT_DIR, 'f041_overview_dashboard.png');
    await page.screenshot({ path: mainScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${mainScreenshotPath}`);

    // Verify Guest Occupancy panel exists and is unchanged
    const guestHeader = page.locator('h2:has-text("Guest Occupancy")');
    await expect(guestHeader).toBeVisible();

    // Verify Member Attendance panel exists
    const memberHeader = page.locator('h2:has-text("Member Attendance")');
    await expect(memberHeader).toBeVisible();

    // Capture varied member states (crop or target section screenshot)
    const attendanceSection = page.locator('section:has(h2:has-text("Member Attendance"))');
    const statesScreenshotPath = path.join(SCREENSHOT_DIR, 'f041_varied_member_states.png');
    await attendanceSection.screenshot({ path: statesScreenshotPath });
    console.log(`Saved screenshot: ${statesScreenshotPath}`);

    // Verify presence of varied states in the page
    const textContent = await attendanceSection.innerText();
    console.log('--- Member Attendance Section Text ---');
    console.log(textContent);
    console.log('--------------------------------------');

    expect(textContent).toContain('Confirmed');
    expect(textContent).toContain('Released no-show');
    expect(textContent).toContain('Subscription inactive');
    expect(textContent).toContain('Pending confirmation');
    expect(textContent).toContain('Window not found');

    // Capture before confirmation screenshot
    const beforeScreenshotPath = path.join(SCREENSHOT_DIR, 'f041_member_confirm_before.png');
    await page.screenshot({ path: beforeScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${beforeScreenshotPath}`);

    // Inspect the rendered text for any leaked UUIDs or fixture seeds
    console.log('Scanning for ID leaks in Member Attendance panel...');
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const fixtureRegex = /(admin-seed-|f041-)/i;

    // Get all inner text elements in the attendance section
    const elementsText = await attendanceSection.locator('*').allInnerTexts();
    
    // Write out the scanned text elements for raw tool output
    const scanLogPath = path.join(SCREENSHOT_DIR, 'leak_scan_output.txt');
    fs.writeFileSync(scanLogPath, JSON.stringify(elementsText, null, 2), 'utf-8');
    console.log(`Raw scan elements logged to: ${scanLogPath}`);

    const leaks: string[] = [];
    for (const text of elementsText) {
      if (uuidRegex.test(text)) {
        leaks.push(`UUID pattern matched: "${text}"`);
      }
      if (fixtureRegex.test(text)) {
        leaks.push(`Fixture prefix pattern matched: "${text}"`);
      }
    }

    if (leaks.length > 0) {
      const leakMsg = `FAILED: Leaks detected:\n${leaks.join('\n')}`;
      console.log(leakMsg);
      fs.appendFileSync(scanLogPath, `\n\n${leakMsg}`, 'utf-8');
    } else {
      const passMsg = 'Leak scan: PASSED (No raw UUIDs or fixture seeds found in DOM elements)';
      console.log(passMsg);
      fs.appendFileSync(scanLogPath, `\n\n${passMsg}`, 'utf-8');
    }

    // -------------------------------------------------------------
    // STEP 2: Log out, log in to PWA as member, and confirm attendance
    // -------------------------------------------------------------
    console.log('Logging out from Admin Web via clearing cookies...');
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());

    console.log('Logging in to PWA as Member (+919422222222)...');
    await page.goto('/login?tenant=courtowner1');
    await page.fill('input[placeholder="99999 99999"]', memberPhone);
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[placeholder="Enter 4 or 6 digit OTP"]');
    await page.fill('input[placeholder="Enter 4 or 6 digit OTP"]', '123456');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/(\?tenant=courtowner1)?$/);
    await expect(page.locator('#member-session-card')).toBeVisible();

    // CRITICAL: Explicitly wait for the confirmation button to be visible and enabled
    // to ensure we capture the actual "I am coming" button (not a loading spinner)
    await page.waitForSelector('#confirm-member-attendance-btn', { state: 'visible' });
    const pwaSessionScreenshotPath = path.join(SCREENSHOT_DIR, 'f041_member_pwa_session.png');
    await page.screenshot({ path: pwaSessionScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${pwaSessionScreenshotPath}`);

    console.log('Confirming attendance on PWA...');
    await page.click('#confirm-member-attendance-btn');
    await expect(page.locator('#member-session-card')).toContainText('Attendance confirmed');

    const pwaConfirmedScreenshotPath = path.join(SCREENSHOT_DIR, 'f041_member_pwa_confirmed.png');
    await page.screenshot({ path: pwaConfirmedScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${pwaConfirmedScreenshotPath}`);

    // -------------------------------------------------------------
    // STEP 3: Log out from PWA, log back in to Admin Web, verify update
    // -------------------------------------------------------------
    console.log('Logging out from PWA...');
    await page.click('#logout-btn');
    await page.waitForURL(/\/login(\?tenant=courtowner1)?$/);

    console.log('Logging back in to Admin Web...');
    await page.goto('/admin/login');
    await page.fill('input[placeholder="9999999999"]', ownerPhone);
    await page.click('button:has-text("Send OTP")');
    await page.waitForSelector('input[placeholder="123456"]');
    await page.fill('input[placeholder="123456"]', '123456');
    await page.click('button:has-text("Verify OTP")');

    await expect(page).toHaveURL(/\/admin\/?$/);
    await page.selectOption('select:near(label:has-text("Branch"))', 'admin-seed-branch-coimbatore');
    await page.fill('input[type="date"]', verificationDate);
    await page.waitForTimeout(2000);

    const afterScreenshotPath = path.join(SCREENSHOT_DIR, 'f041_member_confirm_after.png');
    await page.screenshot({ path: afterScreenshotPath, fullPage: true });
    console.log(`Saved screenshot: ${afterScreenshotPath}`);

    // Verify row status changed to Confirmed
    const updatedSection = page.locator('section:has(h2:has-text("Member Attendance"))');
    const updatedText = await updatedSection.innerText();
    console.log('--- Member Attendance Section Text (After) ---');
    console.log(updatedText);
    console.log('----------------------------------------------');
    
    // Count occurrences of Confirmed
    const confirmedCount = (updatedText.match(/Confirmed/g) || []).length;
    console.log(`Confirmed status count: ${confirmedCount}`);
  });
});
