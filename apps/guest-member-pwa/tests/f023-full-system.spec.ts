import { test, expect, request as playwrightRequest } from '@playwright/test';
import { PrismaClient, BookingStatus } from '@badminton/database';

const prisma = new PrismaClient();

const tenantId = '11111111-1111-1111-1111-111111111111';
const branchId = 'f023-branch-main';
const ownerId = 'f023-admin-owner';
const memberAId = 'f023-member-a-confirming';
const memberBId = 'f023-member-b-unconfirmed';
const memberNoSessionId = 'f023-member-no-session-today';
const guestCId = 'f023-guest-c';
const memberAPhone = '+919811111111';
const memberBPhone = '+919822222222';
const memberNoSessionPhone = '+919833333333';
const guestCPhone = '+919866666666';
const ownerPhone = '+919999999999';
const poolAId = 'f023-pool-confirmed';
const poolBId = 'f023-pool-released';
const windowAId = 'f023-window-confirmed';
const windowBId = 'f023-window-released';

function isoWeekday(now = new Date()) {
  const day = now.getDay();
  return String(day === 0 ? 7 : day);
}

function differentIsoWeekday(now = new Date()) {
  const today = Number(isoWeekday(now));
  return String(today === 7 ? 1 : today + 1);
}

function todayDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function nextAlignedHour(hoursFromNow: number) {
  const start = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return start;
}

async function upsertUser(id: string, phone: string, userType: 'MEMBER' | 'GUEST') {
  await prisma.user.upsert({
    where: { id },
    update: { tenantId, phone, userType, isPhoneVerified: true },
    create: { id, tenantId, phone, userType, isPhoneVerified: true },
  });
}

async function loginByOtp(page: any, phone: string, appPrefix = '') {
  await page.goto(`${appPrefix}/login?tenant=courtowner1`);
  await page.locator('input[placeholder="99999 99999"], input[placeholder="9999999999"]').fill(phone.replace('+91', ''));
  await page.click('button[type="submit"]');
  const otpInput = page.locator('input[placeholder="Enter 4 or 6 digit OTP"], input[placeholder="123456"]');
  await otpInput.waitFor();
  await otpInput.fill('123456');
  await page.click('button[type="submit"]');
}

async function seedF023() {
  const userIds = [ownerId, memberAId, memberBId, memberNoSessionId, guestCId];
  const phones = [ownerPhone, memberAPhone, memberBPhone, memberNoSessionPhone, guestCPhone];
  const existingPhoneUsers = await prisma.user.findMany({
    where: { tenantId, phone: { in: phones } },
    select: { id: true },
  });
  const cleanupUserIds = [...new Set([...userIds, ...existingPhoneUsers.map((user) => user.id)])];

  await prisma.refund.deleteMany({
    where: { paymentIntent: { userId: { in: cleanupUserIds } } },
  });
  await prisma.paymentIntent.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.booking.deleteMany({
    where: {
      OR: [
        { userId: { in: cleanupUserIds } },
        { resourcePoolId: { in: [poolAId, poolBId] } },
        { windowId: { in: [windowAId, windowBId] } },
      ],
    },
  });
  await prisma.bookingPlayer.deleteMany({ where: { phone: { in: phones } } });
  await prisma.otpRequest.deleteMany({ where: { phone: { in: phones } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.memberGroupAssignment.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: cleanupUserIds } } });
  await prisma.roleAssignment.deleteMany({ where: { userId: { in: cleanupUserIds }, tenantId } });
  await prisma.user.deleteMany({ where: { tenantId, phone: { in: phones } } });
  await prisma.availabilityWindow.deleteMany({ where: { resourcePoolId: { in: [poolAId, poolBId] } } });
  await prisma.bookingRule.deleteMany({ where: { resourcePoolId: { in: [poolAId, poolBId] } } });
  await prisma.resourcePool.deleteMany({ where: { id: { in: [poolAId, poolBId] } } });

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { name: 'Elite Court Rentals', subdomain: 'courtowner1', appName: 'Elite Courts', themeColor: '#e11d48', plan: 'basic', status: 'active' },
    create: { id: tenantId, name: 'Elite Court Rentals', subdomain: 'courtowner1', appName: 'Elite Courts', themeColor: '#e11d48', plan: 'basic', status: 'active' },
  });
  await prisma.branch.upsert({
    where: { id: branchId },
    update: { name: 'F023 Integration Arena', status: 'ACTIVE', workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], workingHoursStart: '06:00', workingHoursEnd: '23:00' },
    create: { id: branchId, tenantId, name: 'F023 Integration Arena', status: 'ACTIVE', workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], workingHoursStart: '06:00', workingHoursEnd: '23:00' },
  });

  await upsertUser(ownerId, ownerPhone, 'MEMBER');
  await upsertUser(memberAId, memberAPhone, 'MEMBER');
  await upsertUser(memberBId, memberBPhone, 'MEMBER');
  await upsertUser(memberNoSessionId, memberNoSessionPhone, 'MEMBER');
  await upsertUser(guestCId, guestCPhone, 'GUEST');
  await prisma.roleAssignment.create({
    data: { id: 'f023-owner-role', userId: ownerId, tenantId, branchId, role: 'OWNER' },
  });

  const createPool = async (id: string, name: string, gracePeriodMinutes: number) => {
    await prisma.resourcePool.create({
      data: {
        id,
        tenantId,
        branchId,
        name,
        allocationMode: 'POOLED',
        capacity: 4,
        minOccupancy: 1,
        minBookingDurationMinutes: 60,
        pricingMode: 'FLAT',
        defaultRate: 500,
      },
    });
    await prisma.bookingRule.create({
      data: {
        resourcePoolId: id,
        memberWindowDays: 30,
        guestOpenWindowDays: 7,
        gracePeriodMinutes,
        guestAccessCutoffMinutes: 120,
        lowOccupancyThresholdPct: 75,
        prepaymentRequired: true,
        cancellationPolicyJson: {
          type: 'tiered',
          tiers: [
            { min_hours_before_slot: 24, refund_percent: 100 },
            { min_hours_before_slot: 6, refund_percent: 50 },
            { min_hours_before_slot: 0, refund_percent: 0 },
          ],
        },
      },
    });
  };

  await createPool(poolAId, 'F023 Confirmed Member Court', 30);
  await createPool(poolBId, 'F023 Released Guest Court', 30);

  // Future aligned window: both members begin before cutoff. Each scenario moves
  // its own rule past cutoff immediately before calling the real sweep endpoint.
  const start = nextAlignedHour(2);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  await prisma.availabilityWindow.create({ data: { id: windowAId, resourcePoolId: poolAId, startTime: start, endTime: end, capacity: 4 } });
  await prisma.availabilityWindow.create({ data: { id: windowBId, resourcePoolId: poolBId, startTime: start, endTime: end, capacity: 4 } });

  for (const [userId, poolId] of [[memberAId, poolAId], [memberBId, poolBId]] as const) {
    await prisma.subscription.create({
      data: { userId, tenantId, mandateId: `f023-mandate-${userId}`, amount: 100000, frequency: 'monthly', status: 'active' },
    });
    await prisma.memberGroupAssignment.create({
      data: { userId, resourcePoolId: poolId, daysOfWeek: isoWeekday(), startTime: start.toISOString().slice(11, 16), status: 'ACTIVE' },
    });
  }
  await prisma.subscription.create({
    data: { userId: memberNoSessionId, tenantId, mandateId: `f023-mandate-${memberNoSessionId}`, amount: 100000, frequency: 'monthly', status: 'active' },
  });
  await prisma.memberGroupAssignment.create({
    data: { userId: memberNoSessionId, resourcePoolId: poolAId, daysOfWeek: differentIsoWeekday(), startTime: start.toISOString().slice(11, 16), status: 'ACTIVE' },
  });

  return { start, end };
}

test.describe('F-023 cross-system integration', () => {
  test.setTimeout(180000);

  test.beforeAll(async () => {
    await seedF023();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('protects confirmed member attendance and releases unconfirmed capacity to guest booking and refund override', async ({ browser, baseURL }) => {
    const api = await playwrightRequest.newContext({ baseURL });
    console.log('F023_SEEDED_IDENTITIES', JSON.stringify({
      tenantId,
      branchId,
      admin: { id: ownerId, phone: ownerPhone },
      memberA: { id: memberAId, phone: memberAPhone },
      memberB: { id: memberBId, phone: memberBPhone },
      memberNoSession: { id: memberNoSessionId, phone: memberNoSessionPhone },
      guestC: { id: guestCId, phone: guestCPhone },
      scenarioA: { poolId: poolAId, windowId: windowAId },
      scenarioB: { poolId: poolBId, windowId: windowBId },
    }));

    const noSessionContext = await browser.newContext();
    const noSessionPage = await noSessionContext.newPage();
    const noSessionPromise = noSessionPage.waitForResponse((res) => res.url().includes('/api/slot-engine/member/today-assignment') && res.request().method() === 'GET');
    await loginByOtp(noSessionPage, memberNoSessionPhone);
    const noSessionRes = await noSessionPromise;
    console.log('F023_REQUEST_RESPONSE member_no_session_today_get', JSON.stringify({ status: noSessionRes.status(), body: await noSessionRes.json() }));
    await expect(noSessionPage.locator('#member-session-card')).toContainText('No recurring member session is scheduled for you today.');
    await noSessionPage.screenshot({ path: 'test-results/f023-member-no-session-dashboard.png', fullPage: true });
    await noSessionContext.close();

    const memberAContext = await browser.newContext();
    const memberAPage = await memberAContext.newPage();
    const memberTodayPromise = memberAPage.waitForResponse((res) => res.url().includes('/api/slot-engine/member/today-assignment') && res.request().method() === 'GET');
    await loginByOtp(memberAPage, memberAPhone);
    await expect(memberAPage.locator('#member-session-card')).toContainText('F023 Confirmed Member Court');
    const memberTodayRes = await memberTodayPromise;
    console.log('F023_REQUEST_RESPONSE member_today_get', JSON.stringify({ status: memberTodayRes.status(), body: await memberTodayRes.json() }));

    const memberConfirmPromise = memberAPage.waitForResponse((res) => res.url().includes('/api/slot-engine/member/today-assignment/confirm') && res.request().method() === 'POST');
    await memberAPage.click('#confirm-member-attendance-btn');
    const memberConfirmRes = await memberConfirmPromise;
    console.log('F023_REQUEST_RESPONSE member_confirm_post', JSON.stringify({
      status: memberConfirmRes.status(),
      requestBody: memberConfirmRes.request().postDataJSON?.() ?? memberConfirmRes.request().postData(),
      body: await memberConfirmRes.json(),
    }));
    await expect(memberAPage.locator('#member-session-card')).toContainText('Attendance confirmed');
    await memberAPage.screenshot({ path: 'test-results/f023-member-confirmed-dashboard.png', fullPage: true });

    const scenarioABookingBeforeSweep = await prisma.booking.findFirstOrThrow({ where: { userId: memberAId, windowId: windowAId } });
    console.log('F023_DB scenario_a_after_confirm_before_sweep', JSON.stringify({
      id: scenarioABookingBeforeSweep.id,
      userId: scenarioABookingBeforeSweep.userId,
      windowId: scenarioABookingBeforeSweep.windowId,
      status: scenarioABookingBeforeSweep.status,
      memberAttendanceConfirmedAt: scenarioABookingBeforeSweep.memberAttendanceConfirmedAt,
    }));

    const scenarioACutoffShift = await prisma.bookingRule.updateMany({
      where: { resourcePoolId: poolAId },
      data: { gracePeriodMinutes: 180 },
    });
    console.log('F023_DB scenario_a_cutoff_shift_after_confirm', JSON.stringify({
      poolId: poolAId,
      gracePeriodMinutes: 180,
      updatedRows: scenarioACutoffShift.count,
    }));

    const sweepARes = await api.post('/api/slot-engine/bookings/sweep');
    console.log('F023_REQUEST_RESPONSE sweep_after_confirm', JSON.stringify({ status: sweepARes.status(), body: await sweepARes.json() }));
    const scenarioABookingAfterSweep = await prisma.booking.findFirstOrThrow({ where: { userId: memberAId, windowId: windowAId } });
    console.log('F023_DB scenario_a_after_sweep', JSON.stringify({
      id: scenarioABookingAfterSweep.id,
      status: scenarioABookingAfterSweep.status,
      memberAttendanceConfirmedAt: scenarioABookingAfterSweep.memberAttendanceConfirmedAt,
    }));
    expect(scenarioABookingAfterSweep.status).toBe(BookingStatus.CONFIRMED);
    expect(scenarioABookingAfterSweep.memberAttendanceConfirmedAt).toBeTruthy();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginByOtp(adminPage, ownerPhone, '/admin');
    await expect(adminPage).toHaveURL(/\/admin\/?(\?tenant=courtowner1)?$/);
    await adminPage.goto('/admin/occupancy?tenant=courtowner1');
    await adminPage.locator('label:has-text("Branch") select').selectOption(branchId);
    await adminPage.locator('label:has-text("Resource pool") select').selectOption(poolAId);
    await expect(adminPage.locator('.metric-card')).toContainText('1 of 4 confirmed');
    await adminPage.screenshot({ path: 'test-results/f023-admin-low-occupancy-confirmed-seat.png', fullPage: true });

    const scenarioBCutoffShift = await prisma.bookingRule.updateMany({
      where: { resourcePoolId: poolBId },
      data: { gracePeriodMinutes: 180 },
    });
    console.log('F023_DB scenario_b_cutoff_shift_before_sweep', JSON.stringify({
      poolId: poolBId,
      gracePeriodMinutes: 180,
      updatedRows: scenarioBCutoffShift.count,
    }));

    const sweepBRes = await api.post('/api/slot-engine/bookings/sweep');
    console.log('F023_REQUEST_RESPONSE sweep_unconfirmed_member', JSON.stringify({ status: sweepBRes.status(), body: await sweepBRes.json() }));
    const scenarioBMemberBooking = await prisma.booking.findFirstOrThrow({ where: { userId: memberBId, windowId: windowBId } });
    console.log('F023_DB scenario_b_after_sweep', JSON.stringify({
      id: scenarioBMemberBooking.id,
      userId: scenarioBMemberBooking.userId,
      windowId: scenarioBMemberBooking.windowId,
      status: scenarioBMemberBooking.status,
      memberAttendanceConfirmedAt: scenarioBMemberBooking.memberAttendanceConfirmedAt,
    }));
    expect(scenarioBMemberBooking.status).toBe(BookingStatus.RELEASED_NO_SHOW);

    await adminPage.locator('label:has-text("Resource pool") select').selectOption(poolBId);
    await expect(adminPage.locator('.metric-card')).toContainText('0 of 4 confirmed');
    await adminPage.screenshot({ path: 'test-results/f023-admin-low-occupancy-alert.png', fullPage: true });

    await adminPage.locator('label:has-text("Availability window") select').selectOption(windowBId);
    const releasePromise = adminPage.waitForResponse((res) => res.url().includes(`/api/slot-engine/resource-pools/${poolBId}/windows/${windowBId}/release`) && res.request().method() === 'POST');
    await adminPage.getByRole('button', { name: /Release to guests/i }).click();
    const releaseRes = await releasePromise;
    console.log('F023_REQUEST_RESPONSE admin_release_post', JSON.stringify({
      status: releaseRes.status(),
      requestBody: releaseRes.request().postDataJSON?.() ?? releaseRes.request().postData(),
      body: await releaseRes.json(),
    }));

    const releasedWindow = await prisma.availabilityWindow.findUniqueOrThrow({ where: { id: windowBId } });
    console.log('F023_DB scenario_b_after_admin_release', JSON.stringify({
      id: releasedWindow.id,
      pricingMode: releasedWindow.pricingMode,
      price: releasedWindow.price,
      updatedAt: releasedWindow.updatedAt,
    }));

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await loginByOtp(guestPage, guestCPhone);
    await expect(guestPage).toHaveURL(/\/(\?tenant=courtowner1)?$/);
    const availabilityResPromise = guestPage.waitForResponse((res) => res.url().includes(`/api/slot-engine/resource-pools/${poolBId}/availability`) && res.request().method() === 'GET');
    await guestPage.goto(`/branches/${branchId}/book/${poolBId}?tenant=courtowner1`);
    await expect(guestPage).toHaveURL(new RegExp(`/branches/${branchId}/book/${poolBId}`));
    const availabilityRes = await availabilityResPromise;
    const availabilityBody = await availabilityRes.json();
    console.log('F023_REQUEST_RESPONSE guest_availability_get', JSON.stringify({ status: availabilityRes.status(), body: availabilityBody }));
    expect(JSON.stringify(availabilityBody)).toContain(windowBId);
    await expect(guestPage.locator(`#slot-card-${windowBId}`)).toBeVisible();
    await guestPage.screenshot({ path: 'test-results/f023-guest-newly-available-slot.png', fullPage: true });

    await guestPage.click(`#slot-card-${windowBId}`);
    const bookingPromise = guestPage.waitForResponse((res) => res.url().includes('/api/slot-engine/bookings') && res.request().method() === 'POST');
    await guestPage.click('#reserve-court-btn');
    const bookingRes = await bookingPromise;
    const bookingBody = await bookingRes.json();
    console.log('F023_REQUEST_RESPONSE guest_booking_post', JSON.stringify({
      status: bookingRes.status(),
      requestBody: bookingRes.request().postDataJSON?.() ?? bookingRes.request().postData(),
      body: bookingBody,
    }));
    const guestBookingId = bookingBody.data.id;

    const payPromise = guestPage.waitForResponse((res) => res.url().includes('/api/payment/payments/test/simulate-capture') && res.request().method() === 'POST');
    await guestPage.click('#simulate-success-pay-btn');
    const payRes = await payPromise;
    console.log('F023_REQUEST_RESPONSE guest_payment_mock_capture', JSON.stringify({ status: payRes.status(), body: await payRes.json() }));
    await expect(guestPage.locator('#confirmation-title')).toHaveText('Booking Confirmed!', { timeout: 10000 });

    const guestBookingConfirmed = await prisma.booking.findUniqueOrThrow({ where: { id: guestBookingId } });
    console.log('F023_DB guest_booking_after_payment', JSON.stringify({
      id: guestBookingConfirmed.id,
      userId: guestBookingConfirmed.userId,
      userIsGuestC: guestBookingConfirmed.userId === guestCId,
      notMemberA: guestBookingConfirmed.userId !== memberAId,
      notMemberB: guestBookingConfirmed.userId !== memberBId,
      windowId: guestBookingConfirmed.windowId,
      status: guestBookingConfirmed.status,
      price: guestBookingConfirmed.price,
    }));
    expect(guestBookingConfirmed.userId).toBe(guestCId);
    expect(guestBookingConfirmed.status).toBe(BookingStatus.CONFIRMED);

    await guestPage.goto('/bookings/my?tenant=courtowner1');
    await guestPage.click(`[id^="cancel-booking-btn-${guestBookingId}"]`);
    const previewRes = await guestPage.waitForResponse((res) => res.url().includes(`/api/slot-engine/bookings/${guestBookingId}/cancel-preview`) && res.request().method() === 'GET');
    console.log('F023_REQUEST_RESPONSE guest_refund_preview_get', JSON.stringify({ status: previewRes.status(), body: await previewRes.json() }));
    const cancelPromise = guestPage.waitForResponse((res) => res.url().includes(`/api/slot-engine/bookings/${guestBookingId}/cancel`) && res.request().method() === 'POST');
    await guestPage.click('#confirm-cancellation-btn');
    const cancelRes = await cancelPromise;
    console.log('F023_REQUEST_RESPONSE guest_cancel_post', JSON.stringify({ status: cancelRes.status(), body: await cancelRes.json() }));

    const guestBookingCancelled = await prisma.booking.findUniqueOrThrow({ where: { id: guestBookingId } });
    console.log('F023_DB guest_booking_after_cancel', JSON.stringify({
      id: guestBookingCancelled.id,
      status: guestBookingCancelled.status,
      refundAmount: guestBookingCancelled.refundAmount,
    }));
    expect(guestBookingCancelled.status).toBe(BookingStatus.CANCELLED);

    await adminPage.goto('/admin/refunds?tenant=courtowner1');
    await adminPage.fill('label:has-text("Member phone") input', guestCPhone.replace('+91', ''));
    await adminPage.getByRole('button', { name: /Lookup/i }).click();
    await expect(adminPage.locator('.success-box')).toContainText(guestCPhone);
    await expect(adminPage.locator('.success-box')).toContainText('GUEST');
    await adminPage.getByRole('button', { name: new RegExp(guestBookingId) }).click();
    await expect(adminPage.locator('.result-box')).toContainText('Calculated tiered refund');
    await adminPage.screenshot({ path: 'test-results/f023-admin-refund-override-screen.png', fullPage: true });

    const overrideAmountInput = adminPage.locator('label:has-text("Override amount") input');
    await overrideAmountInput.fill('275');
    const reasonInput = adminPage.locator('label:has-text("Reason") input');
    await reasonInput.fill('F023 full-system goodwill override');
    const refundPromise = adminPage.waitForResponse((res) => res.url().includes('/api/payment/refunds/override') && res.request().method() === 'POST');
    await adminPage.locator('label:has-text("Confirm this bypasses tiered calculation") input').check();
    await adminPage.getByRole('button', { name: /Issue override/i }).click();
    const refundRes = await refundPromise;
    console.log('F023_REQUEST_RESPONSE admin_refund_override_post', JSON.stringify({
      status: refundRes.status(),
      requestBody: refundRes.request().postDataJSON?.() ?? refundRes.request().postData(),
      body: await refundRes.json(),
    }));

    const refund = await prisma.refund.findFirstOrThrow({
      where: { paymentIntent: { referenceId: guestBookingId } },
      orderBy: { createdAt: 'desc' },
    });
    console.log('F023_DB refund_after_override', JSON.stringify({
      id: refund.id,
      amount: refund.amount,
      isOverride: refund.isOverride,
      overriddenBy: refund.overriddenBy,
      overrideReason: refund.overrideReason,
      overrideAt: refund.overrideAt,
    }));
    expect(refund.isOverride).toBe(true);
    expect(refund.overriddenBy).toBe(ownerId);
    expect(refund.amount).toBe(27500);
  });
});
