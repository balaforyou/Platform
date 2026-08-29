import { PrismaClient } from '../../../packages/database/dist/index.js';

// Admin-v2 Slice 1 seed — the one test admin the acceptance criteria need:
// balaforyou@gmail.com, STAFF, OWNER of JBC (branchId = null, per the F-115 owner-row
// shape), JBC tenant only (no courtowner1 RoleAssignment — keeps this account clear of
// the multiple_tenant_match fail-closed path, per the signed plan's post-sign-off addendum).
//
// JBC's tenant UUID is resolved at runtime by subdomain, never hardcoded — this script
// is generic and runs against whatever database `.env` points at.

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'balaforyou@gmail.com';
const JBC_SUBDOMAIN = 'jbc';

async function main() {
  console.log('--- Admin-v2 Slice 1 seed ---');

  const jbc = await prisma.tenant.findFirst({ where: { subdomain: JBC_SUBDOMAIN } });
  if (!jbc) {
    throw new Error(
      `No tenant with subdomain "${JBC_SUBDOMAIN}" in this database. ` +
        'Provision the JBC tenant first (this seed does not create it).',
    );
  }

  const user = await prisma.user.upsert({
    where: { email_tenantId: { email: ADMIN_EMAIL, tenantId: jbc.id } },
    update: { userType: 'STAFF', isEmailVerified: true },
    create: {
      tenantId: jbc.id,
      email: ADMIN_EMAIL,
      userType: 'STAFF',
      isEmailVerified: true,
    },
  });

  const role = await prisma.roleAssignment.upsert({
    where: {
      userId_tenantId_branchId: { userId: user.id, tenantId: jbc.id, branchId: null },
    },
    update: { role: 'OWNER' },
    create: { userId: user.id, tenantId: jbc.id, branchId: null, role: 'OWNER' },
  });

  console.log(`Tenant:  ${jbc.name} (${jbc.subdomain}) — ${jbc.id}`);
  console.log(`User:    ${user.email} — ${user.id} — userType=${user.userType}`);
  console.log(`Role:    ${role.role} (branchId=${role.branchId ?? 'null'})`);
  console.log('');
  console.log('Dev login token for CI/e2e / local:  dev-admin-token-balaforyou@gmail.com');
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Admin-v2 seed failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
