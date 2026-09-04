import { Section, ownerToken, branchManagerToken } from '@badminton/test-harness';
import { db, tenantUrl, internalHeaders, TenantContext } from './_fixtures';

/**
 * F-224 — PATCH /branches/:id/guest-pricing (F-220 §3.2, Custom Pricing Rates).
 *
 * Branch-wide guest-only Standard/Peak rates + an arbitrary list of non-overlapping peak
 * windows. Owner-only + GUEST_BOOKING-gated. defaultRate and the member booking path are
 * never touched. Self-contained: creates its own tenant/branch/entitlement so the shared
 * context's entitlement churn (module-entitlement.regression) can't affect it.
 */

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

async function makeTenantBranch(label: string) {
  const tRes = await fetch(`${tenantUrl}/tenants`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({ name: label, subdomain: label.toLowerCase().replace(/[^a-z0-9]/g, ''), appName: label, themeColor: '#224466' }),
  });
  const tenant = ((await tRes.json()) as any).data;
  const bRes = await fetch(`${tenantUrl}/tenants/${tenant.id}/branches`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({ name: 'Main', address: '1 Court Rd', status: 'ACTIVE' }),
  });
  const branch = ((await bRes.json()) as any).data;
  return { tenant, branch };
}

async function grantGuestBooking(tenantId: string, endOffsetDays: number) {
  return fetch(`${tenantUrl}/tenants/${tenantId}/entitlements`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({ module: 'GUEST_BOOKING', startDate: iso(-1), endDate: iso(endOffsetDays) }),
  });
}

function patch(branchId: string, body: unknown, token: string) {
  return fetch(`${tenantUrl}/branches/${branchId}/guest-pricing`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export const guestPricingSections: Section<TenantContext>[] = [
  {
    name: 'F-224: guest-pricing — owner + GUEST_BOOKING gates, happy path, DB read-back',
    async run() {
      const { tenant, branch } = await makeTenantBranch('F224 Gates');
      const owner = ownerToken('gp-owner', tenant.id);

      // Not entitled yet -> 403 MODULE_NOT_ENTITLED (gate runs after owner check passes).
      const noEnt = await patch(branch.id, { guestStandardRate: 300 }, owner);
      if (noEnt.status !== 403) throw new Error(`no entitlement: expected 403, got ${noEnt.status}`);
      if (((await noEnt.json()) as any).error?.code !== 'MODULE_NOT_ENTITLED') {
        throw new Error('no entitlement: expected MODULE_NOT_ENTITLED');
      }

      await grantGuestBooking(tenant.id, 365);

      // Non-owner (branch_manager) -> 403 FORBIDDEN.
      const asManager = await patch(branch.id, { guestStandardRate: 300 }, branchManagerToken('gp-mgr', branch.id, tenant.id));
      if (asManager.status !== 403) throw new Error(`branch_manager: expected 403, got ${asManager.status}`);

      // Wrong tenant's owner -> 403.
      const asOther = await patch(branch.id, { guestStandardRate: 300 }, ownerToken('x', '99999999-9999-9999-9999-999999999999'));
      if (asOther.status !== 403) throw new Error(`foreign owner: expected 403, got ${asOther.status}`);

      // Owner, entitled -> 200. Standard + peak rate + two windows.
      const ok = await patch(branch.id, {
        guestStandardRate: 350,
        guestPeakRate: 500,
        guestPeakWindows: [{ start: '05:00', end: '09:00' }, { start: '18:00', end: '21:00' }],
      }, owner);
      if (ok.status !== 200) throw new Error(`owner happy path: expected 200, got ${ok.status} ${await ok.text()}`);

      const row = await db.branch.findUnique({ where: { id: branch.id } });
      if (String(row!.guestStandardRate) !== '350') throw new Error(`guestStandardRate: got ${row!.guestStandardRate}`);
      if (String(row!.guestPeakRate) !== '500') throw new Error(`guestPeakRate: got ${row!.guestPeakRate}`);
      const windows = row!.guestPeakWindows as any[];
      if (!Array.isArray(windows) || windows.length !== 2 || windows[0].start !== '05:00') {
        throw new Error(`guestPeakWindows not persisted: ${JSON.stringify(windows)}`);
      }

      // Partial update: rates untouched, windows cleared with []. Peak rate stays but is now unused.
      const clear = await patch(branch.id, { guestPeakWindows: [] }, owner);
      if (clear.status !== 200) throw new Error(`clear windows: expected 200, got ${clear.status}`);
      const row2 = await db.branch.findUnique({ where: { id: branch.id } });
      if ((row2!.guestPeakWindows as any[]).length !== 0) throw new Error('windows not cleared');
      if (String(row2!.guestStandardRate) !== '350') throw new Error('partial update clobbered standard rate');

      // 404 for an unknown branch.
      const missing = await patch('11111111-1111-1111-1111-111111111111', { guestStandardRate: 1 }, owner);
      if (missing.status !== 404) throw new Error(`unknown branch: expected 404, got ${missing.status}`);

      console.log('F-224 gates + happy path + partial update + 404 all correct.');
    },
  },

  {
    name: 'F-224: guest-pricing validation — overlap, duplicate, peak-rate-required, bad amounts',
    async run() {
      const { tenant, branch } = await makeTenantBranch('F224 Validation');
      await grantGuestBooking(tenant.id, 365);
      const owner = ownerToken('gpv-owner', tenant.id);

      const cases: [string, unknown, string][] = [
        ['overlapping windows', { guestStandardRate: 300, guestPeakRate: 400, guestPeakWindows: [{ start: '05:00', end: '10:00' }, { start: '09:00', end: '12:00' }] }, 'INVALID_PEAK_WINDOWS'],
        ['duplicate windows', { guestStandardRate: 300, guestPeakRate: 400, guestPeakWindows: [{ start: '05:00', end: '09:00' }, { start: '05:00', end: '09:00' }] }, 'INVALID_PEAK_WINDOWS'],
        ['end before start', { guestStandardRate: 300, guestPeakRate: 400, guestPeakWindows: [{ start: '10:00', end: '08:00' }] }, 'INVALID_PEAK_WINDOWS'],
        ['malformed time', { guestStandardRate: 300, guestPeakRate: 400, guestPeakWindows: [{ start: '5:00', end: '09:00' }] }, 'INVALID_PEAK_WINDOWS'],
        ['windows without a peak rate', { guestStandardRate: 300, guestPeakWindows: [{ start: '05:00', end: '09:00' }] }, 'PEAK_RATE_REQUIRED'],
        ['negative standard rate', { guestStandardRate: -1 }, 'INVALID_RATE'],
        ['non-numeric rate', { guestStandardRate: 'abc' }, 'INVALID_RATE'],
      ];

      for (const [label, body, code] of cases) {
        const res = await patch(branch.id, body, owner);
        if (res.status !== 400) throw new Error(`${label}: expected 400, got ${res.status}`);
        const got = ((await res.json()) as any).error?.code;
        if (got !== code) throw new Error(`${label}: expected ${code}, got ${got}`);
      }

      // Standard rate alone (no windows, no peak rate) is valid.
      const ok = await patch(branch.id, { guestStandardRate: 300 }, owner);
      if (ok.status !== 200) throw new Error(`standard-only: expected 200, got ${ok.status}`);

      // Rates-only PATCH is rejected while windows already exist and no peak rate is set.
      await patch(branch.id, { guestStandardRate: 300, guestPeakRate: 400, guestPeakWindows: [{ start: '05:00', end: '09:00' }] }, owner);
      const dropPeak = await patch(branch.id, { guestPeakRate: null }, owner);
      if (dropPeak.status !== 400 || ((await dropPeak.json()) as any).error?.code !== 'PEAK_RATE_REQUIRED') {
        throw new Error('dropping peak rate while windows exist should be PEAK_RATE_REQUIRED');
      }

      console.log('F-224 validation cases all correct.');
    },
  },
];
