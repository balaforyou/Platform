import { PrismaClient } from '@badminton/database';
import { assertDisposableDatabase } from '@badminton/test-harness';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Playwright E2E Test Seeding ---');

  // F-101 guard, extended to the e2e suite by Change B.
  //
  // This file is the choke point for every spec that seeds through `execSync` — guest-booking,
  // findings-verification, f061 and f041 — and it is also the realistic bypass: run directly as
  // `npx tsx tests/seed-test-data.ts`, it never loads `playwright.config.ts`, so F-047's rewrite
  // of a `badminton_db` target to `badminton_db_e2e` does not apply. That rewrite is also
  // name-specific, so a `badminton_db_demo` or a remote deployed URL passes through it untouched.
  //
  // Verified rather than assumed: unguarded, this seed wrote a tenant, a user and a pool into a
  // non-disposable database in a single command.
  assertDisposableDatabase('seed-test-data.ts');

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const poolId = 'courtpool-e2e-001';
  const resourceId = 'court-e2e-001';
  const windowId = 'window-e2e-001';
  const userId = '33333333-3333-3333-3333-333333333333';

  // 1. Clean up old E2E-related bookings/data
  console.log('Cleaning up old test data...');
  await prisma.booking.deleteMany({
    where: {
      OR: [
        { windowId },
        { windowId: 'window-e2e-002' },
        { resourcePoolId: poolId },
        { userId }
      ]
    }
  });

  await prisma.availabilityWindow.deleteMany({
    where: {
      id: { in: [windowId, 'window-e2e-002'] }
    }
  });
  await prisma.blockedWindow.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.bookingRule.deleteMany({ where: { resourcePoolId: poolId } });
  await prisma.resource.deleteMany({ where: { id: resourceId } });
  await prisma.resourcePool.deleteMany({ where: { id: poolId } });

  // 2. Ensure Tenant exists
  console.log('Seeding Tenant...');
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {
      name: 'Elite Court Rentals',
      subdomain: 'courtowner1',
      appName: 'Elite Courts',
      themeColor: '#e11d48',
      logo: '/logo.png',
      plan: 'basic',
      status: 'active',
    },
    create: {
      id: tenantId,
      name: 'Elite Court Rentals',
      subdomain: 'courtowner1',
      appName: 'Elite Courts',
      themeColor: '#e11d48',
      logo: '/logo.png',
      plan: 'basic',
      status: 'active',
    },
  });

  // 3. Ensure Branch exists
  console.log('Seeding Branch...');
  await prisma.branch.upsert({
    where: { id: branchId },
    update: {
      name: 'Coimbatore Main Arena',
      address: 'Coimbatore, India',
      status: 'ACTIVE',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      workingHoursStart: '06:00',
      workingHoursEnd: '22:00',
      aboutDescription: 'Coimbatore\'s premium arena with professional standard courts.',
      facilities: ['Locker Rooms', 'Cafeteria', 'Showers', 'Parking'],
    },
    create: {
      id: branchId,
      tenantId,
      name: 'Coimbatore Main Arena',
      address: 'Coimbatore, India',
      status: 'ACTIVE',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      workingHoursStart: '06:00',
      workingHoursEnd: '22:00',
      aboutDescription: 'Coimbatore\'s premium arena with professional standard courts.',
      facilities: ['Locker Rooms', 'Cafeteria', 'Showers', 'Parking'],
    },
  });

  // 4. Seed User
  console.log('Seeding User...');
  await prisma.user.upsert({
    where: { id: userId },
    update: {
      phone: '+919999999999',
      email: 'member@example.com',
      isPhoneVerified: true,
      userType: 'MEMBER',
    },
    create: {
      id: userId,
      tenantId,
      phone: '+919999999999',
      email: 'member@example.com',
      isPhoneVerified: true,
      userType: 'MEMBER',
    },
  });

  // Role Assignment
  await prisma.roleAssignment.upsert({
    where: { id: 'assignment-id-e2e-001' },
    update: { userId, tenantId, role: 'OWNER' },
    create: { id: 'assignment-id-e2e-001', userId, tenantId, role: 'OWNER' },
  });

  // 5. Seed ResourcePool
  console.log('Seeding Resource Pool...');
  await prisma.resourcePool.create({
    data: {
      id: poolId,
      tenantId,
      branchId,
      name: 'E2E Test Court A',
      allocationMode: 'FIXED_INSTANCE',
      pricingMode: 'PER_PERSON',
      defaultRate: 150.00,
      capacity: 4,
      minOccupancy: 1,
      minBookingDurationMinutes: 60,
    },
  });

  // 6. Seed Resource
  console.log('Seeding Resource...');
  await prisma.resource.create({
    data: {
      id: resourceId,
      resourcePoolId: poolId,
      name: 'Court 1',
    },
  });

  // 7. Seed Booking Rule
  console.log('Seeding Booking Rule...');
  await prisma.bookingRule.create({
    data: {
      resourcePoolId: poolId,
      memberWindowDays: 30,
      guestOpenWindowDays: 7,
      gracePeriodMinutes: 30,
      guestAccessCutoffMinutes: 120,
      lowOccupancyThresholdPct: 50,
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

  // 8. Seed Availability Windows
  console.log('Seeding Availability Windows...');
  
  function alignTimeToBoundary(date: Date, durationMinutes: number): Date {
    const result = new Date(date);
    result.setSeconds(0);
    result.setMilliseconds(0);
    const totalMinutes = result.getHours() * 60 + result.getMinutes();
    const snappedMinutes = Math.round(totalMinutes / durationMinutes) * durationMinutes;
    result.setHours(0, snappedMinutes, 0, 0);
    return result;
  }

  const now = new Date();
  const startTime = alignTimeToBoundary(new Date(now.getTime() + 2 * 60 * 60 * 1000), 60);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  await prisma.availabilityWindow.create({
    data: {
      id: windowId,
      resourcePoolId: poolId,
      resourceId,
      startTime,
      endTime,
      capacity: 1,
    },
  });

  let startTime2 = alignTimeToBoundary(new Date(now.getTime() + 1 * 60 * 60 * 1000), 60);
  if (startTime2.getTime() <= now.getTime()) {
    startTime2 = new Date(startTime2.getTime() + 60 * 60 * 1000);
  }
  const endTime2 = new Date(startTime2.getTime() + 2 * 60 * 60 * 1000);

  await prisma.availabilityWindow.create({
    data: {
      id: 'window-e2e-002',
      resourcePoolId: poolId,
      resourceId,
      startTime: startTime2,
      endTime: endTime2,
      capacity: 1,
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Seeding error:', e);
    prisma.$disconnect();
    process.exit(1);
  });
