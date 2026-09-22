import { Section, signJwt } from '@badminton/test-harness';
import { Prisma } from '@badminton/database';
import { db, baseUrl, internalKey, TENANT_ID, BRANCH_ID, SlotEngineContext } from './_fixtures';
import { isRenewalReminderDay } from '../branchTime.js';

/**
 * F-133 Slice E — monthly renewal cycle.
 *
 * Covers: the /renew route's real branch on existing.groupId (batch vs non-batch), a real
 * 30->31-day rollover and a real year rollover for the batch branch, the non-batch branch's
 * F-207.1 QUARTERLY path proven unregressed, a real multi-member batch renewed one assignment at
 * a time (the same shape admin-v2's RenewalPanel.tsx drives), GET /groups/expiring-renewals'
 * real query + branch scoping, and the sweep's new renewal-reminder mechanics.
 *
 * The reminder's own "is it the 20th" gate cannot be driven end-to-end through the live sweep:
 * every other reminder in this file gates on a real near-term offset from "now" (a test CAN
 * construct that), but this one gates on the real wall-clock calendar day, which nothing in this
 * suite can move. Two things ARE proven directly instead: the gate predicate itself
 * (isRenewalReminderDay), by real execution across the boundary dates; and the dedup mechanism,
 * by exercising the exact ScheduledJobDispatch unique constraint the sweep relies on
 * (jobName + dedupKey) with the real key shape `${branchId}:${YYYY-MM}` the sweep computes. The
 * dedup MECHANISM itself (insert-first + P2002 catch) is not new logic -- it's the identical
 * pattern already proven end-to-end for low_occupancy_alert (low-occupancy-release.regression.ts)
 * and the T-2h/T-1h15m member reminders (member-multi-batch-attendance.regression.ts), reused
 * verbatim per rule 3, not re-invented.
 */

const DAY = 24 * 60 * 60 * 1000;

async function makePool(label: string, branchId: string = BRANCH_ID) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId,
      name: `F-133E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      allocationMode: 'POOLED',
      capacity: 8,
      basePrice: 100,
      defaultRate: 100,
    }),
  });
  return ((await poolRes.json()) as any).data;
}

/** The real last instant of `year`-`month` (1-indexed), UTC. */
function endOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

async function renew(assignmentId: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/member-group-assignments/${assignmentId}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: ((await res.json()) as any) };
}

export const groupRenewalSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-133E: isRenewalReminderDay gate predicate — real execution across boundary dates',
    async run() {
      const cases: [string, boolean][] = [
        ['2026-09-19', false],
        ['2026-09-20', true],
        ['2026-09-21', false],
        ['2026-01-20', true],
        ['2026-02-20', true],
        ['2024-02-29', false], // leap day, not the 20th
        ['2026-12-20', true],
        ['2026-12-02', false],
      ];
      const results = cases.map(([d, expected]) => ({ d, expected, actual: isRenewalReminderDay(d) }));
      const wrong = results.filter((r) => r.actual !== r.expected);
      console.log('F133E_EVIDENCE isRenewalReminderDay', JSON.stringify(results));
      if (wrong.length > 0) {
        throw new Error(`isRenewalReminderDay wrong for: ${JSON.stringify(wrong)}`);
      }
    },
  },

  {
    name: 'F-133E: /renew batch branch — 30->31-day rollover (Sept -> Oct)',
    async run() {
      const pool = await makePool('rollover-30-31');
      const originalEndDate = endOfMonthUtc(2026, 9); // Sept 30, 2026, 23:59:59.999Z
      const group = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133E rollover batch', resourcePoolId: pool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 365 * DAY),
        },
      });
      const assignment = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-rollover-member', resourcePoolId: pool.id, groupId: group.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * DAY), endDate: originalEndDate,
        },
      });

      const { status, body } = await renew(assignment.id);
      if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);

      const expected = endOfMonthUtc(2026, 10); // Oct 31, 2026, 23:59:59.999Z
      const row = await db.memberGroupAssignment.findUnique({ where: { id: assignment.id } });
      console.log('F133E_EVIDENCE rollover-30-31', JSON.stringify({ before: originalEndDate, after: row?.endDate, expected }));
      if (row?.endDate?.getTime() !== expected.getTime()) {
        throw new Error(`Expected endDate ${expected.toISOString()}, got ${row?.endDate?.toISOString()}`);
      }
    },
  },

  {
    name: 'F-133E: /renew batch branch — year rollover (Dec -> Jan next year)',
    async run() {
      const pool = await makePool('rollover-year');
      const originalEndDate = endOfMonthUtc(2026, 12); // Dec 31, 2026, 23:59:59.999Z
      const group = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133E year-rollover batch', resourcePoolId: pool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 365 * DAY),
        },
      });
      const assignment = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-year-rollover-member', resourcePoolId: pool.id, groupId: group.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * DAY), endDate: originalEndDate,
        },
      });

      const { status, body } = await renew(assignment.id);
      if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);

      const expected = endOfMonthUtc(2027, 1); // Jan 31, 2027, 23:59:59.999Z
      const row = await db.memberGroupAssignment.findUnique({ where: { id: assignment.id } });
      console.log('F133E_EVIDENCE rollover-year', JSON.stringify({ before: originalEndDate, after: row?.endDate, expected }));
      if (row?.endDate?.getTime() !== expected.getTime()) {
        throw new Error(`Expected endDate ${expected.toISOString()}, got ${row?.endDate?.toISOString()}`);
      }
    },
  },

  {
    name: 'F-133E: /renew batch branch — a termPreset in the body is rejected, not silently ignored',
    async run() {
      const pool = await makePool('reject-termpreset');
      const group = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133E reject batch', resourcePoolId: pool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 365 * DAY),
        },
      });
      const originalEndDate = endOfMonthUtc(2026, 9);
      const assignment = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-reject-member', resourcePoolId: pool.id, groupId: group.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * DAY), endDate: originalEndDate,
        },
      });

      const { status, body } = await renew(assignment.id, { termPreset: 'QUARTERLY' });
      console.log('F133E_EVIDENCE reject-termpreset', JSON.stringify({ status, body }));
      if (status !== 400 || body?.error?.code !== 'TERM_PRESET_NOT_APPLICABLE') {
        throw new Error(`Expected 400 TERM_PRESET_NOT_APPLICABLE, got ${status}: ${JSON.stringify(body)}`);
      }
      const row = await db.memberGroupAssignment.findUnique({ where: { id: assignment.id } });
      if (row?.endDate?.getTime() !== originalEndDate.getTime()) {
        throw new Error(`A rejected renew must not have changed endDate, got ${row?.endDate?.toISOString()}`);
      }
    },
  },

  {
    // F-207.1's own pre-existing regression assertion (admin-operations.regression.ts) already
    // covers this path; this is a second, Slice-E-local proof that the groupId branch added
    // above did not regress it, seeded independently of that file.
    name: 'F-133E: /renew non-batch branch — QUARTERLY still advances by 3 months from the CURRENT endDate, unregressed',
    async run() {
      const pool = await makePool('non-batch-quarterly');
      const originalEndDate = new Date(Date.now() + 10 * DAY);
      const assignment = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-nonbatch-member', resourcePoolId: pool.id, // groupId omitted -> null
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 10 * DAY), endDate: originalEndDate,
        },
      });

      const { status, body } = await renew(assignment.id, { termPreset: 'QUARTERLY' });
      if (status !== 200) throw new Error(`Expected 200, got ${status}: ${JSON.stringify(body)}`);

      const row = await db.memberGroupAssignment.findUnique({ where: { id: assignment.id } });
      const expected = new Date(originalEndDate);
      expected.setUTCMonth(expected.getUTCMonth() + 3);
      console.log('F133E_EVIDENCE non-batch-quarterly', JSON.stringify({ before: originalEndDate, after: row?.endDate, expected }));
      if (row?.endDate?.getTime() !== expected.getTime()) {
        throw new Error(`Expected endDate ${expected.toISOString()}, got ${row?.endDate?.toISOString()}`);
      }

      // And the non-batch branch still requires termPreset -- unchanged pre-F-133 behaviour.
      const missing = await renew(assignment.id, {});
      if (missing.status !== 400 || missing.body?.error?.code !== 'INVALID_TERM_PRESET') {
        throw new Error(`Expected 400 INVALID_TERM_PRESET when termPreset omitted for a non-batch assignment, got ${missing.status}: ${JSON.stringify(missing.body)}`);
      }
    },
  },

  {
    name: 'F-133E: a real multi-member batch, renewed one assignment at a time (the RenewalPanel.tsx shape) — every ACTIVE member advances, DB read-back',
    async run() {
      const pool = await makePool('bulk-renew');
      const group = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133E bulk batch', resourcePoolId: pool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 365 * DAY),
        },
      });
      const originalEndDate = endOfMonthUtc(2026, 9);
      const memberIds = ['f133e-bulk-1', 'f133e-bulk-2', 'f133e-bulk-3'];
      const assignments = await Promise.all(memberIds.map((userId) =>
        db.memberGroupAssignment.create({
          data: {
            userId, resourcePoolId: pool.id, groupId: group.id,
            daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
            startDate: new Date(Date.now() - 30 * DAY), endDate: originalEndDate,
          },
        }),
      ));

      // A member NOT in this batch, expiring the same month -- must be untouched by renewing
      // only this batch's assignmentIds (proves the loop is scoped to the batch, not global).
      const otherPool = await makePool('bulk-renew-unrelated');
      const unrelated = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-bulk-unrelated', resourcePoolId: otherPool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * DAY), endDate: originalEndDate,
        },
      });

      const results = [];
      for (const a of assignments) {
        results.push(await renew(a.id));
      }
      console.log('F133E_EVIDENCE bulk-renew results', JSON.stringify(results.map((r) => r.status)));
      if (results.some((r) => r.status !== 200)) {
        throw new Error(`Expected all 3 renewals to succeed, got statuses ${JSON.stringify(results.map((r) => r.status))}`);
      }

      const expected = endOfMonthUtc(2026, 10);
      const rows = await db.memberGroupAssignment.findMany({ where: { id: { in: assignments.map((a) => a.id) } } });
      const wrong = rows.filter((r) => r.endDate?.getTime() !== expected.getTime());
      console.log('F133E_EVIDENCE bulk-renew read-back', JSON.stringify(rows.map((r) => ({ userId: r.userId, endDate: r.endDate }))));
      if (wrong.length > 0) {
        throw new Error(`Expected every batch member's endDate to be ${expected.toISOString()}, wrong: ${JSON.stringify(wrong)}`);
      }

      const unrelatedRow = await db.memberGroupAssignment.findUnique({ where: { id: unrelated.id } });
      if (unrelatedRow?.endDate?.getTime() !== originalEndDate.getTime()) {
        throw new Error(`An assignment outside the renewed batch must be untouched, got ${unrelatedRow?.endDate?.toISOString()}`);
      }
    },
  },

  {
    name: 'F-133E: GET /groups/expiring-renewals — real batches expiring THIS month are listed, next-month and last-month are not, branch scoping enforced',
    async run() {
      const pool = await makePool('expiring-list');
      const thisMonthGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133E expiring this month', resourcePoolId: pool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 365 * DAY),
        },
      });
      const nextMonthGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133E expiring next month', resourcePoolId: pool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 365 * DAY),
        },
      });

      const now = new Date();
      const thisMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      const nextMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0, 23, 59, 59, 999));
      const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

      const thisMonthAssignment = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-list-this-month', resourcePoolId: pool.id, groupId: thisMonthGroup.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * DAY), endDate: thisMonthEnd,
        },
      });
      await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-list-next-month', resourcePoolId: pool.id, groupId: nextMonthGroup.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'ACTIVE',
          startDate: new Date(Date.now() - 30 * DAY), endDate: nextMonthEnd,
        },
      });
      // Expired last month, still linked to thisMonthGroup, status SUSPENDED -- must not count
      // (not ACTIVE) even though its group otherwise appears via the real active assignment above.
      await db.memberGroupAssignment.create({
        data: {
          userId: 'f133e-list-suspended', resourcePoolId: pool.id, groupId: thisMonthGroup.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00', status: 'SUSPENDED',
          startDate: new Date(Date.now() - 60 * DAY), endDate: lastMonthEnd,
        },
      });

      const ownerJwt = signJwt({ userId: 'f133e-owner', tenantId: TENANT_ID, roles: ['owner'] });
      const res = await fetch(`${baseUrl}/groups/expiring-renewals`, {
        headers: { Authorization: `Bearer ${ownerJwt}` },
      });
      const data = ((await res.json()) as any).data;
      console.log('F133E_EVIDENCE expiring-renewals', JSON.stringify(data));
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);

      const branch = data.find((b: any) => b.branchId === BRANCH_ID);
      if (!branch) throw new Error(`Expected a branch entry for ${BRANCH_ID}, got ${JSON.stringify(data)}`);
      const listedGroupIds = branch.batches.map((b: any) => b.groupId);
      if (!listedGroupIds.includes(thisMonthGroup.id)) {
        throw new Error(`Expected ${thisMonthGroup.id} (expiring this month) to be listed, got ${JSON.stringify(listedGroupIds)}`);
      }
      if (listedGroupIds.includes(nextMonthGroup.id)) {
        throw new Error(`A batch expiring NEXT month must not be listed, got ${JSON.stringify(listedGroupIds)}`);
      }
      const thisMonthBatch = branch.batches.find((b: any) => b.groupId === thisMonthGroup.id);
      if (!thisMonthBatch.assignmentIds.includes(thisMonthAssignment.id)) {
        throw new Error(`Expected the real ACTIVE assignment id in assignmentIds, got ${JSON.stringify(thisMonthBatch)}`);
      }
      if (thisMonthBatch.assignmentIds.length !== 1) {
        throw new Error(`The SUSPENDED assignment must not be counted, expected 1 assignmentId, got ${JSON.stringify(thisMonthBatch.assignmentIds)}`);
      }

      // Branch scoping: a manager for a DIFFERENT branch must not see this branch's entry at all.
      const wrongBranchJwt = signJwt({ userId: 'f133e-wrong-manager', tenantId: TENANT_ID, roles: ['branch_manager:99999999-9999-9999-9999-999999999999'] });
      const scopedRes = await fetch(`${baseUrl}/groups/expiring-renewals`, {
        headers: { Authorization: `Bearer ${wrongBranchJwt}` },
      });
      const scopedData = ((await scopedRes.json()) as any).data;
      if (scopedRes.status !== 200) throw new Error(`Expected 200 for a scoped manager, got ${scopedRes.status}`);
      if (scopedData.some((b: any) => b.branchId === BRANCH_ID)) {
        throw new Error(`A manager scoped to a different branch must not see ${BRANCH_ID}'s entry, got ${JSON.stringify(scopedData)}`);
      }

      // Correct branch_manager DOES see it.
      const rightBranchJwt = signJwt({ userId: 'f133e-right-manager', tenantId: TENANT_ID, roles: [`branch_manager:${BRANCH_ID}`] });
      const rightRes = await fetch(`${baseUrl}/groups/expiring-renewals`, {
        headers: { Authorization: `Bearer ${rightBranchJwt}` },
      });
      const rightData = ((await rightRes.json()) as any).data;
      if (!rightData.some((b: any) => b.branchId === BRANCH_ID)) {
        throw new Error(`A manager scoped to ${BRANCH_ID} must see its own entry, got ${JSON.stringify(rightData)}`);
      }

      // Real gap caught live in dev-stack verification (JBC owner session served a courtowner1
      // batch): an OWNER of a DIFFERENT tenant must not see this tenant's branch entry either --
      // owner scoping was previously not tenant-filtered at all. Needs its own real
      // MEMBER_MANAGEMENT entitlement row (setupBaseFixtures only seeds TENANT_ID's), otherwise
      // this would 403 on the entitlement gate before ever reaching the scoping logic under test.
      const OTHER_TENANT_ID = '99999999-8888-7777-6666-555555555555';
      await db.tenant.upsert({
        where: { id: OTHER_TENANT_ID },
        update: {},
        create: { id: OTHER_TENANT_ID, name: 'F-133E Other Tenant', subdomain: 'f133e-other-tenant' },
      });
      await db.moduleEntitlement.upsert({
        where: { tenantId_module: { tenantId: OTHER_TENANT_ID, module: 'MEMBER_MANAGEMENT' } },
        update: { startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01'), disabledAt: null },
        create: { tenantId: OTHER_TENANT_ID, module: 'MEMBER_MANAGEMENT', startDate: new Date('2020-01-01'), endDate: new Date('2100-01-01') },
      });
      const otherTenantOwnerJwt = signJwt({ userId: 'f133e-other-tenant-owner', tenantId: OTHER_TENANT_ID, roles: ['owner'] });
      const otherOwnerRes = await fetch(`${baseUrl}/groups/expiring-renewals`, {
        headers: { Authorization: `Bearer ${otherTenantOwnerJwt}` },
      });
      const otherOwnerData = ((await otherOwnerRes.json()) as any).data;
      if (otherOwnerRes.status !== 200) throw new Error(`Expected 200 for a different tenant's owner, got ${otherOwnerRes.status}`);
      if (otherOwnerData.some((b: any) => b.branchId === BRANCH_ID)) {
        throw new Error(`An owner of a DIFFERENT tenant must not see ${BRANCH_ID}'s entry (cross-tenant leak), got ${JSON.stringify(otherOwnerData)}`);
      }
    },
  },

  {
    // Real proof of the dedup MECHANISM for this reminder's specific key shape, independent of
    // the day-gate (see file header for why the gate itself can't be driven live). Same
    // insert-first + unique-constraint pattern already proven end-to-end for low_occupancy_alert
    // and the T-2h/T-1h15m reminders -- this proves the (jobName, dedupKey) pair the sweep
    // actually computes (`batch_renewal_reminder`, `${branchId}:${YYYY-MM}`) collides correctly.
    name: 'F-133E: batch_renewal_reminder dedup key — a second dispatch for the same branch+month collides (P2002), a different month does not',
    async run() {
      const dedupBranchId = 'f133e-dedup-branch';
      const monthA = '2026-09';
      const monthB = '2026-10';
      await db.scheduledJobDispatch.deleteMany({ where: { jobName: 'batch_renewal_reminder', dedupKey: { startsWith: dedupBranchId } } });

      const first = await db.scheduledJobDispatch.create({
        data: {
          jobName: 'batch_renewal_reminder', tenantId: TENANT_ID, subjectId: dedupBranchId,
          dedupKey: `${dedupBranchId}:${monthA}`, status: 'SENT', occurrenceAt: new Date(), dispatchedAt: new Date(),
        },
      });

      let secondCollided = false;
      try {
        await db.scheduledJobDispatch.create({
          data: {
            jobName: 'batch_renewal_reminder', tenantId: TENANT_ID, subjectId: dedupBranchId,
            dedupKey: `${dedupBranchId}:${monthA}`, status: 'SENT', occurrenceAt: new Date(), dispatchedAt: new Date(),
          },
        });
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          secondCollided = true;
        } else {
          throw err;
        }
      }
      if (!secondCollided) {
        throw new Error('A second dispatch for the same branch+month must collide on the unique (jobName, dedupKey) constraint.');
      }

      // A different month for the SAME branch must NOT collide -- next month's reminder is real.
      const nextMonth = await db.scheduledJobDispatch.create({
        data: {
          jobName: 'batch_renewal_reminder', tenantId: TENANT_ID, subjectId: dedupBranchId,
          dedupKey: `${dedupBranchId}:${monthB}`, status: 'SENT', occurrenceAt: new Date(), dispatchedAt: new Date(),
        },
      });

      const count = await db.scheduledJobDispatch.count({ where: { jobName: 'batch_renewal_reminder', subjectId: dedupBranchId } });
      console.log('F133E_EVIDENCE dedup', JSON.stringify({ first: first.id, secondCollided, nextMonth: nextMonth.id, totalRows: count }));
      if (count !== 2) {
        throw new Error(`Expected exactly 2 real rows (one per distinct month), got ${count}`);
      }

      await db.scheduledJobDispatch.deleteMany({ where: { jobName: 'batch_renewal_reminder', subjectId: dedupBranchId } });
    },
  },
];
