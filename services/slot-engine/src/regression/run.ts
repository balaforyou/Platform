import path from 'path';
import { startServices, stopServices, runSections, allPassed, SERVICE_PORTS } from '@badminton/test-harness';
import { disconnectAvailabilityGenerationPrisma } from '../availabilityGeneration.js';
import { db, setupBaseFixtures, SlotEngineContext } from './_fixtures';

// EXPLICIT SECTION REGISTRY — never a directory scan. `_fixtures.ts` is imported
// as a helper module by the section files and can never be run as a section.
import { adminOperationsSections } from './admin-operations.regression';
import { guestBookingSections } from './guest-booking.regression';
import { lowOccupancyReleaseSections } from './low-occupancy-release.regression';
import { memberFlowSections } from './member-flow.regression';
import { availabilityGenerationSections } from './availability-generation.regression';
import { availabilityGenerationApiSections } from './availability-generation-api.regression';
import { coPlayerAndAlignmentSections } from './co-player-and-alignment.regression';
import { multiSlotBookingSections } from './multi-slot-booking.regression';
import { dailyBookingCapSections } from './daily-booking-cap.regression';
import { courtSlotIndexSections } from './court-slot-index.regression';

async function main() {
  console.log('Starting local Slot Engine server...');

  const services = await startServices([
    {
      name: 'slot-engine',
      entry: path.join(__dirname, '../index.js'),
      port: SERVICE_PORTS.slotEngine,
    },
  ]);

  let passed = false;
  try {
    const context: SlotEngineContext = await setupBaseFixtures();

    // ORDER IS DELIBERATE and mirrors the pre-consolidation concurrency.test.ts
    // execution order (Test 0 → 1-4 → 5-6 → 7). Sections share the seeded pools
    // and mutate booking rows, so this is the sequence proven to pass. The
    // availability-generation sections are self-contained (own tenant ids) and
    // run last, followed by the two scenarios migrated out of Playwright.
    const results = await runSections<SlotEngineContext>(
      'slot-engine',
      [
        ...adminOperationsSections,
        ...guestBookingSections,
        ...lowOccupancyReleaseSections,
        ...memberFlowSections,
        ...availabilityGenerationSections,
        ...availabilityGenerationApiSections,
        ...coPlayerAndAlignmentSections,
        ...multiSlotBookingSections,
        ...dailyBookingCapSections,
        ...courtSlotIndexSections,
      ],
      context,
    );
    passed = allPassed(results);
  } catch (err) {
    console.error('slot-engine regression suite failed to run:', err);
  } finally {
    stopServices(services);
    await disconnectAvailabilityGenerationPrisma();
    await db.$disconnect();
  }

  process.exit(passed ? 0 : 1);
}

main();
