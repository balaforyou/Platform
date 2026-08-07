import { Section, assert } from '@badminton/test-harness';
import { processQueue } from '../queue.js';
import { db, notificationUrl, internalKey, NotificationContext } from './_fixtures';

/**
 * RETRY / BACKOFF / DEAD-LETTER MECHANICS.
 * Migrated verbatim from notification.test.ts Test 4.
 *
 * Uses the `fail_me` sentinel variable so the mock provider fails
 * deterministically, then drives retryAfter into the past to force each
 * subsequent attempt without waiting out the real backoff.
 */
export const retryAndDeadLetterSections: Section<NotificationContext>[] = [
  {
    name: 'Retry → dead_letter cycle (3 retries stay queued, 4th attempt dead-letters)',
    async run(ctx) {
      await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ctx.userId, token: 'fcm-fail-token-xyz' }),
      });

      const failSendRes = await fetch(`${notificationUrl}/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({
          tenantId: ctx.tenantId,
          recipient: '+919999999999', // literal phone — no Identity lookup needed
          event_type: 'group_invite', // policy: ['sms'] — single channel
          variables: { fail_me: true, groupId: 'grp-001' },
        }),
      });
      assert(failSendRes.status === 202, `Expected 202, got ${failSendRes.status}`);
      const failBody = (await failSendRes.json()) as any;
      const requests4 = failBody.data?.requests ?? failBody.requests;
      const failReqId = requests4[0].id;
      console.log(`Created failing request id=${failReqId}`);

      const forceRetryNow = async (id: string) => {
        await db.notificationRequest.update({
          where: { id },
          data: { retryAfter: new Date(Date.now() - 1000) },
        });
      };

      // Attempt 1 — already queued with no retryAfter.
      await processQueue();
      let rec = await db.notificationRequest.findUnique({ where: { id: failReqId } });
      assert(
        rec?.attempts === 1 && rec?.status === 'queued',
        `After attempt 1: expected queued/1, got ${rec?.status}/${rec?.attempts}`,
      );
      console.log(`After attempt 1: status=${rec?.status} attempts=${rec?.attempts} retryAfter=${rec?.retryAfter}`);

      await forceRetryNow(failReqId);
      await processQueue();
      rec = await db.notificationRequest.findUnique({ where: { id: failReqId } });
      assert(
        rec?.attempts === 2 && rec?.status === 'queued',
        `After attempt 2: expected queued/2, got ${rec?.status}/${rec?.attempts}`,
      );
      console.log(`After attempt 2: status=${rec?.status} attempts=${rec?.attempts}`);

      await forceRetryNow(failReqId);
      await processQueue();
      rec = await db.notificationRequest.findUnique({ where: { id: failReqId } });
      assert(
        rec?.attempts === 3 && rec?.status === 'queued',
        `After attempt 3: expected queued/3, got ${rec?.status}/${rec?.attempts}`,
      );
      console.log(`After attempt 3: status=${rec?.status} attempts=${rec?.attempts}`);

      // Attempt 4 exhausts the retry budget.
      await forceRetryNow(failReqId);
      await processQueue();
      rec = await db.notificationRequest.findUnique({ where: { id: failReqId } });
      assert(rec?.status === 'dead_letter', `After attempt 4: expected dead_letter, got ${rec?.status}`);
      assert(rec?.attempts === 4, `Expected 4 total attempts, got ${rec?.attempts}`);
      console.log(
        `After attempt 4: status=${rec?.status} attempts=${rec?.attempts} errorMessage=${rec?.errorMessage}`,
      );
    },
  },
];
