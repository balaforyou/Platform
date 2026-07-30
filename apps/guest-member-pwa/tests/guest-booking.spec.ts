import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Guest Booking Flow E2E', () => {
  
  test.beforeAll(async () => {
    console.log('Running test database seed...');
    // Execute the seed-test-data script to clear and prepare the database
    execSync('npx tsx tests/seed-test-data.ts', { cwd: process.cwd() });
  });

  test('should execute complete guest booking journey successfully', async ({ page }) => {
    // 1. Authentication (OTP Login)
    await page.goto('/login');
    
    // Fill phone number input
    await page.fill('input[placeholder="99999 99999"]', '9999999999');
    await page.click('button[type="submit"]');

    // Wait for code input to show
    await page.waitForSelector('input[placeholder="Enter 4 or 6 digit OTP"]');
    await page.fill('input[placeholder="Enter 4 or 6 digit OTP"]', '123456');
    await page.click('button[type="submit"]');

    // Verify redirect to main dashboard
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Welcome back to Elite Courts')).toBeVisible();

    // 2. Click "Book Court Now"
    await page.click('#book-court-dashboard-btn');
    
    // 3. Verify Branch Select and pick Coimbatore Main Arena
    await expect(page).toHaveURL('/branches');
    await expect(page.locator('text=Coimbatore Main Arena')).toBeVisible();
    await page.click('[id^="branch-card-22222222-2222-2222-2222-222222222222"]');

    // 4. Verify Branch Dashboard
    await expect(page).toHaveURL(/\/branches\/22222222-2222-2222-2222-222222222222/);
    
    // Check facility about details snippet
    await expect(page.locator('text=Welcome to the Branch Dashboard')).toBeVisible();

    // Go to about page and back
    await page.click('#view-about-branch-btn');
    await expect(page).toHaveURL(/\/branches\/22222222-2222-2222-2222-222222222222\/about/);
    await expect(page.locator('text=Cafeteria')).toBeVisible();
    await expect(page.locator('text=Locker Rooms')).toBeVisible();
    await page.click('text=Back to Court Dashboard');

    // Pick Court Category (Premium Court A / E2E Test Court A)
    await page.click('[id^="court-pool-card-courtpool-e2e-001"]');

    // 5. Verify Slot Selection & Court Booking
    await expect(page).toHaveURL(/\/book\/courtpool-e2e-001/);
    
    // Pick the time slot
    await page.click('[id^="slot-card-window-e2e-001"]');

    // Add co-players
    await page.click('#add-co-player-btn');
    await page.fill('input[placeholder="e.g. 9876543210"]', '9876543211');
    
    await page.click('#add-co-player-btn');
    // Select the second input field dynamically
    const phoneInputs = page.locator('input[placeholder="e.g. 9876543210"]');
    await phoneInputs.nth(1).fill('9876543212');

    // Verify computed price multiplies correctly (1 booker + 2 players = 3 players * 150 = 450)
    const priceText = await page.locator('#computed-price-display').textContent();
    expect(priceText).toContain('₹450');

    // Click Reserve Court / Hold Slot
    await page.click('#reserve-court-btn');

    // 6. Complete payment checkout (Mock Simulation)
    await expect(page).toHaveURL(/\/bookings\/.*\/pay/);
    const amountToPay = await page.locator('#pay-amount-display').textContent();
    expect(amountToPay).toContain('₹450');

    // Click the local dev simulate payment button
    await page.click('#simulate-success-pay-btn');

    // 7. Verify Confirmation Page (Polls until CONFIRMED)
    await expect(page).toHaveURL(/\/bookings\/.*\/confirmation/);
    await expect(page.locator('#confirmation-title')).toHaveText('Booking Confirmed!', { timeout: 10000 });

    // 8. Open booking history
    await page.click('#view-my-bookings-confirmation-btn');
    await expect(page).toHaveURL('/bookings/my');

    // 9. Execute Self Check-In
    await expect(page.locator('text=Confirmed')).toBeVisible();
    await page.click('[id^="check-in-btn-"]');
    await expect(page.locator('text=Checked In')).toBeVisible();

    // 10. Execute Cancellation & Tiered Refund preview
    await page.click('[id^="cancel-booking-btn-"]');
    
    // Verify refund modal loads and calculates refund (1.9 hours before slot = 0% refund = ₹0)
    await expect(page.locator('text=Cancel Your Match')).toBeVisible();
    const refundPreviewText = await page.locator('#refund-preview-display').textContent();
    expect(refundPreviewText).toContain('₹0');

    // Confirm cancel
    await page.click('#confirm-cancellation-btn');
    await expect(page.locator('text=Cancelled')).toBeVisible();
  });
});
