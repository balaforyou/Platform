import { Section, signJwt, expectForbidden } from '@badminton/test-harness';
import { AllocationMode, Prisma, PricingMode } from '@badminton/database';
import { db, baseUrl, internalKey, SlotEngineContext, TENANT_ID, BRANCH_ID, defaultTermDates } from './_fixtures';
import { addMonthsUtc } from '../branchTime.js';

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
      const ownerJwt = signJwt({ userId: 'owner-user', tenantId: TENANT_ID, roles: ['owner'] });
      const branchManagerJwt = signJwt({ userId: 'manager-user', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });
      const otherBranchManagerJwt = signJwt({ userId: 'other-manager', tenantId: TENANT_ID, roles: ['branch_manager:other-branch'] });

      const adminPoolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        // F-091: these routes now authenticate; the suite takes the internal-key path.
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
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

      // F-169: assignment create now rejects a schedule no generated window could match,
      // so this pool needs a real ACTIVE pattern for the 10:00 assignment below to be
      // legitimate. Mon-Wed 10:00-12:00 in 60-minute slots puts 10:00 on a boundary.
      await db.availabilityPattern.create({
        data: {
          resourcePoolId: adminPool.id,
          daysOfWeek: '1,2,3',
          startTime: '10:00',
          endTime: '12:00',
          slotDurationMinutes: 60,
          capacity: 3,
          status: 'ACTIVE',
          ...defaultTermDates(),
        },
      });

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

      // F-169: the three rejection paths, each with a distinct code, and none may persist
      // a row. Guards the exact gap that let a silently-inert assignment be created.
      const rejectionCases = [
        { label: 'unparseable startTime', code: 'INVALID_TIME',
          body: { userId: 'f169-reject-1', resourcePoolId: adminPool.id, daysOfWeek: '1,2,3', startTime: '25:99' } },
        { label: 'misaligned startTime', code: 'START_TIME_NOT_ALIGNED',
          body: { userId: 'f169-reject-2', resourcePoolId: adminPool.id, daysOfWeek: '1,2,3', startTime: '10:15' } },
        { label: 'weekday no pattern covers', code: 'NO_AVAILABILITY_PATTERN',
          body: { userId: 'f169-reject-3', resourcePoolId: adminPool.id, daysOfWeek: '6', startTime: '10:00' } },
      ];
      for (const testCase of rejectionCases) {
        const rejectRes = await fetch(`${baseUrl}/member-group-assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
          body: JSON.stringify(testCase.body),
        });
        if (rejectRes.status !== 400) {
          throw new Error(`F-169 ${testCase.label}: expected 400, got ${rejectRes.status}`);
        }
        const rejectCode = ((await rejectRes.json()) as any)?.error?.code;
        if (rejectCode !== testCase.code) {
          throw new Error(`F-169 ${testCase.label}: expected code ${testCase.code}, got ${rejectCode}`);
        }
        const persisted = await db.memberGroupAssignment.findFirst({ where: { userId: testCase.body.userId } });
        if (persisted) {
          throw new Error(`F-169 ${testCase.label}: rejected request still persisted a row`);
        }
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
      const branchManagerJwt = signJwt({ userId: 'phase-b-manager', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });

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
          ...defaultTermDates(),
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

  {
    name: 'F-207.1: pattern/assignment date-bounding (startDate defaults, endDate recompute, renew) + asymmetric renew auth',
    async run() {
      const ownerJwt = signJwt({ userId: 'f207-owner', tenantId: TENANT_ID, roles: ['owner'] });
      const branchManagerJwt = signJwt({ userId: 'f207-manager', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });

      const poolRes = await fetch(`${baseUrl}/resource-pools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          name: 'F-207.1 Date Bounding Pool',
          allocationMode: 'POOLED',
          capacity: 5,
        }),
      });
      const pool = ((await poolRes.json()) as any).data;

      // CREATE without startDate defaults to now(); endDate = startDate + 1 month.
      const beforeCreate = new Date();
      const createRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-patterns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ daysOfWeek: '1,2,3,4,5', startTime: '06:00', endTime: '08:00', slotDurationMinutes: 60, capacity: 2 }),
      });
      if (createRes.status !== 201) throw new Error(`F-207.1 pattern CREATE: expected 201, got ${createRes.status}`);
      const created = ((await createRes.json()) as any).data;
      const createdStart = new Date(created.startDate);
      const createdEnd = new Date(created.endDate);
      if (createdStart.getTime() < beforeCreate.getTime() - 5000 || createdStart.getTime() > Date.now() + 5000) {
        throw new Error(`F-207.1 pattern CREATE: startDate ${created.startDate} not close to now()`);
      }
      if (createdEnd.getTime() !== addMonthsUtc(createdStart, 1).getTime()) {
        throw new Error(`F-207.1 pattern CREATE: endDate ${created.endDate} is not startDate + 1 month`);
      }

      // PATCH that changes startDate recomputes endDate; PATCH that doesn't is idempotent.
      const explicitStart = '2026-01-31T00:00:00.000Z';
      const patchChangeRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-patterns/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ startDate: explicitStart }),
      });
      if (patchChangeRes.status !== 200) throw new Error(`F-207.1 pattern PATCH (change startDate): expected 200, got ${patchChangeRes.status}`);
      const patchedChanged = ((await patchChangeRes.json()) as any).data;
      const expectedClampedEnd = addMonthsUtc(new Date(explicitStart), 1); // Jan 31 + 1 month clamps to Feb 28 (2026 is not a leap year)
      if (new Date(patchedChanged.endDate).getTime() !== expectedClampedEnd.getTime()) {
        throw new Error(`F-207.1 pattern PATCH: expected clamped endDate ${expectedClampedEnd.toISOString()}, got ${patchedChanged.endDate}`);
      }

      const patchNoChangeRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-patterns/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerJwt}` },
        body: JSON.stringify({ capacity: 3 }), // no startDate in this PATCH
      });
      if (patchNoChangeRes.status !== 200) throw new Error(`F-207.1 pattern PATCH (no startDate change): expected 200, got ${patchNoChangeRes.status}`);
      const patchedUnchanged = ((await patchNoChangeRes.json()) as any).data;
      if (new Date(patchedUnchanged.startDate).toISOString() !== new Date(explicitStart).toISOString()
        || new Date(patchedUnchanged.endDate).getTime() !== expectedClampedEnd.getTime()) {
        throw new Error('F-207.1 pattern PATCH: startDate/endDate drifted on a PATCH that never sent startDate');
      }

      // /renew extends from the pattern's CURRENT endDate, not from now().
      const beforeRenewEnd = new Date(patchedUnchanged.endDate);
      const renewRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-patterns/${created.id}/renew`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}` },
      });
      if (renewRes.status !== 200) throw new Error(`F-207.1 pattern /renew: expected 200, got ${renewRes.status}`);
      const renewed = ((await renewRes.json()) as any).data;
      if (new Date(renewed.endDate).getTime() !== addMonthsUtc(beforeRenewEnd, 1).getTime()) {
        throw new Error('F-207.1 pattern /renew: endDate did not extend from the pattern\'s prior endDate');
      }

      // Pattern renewal is owner-only, matching its POST/PATCH/DELETE siblings (F-237) — a
      // branch_manager (in-scope, same branch) gets 403.
      const managerRenewRes = await fetch(`${baseUrl}/resource-pools/${pool.id}/availability-patterns/${created.id}/renew`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${branchManagerJwt}` },
      });
      await expectForbidden(managerRenewRes, 'pattern /renew by an in-scope branch_manager (owner-only route family)');

      // Member assignment CREATE: default termPreset MONTHLY when omitted.
      await db.availabilityPattern.create({
        data: {
          resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '09:00', endTime: '10:00',
          slotDurationMinutes: 60, capacity: 4, status: 'ACTIVE', ...defaultTermDates(),
        },
      });
      const assignCreateRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
        body: JSON.stringify({ userId: 'f207-member-1', resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '09:00' }),
      });
      if (assignCreateRes.status !== 201) throw new Error(`F-207.1 assignment CREATE: expected 201, got ${assignCreateRes.status}`);
      const assignment = ((await assignCreateRes.json()) as any).data;
      if (new Date(assignment.endDate).getTime() !== addMonthsUtc(new Date(assignment.startDate), 1).getTime()) {
        throw new Error('F-207.1 assignment CREATE: default termPreset did not produce a 1-month endDate');
      }

      // Member assignment /renew: required termPreset, extends from CURRENT endDate.
      const beforeAssignRenewEnd = new Date(assignment.endDate);
      const assignRenewRes = await fetch(`${baseUrl}/member-group-assignments/${assignment.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
        body: JSON.stringify({ termPreset: 'QUARTERLY' }),
      });
      if (assignRenewRes.status !== 200) throw new Error(`F-207.1 assignment /renew: expected 200, got ${assignRenewRes.status}`);
      const renewedAssignment = ((await assignRenewRes.json()) as any).data;
      if (new Date(renewedAssignment.endDate).getTime() !== addMonthsUtc(beforeAssignRenewEnd, 3).getTime()) {
        throw new Error('F-207.1 assignment /renew: QUARTERLY did not extend by 3 months from the prior endDate');
      }

      // Missing/invalid termPreset -> 400, never a silent default.
      const missingPresetRes = await fetch(`${baseUrl}/member-group-assignments/${assignment.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
        body: JSON.stringify({}),
      });
      if (missingPresetRes.status !== 400) throw new Error(`F-207.1 assignment /renew missing termPreset: expected 400, got ${missingPresetRes.status}`);
      const invalidPresetRes = await fetch(`${baseUrl}/member-group-assignments/${assignment.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${branchManagerJwt}` },
        body: JSON.stringify({ termPreset: 'WEEKLY' }),
      });
      if (invalidPresetRes.status !== 400) throw new Error(`F-207.1 assignment /renew invalid termPreset: expected 400, got ${invalidPresetRes.status}`);

      // Asymmetric auth (the corrected design): unlike pattern /renew above, assignment /renew
      // has NO owner-only guard -- an in-scope branch_manager succeeds (already proven by the
      // 200 responses above). This is deliberate: member-group-assignments is a branch_manager-
      // permitted route family (its POST/PATCH siblings never call requireOwnerOrInternal),
      // unlike availability-patterns.
      console.log('F207_1_RENEW_AUTH_ASYMMETRY', {
        patternRenewByBranchManagerStatus: managerRenewRes.status, // 403 -- owner-only
        assignmentRenewByBranchManagerStatus: assignRenewRes.status, // 200 -- branch_manager permitted
      });
    },
  },
];
