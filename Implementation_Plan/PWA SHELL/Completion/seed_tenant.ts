import { PrismaClient } from '@badminton/database';

const prisma = new PrismaClient();

async function main() {
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const subdomain = 'courtowner1';

  console.log('Seeding courtowner1 tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {
      name: 'Elite Court Rentals',
      subdomain,
      appName: 'Elite Courts',
      themeColor: '#e11d48', // rose-600
      logo: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=150&auto=format&fit=crop',
      plan: 'basic',
      status: 'active',
    },
    create: {
      id: tenantId,
      name: 'Elite Court Rentals',
      subdomain,
      appName: 'Elite Courts',
      themeColor: '#e11d48',
      logo: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=150&auto=format&fit=crop',
      plan: 'basic',
      status: 'active',
    },
  });

  console.log('Seeded Tenant:', JSON.stringify(tenant, null, 2));

  // Seed the branch too if needed for later phases
  const branchId = '22222222-2222-2222-2222-222222222222';
  const branch = await prisma.branch.upsert({
    where: { id: branchId },
    update: {
      name: 'Coimbatore Main Arena',
      address: 'Coimbatore, India',
      status: 'ACTIVE',
    },
    create: {
      id: branchId,
      tenantId,
      name: 'Coimbatore Main Arena',
      address: 'Coimbatore, India',
      status: 'ACTIVE',
    },
  });

  console.log('Seeded Branch:', JSON.stringify(branch, null, 2));

  // Seed the test user
  const userId = '33333333-3333-3333-3333-333333333333';
  const user = await prisma.user.upsert({
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

  console.log('Seeded User:', JSON.stringify(user, null, 2));

  // Create role assignment for the user (MEMBER / OWNER)
  // Let's make this test user a tenant OWNER for our verification dashboard display!
  const assignment = await prisma.roleAssignment.upsert({
    where: { id: 'assignment-id-e2e-001' },
    update: {
      userId,
      tenantId,
      role: 'OWNER',
    },
    create: {
      id: 'assignment-id-e2e-001',
      userId,
      tenantId,
      role: 'OWNER',
    },
  });

  console.log('Seeded Role Assignment:', JSON.stringify(assignment, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
