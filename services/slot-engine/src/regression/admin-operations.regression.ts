import { Section, signJwt, expectForbidden } from '@badminton/test-harness';
import { AllocationMode, Prisma, PricingMode } from '@badminton/database';
import { db, baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID } from './_fixtures';

/**
 * ADMIN OPERATIONS — config endpoints and their trust boundaries.
 *
 * Sources: concurrency.test.ts Test 0 (relocated here — it was never a
 * concurrency scenario, it is admin-endpoint scoping) and the trust-boundary
 * section of availabilityGeneration.phaseB.test.ts (relocated here so every
 * "can this admin touch this branch" check lives in one place).
 *
 * CHECKLIST — every new tenant/branch-scoped admin endpoint added to this
 * service needs all three of:
 *   1. JWT-derived identity — a spoofed id in the body must be ignored
 *      (see expectIdentityFromJwt; proven for member-confirm in member-flow).
 *   2. Branch scoping — a branch manager scoped elsewhere gets 403
 *      (expectForbidden), and list endpoints return only in-scope rows
 *      (expectScopedToBranch).
 *   3. Cross-tenant non-leak — another tenant's record 404s, never 403
 *      (expectCrossTenantNoLeak; canonical example lives in identity-auth).
 */
export const adminOperationsSections: Section<SlotEngineContext>[] = [
  {
    name: 'Admin config endpoints & scoping (pool PATCH, immutable branchId, booking-rule PUT, member-assignment scoping)',
    async run() {
      const ownerJwt = signJwt({ userId: 'owner-user', roles: ['owner'] });
      const branchManagerJwt = signJwt({ userId: 'manager-user', roles: [`branch_manager:${BRANCH_ID}`] });
      const otherBranchManagerJwt = signJwt({ userId: 'other-manager', roles: ['branch_manager:other-branch'] });

      const adminPoolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          name: 'Admin Config Pool',
          allocationMode: 'POOLED',
          capacity: 3,
        }),
      });
      const adminPool = ((await adminPoolRes.json()) as any).data;

      const patchPoolRes = await fetch(`${baseUrl}/resource-pools/${adminPool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({
          capacity: 4,
          minOccupancy: 2,
          minBookingDurationMinutes: 60,
          pricingMode: 'PER_PERSON',
          defaultRate: 150,
        }),
      });
      if (patchPoolRes.status !== 200) {
        throw new Error(`Expected pool update 200, got ${patchPoolRes.status}`);
      }
      const updatedPool = ((await patchPoolRes.json()) as any).data;
      if (updatedPool.capacity !== 4 || updatedPool.minOccupancy !== 2 || updatedPool.pricingMode !== 'PER_PERSON') {
        throw new Error('Pool update did not persist expected fields.');
      }

      // branchId is immutable — a pool must not be able to migrate between branches.
      const immutableRes = await fetch(`${baseUrl}/resource-pools/${adminPool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ branchId: 'forged-branch' }),
      });
      if (immutableRes.status !== 400) {
        throw new Error(`Expected immutable branchId update to return 400, got ${immutableRes.status}`);
      }

      const ruleRes = await fetch(`${baseUrl}/resource-pools/${adminPool.id}/booking-rule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
        body: JSON.stringify({ lowOccupancyThresholdPct: 45, guestAccessCutoffMinutes: 90 }),
      });
      if (ruleRes.status !== 200) {
        throw new Error(`Expected rule upsert 200, got ${ruleRes.status}`);
      }
      const updatedRule = ((await ruleRes.json()) as any).data;
      if (updatedRule.lowOccupancyThresholdPct !== 45 || updatedRule.guestAccessCutoffMinutes !== 90) {
        throw new Error('Rule upsert did not persist expected fields.');
      }

      const assignmentRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
        body: JSON.stringify({
          userId: 'assigned-member',
          resourcePoolId: adminPool.id,
          daysOfWeek: '1,2,3',
          startTime: '10:00',
        }),
      });
      if (assignmentRes.status !== 201) {
        throw new Error(`Expected assignment create 201, got ${assignmentRes.status}`);
      }

      const listRes = await fetch(`${baseUrl}/member-group-assignments?resourcePoolId=${adminPool.id}`, {
        headers: { Authorization: `Bearer ${branchManagerJwt}` },
      });
      if (listRes.status !== 200) {
        throw new Error(`Expected scoped assignment list 200, got ${listRes.status}`);
      }
      const listedAssignments = ((await listRes.json()) as any).data;
      if (!Array.isArray(listedAssignments) || listedAssignments.length !== 1) {
        throw new Error('Expected scoped listing to return the created assignment.');
      }

      // Cross-branch admin must not read this branch's assignments.
      const forbiddenListRes = await fetch(`${baseUrl}/member-group-assignments?resourcePoolId=${adminPool.id}`, {
        headers: { Authorization: `Bearer ${otherBranchManagerJwt}` },
      });
      await expectForbidden(forbiddenListRes, 'member-assignment listing by a manager scoped to another branch');

      // The internal service key retains full access (used by other services).
      const internalListRes = await fetch(`${baseUrl}/member-group-assignments`, {
        headers: { Authorization: `Bearer ${internalKey}` },
      });
      if (internalListRes.status !== 200) {
        throw new Error(`Expected internal assignment listing to still return 200, got ${internalListRes.status}`);
      }
    },
  },

  {
    name: 'Availability pattern/override trust boundary (wrong-branch manager 403 on create + edit, both entities)',
    async run() {
      // Relocated from availabilityGeneration.phaseB.test.ts — same "can this
      // admin touch another branch" question as the section above.
      const otherBranchId = 'phase-b-other-branch';
      const branchManagerJwt = signJwt({ userId: 'phase-b-manager', roles: [`branch_manager:${BRANCH_ID}`] });

      const unauthorizedPool = await db.resourcePool.create({
        data: {
          tenantId: TENANT_ID,
          branchId: otherBranchId,
          name: 'Trust Boundary Unauthorized Pool',
          allocationMode: AllocationMode.POOLED,
          capacity: 10,
          minOccupancy: 1,
          minBookingDurationMinutes: 60,
          pricingMode: PricingMode.FLAT,
          defaultRate: new Prisma.Decimal(100),
          basePrice: new Prisma.Decimal(100),
        },
      });

      const existingOtherBranchPattern = await db.availabilityPattern.create({
        data: {
          resourcePoolId: unauthorizedPool.id,
          daysOfWeek: '1',
          startTime: '08:00',
          endTime: '09:00',
          slotDurationMinutes: 60,
          capacity: 1,
        },
      });
      const existingOtherBranchOverride = await db.availabilityOverride.create({
        data: {
          resourcePoolId: unauthorizedPool.id,
          date: new Date('2026-08-17T00:00:00.000Z'),
          type: 'CLOSED',
          reason: 'Existing forbidden override',
        },
      });

      const jsonHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${branchManagerJwt}`,
      };

      const unauthorizedPattern = await fetch(
        `${baseUrl}/resource-pools/${unauthorizedPool.id}/availability-patterns`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({
            daysOfWeek: '1',
            startTime: '10:00',
            endTime: '11:00',
            slotDurationMinutes: 60,
            capacity: 1,
          }),
        },
      );
      await expectForbidden(unauthorizedPattern, 'pattern CREATE for another branch');

      const unauthorizedOverride = await fetch(
        `${baseUrl}/resource-pools/${unauthorizedPool.id}/availability-overrides`,
        {
          method: 'POST',
          headers: jsonHeaders,
          body: JSON.stringify({ date: '2026-08-16', type: 'CLOSED', reason: 'Forbidden check' }),
        },
      );
      await expectForbidden(unauthorizedOverride, 'override CREATE for another branch');

      const unauthorizedPatternEdit = await fetch(
        `${baseUrl}/resource-pools/${unauthorizedPool.id}/availability-patterns/${existingOtherBranchPattern.id}`,
        { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ capacity: 2 }) },
      );
      await expectForbidden(unauthorizedPatternEdit, 'pattern EDIT for another branch');

      const unauthorizedOverrideEdit = await fetch(
        `${baseUrl}/resource-pools/${unauthorizedPool.id}/availability-overrides/${existingOtherBranchOverride.id}`,
        { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ reason: 'Forbidden edit' }) },
      );
      await expectForbidden(unauthorizedOverrideEdit, 'override EDIT for another branch');

      console.log('TRUST_BOUNDARY_403', {
        patternCreateStatus: unauthorizedPattern.status,
        overrideCreateStatus: unauthorizedOverride.status,
        patternEditStatus: unauthorizedPatternEdit.status,
        overrideEditStatus: unauthorizedOverrideEdit.status,
      });
    },
  },
];
