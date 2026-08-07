import { Section, assert } from '@badminton/test-harness';
import { processQueue } from '../queue.js';
import { db, notificationUrl, paymentUrl, internalKey, NotificationContext } from './_fixtures';

/**
 * CHANNEL POLICY ROUTING AND TEMPLATE STORAGE.
 * Migrated from notification.test.ts Tests 1, 2, 3, 6 and the trailing
 * payment-health regression check.
 *
 * NOTE ON STRICTNESS: the original file used `console.assert(...)` for several
 * of these checks, which only prints and never fails a run. They are real
 * throwing assertions here — same conditions, now actually enforced.
 */
export const dispatchAndRoutingSections: Section<NotificationContext>[] = [
  {
    name: 'Notification service health check',
    async run() {
      const healthRes = await fetch(`${notificationUrl}/health`);
      assert(healthRes.ok, `Health check should return 200, got ${healthRes.status}`);
      const health = (await healthRes.json()) as any;
      console.log('Health:', JSON.stringify(health));
      assert(
        health.data?.service === 'notification' || health.service === 'notification',
        'Service name should be notification',
      );
    },
  },

  {
    name: 'Push-preferred routing (push_or_sms targets the device token, dispatches to sent)',
    async run(ctx) {
      const regRes = await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ctx.userId, token: 'fcm-test-token-abc123' }),
      });
      assert(regRes.ok, `Device register should succeed, got ${regRes.status}`);

      const sendRes = await fetch(`${notificationUrl}/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({
          tenantId: ctx.tenantId,
          recipient: ctx.userId,
          event_type: 'booking_confirmed',
          variables: { bookingId: 'bk-test-001' },
        }),
      });
      assert(sendRes.status === 202, `Expected 202, got ${sendRes.status}`);
      const sendBody = (await sendRes.json()) as any;
      const requests2 = sendBody.data?.requests ?? sendBody.requests;
      console.log(
        'Queued requests:',
        JSON.stringify(requests2.map((r: any) => ({ channel: r.channel, recipient: r.recipient, status: r.status }))),
      );

      const pushRequest = requests2.find((r: any) => r.channel === 'push');
      assert(pushRequest !== undefined, 'Should have queued a push notification');
      assert(pushRequest.recipient === 'fcm-test-token-abc123', 'Push should target the device token');

      // Run the worker synchronously for deterministic assertions.
      await processQueue();

      const sentRecord = await db.notificationRequest.findUnique({ where: { id: pushRequest.id } });
      assert(sentRecord?.status === 'sent', `Expected status=sent, got ${sentRecord?.status}`);
      assert(
        Boolean(sentRecord?.providerRef?.startsWith('mock-push')),
        `Should have a mock provider ref, got ${sentRecord?.providerRef}`,
      );
      console.log(
        'NotificationRequest after dispatch:',
        JSON.stringify({
          id: sentRecord?.id,
          channel: sentRecord?.channel,
          status: sentRecord?.status,
          providerRef: sentRecord?.providerRef,
          attempts: sentRecord?.attempts,
        }),
      );
    },
  },

  {
    name: 'Dual-channel routing (slot_release_reminder queues BOTH push and sms)',
    async run(ctx) {
      const dualSendRes = await fetch(`${notificationUrl}/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({
          tenantId: ctx.tenantId,
          recipient: ctx.userId,
          event_type: 'slot_release_reminder',
          variables: { slotId: 'sl-001', releaseTime: '2026-08-01T10:00:00Z' },
        }),
      });
      assert(dualSendRes.status === 202, `Expected 202, got ${dualSendRes.status}`);
      const dualBody = (await dualSendRes.json()) as any;
      const requests3 = dualBody.data?.requests ?? dualBody.requests;
      console.log(
        'Dual-channel queued:',
        JSON.stringify(requests3.map((r: any) => ({ channel: r.channel, recipient: r.recipient }))),
      );

      // slot_release_reminder is time-critical: policy requires both channels.
      const pushReq = requests3.find((r: any) => r.channel === 'push');
      const smsReq = requests3.find((r: any) => r.channel === 'sms');
      if (!pushReq) throw new Error('Push channel should be queued for slot_release_reminder (dual routing failed)');
      if (!smsReq) throw new Error('SMS channel should be queued for slot_release_reminder (dual routing failed)');
    },
  },

  {
    name: 'Template override storage (custom SMS body with {{venueName}} persists)',
    async run(ctx) {
      const tmplRes = await fetch(`${notificationUrl}/notifications/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: ctx.tenantId,
          channel: 'sms',
          eventType: 'booking_confirmed',
          templateBody: 'Your court at {{venueName}} is confirmed for {{slotTime}}.',
        }),
      });
      assert(tmplRes.ok, `Template upsert should succeed, got ${tmplRes.status}`);
      const tmplBody = (await tmplRes.json()) as any;
      const tmpl = tmplBody.data ?? tmplBody;
      console.log(
        'Template stored:',
        JSON.stringify({ id: tmpl?.id, channel: tmpl?.channel, eventType: tmpl?.eventType }),
      );

      const stored = await db.notificationTemplate.findFirst({
        where: { tenantId: ctx.tenantId, channel: 'sms', eventType: 'booking_confirmed' },
      });
      assert(
        Boolean(stored?.templateBody?.includes('{{venueName}}')),
        'Template body should be persisted with its placeholder',
      );
    },
  },

  {
    name: 'Regression check: Payment service still healthy after webhook-path changes',
    async run() {
      const paymentHealth = await fetch(`${paymentUrl}/health`);
      assert(paymentHealth.ok, `Payment service should be healthy, got ${paymentHealth.status}`);
      console.log(`Payment service health: ${paymentHealth.status}`);
    },
  },
];
