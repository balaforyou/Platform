import path from 'path';
import { startServices, stopServices, runSections, allPassed, SERVICE_PORTS } from '@badminton/test-harness';
import { db, setupBaseFixtures, internalKey, tenantUrl, TenantContext } from './_fixtures';

// EXPLICIT SECTION REGISTRY — never a directory scan. `_fixtures.ts` is a helper
// module imported by the section files and can never be run as a section.
import { branchLifecycleSections } from './branch-lifecycle.regression';
import { roleScopingSections } from './role-scoping.regression';
import { moduleEntitlementSections } from './module-entitlement.regression';
import { guestPricingSections } from './guest-pricing.regression';

async function main() {
  console.log('Starting local servers (Slot Engine, Identity & Auth, Tenant Management)...');

  const services = await startServices([
    {
      name: 'slot-engine',
      entry: path.join(__dirname, '../../../slot-engine/dist/index.js'),
      port: SERVICE_PORTS.slotEngine,
    },
    {
      name: 'identity-auth',
      entry: path.join(__dirname, '../../../identity-auth/dist/index.js'),
      port: SERVICE_PORTS.identityAuth,
      env: { INTERNAL_SERVICE_KEY: internalKey, TENANT_SERVICE_URL: tenantUrl },
    },
    {
      name: 'tenant-management',
      entry: path.join(__dirname, '../index.js'),
      port: SERVICE_PORTS.tenantManagement,
      env: { INTERNAL_SERVICE_KEY: internalKey },
    },
  ]);

  let passed = false;
  try {
    const context: TenantContext = await setupBaseFixtures();

    // Order matters: branch-lifecycle creates Branch A, which role-scoping reuses.
    const results = await runSections<TenantContext>(
      'tenant-management',
      [...branchLifecycleSections, ...roleScopingSections, ...moduleEntitlementSections, ...guestPricingSections],
      context,
    );
    passed = allPassed(results);
  } catch (err) {
    console.error('tenant-management regression suite failed to run:', err);
  } finally {
    stopServices(services);
    await db.$disconnect();
  }

  process.exit(passed ? 0 : 1);
}

main();
