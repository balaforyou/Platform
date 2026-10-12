import fs from 'fs';
import {
  db, SE, PAY, TENANT, BRANCH, ownerTok, managerTok, memberTok, guestTok, http, sql, log, h, baseFixture,
  hhmm, isoWeekday, alignedHour, makeWindow, makeSubscription, makeUser, writeOut,
} from './lib.mjs';

const only = process.argv.slice(2);
const want = (p) => only.length === 0 || only.includes(p);

// ---- time anchors (all UTC; the scratch branch is timezone UTC) -----------------------------
const now = new Date();
const FAR = alignedHour(5);   // today, >= 4h away  => confirm cutoff (start-60min) still in the future
const NEAR = alignedHour(1);  // next full hour (<= 60 min away) => release cutoff already passed
if (FAR.getUTCDate() !== now.getUTCDate()) throw new Error('re-run earlier in the UTC day');
const TOMORROW = alignedHour(24 + 12 - now.getUTCHours() + 0); // tomorrow ~12:00-ish, aligned below
TOMORROW.setUTCHours(19, 0, 0, 0);
TOMORROW.setUTCDate(now.getUTCDate() + 1);

log(`Spike run started ${now.toISOString()}  | DB scratch: badminton_db_scratch_spike | services: slot-engine :3001, payment :3004 (real built dist)`);
log(`Anchors: FAR(today)=${FAR.toISOString()}  NEAR(today)=${NEAR.toISOString()}  TOMORROW=${TOMORROW.toISOString()}`);

async function assignmentsPost(pool, userId, start, extra = {}) {
  return http(`create assignment ${userId}`, 'POST', `${SE}/member-group-assignments`, {
    token: ownerTok(),
    body: { userId, resourcePoolId: pool.id, daysOfWeek: isoWeekday(start), startTime: hhmm(start), startDate: new Date().toISOString(), ...extra },
  });
}
async function confirm(userId, assignmentId) {
  return http(`member ${userId} confirms attendance`, 'POST', `${SE}/member/today-assignment/confirm`, {
    token: memberTok(userId), body: { assignmentId },
  });
}
const bookingsSql = (windowId) => `SELECT "userId", status, "isMemberBooking" AS member, "resourceId" IS NOT NULL AS has_court, "courtSlotIndex" AS slot_idx FROM "Booking" WHERE "windowId"='${windowId}' ORDER BY "createdAt"`;
const countSql = (windowId) => `SELECT count(*) FILTER (WHERE "isMemberBooking" AND status='CONFIRMED') AS member_confirmed, count(*) FILTER (WHERE NOT "isMemberBooking" AND status IN ('HELD','CONFIRMED')) AS guest_live, count(*) FILTER (WHERE status IN ('HELD','CONFIRMED')) AS capacity_consumed, (SELECT capacity FROM "AvailabilityWindow" WHERE id='${windowId}') AS window_capacity FROM "Booking" WHERE "windowId"='${windowId}'`;

// ===========================================================================================
async function P1() {
  h('P1 — 8 members of ONE batch confirm into a capacity-4 window (does the 5th member fail?)');
  const { pool } = await baseFixture({ courts: 4 });
  const win = await makeWindow(pool.id, FAR, 4);
  log(`Fixture: POOLED pool capacity 4 (Court 1-4), window ${win.id} @ ${FAR.toISOString()} capacity 4, grace 60.`);
  const ids = [];
  for (let i = 1; i <= 8; i++) { const u = `p1-member-${i}`; await makeSubscription(u); const r = await assignmentsPost(pool, u, FAR); ids.push([u, r.data.id]); }
  sql('assignments', `SELECT "userId", "daysOfWeek", "startTime", status FROM "MemberGroupAssignment" ORDER BY "createdAt"`);
  for (const [u, a] of ids) await confirm(u, a);
  sql('Booking rows after 8 confirm attempts', bookingsSql(win.id));
  sql('capacity accounting', countSql(win.id));
}

async function P1b() {
  h('P1b — footprint today equals confirming-member count (3-member batch; two 3-member batches same hour)');
  // (a) one 3-member batch
  let { pool } = await baseFixture({ courts: 4 });
  let win = await makeWindow(pool.id, FAR, 4);
  log('--- P1b-(a): ONE batch of 3 members, all confirm. Then ask: how many seats are left, and can a negotiated (admin/walk-in) booking still use them?');
  const ids = [];
  for (let i = 1; i <= 3; i++) { const u = `p1b-a-${i}`; await makeSubscription(u); const r = await assignmentsPost(pool, u, FAR); ids.push([u, r.data.id]); }
  for (const [u, a] of ids) await confirm(u, a);
  sql('capacity accounting (3-member batch)', countSql(win.id));
  await makeUser('p1b-guest-1', 'Walk-in Guest', '+910000000001');
  await http('admin negotiated booking onto the same window (what a walk-in uses; capacity-only check)', 'POST', `${SE}/bookings/negotiated`, {
    token: 'INTERNAL', headers: { 'Idempotency-Key': 'p1b-a-neg-1' },
    body: { tenantId: TENANT, branchId: BRANCH, resourcePoolId: pool.id, windowId: win.id, userId: 'p1b-guest-1', negotiatedPrice: 100, guestOnly: true },
  });
  sql('capacity accounting after walk-in', countSql(win.id));
  // (b) two 3-member batches same hour, same pool
  ({ pool } = await baseFixture({ courts: 4 }));
  win = await makeWindow(pool.id, FAR, 4);
  log('--- P1b-(b): TWO batches of 3 members each, SAME hour, SAME pool (pool-level batches today). All 6 confirm in order.');
  const ids2 = [];
  for (let i = 1; i <= 6; i++) { const u = `p1b-b-${i}`; await makeSubscription(u); const r = await assignmentsPost(pool, u, FAR); ids2.push([u, r.data.id]); }
  for (const [u, a] of ids2) await confirm(u, a);
  sql('capacity accounting (two 3-member batches)', countSql(win.id));
  sql('Booking rows', bookingsSql(win.id));
}

async function P2() {
  h('P2 — one batch with ONE member: does it lock all 4 courts for guests (grid + availability + guest POST /bookings)?');
  const { pool, resources } = await baseFixture({ courts: 4 });
  const win = await makeWindow(pool.id, FAR, 4);
  await makeUser('p2-guest', 'Spike Guest', '+910000000002');
  await makeSubscription('p2-member');
  // control: before any assignment
  const dateStr = FAR.toISOString().slice(0, 10);
  const gridBefore = await http('CONTROL grid BEFORE assignment (cells for the window row only; filter applied by the probe)', 'GET',
    `${SE}/branches/${BRANCH}/guest-inventory-grid?date=${dateStr}&poolId=${pool.id}`, { token: ownerTok(), quiet: true });
  log('  cells @window: ' + JSON.stringify(gridBefore.data.cells.filter((c) => c.startTime === FAR.toISOString()).map((c) => ({ court: resources.find((r) => r.id === c.resourceId)?.name, type: c.type }))));
  const availBefore = await http('CONTROL availability BEFORE assignment (unauthenticated guest browse)', 'GET', `${SE}/resource-pools/${pool.id}/availability?date=${dateStr}`, { quiet: true });
  log('  bookable slots at window: ' + JSON.stringify(availBefore.data.filter((s) => s.window.id === win.id).map((s) => ({ remainingCapacity: s.remainingCapacity }))));
  // one-member batch (created through POST /groups -> a real batch, then the member joins it)
  const g = await http('create batch (Group) with a single member to follow', 'POST', `${SE}/groups`, {
    token: ownerTok(), body: { name: 'P2 one-member batch', resourcePoolId: pool.id, daysOfWeek: isoWeekday(FAR), startTime: hhmm(FAR), customRate: 100 },
  });
  const a = await assignmentsPost(pool, 'p2-member', FAR, { groupId: g.data.id });
  sql('batch + assignment (note assignment.startDate)', `SELECT g.name, g."startDate" AS group_start, a."userId", a.status, a."startDate" AS assignment_start, a."endDate" FROM "Group" g JOIN "MemberGroupAssignment" a ON a."groupId"=g.id`);
  const gridAfter = await http('grid AFTER single-member batch (member NOT yet confirmed)', 'GET',
    `${SE}/branches/${BRANCH}/guest-inventory-grid?date=${dateStr}&poolId=${pool.id}`, { token: ownerTok(), quiet: true });
  log('  cells @window: ' + JSON.stringify(gridAfter.data.cells.filter((c) => c.startTime === FAR.toISOString()).map((c) => ({ court: resources.find((r) => r.id === c.resourceId)?.name, type: c.type }))));
  const availAfter = await http('availability AFTER (unauthenticated guest browse)', 'GET', `${SE}/resource-pools/${pool.id}/availability?date=${dateStr}`, { quiet: true });
  log('  bookable slots at window: ' + JSON.stringify(availAfter.data.filter((s) => s.window.id === win.id).map((s) => ({ remainingCapacity: s.remainingCapacity }))) + `   (total slots returned: ${availAfter.data.length})`);
  await http('guest self-service POST /bookings on that window', 'POST', `${SE}/bookings`, {
    token: guestTok('p2-guest'), headers: { 'Idempotency-Key': 'p2-guest-book-1' },
    body: { resourcePoolId: pool.id, windowId: win.id },
  });
  void a;
}

async function P3() {
  h('P3 — scoped manager POST /payment/bookings/manual onto a member window, without vs with releaseGroupId');
  const { pool } = await baseFixture({ courts: 4 });
  const winFar = await makeWindow(pool.id, FAR, 4);
  const winNear = await makeWindow(pool.id, NEAR, 4);
  await makeUser('p3-guest-a', 'Guest A', '+910000000031');
  await makeUser('p3-guest-b', 'Guest B', '+910000000032');
  await makeUser('p3-guest-c', 'Guest C', '+910000000033');
  await makeSubscription('p3-member-far'); await makeSubscription('p3-member-near');
  const gFar = await http('batch FAR', 'POST', `${SE}/groups`, { token: ownerTok(), body: { name: 'P3 far batch', resourcePoolId: pool.id, daysOfWeek: isoWeekday(FAR), startTime: hhmm(FAR), customRate: 100 } });
  const gNear = await http('batch NEAR', 'POST', `${SE}/groups`, { token: ownerTok(), body: { name: 'P3 near batch', resourcePoolId: pool.id, daysOfWeek: isoWeekday(NEAR), startTime: hhmm(NEAR), customRate: 100 } });
  const aFar = await assignmentsPost(pool, 'p3-member-far', FAR, { groupId: gFar.data.id });
  await assignmentsPost(pool, 'p3-member-near', NEAR, { groupId: gNear.data.id });
  const mgr = managerTok();
  const body = (win, userId, extra = {}) => ({ tenantId: TENANT, branchId: BRANCH, resourcePoolId: pool.id, windowId: win.id, userId, negotiatedPrice: 100, paymentMethod: 'cash', ...extra });
  await http('(a) scoped manager, member-reserved window FAR, NO releaseGroupId', 'POST', `${PAY}/bookings/manual`, { token: mgr, headers: { 'Idempotency-Key': 'p3-a' }, body: body(winFar, 'p3-guest-a') });
  sql('(a) read-back: bookings on FAR window', bookingsSql(winFar.id));
  // member confirms, then a release placement must be refused
  await confirm('p3-member-far', aFar.data.id);
  await http('(b) scoped manager, FAR window, WITH releaseGroupId, member has CONFIRMED', 'POST', `${PAY}/bookings/manual`, { token: mgr, headers: { 'Idempotency-Key': 'p3-b' }, body: body(winFar, 'p3-guest-b', { releaseGroupId: gFar.data.id }) });
  await http('release-eligibility FAR (what the gate asks)', 'GET', `${SE}/groups/${gFar.data.id}/release-eligibility`, { token: 'INTERNAL' });
  await http('(c) control: scoped manager, NEAR window (cutoff passed, nobody confirmed), WITH releaseGroupId', 'POST', `${PAY}/bookings/manual`, { token: mgr, headers: { 'Idempotency-Key': 'p3-c' }, body: body(winNear, 'p3-guest-c', { releaseGroupId: gNear.data.id }) });
  sql('read-back: all bookings', `SELECT w."startTime", b."userId", b.status, b."isMemberBooking" AS member FROM "Booking" b JOIN "AvailabilityWindow" w ON w.id=b."windowId" ORDER BY w."startTime", b."createdAt"`);
}

async function P4() {
  h('P4 — member with an ACTIVE assignment and NO Subscription row: confirm attendance');
  const { pool } = await baseFixture({ courts: 4 });
  await makeWindow(pool.id, FAR, 4);
  const a = await assignmentsPost(pool, 'p4-member-nosub', FAR);
  sql('Subscription rows (expect none)', `SELECT count(*) AS subscriptions FROM "Subscription"`);
  await http('member sees today state', 'GET', `${SE}/member/today-assignment`, { token: memberTok('p4-member-nosub') });
  await confirm('p4-member-nosub', a.data.id);
  sql('Booking rows (expect none)', `SELECT count(*) AS bookings FROM "Booking"`);
}

async function collisionScenario(title, nGuest, statuses, memberCount) {
  h(title);
  const { pool } = await baseFixture({ courts: 4 });
  const win = await makeWindow(pool.id, TOMORROW, 4);
  for (let i = 1; i <= nGuest; i++) {
    const uid = `guest-${i}`;
    await makeUser(uid, `Guest ${i}`, `+9100000001${i}0`);
    const b = await db.booking.create({ data: {
      tenantId: TENANT, branchId: BRANCH, resourcePoolId: pool.id, windowId: win.id, userId: uid, status: statuses[i - 1],
      heldAt: new Date(), heldUntil: statuses[i - 1] === 'HELD' ? new Date(Date.now() + 300000) : new Date(), idempotencyKey: `seed-${title.slice(0, 2)}-${i}`,
      isMemberBooking: false, price: 100,
    } });
    if (statuses[i - 1] === 'CONFIRMED') {
      await db.paymentIntent.create({ data: { tenantId: TENANT, userId: uid, amount: 10000, purpose: 'guest_booking', referenceId: b.id, status: 'captured', gatewayRef: `cash_seed_${b.id.slice(0, 8)}` } });
    }
  }
  log(`Seeded ${nGuest} guest bookings on window ${win.id} @ ${TOMORROW.toISOString()} (statuses ${statuses.join(',')}); CONFIRMED ones carry a captured cash PaymentIntent.`);
  sql('BEFORE: bookings on window', `SELECT "userId", status, "isMemberBooking" AS member FROM "Booking" WHERE "windowId"='${win.id}' ORDER BY "createdAt"`);
  await http('owner previews the collision for this batch slot', 'GET',
    `${SE}/resource-pools/${pool.id}/member-collision-preview?daysOfWeek=${isoWeekday(TOMORROW)}&startTime=${hhmm(TOMORROW)}`, { token: ownerTok() });
  for (let i = 1; i <= memberCount; i++) {
    await makeSubscription(`${title.slice(0, 2)}-member-${i}`);
    await http(`create assignment #${i} (this is what triggers the sweep)`, 'POST', `${SE}/member-group-assignments`, {
      token: ownerTok(), body: { userId: `${title.slice(0, 2)}-member-${i}`, resourcePoolId: pool.id, daysOfWeek: isoWeekday(TOMORROW), startTime: hhmm(TOMORROW), startDate: new Date().toISOString() },
    });
  }
  sql('AFTER: bookings on window', `SELECT "userId", status, "isMemberBooking" AS member, "refundAmount" FROM "Booking" WHERE "windowId"='${win.id}' ORDER BY "createdAt"`);
  sql('AFTER: refunds', `SELECT r.amount, r.status, r.reason, pi."referenceId" AS booking FROM "Refund" r JOIN "PaymentIntent" pi ON pi.id=r."paymentIntentId" ORDER BY r."createdAt"`);
  sql('AFTER: sibling pools (can anything relocate?)', `SELECT count(*) AS pools_in_branch FROM "ResourcePool" WHERE "branchId"='${BRANCH}'`);
}
const P5 = () => collisionScenario('P5 — single-pool branch, 2 CONFIRMED + 1 HELD guest bookings, create the FIRST assignment', 3, ['CONFIRMED', 'CONFIRMED', 'HELD'], 1);
const P6 = () => collisionScenario('P6 — capacity 4, 2 guest bookings, create a 2-member batch (would 2 free courts remain for guests?)', 2, ['CONFIRMED', 'CONFIRMED'], 2);

async function P7() {
  h('P7 (observation, not in the P1-P6 brief) — same member in two batches of one pool; assignment queued for next month');
  const { pool } = await baseFixture({ courts: 4 });
  const w1 = await makeWindow(pool.id, FAR, 4);
  const w2 = await makeWindow(pool.id, alignedHour(7), 4);
  await makeSubscription('p7-member');
  await assignmentsPost(pool, 'p7-member', FAR);
  await http('same member, second batch at a different hour, SAME pool', 'POST', `${SE}/member-group-assignments`, {
    token: ownerTok(), body: { userId: 'p7-member', resourcePoolId: pool.id, daysOfWeek: isoWeekday(alignedHour(7)), startTime: hhmm(alignedHour(7)), startDate: new Date().toISOString() },
  });
  // queued batch: created via POST /groups on a non-1st day => startDate = 1st of next month
  const g = await http('batch created today (not the 1st) => queued to next month', 'POST', `${SE}/groups`, {
    token: ownerTok(), body: { name: 'P7 queued batch', resourcePoolId: pool.id, daysOfWeek: isoWeekday(alignedHour(9)), startTime: hhmm(alignedHour(9)), customRate: 100 },
  });
  const w3 = await makeWindow(pool.id, alignedHour(9), 4);
  await makeSubscription('p7-queued-member');
  await assignmentsPost(pool, 'p7-queued-member', alignedHour(9), { groupId: g.data.id, startDate: undefined });
  sql('queued assignment dates', `SELECT "userId", status, "startDate", "endDate" FROM "MemberGroupAssignment" WHERE "userId"='p7-queued-member'`);
  const dateStr = FAR.toISOString().slice(0, 10);
  const av = await http('availability today (is the QUEUED batch slot already withheld from guests?)', 'GET', `${SE}/resource-pools/${pool.id}/availability?date=${dateStr}`, { quiet: true });
  log('  bookable windows today: ' + JSON.stringify(av.data.map((s) => s.window.startTime)) + `   (queued-batch window is ${w3.startTime.toISOString()})`);
  void w1; void w2;
}

const table = { P1, P1b, P2, P3, P4, P5, P6, P7 };
for (const [name, fn] of Object.entries(table)) {
  if (!want(name)) continue;
  try { await fn(); } catch (e) { log(`!! PROBE ${name} THREW: ${e.stack || e}`); }
}
fs.writeFileSync(process.env.SPIKE_OUT || '/tmp/spike-out.txt', writeOut());
await db.$disconnect();
