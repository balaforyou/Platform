import path from 'path';
import { startServices, stopServices, runSections, allPassed, SERVICE_PORTS } from '@badminton/test-harness';
import {
  db,
  setupBaseFixtures,
  internalKey,
  webhookSecret,
  notificationUrl,
  identityUrl,
  NotificationContext,
} from './_fixtures';

// EXPLICIT SECTION REGISTRY — never a directory scan. `_fixtures.ts` is a helper
// module imported by the section files and can never be run as a section.
import { dispatchAndRoutingSections } from './dispatch-and-routing.regression';
import { retryAndDeadLetterSections } from './retry-and-dead-letter.regression';
import { crossServiceE2eSections } from './cross-service-e2e.regression';

async function main() {
  console.log('Starting local servers (Identity & Auth, Payment, Notification)...');

  // NOTE: the pre-consolidation notification.test.ts spawned NOTHING — it assumed
  // the operator had already started these services by hand, which is why it was
  // easy to run "successfully" against a stale or missing stack. The suite now
  // owns its own process lifecycle like every other service's suite.
  const services = await startServices([
    {
      name: 'identity-auth',
      entry: path.join(__dirname, '../../../identity-auth/dist/index.js'),
      port: SERVICE_PORTS.identityAuth,
      env: { INTERNAL_SERVICE_KEY: internalKey },
    },
    {
      name: 'payment',
      entry: path.join(__dirname, '../../../payment/dist/index.js'),
      port: SERVICE_PORTS.payment,
      env: {
        INTERNAL_SERVICE_KEY: internalKey,
        RAZORPAY_WEBHOOK_SECRET: webhookSecret,
        NOTIFICATION_SERVICE_URL: notificationUrl,
      },
    },
    {
      name: 'notification',
      entry: path.join(__dirname, '../index.js'),
      port: SERVICE_PORTS.notification,
      env: { INTERNAL_SERVICE_KEY: internalKey, IDENTITY_SERVICE_URL: identityUrl },
    },
  ]);

  let passed = false;
  try {
    const context: NotificationContext = await setupBaseFixtures();

    const results = await runSections<NotificationContext>(
      'notification',
      [...dispatchAndRoutingSections, ...retryAndDeadLetterSections, ...crossServiceE2eSections],
      context,
    );
    passed = allPassed(results);
  } catch (err) {
    console.error('notification regression suite failed to run:', err);
  } finally {
    stopServices(services);
    await db.$disconnect();
  }

  process.exit(passed ? 0 : 1);
}

main();
