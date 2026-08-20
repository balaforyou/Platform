import { test, expect } from '@playwright/test';
import { PrismaClient, BookingStatus } from '@badminton/database';

const prisma = new PrismaClient();

const tenantId = '11111111-1111-1111-1111-111111111111';
const branchId = 'member-self-confirm-branch';
const activeMemberId = 'member-ui-confirm-active';
const noSessionMemberId = 'member-ui-confirm-no-session';
const raceMemberId = 'member-ui-confirm-race';
const inactiveMemberId = 'member-ui-confirm-inactive';
const cutoffMemberId = 'member-ui-confirm-cutoff';
const activePhone = '+919902000001';
const noSessionPhone = '+919902000002';
const activePoolId = 'member-ui-confirm-pool';
const activeWindowId = 'member-ui-confirm-window';

function todayIsoWeekday() {
  const day = new Date().getDay();
  return String(day === 0 ? 7 : day);
}

function notTodayIsoWeekday() {
  return todayIsoWeekday() === '1' ? '2' : '1';
}

function alignFutureStart(hoursFromNow: number) {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return start;
}

async function upsertMember(id: string, phone: string) {
  await prisma.user.upsert({
    where: { id },
    update: { tenantId, phone, userType: 'MEMBER', isPhoneVerified: true },
    create: { id, tenantId, phone, userType: 'MEMBER', isPhoneVerified: true },
  });
}

async function loginAs(page: any, phone: string) {
  await page.goto('/login?tenant=courtowner1');
  await page.fill('input[placeholder="99999 99999"]', phone.replace('+91', ''));
  await page.click('button[type="submit"]');
  await page.waitForSelector('input[placeholder="Enter 4 or 6 digit OTP"]');
  await page.fill('input[placeholder="Enter 4 or 6 digit OTP"]', '123456');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/(\?tenant=courtowner1)?$/);
  await expect(page.locator('#member-session-card')).toBeVisible({ timeout: 10000 });
}

test.describe('Member self-confirm attendance', () => {
  test.beforeAll(async () => {
    await prisma.booking.deleteMany({
      where: {
        OR: [
          { userId: { in: [activeMemberId, noSessionMemberId, raceMemberId, inactiveMemberId, cutoffMemberId] } },
          { resourcePoolId: { in: [activePoolId, 'member-ui-cutoff-pool'] } },
        ],
      },
    });
    await prisma.otpRequest.deleteMany({ where: { phone: { in: [activePhone, noSessionPhone] } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: [activeMemberId, noSessionMemberId, raceMemberId, inactiveMemberId, cutoffMemberId] } } });
    await prisma.memberGroupAssignment.deleteMany({ where: { userId: { in: [activeMemberId, noSessionMemberId, raceMemberId, inactiveMemberId, cutoffMemberId] } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: [activeMemberId, noSessionMemberId, raceMemberId, inactiveMemberId, cutoffMemberId] } } });
    await prisma.availabilityWindow.deleteMany({ where: { resourcePoolId: { in: [activePoolId, 'member-ui-cutoff-pool'] } } });
    await prisma.bookingRule.deleteMany({ where: { resourcePoolId: { in: [activePoolId, 'member-ui-cutoff-pool'] } } });
    await prisma.resourcePool.deleteMany({ where: { id: { in: [activePoolId, 'member-ui-cutoff-pool'] } } });

    await prisma.tenant.upsert({
      where: { id: tenantId },
      update: { name: 'Elite Court Rentals', subdomain: 'courtowner1', appName: 'Elite Courts', themeColor: '#e11d48', plan: 'basic', status: 'active' },
      create: { id: tenantId, name: 'Elite Court Rentals', subdomain: 'courtowner1', appName: 'Elite Courts', themeColor: '#e11d48', plan: 'basic', status: 'active' },
    });
    await prisma.branch.upsert({
      where: { id: branchId },
      update: { name: 'Member Self Confirm Arena', status: 'ACTIVE', workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], workingHoursStart: '06:00', workingHoursEnd: '22:00' },
      create: { id: branchId, tenantId, name: 'Member Self Confirm Arena', status: 'ACTIVE', workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], workingHoursStart: '06:00', workingHoursEnd: '22:00' },
    });

    await upsertMember(activeMemberId, activePhone);
    await upsertMember(noSessionMemberId, noSessionPhone);
    await upsertMember(raceMemberId, '+919902000003');
    await upsertMember(inactiveMemberId, '+919902000004');
    await upsertMember(cutoffMemberId, '+919902000005');

    const activeStart = alignFutureStart(4);
    await prisma.resourcePool.create({
      data: { id: activePoolId, tenantId, branchId, name: 'Member Confirm Premium Court', allocationMode: 'POOLED', capacity: 8, minOccupancy: 2, minBookingDurationMinutes: 60, pricingMode: 'FLAT', defaultRate: 0 },
    });
    await prisma.bookingRule.create({
      data: { resourcePoolId: activePoolId, gracePeriodMinutes: 30, guestAccessCutoffMinutes: 120, cancellationPolicyJson: { type: 'tiered', tiers: [] } },
    });
    await prisma.availabilityWindow.create({
      data: { id: activeWindowId, resourcePoolId: activePoolId, startTime: activeStart, endTime: new Date(activeStart.getTime() + 60 * 60 * 1000), capacity: 8 },
    });

    for (const userId of [activeMemberId, raceMemberId]) {
      await prisma.subscription.create({ data: { userId, tenantId, mandateId: `member-ui-mandate-${userId}`, amount: 100000, frequency: 'monthly', status: 'active' } });
      await prisma.memberGroupAssignment.create({ data: { userId, resourcePoolId: activePoolId, daysOfWeek: todayIsoWeekday(), startTime: activeStart.toISOString().slice(11, 16), status: 'ACTIVE' } });
    }
    await prisma.subscription.create({ data: { userId: noSessionMemberId, tenantId, mandateId: 'member-ui-mandate-no-session', amount: 100000, frequency: 'monthly', status: 'active' } });
    await prisma.memberGroupAssignment.create({ data: { userId: noSessionMemberId, resourcePoolId: activePoolId, daysOfWeek: notTodayIsoWeekday(), startTime: activeStart.toISOString().slice(11, 16), status: 'ACTIVE' } });

    await prisma.subscription.create({ data: { userId: inactiveMemberId, tenantId, mandateId: 'member-ui-mandate-inactive', amount: 100000, frequency: 'monthly', status: 'suspended' } });
    await prisma.memberGroupAssignment.create({ data: { userId: inactiveMemberId, resourcePoolId: activePoolId, daysOfWeek: todayIsoWeekday(), startTime: activeStart.toISOString().slice(11, 16), status: 'ACTIVE' } });

    const cutoffStart = alignFutureStart(1);
    await prisma.resourcePool.create({
      data: { id: 'member-ui-cutoff-pool', tenantId, branchId, name: 'Member Confirm Cutoff Court', allocationMode: 'POOLED', capacity: 8, minOccupancy: 2, minBookingDurationMinutes: 60, pricingMode: 'FLAT', defaultRate: 0 },
    });
    await prisma.bookingRule.create({
      data: { resourcePoolId: 'member-ui-cutoff-pool', gracePeriodMinutes: 120, guestAccessCutoffMinutes: 120, cancellationPolicyJson: { type: 'tiered', tiers: [] } },
    });
    await prisma.availabilityWindow.create({
      data: { id: 'member-ui-cutoff-window', resourcePoolId: 'member-ui-cutoff-pool', startTime: cutoffStart, endTime: new Date(cutoffStart.getTime() + 60 * 60 * 1000), capacity: 8 },
    });
    await prisma.subscription.create({ data: { userId: cutoffMemberId, tenantId, mandateId: 'member-ui-mandate-cutoff', amount: 100000, frequency: 'monthly', status: 'active' } });
    await prisma.memberGroupAssignment.create({ data: { userId: cutoffMemberId, resourcePoolId: 'member-ui-cutoff-pool', daysOfWeek: todayIsoWeekday(), startTime: cutoffStart.toISOString().slice(11, 16), status: 'ACTIVE' } });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('renders session and no-session states and confirms through the UI', async ({ page }) => {
    const todayApi = page.waitForResponse((res) => res.url().includes('/api/slot-engine/member/today-assignment') && res.request().method() === 'GET');
    await loginAs(page, activePhone);
    const todayResponse = await todayApi;
    console.log('PLAYWRIGHT_MEMBER_CONFIRM_EVIDENCE today_get', JSON.stringify({ status: todayResponse.status(), body: await todayResponse.json() }));
    await expect(page.locator('#member-session-card')).toContainText('Member Confirm Premium Court');
    await page.screenshot({ path: 'test-results/member-self-confirm-has-session.png', fullPage: true });

    const confirmApi = page.waitForResponse((res) => res.url().includes('/api/slot-engine/member/today-assignment/confirm') && res.request().method() === 'POST');
    await page.click('#confirm-member-attendance-btn');
    const confirmResponse = await confirmApi;
    const confirmBody = await confirmResponse.json();
    console.log('PLAYWRIGHT_MEMBER_CONFIRM_EVIDENCE ui_confirm_post', JSON.stringify({ status: confirmResponse.status(), body: confirmBody }));
    await expect(page.locator('#member-session-card')).toContainText('Attendance confirmed');
    await page.screenshot({ path: 'test-results/member-self-confirm-confirmed.png', fullPage: true });

    const dbBooking = await prisma.booking.findFirst({
      where: { userId: activeMemberId, windowId: activeWindowId, status: { not: BookingStatus.CANCELLED } },
    });
    console.log('PLAYWRIGHT_MEMBER_CONFIRM_EVIDENCE db_after_confirm', JSON.stringify({
      id: dbBooking?.id,
      userId: dbBooking?.userId,
      status: dbBooking?.status,
      idempotencyKey: dbBooking?.idempotencyKey,
      memberAttendanceConfirmedAt: dbBooking?.memberAttendanceConfirmedAt,
    }));
    expect(dbBooking?.memberAttendanceConfirmedAt).toBeTruthy();

    await page.click('#logout-btn');
    const noSessionApi = page.waitForResponse((res) => res.url().includes('/api/slot-engine/member/today-assignment') && res.request().method() === 'GET');
    await loginAs(page, noSessionPhone);
    const noSessionResponse = await noSessionApi;
    console.log('PLAYWRIGHT_MEMBER_CONFIRM_EVIDENCE no_session_get', JSON.stringify({ status: noSessionResponse.status(), body: await noSessionResponse.json() }));
    await expect(page.locator('#member-session-card')).toContainText('No recurring member session is scheduled for you today.');
    await page.screenshot({ path: 'test-results/member-self-confirm-no-session.png', fullPage: true });

    // SCOPE NOTE: the concurrent double-confirm race check used to run here via
    // playwrightRequest — raw API calls that drove no browser and duplicated
    // what concurrency.test.ts Test 7 already proved. It now lives once, in
    // services/slot-engine/src/regression/member-flow.regression.ts.
    // This spec keeps what genuinely needs a browser: the rendered session card,
    // the confirm click, and the resulting "Attendance confirmed" state above.
  });
});
