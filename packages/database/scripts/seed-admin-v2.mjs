#!/usr/bin/env node
/**
 * Seed the admin-v2 Slice 1 test admin into a real database, from inside the `migrate`
 * container.
 *
 * WHY THIS LIVES HERE and not in apps/: `Dockerfile.node-service` (the migrate image)
 * COPYs `packages` + `services`, not `apps` — so `apps/admin-v2/tests/seed-admin-v2-data.mjs`
 * is unreachable there. This is the sibling of `verify-build-sha.mjs` / `copy-client.js`,
 * runnable the same way the migrate flow runs those.
 *
 * WHAT IT DOES: upserts ONE User (balaforyou@gmail.com, STAFF) + ONE RoleAssignment
 * (OWNER, branchId = null) on the JBC tenant only — no courtowner1, no other tenant.
 * Idempotent (findFirst -> create/update, same shape as the fixed
 * apps/admin-v2/tests/seed-admin-v2-data.mjs, d55524e): re-running updates in place, never
 * errors. NOT `roleAssignment.upsert` — Prisma 5.14 rejects `branchId: null` in the
 * compound-unique where input even though the real index is NULLS NOT DISTINCT
 * (schema.prisma:111-117 / F-115).
 *
 * F-077 GUARD: this writes to a real DB, so — exactly like the migrate command
 * (`node scripts/verify-build-sha.mjs && prisma migrate deploy`) — it runs
 * verify-build-sha.mjs first and refuses if the image is stale or unverifiable. The
 * deploy must `export GIT_SHA=<sha>` so the migrate service's `EXPECTED_GIT_SHA` is set,
 * same as promote.sh does. A local test run sets BUILD_GIT_SHA + EXPECTED_GIT_SHA to a
 * matching dummy.
 *
 * ENV: reads DATABASE_URL straight from process.env — no dotenv-cli. `docker compose run`
 * supplies it via the migrate service's `env_file: .env`.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ADMIN_EMAIL = 'balaforyou@gmail.com';
const JBC_SUBDOMAIN = 'jbc';

const here = dirname(fileURLToPath(import.meta.url));

// ── F-077 guard — same check, same wiring as the migrate flow ────────────────────
const guard = spawnSync(process.execPath, [resolve(here, 'verify-build-sha.mjs')], {
  stdio: 'inherit',
});
if (guard.status !== 0) {
  console.error('\n[seed-admin-v2] F-077 guard failed — refusing to touch the database. See above.');
  process.exit(guard.status ?? 1);
}

if (!process.env.DATABASE_URL) {
  console.error('[seed-admin-v2] DATABASE_URL is not set.');
  process.exit(1);
}

const { PrismaClient } = await import('../dist/index.js');
const prisma = new PrismaClient();

async function main() {
  console.log('\n--- Admin-v2 Slice 1 seed (production-capable) ---');

  const jbc = await prisma.tenant.findFirst({ where: { subdomain: JBC_SUBDOMAIN } });
  if (!jbc) {
    throw new Error(
      `No tenant with subdomain "${JBC_SUBDOMAIN}" in this database — refusing to guess. ` +
        'Provision the JBC tenant first; this script does not create it.',
    );
  }

  const existingUser = await prisma.user.findFirst({
    where: { tenantId: jbc.id, email: ADMIN_EMAIL },
  });
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: { userType: 'STAFF', isEmailVerified: true },
      })
    : await prisma.user.create({
        data: { tenantId: jbc.id, email: ADMIN_EMAIL, userType: 'STAFF', isEmailVerified: true },
      });
  const userAction = existingUser ? 'already existed (updated in place)' : 'CREATED';

  const existingRole = await prisma.roleAssignment.findFirst({
    where: { userId: user.id, tenantId: jbc.id, branchId: null },
  });
  const role = existingRole
    ? await prisma.roleAssignment.update({ where: { id: existingRole.id }, data: { role: 'OWNER' } })
    : await prisma.roleAssignment.create({
        data: { userId: user.id, tenantId: jbc.id, branchId: null, role: 'OWNER' },
      });
  const roleAction = existingRole ? 'already existed (updated in place)' : 'CREATED';

  console.log('');
  console.log(`  Tenant : ${jbc.name}  (subdomain=${jbc.subdomain})`);
  console.log(`           id ${jbc.id}`);
  console.log(`  User   : ${user.email}  userType=${user.userType}  ${userAction}`);
  console.log(`           id ${user.id}`);
  console.log(`  Role   : ${role.role}  branchId=${role.branchId ?? 'null'}  ${roleAction}`);
  console.log(`           id ${role.id}`);
  console.log('');
  console.log('  Verify:  POST /api/identity/auth/admin/google/verify with a real Google');
  console.log(`           ID token for ${ADMIN_EMAIL} should now return an accessToken.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('\n[seed-admin-v2] FAILED:', error?.message ?? error);
    prisma.$disconnect();
    process.exit(1);
  });
