import { Section } from '@badminton/test-harness';
import {
  db,
  notificationUrl,
  paymentUrl,
  webhookSecret,
  generateRazorpaySignature,
  NotificationContext,
} from './_fixtures';

/**
 * THE ACCEPTANCE-BAR TEST — Payment ↔ Notification wiring, end to end.
 * Migrated verbatim from notification.test.ts Test 5.
 *
 * Kept in its own file (rather than folded into dispatch-and-routing) because
 * it is the only section proving the two services actually talk to each other:
 * a real signed Razorpay webhook hits Payment, and real NotificationRequest
 * rows must appear as a result.
 */
export const crossServiceE2eSections: Section<NotificationContext>[] = [
  {
    name: 'Payment subscription.charge_failed webhook creates real push+sms NotificationRequests and suspends the subscription',
    async run(ctx) {
      const mandateId = 'sub_e2e_test_mandate_001';
      const sub = await db.subscription.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          mandateId,
          amount: 29900,
          frequency: 'monthly',
          status: 'active',
        },
      });
      console.log(`Created subscription id=${sub.id}, mandateId=${sub.mandateId}`);

      // subscription_charge_failed policy = ['push','sms']; without a device
      // token there would be no push destination and no row would be created.
      await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ctx.userId, token: 'fcm-sub-fail-test-token' }),
      });
      console.log('Device token registered for subscription failure test');

      const subCheck = await db.subscription.findUnique({ where: { mandateId } });
      if (!subCheck) {
        throw new Error(`Subscription with mandateId=${mandateId} not found in DB — test setup failed`);
      }
      console.log(`Subscription pre-check: found id=${subCheck.id} status=${subCheck.status}`);

      const webhookPayload = JSON.stringify({
        id: `evt_e2e_charge_fail_${Date.now()}`, // unique — passes the idempotency gate
        event: 'subscription.charge_failed',
        payload: { subscription: { entity: { id: mandateId } } },
      });
      const sig = generateRazorpaySignature(webhookPayload, webhookSecret);

      const countBefore = await db.notificationRequest.count({
        where: { eventType: 'subscription_charge_failed' },
      });

      const webhookRes = await fetch(`${paymentUrl}/webhooks/razorpay/autopay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
        body: webhookPayload,
      });

      const webhookRespBody = (await webhookRes.json()) as any;
      console.log(`Webhook response: ${webhookRes.status}`, JSON.stringify(webhookRespBody));
      if (![200, 202].includes(webhookRes.status)) {
        throw new Error(`Expected 2xx from webhook, got ${webhookRes.status}`);
      }
      if (webhookRespBody?.data?.duplicated || webhookRespBody?.duplicated) {
        throw new Error('Webhook was treated as duplicate — clean DB before re-running');
      }

      // Payment dispatches the notification fire-and-forget; allow the
      // Payment→Notification round-trip and DB write to land.
      await new Promise((r) => setTimeout(r, 3000));

      const notifRecords = await db.notificationRequest.findMany({
        where: { eventType: 'subscription_charge_failed' },
        orderBy: { createdAt: 'desc' },
      });

      const countAfter = notifRecords.length;
      if (countAfter <= countBefore) {
        throw new Error(
          `Expected new NotificationRequest(s) after webhook — before=${countBefore} after=${countAfter}`,
        );
      }

      console.log('\n=== NotificationRequests from Payment<->Notification wiring ===');
      console.log(
        JSON.stringify(
          notifRecords.map((r) => ({
            id: r.id,
            tenantId: r.tenantId,
            eventType: r.eventType,
            channel: r.channel,
            recipient: r.recipient,
            status: r.status,
            attempts: r.attempts,
            variables: r.variables,
            createdAt: r.createdAt,
          })),
          null,
          2,
        ),
      );
      console.log('=============================================================\n');

      const pushRecord = notifRecords.find((r) => r.channel === 'push');
      const smsRecord = notifRecords.find((r) => r.channel === 'sms');
      if (!pushRecord) {
        throw new Error('Expected a push NotificationRequest record for subscription_charge_failed');
      }
      if (!smsRecord) {
        throw new Error('Expected an SMS NotificationRequest record for subscription_charge_failed');
      }

      const updatedSub = await db.subscription.findUnique({ where: { id: sub.id } });
      if (updatedSub?.status !== 'suspended') {
        throw new Error(`Expected subscription suspended, got ${updatedSub?.status}`);
      }
      console.log(`Subscription status after failed charge: ${updatedSub?.status}`);
    },
  },
];
