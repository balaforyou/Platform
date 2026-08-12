import fastify from 'fastify';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { processQueue, prisma } from './queue.js';

const server = fastify({ logger: true });

// WHY: Register the response envelope plugin globally so all success and error responses
// are automatically wrapped to follow the API standards.
server.register(responseEnvelopePlugin);

// ============================================================
// Channel policy matrix (per spec Section 5, resolved decisions)
// WHY: Centralised so it's easy to compare against the spec
//      and to override per-tenant in a future iteration.
// ============================================================
const CHANNEL_POLICY: Record<string, string[]> = {
  booking_confirmed:             ['push_or_sms'],
  refund_processed:              ['push_or_sms'],
  tournament_fixture_scheduled:  ['push_or_sms'],
  slot_release_reminder:         ['sms', 'push'],        // both — time-critical, cannot rely on push alone
  group_invite:                  ['sms'],                // SMS only — recipient may not be a registered app user
  payment_receipt:               ['email_or_sms'],
  subscription_charge_failed:    ['push', 'sms'],        // both — revenue-affecting, must land regardless of channel
  // WHY: Admin must not miss low occupancy — a missed alert means unreleased capacity and lost revenue.
  // Both push and sms are required (same rationale as subscription_charge_failed).
  low_occupancy_alert:           ['push', 'sms'],
};

// ============================================================
// Resolve channel list for an event, then queue requests.
// WHY: Resolves actual destinations based on the policy matrix.
//      Uses Identity service API (not direct DB read) for user
//      contact details to respect service ownership boundaries.
// ============================================================
async function resolveAndQueue(
  tenantId: string,
  recipient: string,
  eventType: string,
  variables: Record<string, any>,
) {
  const policy = CHANNEL_POLICY[eventType] ?? ['push_or_sms'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  const identityUrl = process.env.IDENTITY_SERVICE_URL || 'http://localhost:3002';

  let phone: string | null = null;
  let email: string | null = null;
  let pushTokens: string[] = [];

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(recipient);
  if (isUuid) {
    // WHY: Cross-service lookup via HTTP API — Notification service does not own the User table.
    try {
      const res = await fetch(`${identityUrl}/users/${recipient}`, {
        headers: { 'Authorization': `Bearer ${internalKey}` },
      });
      if (res.ok) {
        const body = await res.json() as any;
        const user = body.data ?? body;
        phone = user.phone ?? null;
        email = user.email ?? null;
      }
    } catch (e) {
      server.log.warn(`Could not resolve user contact from Identity: ${String(e)}`);
    }

    // DeviceToken is owned by this service — direct query is correct.
    const deviceTokens = await prisma.deviceToken.findMany({ where: { userId: recipient } });
    pushTokens = deviceTokens.map((d) => d.token);
  } else if (recipient.includes('@')) {
    email = recipient;
  } else {
    // Treat as a raw phone number literal
    phone = recipient;
  }

  const requests: Array<{ channel: string; destination: string }> = [];

  for (const rule of policy) {
    if (rule === 'push_or_sms') {
      if (pushTokens.length > 0) {
        pushTokens.forEach((t) => requests.push({ channel: 'push', destination: t }));
      } else if (phone) {
        requests.push({ channel: 'sms', destination: phone });
      }
    } else if (rule === 'email_or_sms') {
      if (email) {
        requests.push({ channel: 'email', destination: email });
      } else if (phone) {
        requests.push({ channel: 'sms', destination: phone });
      }
    } else if (rule === 'sms') {
      if (phone) requests.push({ channel: 'sms', destination: phone });
    } else if (rule === 'push') {
      pushTokens.forEach((t) => requests.push({ channel: 'push', destination: t }));
    }
  }

  // Create queued NotificationRequest records for each channel destination
  const created = await Promise.all(
    requests.map((r) =>
      prisma.notificationRequest.create({
        data: {
          tenantId,
          recipient: r.destination,
          channel: r.channel,
          eventType,
          variables,
          status: 'queued',
        },
      })
    )
  );

  // WHY: Kick off the queue worker immediately in the background.
  //      The caller has already received 202 — we must not await this.
  setImmediate(() => {
    processQueue().catch((e) => server.log.error('Queue worker error: ' + String(e)));
  });

  return created;
}

// ============================================================
// Health check
// ============================================================
server.get('/health', async () => {
  // F-077: BUILD_GIT_SHA is baked in at image build; the deploy verifier compares it
    // against the SHA it intended to ship. 'unknown' locally, where there is no build step.
    return { status: 'ok', service: 'notification', version: process.env.BUILD_GIT_SHA ?? 'unknown' };
});

// Dummy route to test error enveloping
server.get('/error-test', async () => {
  const error = new Error('Test template resolution error');
  (error as any).statusCode = 500;
  (error as any).code = 'TEMPLATE_RESOLUTION_FAILED';
  throw error;
});

// ============================================================
// POST /notifications/send — canonical spec endpoint
// WHY: Single, spec-defined contract. Callers must use this path
//      and the standard {event_type, recipient, variables} shape.
//      Returns 202 immediately — delivery is async via queue worker.
// ============================================================
server.post('/notifications/send', async (request, reply) => {
  const body = request.body as any;
  const eventType = body.event_type;
  const recipient = body.recipient;
  const variables = body.variables ?? {};
  const tenantId = body.tenantId ?? 'platform';

  if (!eventType || !recipient) {
    const err = new Error('event_type and recipient are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const created = await resolveAndQueue(tenantId, recipient, eventType, variables);

  reply.status(202);
  return { queued: created.length, requests: created };
});

// ============================================================
// POST /notifications/templates — tenant template overrides
// ============================================================
server.post('/notifications/templates', async (request) => {
  const { tenantId, channel, eventType, templateBody } = request.body as any;

  const template = await prisma.notificationTemplate.upsert({
    where: { tenantId_channel_eventType: { tenantId: tenantId ?? 'platform', channel, eventType } },
    update: { templateBody },
    create: { tenantId: tenantId ?? 'platform', channel, eventType, templateBody },
  });

  return template;
});

// ============================================================
// POST /devices/register — register FCM/Web Push token
// ============================================================
server.post('/devices/register', async (request) => {
  const { userId, token } = request.body as any;

  const device = await prisma.deviceToken.upsert({
    where: { token },
    update: { userId },
    create: { userId, token },
  });

  return device;
});

// ============================================================
// GET /notifications/:userId/history — support / debugging log
// ============================================================
server.get('/notifications/:userId/history', async (request) => {
  const { userId } = request.params as any;

  const history = await prisma.notificationRequest.findMany({
    where: { recipient: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return { history };
});

// ============================================================
// Server startup
// ============================================================
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3005;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Notification service running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
