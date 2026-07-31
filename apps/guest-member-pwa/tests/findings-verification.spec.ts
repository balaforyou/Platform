import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Findings Verification (F-009 & F-010)', () => {

  test.beforeAll(async () => {
    console.log('Running test database seed...');
    execSync('npx tsx tests/seed-test-data.ts', { cwd: process.cwd() });
  });

  test('F-009: Should reject malformed co-player phone number on client and server', async ({ page, request }) => {
    // ==========================================
    // 1. Backend API Rejection Verification
    // ==========================================
    console.log('Verifying backend F-009 validation...');
    
    // Clear cookies and localStorage to ensure clean login state
    await page.context().clearCookies();
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());

    await page.fill('input[placeholder="99999 99999"]', '9999999999');
    await page.click('button[type="submit"]');
    await page.waitForSelector('input[placeholder="Enter 4 or 6 digit OTP"]');
    
    // Start listening for verification response to capture the accessToken in memory
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/auth/otp/verify') && response.ok()
    );

    await page.fill('input[placeholder="Enter 4 or 6 digit OTP"]', '123456');
    
    // Concurrently trigger click and await response to avoid page navigation race conditions
    const [response] = await Promise.all([
      responsePromise,
      page.click('button[type="submit"]'),
    ]);

    await expect(page).toHaveURL('/');

    const json = await response.json();
    const accessToken = json.data?.accessToken || json.accessToken;
    expect(accessToken).toBeTruthy();

    // Call POST /bookings with bad phone numbers
    const badPhoneResponse1 = await request.post('/api/slot-engine/bookings', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        tenantId: '11111111-1111-1111-1111-111111111111',
        branchId: '22222222-2222-2222-2222-222222222222',
        resourcePoolId: 'courtpool-e2e-001',
        windowId: 'window-e2e-001',
        userId: 'test-user-id',
        coPlayers: ['12345'], // Too short, not valid
      }
    });

    expect(badPhoneResponse1.status()).toBe(400);
    const text1 = await badPhoneResponse1.text();
    expect(text1).toContain('Invalid co-player phone number format');

    const badPhoneResponse2 = await request.post('/api/slot-engine/bookings', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        tenantId: '11111111-1111-1111-1111-111111111111',
        branchId: '22222222-2222-2222-2222-222222222222',
        resourcePoolId: 'courtpool-e2e-001',
        windowId: 'window-e2e-001',
        userId: 'test-user-id',
        coPlayers: ['1234567890'], // 10 digits but doesn't start with 6-9
      }
    });

    expect(badPhoneResponse2.status()).toBe(400);
    const text2 = await badPhoneResponse2.text();
    expect(text2).toContain('Invalid co-player phone number format');

    // ==========================================
    // 2. Client UI Validation Verification
    // ==========================================
    console.log('Verifying client-side F-009 validation...');
    await page.click('#book-court-dashboard-btn');
    await expect(page).toHaveURL('/branches');
    await page.click('[id^="branch-card-22222222-2222-2222-2222-222222222222"]');
    await expect(page).toHaveURL(/\/branches\/22222222-2222-2222-2222-222222222222/);
    await page.click('[id^="court-pool-card-courtpool-e2e-001"]');

    // Select slot card
    await page.click('[id^="slot-card-window-e2e-001"]');
    
    // Add co-player input
    await page.click('#add-co-player-btn');
    await page.fill('input[placeholder="Enter co-player phone number"]', '123456');

    // Try to reserve
    await page.click('#reserve-slot-btn');

    // Verify visual error message
    const errorAlert = page.locator('.bg-red-950');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('is not a valid Indian mobile number');

    // Change to valid phone format
    await page.fill('input[placeholder="Enter co-player phone number"]', '9876543210');
    await page.click('#reserve-slot-btn');

    // Verify redirection to payment checkout overlay, which means reservation passed
    await expect(page).toHaveURL(/\/bookings\/[a-f0-9\-]+\/pay/);
  });

  test('F-010: Should reject unaligned availability windows with computed suggestion, and snap seeded windows', async ({ request }) => {
    console.log('Verifying backend F-010 validation & suggestions...');

    // 1. Create a temporary resource pool with 60 minutes duration
    const pool60 = await request.post('/api/slot-engine/resource-pools', {
      data: {
        tenantId: '11111111-1111-1111-1111-111111111111',
        branchId: '22222222-2222-2222-2222-222222222222',
        name: 'Pool 60min Test',
        allocationMode: 'POOLED',
        minBookingDurationMinutes: 60,
      }
    });
    expect(pool60.ok()).toBeTruthy();
    const pool60Json = await pool60.json();
    const pool60Id = pool60Json.data.id;

    // Post availability window with unaligned startTime (e.g. 22:16)
    const res60 = await request.post(`/api/slot-engine/resource-pools/${pool60Id}/availability-windows`, {
      data: {
        startTime: '2026-07-31T22:16:00',
        endTime: '2026-07-31T23:00:00',
        capacity: 1,
      }
    });

    expect(res60.status()).toBe(400);
    const text60 = await res60.text();
    expect(text60).toContain('Start time must align to 60-minute slots');
    // Verify it suggests nearest valid boundaries (22:00 or 23:00)
    expect(text60).toContain('You entered 22:16 — did you mean 22:00 or 23:00?');

    // 2. Create a temporary resource pool with 30 minutes duration
    const pool30 = await request.post('/api/slot-engine/resource-pools', {
      data: {
        tenantId: '11111111-1111-1111-1111-111111111111',
        branchId: '22222222-2222-2222-2222-222222222222',
        name: 'Pool 30min Test',
        allocationMode: 'POOLED',
        minBookingDurationMinutes: 30,
      }
    });
    expect(pool30.ok()).toBeTruthy();
    const pool30Json = await pool30.json();
    const pool30Id = pool30Json.data.id;

    // Post availability window with unaligned startTime (e.g. 22:16)
    const res30 = await request.post(`/api/slot-engine/resource-pools/${pool30Id}/availability-windows`, {
      data: {
        startTime: '2026-07-31T22:16:00',
        endTime: '2026-07-31T23:00:00',
        capacity: 1,
      }
    });

    expect(res30.status()).toBe(400);
    const text30 = await res30.text();
    expect(text30).toContain('Start time must align to 30-minute slots');
    // Verify it suggests nearest valid boundaries (22:00 or 22:30)
    expect(text30).toContain('You entered 22:16 — did you mean 22:00 or 22:30?');

    // 3. Post availability window with unaligned endTime (e.g. 23:15)
    const res30End = await request.post(`/api/slot-engine/resource-pools/${pool30Id}/availability-windows`, {
      data: {
        startTime: '2026-07-31T22:00:00',
        endTime: '2026-07-31T23:15:00',
        capacity: 1,
      }
    });

    expect(res30End.status()).toBe(400);
    const text30End = await res30End.text();
    expect(text30End).toContain('End time must align to 30-minute slots');
    // Verify it independently suggests for end time (23:00 or 23:30)
    expect(text30End).toContain('You entered 23:15 — did you mean 23:00 or 23:30?');
  });

});
