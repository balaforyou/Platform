import { PrismaClient } from '@badminton/database';

// WHY: Shared Prisma instance for the queue module — tests import this
//      module directly without starting the HTTP server.
const prisma = new PrismaClient();

// WHY: Retry backoff schedule (per spec):
//   Attempt 1 (initial): immediate. On fail → +1 min.
//   Attempt 2 (retry 1): after 1 min. On fail → +5 min.
//   Attempt 3 (retry 2): after 5 min. On fail → +15 min.
//   Attempt 4 (retry 3): after 15 min. On fail → dead_letter.
const RETRY_DELAYS_MS = [1 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

// WHY: Mock provider. In production these are MSG91 and FCM SDK calls.
//      Setting variables.fail_me = true forces failure deterministically in tests.
async function mockDispatch(channel: string, destination: string, variables: any): Promise<string> {
  if (variables?.fail_me) {
    throw new Error(`Mock provider failure for channel=${channel}`);
  }
  const ref = `mock-${channel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[MOCK ${channel.toUpperCase()} SEND] to=${destination} ref=${ref}`);
  return ref;
}

/**
 * Processes all pending NotificationRequests whose retryAfter is in the past (or null).
 * Exported so the test suite can call it synchronously for deterministic retry testing.
 */
export async function processQueue(): Promise<void> {
  const now = new Date();
  const pending = await prisma.notificationRequest.findMany({
    where: {
      status: 'queued',
      OR: [{ retryAfter: null }, { retryAfter: { lte: now } }],
    },
    take: 50,
  });

  for (const req of pending) {
    const attempt = req.attempts + 1;
    try {
      const ref = await mockDispatch(req.channel, req.recipient, req.variables);
      await prisma.notificationRequest.update({
        where: { id: req.id },
        data: { status: 'sent', attempts: attempt, providerRef: ref, retryAfter: null },
      });
    } catch (err: any) {
      if (attempt >= 4) {
        // WHY: All backoff intervals exhausted — transition to dead_letter (terminal state).
        await prisma.notificationRequest.update({
          where: { id: req.id },
          data: {
            status: 'dead_letter',
            attempts: attempt,
            errorMessage: err?.message ?? 'Unknown dispatch error',
            retryAfter: null,
          },
        });
        console.error(`[DEAD-LETTER] NotificationRequest ${req.id} exhausted retries: ${err?.message}`);
      } else {
        // WHY: Schedule next retry using the exponential backoff table.
        const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        const retryAfter = new Date(now.getTime() + delayMs);
        await prisma.notificationRequest.update({
          where: { id: req.id },
          data: {
            status: 'queued',
            attempts: attempt,
            retryAfter,
            errorMessage: err?.message ?? 'Unknown dispatch error',
          },
        });
        console.warn(`[RETRY] NotificationRequest ${req.id} attempt ${attempt} failed, retry at ${retryAfter.toISOString()}`);
      }
    }
  }
}

export { prisma };
