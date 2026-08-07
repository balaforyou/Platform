import path from 'path';
import { startServices, stopServices, runSections, allPassed, SERVICE_PORTS } from '@badminton/test-harness';
import { db, setupBaseFixtures, internalKey, IdentityContext } from './_fixtures';

// EXPLICIT SECTION REGISTRY — never a directory scan.
// Only files listed here run. `_fixtures.ts` is imported as a helper module by the
// section files themselves and can therefore never be executed as a section,
// regardless of naming convention.
import { otpFlowSections } from './otp-flow.regression';
import { jwtSessionSections } from './jwt-session.regression';
import { adminPhoneLookupSections } from './admin-phone-lookup.regression';

async function main() {
  console.log('Starting local Identity & Auth and Slot Engine servers...');

  const services = await startServices([
    {
      name: 'slot-engine',
      entry: path.join(__dirname, '../../../slot-engine/dist/index.js'),
      port: SERVICE_PORTS.slotEngine,
    },
    {
      name: 'identity-auth',
      entry: path.join(__dirname, '../index.js'),
      port: SERVICE_PORTS.identityAuth,
      env: { INTERNAL_SERVICE_KEY: internalKey },
    },
  ]);

  let passed = false;
  try {
    const context: IdentityContext = await setupBaseFixtures();

    // Order matters: otp-flow registers the user whose session jwt-session rotates.
    const results = await runSections<IdentityContext>(
      'identity-auth',
      [...otpFlowSections, ...jwtSessionSections, ...adminPhoneLookupSections],
      context,
    );
    passed = allPassed(results);
  } catch (err) {
    console.error('identity-auth regression suite failed to run:', err);
  } finally {
    stopServices(services);
    await db.$disconnect();
  }

  process.exit(passed ? 0 : 1);
}

main();
