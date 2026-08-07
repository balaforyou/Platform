import path from 'path';
import { startServices, stopServices, runSections, allPassed, SERVICE_PORTS } from '@badminton/test-harness';
import { db, setupBaseFixtures, internalKey, webhookSecret, PaymentContext } from './_fixtures';

// EXPLICIT SECTION REGISTRY — never a directory scan. `_fixtures.ts` is a helper
// module imported by the section files and can never be run as a section.
import { priceIntegritySections } from './price-integrity.regression';
import { webhookSignatureAndIdempotencySections } from './webhook-signature-and-idempotency.regression';
import { autopayAndRefundSections } from './autopay-and-refund.regression';
import { negotiatedLinkSections } from './negotiated-link.regression';

async function main() {
  console.log('Starting local servers (Slot Engine, Identity & Auth, Payment)...');

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
      env: { INTERNAL_SERVICE_KEY: internalKey },
    },
    {
      name: 'payment',
      entry: path.join(__dirname, '../index.js'),
      port: SERVICE_PORTS.payment,
      env: { INTERNAL_SERVICE_KEY: internalKey, RAZORPAY_WEBHOOK_SECRET: webhookSecret },
    },
  ]);

  let passed = false;
  try {
    const context: PaymentContext = await setupBaseFixtures();

    // ORDER IS DELIBERATE: the webhook section confirms the booking that the
    // refund section then cancels and refunds — the same chain the original
    // payment.test.ts relied on (Test 4 → Test 7).
    const results = await runSections<PaymentContext>(
      'payment',
      [
        ...priceIntegritySections,
        ...webhookSignatureAndIdempotencySections,
        ...autopayAndRefundSections,
        ...negotiatedLinkSections,
      ],
      context,
    );
    passed = allPassed(results);
  } catch (err) {
    console.error('payment regression suite failed to run:', err);
  } finally {
    stopServices(services);
    await db.$disconnect();
  }

  process.exit(passed ? 0 : 1);
}

main();
