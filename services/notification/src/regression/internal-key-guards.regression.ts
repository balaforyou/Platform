import { Section, signJwt } from '@badminton/test-harness';
import { notificationUrl, internalKey, TENANT_ID, USER_ID, NotificationContext } from './_fixtures';

/**
 * F-292 — real auth-guard proof for all 4 previously-unauthenticated notification routes.
 *
 * Three routes (POST /notifications/send, POST /notifications/templates,
 * GET /notifications/:userId/history) are backend-only in real production (confirmed via
 * repo-wide grep, no frontend caller exists) -- plain requireInternalKey.
 *
 * POST /devices/register has a real, live frontend caller (admin-v2's push opt-in,
 * apps/admin-v2/src/lib/firebase.ts:62) that sends the admin's own session JWT, never the
 * internal key -- dual-path guard (internal key OR valid user JWT), either sufficient.
 */
export const internalKeyGuardSections: Section<NotificationContext>[] = [
  {
    name: 'F-292: POST /notifications/send requires the internal key (401 unauthenticated, 401 wrong key, 202 correct key)',
    async run() {
      const body = JSON.stringify({
        tenantId: TENANT_ID,
        recipient: '+919000000001',
        event_type: 'group_invite',
        variables: {},
      });

      const noAuth = await fetch(`${notificationUrl}/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (noAuth.status !== 401) throw new Error(`Expected 401 with no auth, got ${noAuth.status}`);

      const wrongKey = await fetch(`${notificationUrl}/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-the-real-key' },
        body,
      });
      if (wrongKey.status !== 401) throw new Error(`Expected 401 with a wrong key, got ${wrongKey.status}`);

      const realKey = await fetch(`${notificationUrl}/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body,
      });
      if (realKey.status !== 202) throw new Error(`Expected 202 with the real internal key, got ${realKey.status}`);
    },
  },

  {
    name: 'F-292: POST /notifications/templates requires the internal key (401 unauthenticated, 401 wrong key, 200 correct key)',
    async run() {
      const body = JSON.stringify({
        tenantId: TENANT_ID,
        channel: 'sms',
        eventType: 'f292_guard_test',
        templateBody: 'test',
      });

      const noAuth = await fetch(`${notificationUrl}/notifications/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (noAuth.status !== 401) throw new Error(`Expected 401 with no auth, got ${noAuth.status}`);

      const wrongKey = await fetch(`${notificationUrl}/notifications/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-the-real-key' },
        body,
      });
      if (wrongKey.status !== 401) throw new Error(`Expected 401 with a wrong key, got ${wrongKey.status}`);

      const realKey = await fetch(`${notificationUrl}/notifications/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body,
      });
      if (realKey.status !== 200) throw new Error(`Expected 200 with the real internal key, got ${realKey.status}`);
    },
  },

  {
    name: 'F-292: GET /notifications/:userId/history requires the internal key (401 unauthenticated, 401 wrong key, 200 correct key)',
    async run() {
      const noAuth = await fetch(`${notificationUrl}/notifications/${USER_ID}/history`);
      if (noAuth.status !== 401) throw new Error(`Expected 401 with no auth, got ${noAuth.status}`);

      const wrongKey = await fetch(`${notificationUrl}/notifications/${USER_ID}/history`, {
        headers: { Authorization: 'Bearer not-the-real-key' },
      });
      if (wrongKey.status !== 401) throw new Error(`Expected 401 with a wrong key, got ${wrongKey.status}`);

      const realKey = await fetch(`${notificationUrl}/notifications/${USER_ID}/history`, {
        headers: { Authorization: `Bearer ${internalKey}` },
      });
      if (realKey.status !== 200) throw new Error(`Expected 200 with the real internal key, got ${realKey.status}`);
    },
  },

  {
    name: "F-292: POST /devices/register dual-path guard — 401 unauthenticated, 401 invalid JWT, 401 expired JWT, 200 real internal key, 200 real valid user JWT (admin-v2's actual call shape)",
    async run() {
      const body = (token: string) => JSON.stringify({ userId: USER_ID, token });

      const noAuth = await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body('f292-noauth-token'),
      });
      if (noAuth.status !== 401) throw new Error(`Expected 401 with no auth, got ${noAuth.status}`);

      const invalidJwt = await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-jwt' },
        body: body('f292-invalidjwt-token'),
      });
      if (invalidJwt.status !== 401) throw new Error(`Expected 401 with an invalid JWT, got ${invalidJwt.status}`);

      // A real, correctly-signed JWT that is genuinely expired (negative TTL) -- proves
      // expiry is actually enforced, not just signature shape.
      const expiredJwt = signJwt({ userId: 'f292-admin', tenantId: TENANT_ID, roles: ['owner'] }, -60);
      const expiredRes = await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${expiredJwt}` },
        body: body('f292-expiredjwt-token'),
      });
      if (expiredRes.status !== 401) throw new Error(`Expected 401 with an expired JWT, got ${expiredRes.status}`);

      const realKeyRes = await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: body('f292-internalkey-token'),
      });
      if (realKeyRes.status !== 200) throw new Error(`Expected 200 with the real internal key, got ${realKeyRes.status}`);

      // admin-v2's real call shape (apps/admin-v2/src/lib/firebase.ts:62): a real, valid
      // owner/branch_manager session JWT, no internal key involved at all.
      const adminJwt = signJwt({ userId: 'f292-admin', tenantId: TENANT_ID, roles: ['owner'], userType: 'MEMBER' });
      const adminRes = await fetch(`${notificationUrl}/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
        body: body('f292-adminjwt-token'),
      });
      if (adminRes.status !== 200) throw new Error(`Expected 200 with a real valid admin JWT, got ${adminRes.status}: ${await adminRes.text()}`);
      const adminBody = (await adminRes.json()) as any;
      const device = adminBody.data ?? adminBody;
      if (device.token !== 'f292-adminjwt-token') {
        throw new Error(`Expected the real device token to be persisted, got ${JSON.stringify(device)}`);
      }
    },
  },
];
