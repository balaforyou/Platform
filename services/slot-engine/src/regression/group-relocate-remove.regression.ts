import { Section, signJwt } from '@badminton/test-harness';
import { BookingStatus } from '@badminton/database';
import { db, baseUrl, internalKey, TENANT_ID, BRANCH_ID, SlotEngineContext } from './_fixtures';

/**
 * F-133 Slice D — relocate or remove a member.
 *
 * Real gap, confirmed still true through Slices A-C: PATCH /member-group-assignments/:id only
 * ever toggled status, never touching endDate -- a "removed" member's row kept reading the
 * original month-end forever. Fixed here: transitioning to SUSPENDED now also sets
 * endDate = now(), server-computed only.
 *
 * "Relocate" is not a new endpoint -- it's the admin-v2 UI composing the same two existing
 * routes (PATCH .../:id + POST /member-group-assignments, groupId-aware since Slice C):
 *   - target already live (startDate <= now): suspend old (endDate = now) + create new, both
 *     effective immediately.
 *   - target not yet live: old stays ACTIVE untouched, new is created queued for the target's
 *     own real startDate.
 *
 * Real gap caught in review, fixed in this same PR: the create route already derived
 * resourcePoolId/daysOfWeek/startTime from groupId (Slice C) but silently kept defaulting
 * startDate to now() regardless of the target's own cycle -- not actually authoritative for any
 * caller besides the one admin-v2 flow this slice happened to wire up explicitly. Fixed
 * server-side: groupStartDate = max(group.startDate, now()) is now the real default whenever no
 * explicit startDate is given -- a not-yet-live target's own future startDate is used as-is
 * (queued correctly); an already-live target's own startDate is clamped up to now (effective
 * immediately, never backdated to the batch's original cycle start). admin-v2's own explicit
 * startDate pass-through for the not-yet-live case stays (it still needs to decide whether to
 * suspend the old assignment, a real client decision) but is now redundant-safe rather than
 * load-bearing -- section 4 below proves the server gets it right with no client hint at all.
 *
 * Section 2 below is the real point of this slice: it doesn't just check the PATCH/POST calls in
 * isolation, it re-runs Slice C's own derived-join calendar logic against a genuine relocation,
 * proving dates before the relocation still attribute to the old batch and dates after attribute
 * to the new one -- unchanged Slice C code, corrected input.
 */

async function makePool(label: string) {
  const poolRes = await fetch(`${baseUrl}/resource-pools`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      branchId: BRANCH_ID,
      name: `F-133D ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      allocationMode: 'POOLED',
      capacity: 8,
      basePrice: 100,
      defaultRate: 100,
    }),
  });
  const pool = ((await poolRes.json()) as any).data;
  // F-169 precedent (same as every other regression file's own pool helper): POST
  // /member-group-assignments reuses validateAssignmentSchedule, which requires a real ACTIVE
  // AvailabilityPattern covering the declared day/time. Broad enough for every schedule these
  // sections declare.
  await db.availabilityPattern.create({
    data: { resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '00:00', endTime: '23:00', slotDurationMinutes: 60, capacity: 8, status: 'ACTIVE', startDate: new Date(Date.now() - 365 * DAY), endDate: new Date(Date.now() + 365 * DAY) },
  });
  return pool;
}

const DAY = 24 * 60 * 60 * 1000;

function dateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function monthStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** The real UTC instant of HH:00 on the same calendar date as `d`. */
function atHourUtc(d: Date, hour: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0));
}

export const groupRelocateRemoveSections: Section<SlotEngineContext>[] = [
  {
    name: 'F-133D: Remove -- PATCH .../:id to SUSPENDED sets endDate to the real suspension moment, not the original month-end',
    async run() {
      const pool = await makePool('remove');
      const originalEndDate = new Date(Date.now() + 60 * DAY);
      const assignment = await db.memberGroupAssignment.create({
        data: {
          userId: 'f133d-remove-member', resourcePoolId: pool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          status: 'ACTIVE', startDate: new Date(Date.now() - 10 * DAY), endDate: originalEndDate,
        },
      });

      const before = new Date();
      const res = await fetch(`${baseUrl}/member-group-assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });
      const after = new Date();
      if (res.status !== 200) throw new Error(`F-133D remove: expected 200, got ${res.status}: ${JSON.stringify(await res.json())}`);

      const row = await db.memberGroupAssignment.findUnique({ where: { id: assignment.id } });
      console.log('F133D_EVIDENCE remove', JSON.stringify({ status: row?.status, endDate: row?.endDate, originalEndDate, before, after }));
      if (row?.status !== 'SUSPENDED') throw new Error(`Expected status SUSPENDED, got ${row?.status}`);
      if (!row.endDate || row.endDate.getTime() === originalEndDate.getTime()) {
        throw new Error(`Expected endDate to change from the original month-end, still ${row?.endDate}`);
      }
      if (row.endDate < before || row.endDate > after) {
        throw new Error(`Expected endDate within [${before.toISOString()}, ${after.toISOString()}], got ${row.endDate.toISOString()}`);
      }
    },
  },

  {
    name: 'F-133D: Relocate into an already-live target -- old endDate truncated, new assignment immediately active, and Slice C\'s calendar join re-verified live: before attributes to the old batch, after to the new one',
    async run() {
      const oldPool = await makePool('relocate-live-old');
      const newPool = await makePool('relocate-live-new');
      const userId = 'f133d-relocate-live-member';

      const oldGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133D old live batch', resourcePoolId: oldPool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 90 * DAY), endDate: new Date(Date.now() + 90 * DAY),
        },
      });
      const newGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133D new live batch', resourcePoolId: newPool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 5 * DAY), endDate: new Date(Date.now() + 55 * DAY), // already live
        },
      });

      const oldAssignment = await db.memberGroupAssignment.create({
        data: {
          userId, groupId: oldGroup.id, resourcePoolId: oldPool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          status: 'ACTIVE', startDate: new Date(Date.now() - 60 * DAY), endDate: new Date(Date.now() + 60 * DAY),
        },
      });

      // A real, already-resolved session YESTERDAY on the OLD batch's pool.
      const yesterday = new Date(Date.now() - DAY);
      const yesterdayStart = atHourUtc(yesterday, 10);
      const yesterdayWindow = await db.availabilityWindow.create({
        data: { resourcePoolId: oldPool.id, startTime: yesterdayStart, endTime: new Date(yesterdayStart.getTime() + 3600000), capacity: 8 },
      });
      await db.booking.create({
        data: {
          tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: oldPool.id, windowId: yesterdayWindow.id, userId,
          status: BookingStatus.CONFIRMED, isMemberBooking: true, heldUntil: new Date(),
          idempotencyKey: `f133d-yesterday-${Date.now()}`, memberAttendanceConfirmedAt: yesterdayStart,
        },
      });

      // --- The real relocation: exactly the two existing routes, exactly as admin-v2 composes them. ---
      const patchRes = await fetch(`${baseUrl}/member-group-assignments/${oldAssignment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });
      if (patchRes.status !== 200) throw new Error(`F-133D relocate-live: expected suspend 200, got ${patchRes.status}`);

      const createRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId, groupId: newGroup.id }),
      });
      if (createRes.status !== 201) throw new Error(`F-133D relocate-live: expected create 201, got ${createRes.status}: ${JSON.stringify(await createRes.json())}`);
      const newAssignment = ((await createRes.json()) as any).data;

      const oldRow = await db.memberGroupAssignment.findUnique({ where: { id: oldAssignment.id } });
      const newRow = await db.memberGroupAssignment.findUnique({ where: { id: newAssignment.id } });
      console.log('F133D_EVIDENCE relocate_live_rows', JSON.stringify({
        old: { status: oldRow?.status, endDate: oldRow?.endDate },
        new: { status: newRow?.status, startDate: newRow?.startDate },
      }));
      if (oldRow?.status !== 'SUSPENDED') throw new Error(`Expected old assignment SUSPENDED, got ${oldRow?.status}`);
      const now = new Date();
      if (!oldRow.endDate || Math.abs(oldRow.endDate.getTime() - now.getTime()) > 60000) {
        throw new Error(`Expected old endDate truncated to ~now, got ${oldRow?.endDate}`);
      }
      if (newRow?.status !== 'ACTIVE') throw new Error(`Expected new assignment ACTIVE, got ${newRow?.status}`);
      if (!newRow.startDate || newRow.startDate > now) {
        throw new Error(`Expected new assignment already effective (startDate <= now), got ${newRow?.startDate}`);
      }

      // A real, already-resolved session TOMORROW on the NEW batch's pool.
      const tomorrow = new Date(Date.now() + DAY);
      const tomorrowStart = atHourUtc(tomorrow, 10);
      const tomorrowWindow = await db.availabilityWindow.create({
        data: { resourcePoolId: newPool.id, startTime: tomorrowStart, endTime: new Date(tomorrowStart.getTime() + 3600000), capacity: 8 },
      });
      await db.booking.create({
        data: {
          tenantId: TENANT_ID, branchId: BRANCH_ID, resourcePoolId: newPool.id, windowId: tomorrowWindow.id, userId,
          status: BookingStatus.CONFIRMED, isMemberBooking: true, heldUntil: new Date(),
          idempotencyKey: `f133d-tomorrow-${Date.now()}`, memberAttendanceConfirmedAt: tomorrowStart,
        },
      });

      // --- Slice C's own calendar route, re-run live against this real relocation. Member-JWT
      // scoped (requireMemberJwt), not internal-key -- the real caller shape. ---
      const memberJwt = signJwt({ userId, tenantId: TENANT_ID, userType: 'MEMBER', roles: [] });
      async function stateFor(assignmentId: string, forDate: Date): Promise<string | undefined> {
        const res = await fetch(
          `${baseUrl}/member/calendar?assignmentId=${assignmentId}&month=${monthStr(forDate)}`,
          { headers: { Authorization: `Bearer ${memberJwt}` } },
        );
        if (res.status !== 200) throw new Error(`F-133D relocate-live calendar: expected 200 for assignment ${assignmentId}, got ${res.status}`);
        const body = ((await res.json()) as any).data;
        const day = (body.days as any[]).find((d) => d.date === dateStr(forDate));
        return day?.state;
      }

      const oldOnYesterday = await stateFor(oldAssignment.id, yesterday);
      const oldOnTomorrow = await stateFor(oldAssignment.id, tomorrow);
      const newOnTomorrow = await stateFor(newAssignment.id, tomorrow);
      const newOnYesterday = await stateFor(newAssignment.id, yesterday);
      console.log('F133D_EVIDENCE relocate_live_calendar_join', JSON.stringify({
        oldOnYesterday, oldOnTomorrow, newOnTomorrow, newOnYesterday,
      }));

      if (oldOnYesterday !== 'ATTENDED') {
        throw new Error(`Expected the OLD assignment's calendar to still show yesterday (before the relocation) as ATTENDED, got ${oldOnYesterday}`);
      }
      if (oldOnTomorrow !== 'NO_DATA') {
        throw new Error(`Expected the OLD assignment's calendar to show tomorrow (after the relocation, past its truncated endDate) as NO_DATA, got ${oldOnTomorrow}`);
      }
      if (newOnTomorrow !== 'ATTENDED') {
        throw new Error(`Expected the NEW assignment's calendar to show tomorrow (after the relocation) as ATTENDED, got ${newOnTomorrow}`);
      }
      if (newOnYesterday !== 'NO_DATA') {
        throw new Error(`Expected the NEW assignment's calendar to show yesterday (before it existed) as NO_DATA, got ${newOnYesterday}`);
      }
    },
  },

  {
    name: 'F-133D: Relocate into a not-yet-started target -- old stays ACTIVE untouched, new assignment queued for the target\'s real startDate, no coverage gap',
    async run() {
      const oldPool = await makePool('relocate-future-old');
      const newPool = await makePool('relocate-future-new');
      const userId = 'f133d-relocate-future-member';

      const targetStartDate = new Date(Date.now() + 10 * DAY); // genuinely not live yet
      const newGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133D not-yet-started batch', resourcePoolId: newPool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: targetStartDate, endDate: new Date(targetStartDate.getTime() + 30 * DAY),
        },
      });

      const oldOriginalEndDate = new Date(Date.now() + 60 * DAY);
      const oldAssignment = await db.memberGroupAssignment.create({
        data: {
          userId, resourcePoolId: oldPool.id, daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          status: 'ACTIVE', startDate: new Date(Date.now() - 30 * DAY), endDate: oldOriginalEndDate,
        },
      });

      // Real relocation logic for a not-yet-live target: no suspend call at all, only create --
      // startDate passed explicitly here (admin-v2's own real call shape); section 4 below
      // proves the server derives the identical value even without this client hint.
      const createRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId, groupId: newGroup.id, startDate: targetStartDate.toISOString() }),
      });
      if (createRes.status !== 201) throw new Error(`F-133D relocate-future: expected create 201, got ${createRes.status}: ${JSON.stringify(await createRes.json())}`);
      const newAssignment = ((await createRes.json()) as any).data;

      const oldRow = await db.memberGroupAssignment.findUnique({ where: { id: oldAssignment.id } });
      const newRow = await db.memberGroupAssignment.findUnique({ where: { id: newAssignment.id } });
      console.log('F133D_EVIDENCE relocate_future_rows', JSON.stringify({
        old: { status: oldRow?.status, endDate: oldRow?.endDate },
        new: { status: newRow?.status, startDate: newRow?.startDate },
        targetStartDate,
      }));

      if (oldRow?.status !== 'ACTIVE') throw new Error(`Expected old assignment to stay ACTIVE, got ${oldRow?.status}`);
      if (oldRow.endDate.getTime() !== oldOriginalEndDate.getTime()) {
        throw new Error(`Expected old assignment's endDate untouched, got ${oldRow.endDate} vs original ${oldOriginalEndDate}`);
      }
      if (newRow?.status !== 'ACTIVE') throw new Error(`Expected new assignment status ACTIVE (queued via a future startDate, not a new status), got ${newRow?.status}`);
      if (Math.abs(new Date(newRow.startDate).getTime() - targetStartDate.getTime()) > 1000) {
        throw new Error(`Expected new assignment queued for the target's real startDate ${targetStartDate.toISOString()}, got ${newRow.startDate}`);
      }
      // No gap: the old assignment's own bound must cover every date up to and including the
      // target's startDate -- real proof there is no day the member has no batch at all.
      if (oldRow.endDate < targetStartDate) {
        throw new Error(`Expected the old assignment to still cover the target's startDate (no coverage gap), old endDate ${oldRow.endDate} < target startDate ${targetStartDate}`);
      }
    },
  },

  {
    name: 'F-133D: POST /member-group-assignments derives startDate from the group itself when none is given -- queued for a not-yet-live target, clamped to now for an already-live one',
    async run() {
      const futurePool = await makePool('startdate-derive-future');
      const futureStart = new Date(Date.now() + 15 * DAY);
      const futureGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133D startDate-derive future batch', resourcePoolId: futurePool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: futureStart, endDate: new Date(futureStart.getTime() + 30 * DAY),
        },
      });
      // No startDate in the body at all -- the real point: the server must get this right with
      // zero client hint, not just when admin-v2's own UI happens to pass one.
      const futureRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId: 'f133d-startdate-derive-future-member', groupId: futureGroup.id }),
      });
      if (futureRes.status !== 201) throw new Error(`F-133D startDate derive (future): expected 201, got ${futureRes.status}: ${JSON.stringify(await futureRes.json())}`);
      const futureAssignment = ((await futureRes.json()) as any).data;
      console.log('F133D_EVIDENCE startdate_derive_future', JSON.stringify({ startDate: futureAssignment.startDate, targetStartDate: futureStart }));
      if (Math.abs(new Date(futureAssignment.startDate).getTime() - futureStart.getTime()) > 1000) {
        throw new Error(`Expected startDate derived from the not-yet-live group's own startDate ${futureStart.toISOString()}, got ${futureAssignment.startDate}`);
      }

      const livePool = await makePool('startdate-derive-live');
      const liveGroup = await db.group.create({
        data: {
          tenantId: TENANT_ID, name: 'F-133D startDate-derive live batch', resourcePoolId: livePool.id,
          daysOfWeek: '1,2,3,4,5,6,7', startTime: '10:00',
          startDate: new Date(Date.now() - 20 * DAY), endDate: new Date(Date.now() + 40 * DAY), // already live
        },
      });
      const before = new Date();
      const liveRes = await fetch(`${baseUrl}/member-group-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKey}` },
        body: JSON.stringify({ userId: 'f133d-startdate-derive-live-member', groupId: liveGroup.id }),
      });
      const after = new Date();
      if (liveRes.status !== 201) throw new Error(`F-133D startDate derive (live): expected 201, got ${liveRes.status}: ${JSON.stringify(await liveRes.json())}`);
      const liveAssignment = ((await liveRes.json()) as any).data;
      console.log('F133D_EVIDENCE startdate_derive_live', JSON.stringify({ startDate: liveAssignment.startDate, before, after }));
      const liveStartDate = new Date(liveAssignment.startDate);
      if (liveStartDate < before || liveStartDate > after) {
        throw new Error(`Expected startDate clamped to ~now (not backdated to the live group's original ${liveGroup.startDate}), got ${liveAssignment.startDate}`);
      }
    },
  },
];
