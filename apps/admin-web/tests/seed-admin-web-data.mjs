import { PrismaClient } from '../../../packages/database/dist/index.js';

const prisma = new PrismaClient();

const tenantId = '11111111-1111-1111-1111-111111111111';
const ownerUserId = 'admin-seed-owner-001';
const memberUserId = 'admin-seed-member-001';
const secondMemberUserId = 'admin-seed-member-002';

const branches = [
  { id: 'admin-seed-branch-coimbatore', name: 'Coimbatore Main Arena', address: 'Avinashi Road, Coimbatore', workingHoursStart: '05:00', workingHoursEnd: '23:00' },
  { id: 'admin-seed-branch-peelamedu', name: 'Peelamedu Shuttle Hub', address: 'Peelamedu, Coimbatore', workingHoursStart: '06:00', workingHoursEnd: '22:30' },
  { id: 'admin-seed-branch-rspuram', name: 'RS Puram Indoor Courts', address: 'RS Puram, Coimbatore', workingHoursStart: '06:30', workingHoursEnd: '21:30' },
];

const pools = [
  { id: 'admin-seed-pool-main-premium', branchId: branches[0].id, name: 'Main Arena Premium Courts', allocationMode: 'POOLED', capacity: 6, minOccupancy: 2, pricingMode: 'PER_PERSON', defaultRate: 180 },
  { id: 'admin-seed-pool-main-training', branchId: branches[0].id, name: 'Main Arena Training Pool', allocationMode: 'POOLED', capacity: 10, minOccupancy: 4, pricingMode: 'FLAT', defaultRate: 900 },
  { id: 'admin-seed-pool-peelamedu-courts', branchId: branches[1].id, name: 'Peelamedu Evening Courts', allocationMode: 'POOLED', capacity: 8, minOccupancy: 3, pricingMode: 'PER_PERSON', defaultRate: 140 },
  { id: 'admin-seed-pool-peelamedu-weekend', branchId: branches[1].id, name: 'Peelamedu Weekend Batch', allocationMode: 'POOLED', capacity: 12, minOccupancy: 6, pricingMode: 'FLAT', defaultRate: 1200 },
  { id: 'admin-seed-pool-rspuram-elite', branchId: branches[2].id, name: 'RS Puram Elite Slots', allocationMode: 'POOLED', capacity: 4, minOccupancy: 1, pricingMode: 'PER_PERSON', defaultRate: 220 },
  { id: 'admin-seed-pool-rspuram-social', branchId: branches[2].id, name: 'RS Puram Social Play', allocationMode: 'POOLED', capacity: 8, minOccupancy: 2, pricingMode: 'FLAT', defaultRate: 650 },
];

function alignedLocalHour(daysFromNow, hour) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function cleanSeededData() {
  const poolIds = pools.map((pool) => pool.id);
  const branchIds = branches.map((branch) => branch.id);
  const branchNames = branches.map((branch) => branch.name);
  const userIds = [ownerUserId, memberUserId, secondMemberUserId];

  await prisma.paymentIntent.deleteMany({ where: { referenceId: { startsWith: 'admin-seed-' } } });
  await prisma.bookingPlayer.deleteMany({ where: { booking: { resourcePoolId: { in: poolIds } } } });
  await prisma.booking.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await prisma.memberGroupAssignment.deleteMany({ where: { OR: [{ resourcePoolId: { in: poolIds } }, { userId: { in: userIds } }] } });
  await prisma.availabilityWindow.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await prisma.blockedWindow.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await prisma.bookingRule.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await prisma.resource.deleteMany({ where: { resourcePoolId: { in: poolIds } } });
  await prisma.resourcePool.deleteMany({ where: { id: { in: poolIds } } });
  await prisma.roleAssignment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { branchId: { in: branchIds } }] } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: userIds } }, { tenantId, phone: { in: ['+919999999999', '+919888888888', '+919777777777'] } }] } });
  await prisma.branch.deleteMany({ where: { tenantId, OR: [{ id: { in: branchIds } }, { name: { in: branchNames } }] } });
}

async function main() {
  console.log('--- Admin Web local seed ---');
  await cleanSeededData();

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

  for (const branch of branches) {
    await prisma.branch.create({
      data: {
        id: branch.id,
        tenantId,
        name: branch.name,
        address: branch.address,
        status: 'ACTIVE',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        workingHoursStart: branch.workingHoursStart,
        workingHoursEnd: branch.workingHoursEnd,
        aboutDescription: `${branch.name} seeded for Admin Web verification.`,
        facilities: ['Parking', 'Showers', 'Locker Rooms'],
        photos: [],
      },
    });
  }

  await prisma.user.create({ data: { id: ownerUserId, tenantId, phone: '+919999999999', email: 'admin-owner@example.com', isPhoneVerified: true, userType: 'MEMBER' } });
  await prisma.user.create({ data: { id: memberUserId, tenantId, phone: '+919888888888', email: 'seed-member-one@example.com', isPhoneVerified: true, userType: 'MEMBER' } });
  await prisma.user.create({ data: { id: secondMemberUserId, tenantId, phone: '+919777777777', email: 'seed-member-two@example.com', isPhoneVerified: true, userType: 'MEMBER' } });
  await prisma.roleAssignment.create({ data: { id: 'admin-seed-role-owner', userId: ownerUserId, tenantId, role: 'OWNER' } });

  for (const pool of pools) {
    await prisma.resourcePool.create({
      data: {
        id: pool.id,
        tenantId,
        branchId: pool.branchId,
        name: pool.name,
        allocationMode: pool.allocationMode,
        capacity: pool.capacity,
        minOccupancy: pool.minOccupancy,
        minBookingDurationMinutes: 60,
        pricingMode: pool.pricingMode,
        defaultRate: pool.defaultRate,
        basePrice: pool.defaultRate,
      },
    });
    await prisma.bookingRule.create({
      data: {
        resourcePoolId: pool.id,
        memberWindowDays: 30,
        guestOpenWindowDays: 7,
        gracePeriodMinutes: 30,
        guestAccessCutoffMinutes: 120,
        lowOccupancyThresholdPct: pool.minOccupancy > 3 ? 60 : 40,
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
  }

  const negotiatedPoolId = 'admin-seed-pool-main-premium';
  for (let idx = 0; idx < 4; idx++) {
    const startTime = alignedLocalHour(1, 16 + idx);
    await prisma.availabilityWindow.create({
      data: {
        id: `admin-seed-window-main-premium-${idx + 1}`,
        resourcePoolId: negotiatedPoolId,
        startTime,
        endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
        capacity: 6,
      },
    });
  }

  await prisma.memberGroupAssignment.create({
    data: {
      id: 'admin-seed-existing-assignment',
      userId: secondMemberUserId,
      resourcePoolId: 'admin-seed-pool-peelamedu-courts',
      daysOfWeek: '2,4',
      startTime: '19:00',
      status: 'ACTIVE',
    },
  });

  console.log('Seeded tenant: courtowner1 / Elite Courts');
  console.log('Owner login phone: 9999999999, OTP: 123456');
  console.log('Lookup member phones: 9888888888, 9777777777');
  console.log('Branches:', branches.map((branch) => branch.name).join(', '));
  console.log('Pools:', pools.map((pool) => pool.name).join(', '));
  console.log('Negotiated windows seeded on Main Arena Premium Courts for tomorrow at 16:00-20:00 local time.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Admin Web seed failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
