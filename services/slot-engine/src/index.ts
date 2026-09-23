import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, BookingStatus, AllocationMode, PricingMode, Prisma, AvailabilityOverrideType, TenantModule } from '@badminton/database';
import { resolveEntitlementState, entitlementAllows } from '@badminton/shared-types';
import { ensureAvailabilityWindowsForDate, reconcilePatternWindows } from './availabilityGeneration.js';
import {
  DEFAULT_TIME_ZONE,
  addBranchDays,
  addMonthsUtc,
  branchDateString,
  branchHHMM,
  branchIsoWeekday,
  branchLocalToUtc,
  parseBranchLocalDateTime,
  branchMinutesOfDay,
  daysInMonth,
  endOfNextCalendarMonthUtc,
  isRenewalReminderDay,
  safeTimeZone,
} from './branchTime.js';
import { createScheduler, createSqlScheduledJobStore, type JobDefinition, type SqlExecutor } from '@badminton/job-scheduler';

const server = fastify({ logger: true });

// WHY: Register the response envelope plugin globally so all success and error responses
// are automatically wrapped to follow the API standards (200/201 success wraps in {data: ...}, errors wrap in {error: ...}).
server.register(responseEnvelopePlugin);

// Register JWT support for verifying admin tokens on privileged endpoints.
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg',
});

const prisma = new PrismaClient();

const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
const notificationUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';

// ---------------------------------------------------------------------------
// Helpers: F-009 Phone Validation & Normalization
// ---------------------------------------------------------------------------
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) {
    return '+' + cleaned.replace(/\D/g, '');
  }
  let digits = cleaned.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return '+91' + digits;
  }
  return '+' + digits;
}

function isValidIndianPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+91[6-9]\d{9}$/.test(normalized);
}

// ---------------------------------------------------------------------------
// Helpers: F-010 Time Boundary Alignment Snapping
// ---------------------------------------------------------------------------
// F-066: these read the clock of the BRANCH, not of the server process. Previously they
// used getHours()/setHours(), so the boundary a request was judged against depended on the
// container's own timezone. That is not cosmetic: under IST the offset is 330 minutes and
// 330 % 60 = 30, so the same request would be accepted or rejected differently for
// 60-minute slots purely because of an environment variable. Latent today only because the
// containers happen to run UTC.
function snapToBoundary(
  date: Date,
  durationMinutes: number,
  timeZone: string,
  round: (n: number) => number,
): Date {
  const totalMinutes = branchMinutesOfDay(date, timeZone);
  const snapped = round(totalMinutes / durationMinutes) * durationMinutes;
  // Minutes may exceed a day after snapping; normalise into days + HH:mm before converting
  // back, since branchLocalToUtc takes a real wall-clock reading rather than an overflow.
  const dayShift = Math.floor(snapped / 1440);
  const withinDay = ((snapped % 1440) + 1440) % 1440;
  const hhmm = `${String(Math.floor(withinDay / 60)).padStart(2, '0')}:${String(withinDay % 60).padStart(2, '0')}`;
  const base = dayShift === 0 ? date : addBranchDays(date, dayShift, timeZone);
  return branchLocalToUtc(branchDateString(base, timeZone), hhmm, timeZone);
}

function isAlignedToBoundary(date: Date, durationMinutes: number, timeZone: string): boolean {
  const totalMinutes = branchMinutesOfDay(date, timeZone);
  return totalMinutes % durationMinutes === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

function floorTimeToBoundary(date: Date, durationMinutes: number, timeZone: string): Date {
  return snapToBoundary(date, durationMinutes, timeZone, Math.floor);
}

function ceilTimeToBoundary(date: Date, durationMinutes: number, timeZone: string): Date {
  return snapToBoundary(date, durationMinutes, timeZone, Math.ceil);
}

function formatHHMM(date: Date, timeZone: string): string {
  return branchHHMM(date, timeZone);
}

/**
 * F-205: automatic real-court assignment for a POOLED booking.
 *
 * Picks the first real `Resource` in the pool (stable `createdAt asc` order — matches
 * provision order, so position lines up with the "Court N" numbering) that no active
 * (HELD/CONFIRMED) booking already holds across the window(s) this booking touches, and
 * derives `courtSlotIndex` from that resource's position (F-186's cosmetic number and
 * the real resource are forced to agree — see the F-205 plan §1 step 4).
 *
 * Falls back to `resourceId: null` + F-186's original occupancy-scan index when the pool
 * can't be assigned a real court: its `Resource` count doesn't match `capacity` (nothing
 * enforces that at the schema level), or every real court is somehow already taken. That
 * fallback path is unchanged from today's behaviour.
 */
function assignPooledCourt(
  pool: { capacity: number; resources: { id: string; createdAt: Date; guestBookable?: boolean }[] },
  activeBookings: { courtSlotIndex: number | null; resourceId: string | null }[],
  // F-225: when guestOnly, skip a court not authorised for walk-in guest bookings
  // (`guestBookable === false`). Applied INSIDE the findIndex over the full ordered list — never
  // by pre-filtering `pool.resources`, which would break the `ordered.length === pool.capacity`
  // completeness gate for the whole pool and desync `courtSlotIndex` from the real "Court N".
  opts?: { guestOnly?: boolean },
): { resourceId: string | null; courtSlotIndex: number | null } {
  const ordered = [...pool.resources].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (ordered.length === pool.capacity && ordered.length > 0) {
    const taken = new Set(
      activeBookings.map((b) => b.resourceId).filter((v): v is string => v !== null),
    );
    const free = ordered.findIndex(
      (r) => !taken.has(r.id) && (opts?.guestOnly ? r.guestBookable === true : true),
    );
    if (free !== -1) {
      return { resourceId: ordered[free].id, courtSlotIndex: free + 1 };
    }
  }

  // Fallback: F-186 occupancy scan over the cosmetic 1..capacity indices, unchanged.
  const occupied = new Set(
    activeBookings.map((b) => b.courtSlotIndex).filter((v): v is number => v !== null),
  );
  for (let i = 1; i <= pool.capacity; i++) {
    if (!occupied.has(i)) return { resourceId: null, courtSlotIndex: i };
  }
  return { resourceId: null, courtSlotIndex: null };
}

/**
 * F-263: a human-facing court label, honest about whether `courtSlotIndex` ties to a real
 * `Resource` or is F-186's cosmetic fallback index. Both paths set a non-null `courtSlotIndex`
 * (see `assignPooledCourt` above), so `courtSlotIndex != null` alone can't distinguish them --
 * `resourceId` is the real signal. Replaces the identical `resource?.name ?? (courtSlotIndex !=
 * null ? \`Court ${courtSlotIndex}\` : null)` ternary duplicated at 3 response sites, which all
 * silently displayed a specific court number even when the fallback fired.
 */
function describeCourtAssignment(
  resourceName: string | null | undefined,
  resourceId: string | null,
  courtSlotIndex: number | null,
): string | null {
  if (resourceName) return resourceName;
  // Real assignment, but the joined Resource's name wasn't available (e.g. deleted) -- keep the
  // numbered label rather than inventing a new, rarer-still fallback state for this edge case.
  if (resourceId != null && courtSlotIndex != null) return `Court ${courtSlotIndex}`;
  if (courtSlotIndex != null) return 'General allocation';
  return null;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

// WHY: Guards endpoints that require a verified INTERNAL_SERVICE_KEY.
// Used on service-to-service paths where a JWT is not appropriate.
const requireInternalKey = (request: any, reply: any) => {
  const authHeader = request.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${internalKey}`) {
    const err = new Error('Unauthorized internal service access');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
};

type AdminAuthContext = {
  isInternal: boolean;
  userId: string | null;
  roles: string[];
  // F-091: the caller's tenant, when one is knowable. Null on the internal-key path, which is
  // the platform/bootstrap caller and carries no token to derive a tenant from. Additive —
  // existing consumers read isInternal/userId/roles and are unaffected.
  tenantId: string | null;
};

// WHY: Guards admin-only endpoints using the same dual-path pattern established in
// tenant-management, while returning claims so branch-scoped admin routes can enforce
// authorization beyond "has some admin role".
const getInternalOrAdminAuth = async (request: any, reply: any): Promise<AdminAuthContext> => {
  const authHeader = request.headers['authorization'];
  if (!authHeader) {
    reply.status(401);
    const err = new Error('Missing authorization header');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  // Path 1: internal service key
  if (authHeader === `Bearer ${internalKey}`) {
    return { isInternal: true, userId: null, roles: [], tenantId: null };
  }

  // Path 2: admin JWT with owner or branch_manager role
  try {
    const decoded = await request.jwtVerify() as any;
    const roles: string[] = decoded.roles ?? [];
    const isAdmin = roles.some((r: string) =>
      r === 'owner' || r.startsWith('branch_manager:')
    );
    if (!isAdmin) {
      reply.status(403);
      const err = new Error('Forbidden: Owner or Branch Manager role required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
    return {
      isInternal: false,
      userId: decoded.userId || decoded.sub || decoded.id || null,
      roles,
      tenantId: decoded.tenantId ?? null,
    };
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
};

const requireInternalOrAdmin = async (request: any, reply: any) => {
  await getInternalOrAdminAuth(request, reply);
};

const isAuthorizedForBranch = (auth: AdminAuthContext, branchId: string): boolean => (
  auth.isInternal ||
  auth.roles.includes('owner') ||
  auth.roles.includes(`branch_manager:${branchId}`)
);

// F-225: owner-tier gate for a slot-engine route (the internal-key/platform caller bypasses, same
// precedent as isAuthorizedForBranch). Mirrors tenant-management's verifyTenantOwnerOrInternal
// for a `Resource` write that must be owner-only, not branch_manager — distinct from
// requirePoolScope, which permits branch_manager. Compose after getInternalOrAdminAuth.
const requireOwnerOrInternal = (auth: AdminAuthContext, reply: any) => {
  if (auth.isInternal || auth.roles.includes('owner')) return;
  reply.status(403);
  const err = new Error('Forbidden: Owner privilege required');
  (err as any).statusCode = 403;
  (err as any).code = 'FORBIDDEN';
  throw err;
};

// WHY: A branch-manager role is scoped to one branch. Resource-pool admin routes
// must check the pool's branchId server-side instead of trusting client filters.
const requirePoolScope = async (auth: AdminAuthContext, resourcePoolId: string, reply: any) => {
  const pool = await prisma.resourcePool.findUnique({
    where: { id: resourcePoolId },
    include: { resources: true, bookingRules: { orderBy: { createdAt: 'asc' } } },
  });
  if (!pool) {
    reply.status(404);
    const err = new Error('Resource pool not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  if (!isAuthorizedForBranch(auth, pool.branchId)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }
  return pool;
};

// F-206: module-entitlement gate. Composes into the same chain as requirePoolScope — called
// right after getInternalOrAdminAuth (cheapest/least-informative check first, matching the
// booking-rules route's existing ordering comment) on every admin config endpoint that
// belongs to a sellable module.
//
// The internal-key / platform caller bypasses unconditionally — the same established
// precedent isAuthorizedForBranch already applies. A JWT caller's tenant comes straight from
// the decoded token (auth.tenantId); no tenant on the token means no entitlement, denied.
//
// write: true  -> only ACTIVE passes.
// write: false -> ACTIVE or READ_ONLY (Owner has wound the module down early but data stays
//                 readable until endDate).
const requireModuleEntitlement = async (
  auth: AdminAuthContext,
  module: TenantModule,
  reply: any,
  opts: { write: boolean },
) => {
  if (auth.isInternal) return;

  const row = auth.tenantId
    ? await prisma.moduleEntitlement.findUnique({
        where: { tenantId_module: { tenantId: auth.tenantId, module } },
      })
    : null;

  const state = resolveEntitlementState(row, new Date());
  if (!entitlementAllows(state, opts.write)) {
    reply.status(403);
    const err = new Error(`Module not entitled: ${module}`);
    (err as any).statusCode = 403;
    (err as any).code = 'MODULE_NOT_ENTITLED';
    throw err;
  }
};

// WHY (F-071): the booking-scoped routes (cancel, read, cancel-preview) each carried an
// identical inline IDOR guard that failed in two opposite directions. It tested
// `roles.includes('branch_manager')` against a claim format that is actually
// `branch_manager:<branchId>`, so it never matched and a real branch manager was wrongly
// DENIED; and `roles.includes('owner')` did match while no tenant or branch comparison
// existed anywhere in those handlers, so any owner could reach ANY booking in ANY tenant.
//
// This implements the convention the platform already established in Tenant Management's
// GET /users/:userId/branches/:branchId/check — "owner grants access to all branches under
// the tenant" — where the tenant is resolved from the resource and role assignments are
// filtered by it. Here the equivalent facts (tenantId, branchId) are read from the booking
// row, never from the request.
//
// Three identical copies is how F-022's drift happened; one function is the durable fix.
const requireBookingAccess = (booking: any, decodedUser: any, reply: any) => {
  const forbidden = () => {
    reply.status(403);
    const err = new Error('Forbidden');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    return err;
  };

  // WHY: tenant is the OUTER boundary and applies to every JWT caller, including the
  // booking's own guest. A userId match already proves identity within a tenant, so this
  // is defence in depth — it means a future bug in identity or booking lookup still cannot
  // cross a tenant boundary. A token carrying no tenantId claim fails closed here.
  if (!decodedUser.tenantId || decodedUser.tenantId !== booking.tenantId) {
    throw forbidden();
  }

  const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
  const roles: string[] = decodedUser.roles ?? [];

  const isBookingOwner = booking.userId === userId;
  // Reuses the same helper the 14 correctly-guarded admin routes rely on: it already
  // understands `owner` and the real `branch_manager:<branchId>` format. The bug was never
  // in this helper — it was that these routes never called it.
  const isScopedAdmin = isAuthorizedForBranch({ isInternal: false, userId, roles, tenantId: decodedUser.tenantId ?? null }, booking.branchId);

  if (!isBookingOwner && !isScopedAdmin) {
    throw forbidden();
  }
};

type GuestOccupancyRow = {
  resourcePoolId: string;
  resourcePoolName: string;
  totalCapacity: number;
  confirmedSeats: number;
  occupancyPercentage: number;
};

type MemberAttendanceState =
  | 'CONFIRMED'
  | 'PENDING_CONFIRMATION'
  | 'PAST_CUTOFF'
  | 'RELEASED_NO_SHOW'
  | 'SUBSCRIPTION_INACTIVE'
  | 'WINDOW_NOT_FOUND';

type MemberAttendanceRow = {
  memberPhone: string;
  resourcePoolName: string;
  startTime: string;
  endTime: string | null;
  cutoffTime: string | null;
  status: MemberAttendanceState;
  statusLabel: string;
};

function dayBounds(date?: string) {
  // Preserve the existing occupancy endpoint's UTC-day semantics for this phase.
  const day = date ? new Date(date) : new Date();
  const startOfDay = new Date(day);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(day);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

/**
 * F-066: the same bounds, but for a calendar day on the BRANCH's clock.
 *
 * Deliberately separate from `dayBounds` rather than replacing it: `dayBounds` is shared
 * with the occupancy endpoint, which feeds availability generation — explicitly Stage 2
 * scope, because changing it would move which windows that endpoint returns. For a UTC
 * branch this produces byte-identical bounds, so the split costs nothing today.
 */
function branchDayBounds(dateString: string, timeZone: string) {
  const startOfDay = branchLocalToUtc(dateString, '00:00', timeZone);
  const nextDay = addBranchDays(startOfDay, 1, timeZone);
  return { startOfDay, endOfDay: new Date(nextDay.getTime() - 1) };
}

// F-258 Phase 1: same shape as branchDayBounds, first/last instant of a calendar month instead
// of a day — a clean sibling rather than inlining against branchLocalToUtc a second time, since
// This Month needs exactly the same "branch-local boundary, half-open, minus one ms" pattern.
function branchMonthBounds(month: string, timeZone: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`branchMonthBounds: invalid month "${month}"`);
  const year = Number(m[1]);
  const monthNum = Number(m[2]);
  if (monthNum < 1 || monthNum > 12) throw new Error(`branchMonthBounds: invalid month "${month}"`);
  const startOfMonth = branchLocalToUtc(`${m[1]}-${m[2]}-01`, '00:00', timeZone);
  const nextMonthYear = monthNum === 12 ? year + 1 : year;
  const nextMonthNum = monthNum === 12 ? 1 : monthNum + 1;
  const startOfNextMonth = branchLocalToUtc(
    `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}-01`,
    '00:00',
    timeZone,
  );
  return { startOfMonth, endOfMonth: new Date(startOfNextMonth.getTime() - 1) };
}

// F-179: digit-count-only parsing let an invalid calendar date (Feb 30, Apr 31) silently
// normalise into a different real date via native Date rollover instead of being rejected —
// same root cause and remedy shape as F-173/F-176 in branchTime.ts, reusing daysInMonth rather
// than re-deriving it.
const CALENDAR_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateOnly(value: string | Date) {
  if (typeof value === 'string') {
    const m = CALENDAR_DATE_ONLY.exec(value);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
        const err = new Error('Invalid date');
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_DATE';
        throw err;
      }
    }
  }
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('Invalid date');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DATE';
    throw err;
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function dateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function datesInRange(fromDate: string, toDate: string, maxDays = 366) {
  const start = dateOnly(fromDate);
  const end = dateOnly(toDate);
  if (end < start) {
    const err = new Error('toDate must be on or after fromDate');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DATE_RANGE';
    throw err;
  }
  const dates: Date[] = [];
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 24 * 60 * 60 * 1000) {
    dates.push(new Date(cursor));
    if (dates.length > maxDays) {
      const err = new Error(`Date range cannot exceed ${maxDays} days`);
      (err as any).statusCode = 400;
      (err as any).code = 'DATE_RANGE_TOO_LARGE';
      throw err;
    }
  }
  return dates;
}

function validateTimeString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
    const err = new Error(`${fieldName} must be HH:mm`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TIME';
    throw err;
  }
}

function validateWholeSlotRange(startTime: string, endTime: string, slotDurationMinutes: number) {
  validateTimeString(startTime, 'startTime');
  validateTimeString(endTime, 'endTime');
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0 || 1440 % slotDurationMinutes !== 0) {
    const err = new Error('slotDurationMinutes must be a positive slot increment that divides one day');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DURATION';
    throw err;
  }
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (end <= start || (end - start) % slotDurationMinutes !== 0) {
    const err = new Error('time range must contain whole slots');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TIME_RANGE';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// F-169: creation-time validation for member group assignments
// ---------------------------------------------------------------------------
// WHY: `MemberGroupAssignment.startTime` is a free-form String and the create route
// checked only presence. A declared time no generated window can ever match produces a
// silently inert assignment — it yields no booking, and all three consumers (admin
// attendance, member view, sweep) simply find nothing. Rejecting at creation is the only
// point where the caller can still act on the error.
//
// Deliberately timezone-free: the declared startTime and the pattern's startTime/endTime
// are all branch-local HH:mm strings, so minute-of-day arithmetic on the strings is exact
// and involves no conversion. This keeps F-169 independent of F-088 parts (3)/(4), which
// must not gate it.
function minutesOfDay(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Valid window starts for a pattern are start + k*slot while < end — mirroring
// buildCandidatesFromDefinition's `cursor < end` loop exactly, so this predicate accepts
// precisely the times generation can produce.
function patternBoundaries(pattern: { startTime: string; endTime: string; slotDurationMinutes: number }): number[] {
  const start = minutesOfDay(pattern.startTime);
  const end = minutesOfDay(pattern.endTime);
  const boundaries: number[] = [];
  for (let cursor = start; cursor < end; cursor += pattern.slotDurationMinutes) {
    boundaries.push(cursor);
  }
  return boundaries;
}

function parseIsoDays(daysOfWeek: unknown): string[] {
  const raw = typeof daysOfWeek === 'string' ? daysOfWeek.split(',').map((day) => day.trim()) : [];
  const days = raw.filter((day) => day.length > 0);
  // An unparseable daysOfWeek is itself an inert assignment — it can never match a weekday —
  // and the alignment check below is unsound without a trustworthy day list.
  if (days.length === 0 || days.some((day) => !/^[1-7]$/.test(day))) {
    const err = new Error('daysOfWeek must be a comma-separated list of ISO weekdays (1=Mon … 7=Sun)');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DAYS_OF_WEEK';
    throw err;
  }
  return Array.from(new Set(days));
}

// Checks are ordered cheapest/most-decisive first so a bad request fails on the most
// useful error rather than the first one a lazier order would reach.
async function validateAssignmentSchedule(resourcePoolId: string, daysOfWeek: unknown, startTime: unknown) {
  validateTimeString(startTime, 'startTime');
  const declared = startTime as string;
  const days = parseIsoDays(daysOfWeek);

  // Pattern existence, NOT window existence: generation is lazy/on-access, so a correctly
  // configured pool legitimately has zero windows right now. Checking windows would reject
  // valid pools (confirmed via F-126/F-127's withdrawal).
  const patterns = await prisma.availabilityPattern.findMany({
    where: { resourcePoolId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (patterns.length === 0) {
    const err = new Error('Resource pool has no active availability pattern, so this assignment could never produce a booking');
    (err as any).statusCode = 400;
    (err as any).code = 'NO_AVAILABILITY_PATTERN';
    throw err;
  }

  // Patterns are weekday-scoped and a pool may hold several (generation findMany's every
  // ACTIVE one and filters by weekday), so each declared day is checked against the
  // patterns that actually cover it. A pool-wide check would accept an assignment whose
  // Thursday half is inert because only its Tuesday pattern exists.
  const declaredMinutes = minutesOfDay(declared);
  const uncoveredDays: string[] = [];
  const misalignedDays: string[] = [];
  const suggestions = new Set<number>();

  for (const day of days) {
    const dayPatterns = patterns.filter((pattern: any) =>
      pattern.daysOfWeek.split(',').map((entry: string) => entry.trim()).includes(day),
    );
    if (dayPatterns.length === 0) {
      uncoveredDays.push(day);
      continue;
    }
    const aligned = dayPatterns.some((pattern: any) => patternBoundaries(pattern).includes(declaredMinutes));
    if (!aligned) {
      misalignedDays.push(day);
      for (const pattern of dayPatterns) {
        for (const boundary of patternBoundaries(pattern)) suggestions.add(boundary);
      }
    }
  }

  if (uncoveredDays.length > 0) {
    const err = new Error(
      `No active availability pattern covers weekday(s) ${uncoveredDays.join(',')}, so this assignment could never produce a booking on ${uncoveredDays.length > 1 ? 'those days' : 'that day'}`,
    );
    (err as any).statusCode = 400;
    (err as any).code = 'NO_AVAILABILITY_PATTERN';
    throw err;
  }

  if (misalignedDays.length > 0) {
    // Actionable suggestion, following the pattern F-010 established for availability windows.
    const nearest = Array.from(suggestions).sort(
      (a, b) => Math.abs(a - declaredMinutes) - Math.abs(b - declaredMinutes) || a - b,
    )[0];
    const suffix = nearest === undefined ? '' : ` Nearest valid start time is ${timeFromMinutes(nearest)}.`;
    const err = new Error(
      `startTime ${declared} does not fall on a slot boundary for weekday(s) ${misalignedDays.join(',')}.${suffix}`,
    );
    (err as any).statusCode = 400;
    (err as any).code = 'START_TIME_NOT_ALIGNED';
    throw err;
  }
}

// F-211: patterns and branch operating hours are two independent models with nothing
// cross-checking them at write time — confirmed to have caused a real production incident
// (New Japan Badminton Court: Branch Settings claimed 7 days/05:00-23:00, real patterns left
// Sunday evening with zero inventory). Mirrors the existing getBranchTimeZone(branchId) pattern
// immediately below — same shared-Prisma read, no cross-service HTTP call needed.
async function getBranchOperatingWindow(branchId: string): Promise<{
  workingDays: string[];
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
}> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { workingDays: true, workingHoursStart: true, workingHoursEnd: true },
  });
  return branch ?? { workingDays: [], workingHoursStart: null, workingHoursEnd: null };
}

// Branch.workingDays stores full day names ("Monday" ... "Sunday"); AvailabilityPattern.daysOfWeek
// stores ISO weekday digits (1=Mon ... 7=Sun, same convention as isoWeekday()/parseIsoDays() below).
const DAY_NAME_TO_ISO: Record<string, string> = {
  Monday: '1',
  Tuesday: '2',
  Wednesday: '3',
  Thursday: '4',
  Friday: '5',
  Saturday: '6',
  Sunday: '7',
};

// F-211: reject (fail closed, explicit code) a pattern write that falls outside the branch's own
// stated operating hours/days. Fails open only when the branch has never had hours configured at
// all (nothing real to validate against yet) — same "don't block on absent data" convention as
// every other optional-field check in this file.
async function validatePatternAgainstBranchHours(branchId: string, data: {
  daysOfWeek?: string;
  startTime?: string;
  endTime?: string;
}, reply: any) {
  const { workingDays, workingHoursStart, workingHoursEnd } = await getBranchOperatingWindow(branchId);
  if (!workingHoursStart || !workingHoursEnd || workingDays.length === 0) return; // never configured — nothing to validate against

  const allowedIsoDays = new Set(workingDays.map((day) => DAY_NAME_TO_ISO[day]).filter(Boolean));
  const patternDays = (data.daysOfWeek ?? '').split(',').map((day) => day.trim()).filter(Boolean);
  const outsideDays = patternDays.filter((day) => !allowedIsoDays.has(day));

  const outsideTime =
    data.startTime !== undefined && data.endTime !== undefined &&
    (data.startTime < workingHoursStart || data.endTime > workingHoursEnd);

  if (outsideDays.length > 0 || outsideTime) {
    reply.status(400);
    const parts: string[] = [];
    if (outsideDays.length > 0) parts.push(`day(s) [${outsideDays.join(',')}] are not in the branch's working days`);
    if (outsideTime) parts.push(`time range ${data.startTime}-${data.endTime} falls outside branch hours ${workingHoursStart}-${workingHoursEnd}`);
    const err = new Error(`Pattern outside branch operating hours: ${parts.join('; ')}`);
    (err as any).statusCode = 400;
    (err as any).code = 'PATTERN_OUTSIDE_OPERATING_HOURS';
    throw err;
  }
}

// F-268: rejects a pattern write that would overlap another already-ACTIVE pattern on the same
// pool. Confirmed no legitimate overlap use case exists anywhere in this codebase (no priority/
// precedence field on the model, neither admin UI surfaces a "which pattern wins" choice) --
// reject-at-write-time is the right default, unlike F-263's capacity-vs-court-count case, since an
// admin can always avoid this by editing the one pattern instead of stacking a second.
//
// A write resolving to SUSPENDED produces no candidates in ensureAvailabilityWindowsForDate, so
// there's nothing to overlap -- checked via the resultant status, not the request body's raw
// field, since `patternDataFromBody` only sets `data.status` when the body supplies it explicitly
// (POST with no status omits it, relying on the schema's own ACTIVE default).
async function validateNoOverlappingActivePatterns(
  resourcePoolId: string,
  data: { daysOfWeek?: string; startTime?: string; endTime?: string; status?: string },
  excludePatternId: string | null,
  reply: any,
) {
  const resultantStatus = data.status ?? 'ACTIVE';
  if (resultantStatus !== 'ACTIVE') return;
  if (!data.daysOfWeek || !data.startTime || !data.endTime) return;

  const others = await prisma.availabilityPattern.findMany({
    where: {
      resourcePoolId,
      status: 'ACTIVE',
      ...(excludePatternId ? { id: { not: excludePatternId } } : {}),
    },
  });

  const newDays = new Set(data.daysOfWeek.split(',').map((day) => day.trim()));
  for (const other of others) {
    const otherDays = new Set(String(other.daysOfWeek).split(',').map((day: string) => day.trim()));
    const commonDays = [...newDays].filter((day) => otherDays.has(day));
    if (commonDays.length === 0) continue;

    // Same half-open-interval, string-comparable HH:mm convention validatePatternAgainstBranchHours
    // already uses above -- not a new comparison shape.
    const overlaps = data.startTime! < other.endTime && data.endTime! > other.startTime;
    if (overlaps) {
      reply.status(400);
      const err = new Error(
        `Pattern overlaps an existing active pattern (${other.id}) on day(s) [${commonDays.join(',')}]: ${other.startTime}-${other.endTime}`,
      );
      (err as any).statusCode = 400;
      (err as any).code = 'PATTERN_OVERLAP';
      throw err;
    }
  }
}

function patternDataFromBody(body: any, reply: any, partial = false) {
  const data: any = {};
  const required = ['daysOfWeek', 'startTime', 'endTime', 'slotDurationMinutes', 'capacity'];
  if (!partial) {
    for (const field of required) {
      if (body[field] === undefined) {
        reply.status(400);
        const err = new Error(`${field} is required`);
        (err as any).statusCode = 400;
        (err as any).code = 'BAD_REQUEST';
        throw err;
      }
    }
  }

  if (body.daysOfWeek !== undefined) {
    const days = String(body.daysOfWeek).split(',').map((day) => day.trim()).filter(Boolean);
    if (days.length === 0 || days.some((day) => !/^[1-7]$/.test(day))) {
      reply.status(400);
      const err = new Error('daysOfWeek must contain ISO weekdays 1-7');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_DAYS_OF_WEEK';
      throw err;
    }
    data.daysOfWeek = [...new Set(days)].join(',');
  }

  const nextStartTime = body.startTime;
  const nextEndTime = body.endTime;
  const nextDuration = body.slotDurationMinutes !== undefined ? Number(body.slotDurationMinutes) : undefined;
  if (!partial || nextStartTime !== undefined || nextEndTime !== undefined || nextDuration !== undefined) {
    if (nextStartTime === undefined || nextEndTime === undefined || nextDuration === undefined) {
      reply.status(400);
      const err = new Error('startTime, endTime, and slotDurationMinutes must be provided together');
      (err as any).statusCode = 400;
      (err as any).code = 'PARTIAL_TIME_RANGE';
      throw err;
    }
    validateWholeSlotRange(String(nextStartTime), String(nextEndTime), nextDuration);
    data.startTime = String(nextStartTime);
    data.endTime = String(nextEndTime);
    data.slotDurationMinutes = nextDuration;
  }

  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      reply.status(400);
      const err = new Error('capacity must be a positive integer');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_CAPACITY';
      throw err;
    }
    data.capacity = capacity;
  }

  const hasMode = body.pricingMode != null;
  const hasPrice = body.price != null;
  if (hasMode !== hasPrice) {
    reply.status(400);
    const err = new Error('pricingMode and price must both be provided or both omitted');
    (err as any).statusCode = 400;
    (err as any).code = 'PARTIAL_PRICING_OVERRIDE';
    throw err;
  }
  if (hasMode) {
    if (!Object.values(PricingMode).includes(body.pricingMode)) {
      reply.status(400);
      const err = new Error('Invalid pricingMode');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_PRICING_MODE';
      throw err;
    }
    const price = Number(body.price);
    if (Number.isNaN(price) || price < 0) {
      reply.status(400);
      const err = new Error('price must be a non-negative number');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_PRICE';
      throw err;
    }
    data.pricingMode = body.pricingMode;
    data.price = new Prisma.Decimal(price);
  }
  if (body.status !== undefined) {
    if (!['ACTIVE', 'SUSPENDED'].includes(body.status)) {
      reply.status(400);
      const err = new Error('status must be ACTIVE or SUSPENDED');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_STATUS';
      throw err;
    }
    data.status = body.status;
  }

  // F-207.1: startDate is optional at the API layer -- CREATE defaults to now() when absent
  // (no `existing` row to fall back on); PATCH always has a value to fall back on because the
  // route pre-merges `{...existing, ...body}` before calling this function, so `body.startDate`
  // here is really "merged.startDate" and is always defined on that path. endDate is never a
  // direct write target -- always server-computed as exactly one month out, guest patterns are
  // capped at one month by design.
  const rawStartDate = body.startDate !== undefined ? new Date(body.startDate) : (!partial ? new Date() : undefined);
  if (rawStartDate !== undefined) {
    if (Number.isNaN(rawStartDate.getTime())) {
      reply.status(400);
      const err = new Error('startDate must be a valid datetime');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_START_DATE';
      throw err;
    }
    data.startDate = rawStartDate;
    data.endDate = addMonthsUtc(rawStartDate, 1);
  }
  return data;
}

async function ensureGenerationForPoolDates(resourcePoolId: string, dates: Date[]) {
  const uniqueDates = [...new Set(dates.map(dateOnlyString))];
  for (const date of uniqueDates) {
    await ensureAvailabilityWindowsForDate(resourcePoolId, date);
  }
}

async function computePoolGuestOccupancy(resourcePoolIds: string[], date?: string): Promise<GuestOccupancyRow[]> {
  if (resourcePoolIds.length === 0) return [];

  const pools = await prisma.resourcePool.findMany({
    where: { id: { in: resourcePoolIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (date) {
    await Promise.all(pools.map((pool) => ensureAvailabilityWindowsForDate(pool.id, date)));
  }
  const { startOfDay, endOfDay } = dayBounds(date);
  const windows = await prisma.availabilityWindow.findMany({
    where: {
      resourcePoolId: { in: resourcePoolIds },
      startTime: { gte: startOfDay, lte: endOfDay },
    },
    select: { id: true, resourcePoolId: true, capacity: true },
  });

  const windowIds = windows.map((window) => window.id);
  const confirmedByWindow = windowIds.length > 0
    ? await prisma.booking.groupBy({
        by: ['windowId'],
        where: {
          windowId: { in: windowIds },
          isMemberBooking: false,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
        },
        _count: { _all: true },
      })
    : [];
  const confirmedLookup = new Map(confirmedByWindow.map((row) => [row.windowId, row._count._all]));

  return pools.map((pool) => {
    const poolWindows = windows.filter((window) => window.resourcePoolId === pool.id);
    const totalCapacity = poolWindows.reduce((sum, window) => sum + window.capacity, 0);
    const confirmedSeats = poolWindows.reduce((sum, window) => sum + (confirmedLookup.get(window.id) || 0), 0);
    return {
      resourcePoolId: pool.id,
      resourcePoolName: pool.name,
      totalCapacity,
      confirmedSeats,
      occupancyPercentage: totalCapacity > 0 ? Math.round((confirmedSeats / totalCapacity) * 100) : 0,
    };
  });
}

// F-066: `startTime` is branch local time per the schema, so the branch's clock decides
// which instant it names. Previously pasted straight into a UTC ISO string.
function slotStartForDate(dateString: string, startTime: string, timeZone: string): Date {
  return branchLocalToUtc(dateString, startTime, timeZone);
}

async function computeBranchMemberAttendance(branchId: string, date: string | undefined, now: Date): Promise<MemberAttendanceRow[]> {
  // F-066: this admin-facing attendance view had the same mixed-clock defect as the member
  // path — an explicit `date` was read as UTC while the weekday came from the process's
  // local clock, so the roster could be built for one calendar day and filtered by another.
  const timeZone = await getBranchTimeZone(branchId);
  const dateString = date || todayDateString(now, timeZone);
  // F-176: `date` is a raw, unvalidated query param, and neither call below was guarded — a
  // malformed value would 500 via Fastify's default handler instead of the clean 400 every other
  // malformed-input path in this file returns. Same guard shape as F-172's three other call sites.
  let weekday: string;
  let startOfDay: Date;
  let endOfDay: Date;
  try {
    // Midday anchor: any instant inside the branch's day names that day, and noon is the one
    // choice no DST transition can move across a date boundary.
    weekday = branchIsoWeekday(branchLocalToUtc(dateString, '12:00', timeZone), timeZone);
    ({ startOfDay, endOfDay } = branchDayBounds(dateString, timeZone));
  } catch (err: any) {
    const e = new Error(`Invalid date "${dateString}": ${err.message}`);
    (e as any).statusCode = 400;
    (e as any).code = 'INVALID_DATE';
    throw e;
  }

  const assignments = await prisma.memberGroupAssignment.findMany({
    where: {
      status: 'ACTIVE',
      resourcePool: { branchId },
    },
    include: {
      resourcePool: { include: { bookingRules: { orderBy: { createdAt: 'asc' } } } },
    },
    orderBy: { startTime: 'asc' },
  });
  const matchingAssignments = assignments.filter((assignment) => (
    assignment.daysOfWeek.split(',').map((day: string) => day.trim()).includes(weekday)
  ));
  if (matchingAssignments.length === 0) return [];

  const userIds = Array.from(new Set(matchingAssignments.map((assignment) => assignment.userId)));
  const poolIds = Array.from(new Set(matchingAssignments.map((assignment) => assignment.resourcePoolId)));
  const [users, windows, subscriptions] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, phone: true },
    }),
    prisma.availabilityWindow.findMany({
      where: {
        resourcePoolId: { in: poolIds },
        startTime: { gte: startOfDay, lte: endOfDay },
      },
      select: { id: true, resourcePoolId: true, startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    }),
    prisma.subscription.findMany({
      where: {
        userId: { in: userIds },
        status: 'active',
      },
      select: { userId: true },
    }),
  ]);
  const userPhone = new Map(users.map((user) => [user.id, user.phone || 'Phone not available']));
  const activeSubscriptions = new Set(subscriptions.map((subscription) => subscription.userId));
  const windowByAssignment = new Map<string, any>();

  for (const assignment of matchingAssignments) {
    // F-170: exact match, no tolerance. This previously accepted any window starting
    // within a forward 1-hour span of the declared time, so an assignment declaring 17:30
    // silently rebound to an 18:00 window and was then reported as 18:00 — the declared
    // time was never shown again. Exact match cannot spuriously fail for an assignment
    // created after F-169, whose alignment check guarantees a real boundary; a near-miss
    // now surfaces as WINDOW_NOT_FOUND, which all three consumers already handle.
    // F-172: a malformed stored `startTime` must not fail the whole branch view. The sweep
    // has guarded this since F-066; this path did not, so a single unparseable row threw out
    // of the request and 500'd the attendance screen for *every* member at the branch, not
    // just the bad one. Skipping leaves this assignment's map entry unset, which the roster
    // below already reports as WINDOW_NOT_FOUND — the same state a genuine non-match yields.
    let expectedStart: Date;
    try {
      expectedStart = slotStartForDate(dateString, assignment.startTime, timeZone);
    } catch (err: any) {
      console.warn(
        `[attendance] skipping assignment ${assignment.id}: unusable startTime ` +
          `${JSON.stringify(assignment.startTime)} — ${err.message}`,
      );
      continue;
    }
    const matchingWindow = windows.find((window) => (
      window.resourcePoolId === assignment.resourcePoolId &&
      window.startTime.getTime() === expectedStart.getTime()
    ));
    if (matchingWindow) {
      windowByAssignment.set(assignment.id, matchingWindow);
    }
  }

  const windowIds = Array.from(new Set(Array.from(windowByAssignment.values()).map((window: any) => window.id)));
  const bookings = windowIds.length > 0
    ? await prisma.booking.findMany({
        where: {
          userId: { in: userIds },
          windowId: { in: windowIds },
          isMemberBooking: true,
          status: { not: BookingStatus.CANCELLED },
        },
        select: {
          userId: true,
          windowId: true,
          status: true,
          memberAttendanceConfirmedAt: true,
        },
      })
    : [];
  const bookingByUserWindow = new Map(bookings.map((booking) => [`${booking.userId}:${booking.windowId}`, booking]));

  return matchingAssignments.flatMap<MemberAttendanceRow>((assignment) => {
    const memberPhone = userPhone.get(assignment.userId) || 'Phone not available';
    const matchingWindow = windowByAssignment.get(assignment.id);
    if (!matchingWindow) {
      return [{
        memberPhone,
        resourcePoolName: assignment.resourcePool.name,
        startTime: assignment.startTime,
        endTime: null,
        cutoffTime: null,
        status: 'WINDOW_NOT_FOUND' as MemberAttendanceState,
        statusLabel: 'Window not found',
      }];
    }

    const rule = assignment.resourcePool.bookingRules[0];
    const gracePeriodMinutes = rule ? rule.gracePeriodMinutes : 30;
    const cutoffTime = new Date(matchingWindow.startTime.getTime() - gracePeriodMinutes * 60 * 1000);

    const booking = bookingByUserWindow.get(`${assignment.userId}:${matchingWindow.id}`);
    let status: MemberAttendanceState = 'PENDING_CONFIRMATION';
    let statusLabel = 'Pending confirmation';
    if (!activeSubscriptions.has(assignment.userId)) {
      status = 'SUBSCRIPTION_INACTIVE';
      statusLabel = 'Subscription inactive';
    } else if (booking?.memberAttendanceConfirmedAt) {
      status = 'CONFIRMED';
      statusLabel = 'Confirmed';
    } else if (booking?.status === BookingStatus.RELEASED_NO_SHOW) {
      status = 'RELEASED_NO_SHOW';
      statusLabel = 'Released no-show';
    } else if (now >= cutoffTime) {
      status = 'PAST_CUTOFF';
      statusLabel = 'Cutoff passed';
    }

    return [{
      memberPhone,
      resourcePoolName: assignment.resourcePool.name,
      startTime: matchingWindow.startTime.toISOString(),
      endTime: matchingWindow.endTime.toISOString(),
      cutoffTime: cutoffTime.toISOString(),
      status,
      statusLabel,
    }];
  });
}

// F-276: group-level no-show detection. Reuses computeBranchMemberAttendance's exact per-member
// status logic (CONFIRMED / PENDING_CONFIRMATION / PAST_CUTOFF / RELEASED_NO_SHOW /
// SUBSCRIPTION_INACTIVE) rather than a second copy -- see that function's own comment for why each
// state means what it does. A group is release-eligible only once the window's own cutoff has
// passed AND zero members are CONFIRMED; PENDING_CONFIRMATION only exists pre-cutoff, so it can
// never coexist with now >= cutoffTime in practice, but the explicit `some` check below is the
// real gate, not an inferred one.
//
// WHY the Group's own resourcePoolId/daysOfWeek/startTime (schema.prisma:425-450), not a per-
// assignment schedule: a batch's members share one canonical schedule by construction (F-133's
// creation flow writes every assignment the same way the Group itself specifies), and this is the
// same assumption GuestOccupancyDashboard's per-window grouping already makes.
type GroupReleaseEligibility = {
  groupId: string;
  groupName: string;
  eligible: boolean;
  window: { id: string; startTime: Date; endTime: Date; resourcePoolId: string } | null;
  cutoffTime: Date | null;
  members: { userId: string; phone: string; status: MemberAttendanceState }[];
};

async function computeGroupReleaseEligibility(
  groupId: string,
  date: string | undefined,
  now: Date,
): Promise<GroupReleaseEligibility | null> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { resourcePool: { include: { bookingRules: { orderBy: { createdAt: 'asc' } } } } },
  });
  if (!group) return null;

  const timeZone = await getBranchTimeZone(group.resourcePool.branchId);
  const dateString = date || todayDateString(now, timeZone);
  let weekday: string;
  let expectedStart: Date;
  try {
    weekday = branchIsoWeekday(branchLocalToUtc(dateString, '12:00', timeZone), timeZone);
    expectedStart = slotStartForDate(dateString, group.startTime, timeZone);
  } catch (err: any) {
    const e = new Error(`Invalid date "${dateString}": ${err.message}`);
    (e as any).statusCode = 400;
    (e as any).code = 'INVALID_DATE';
    throw e;
  }

  if (!group.daysOfWeek.split(',').map((d) => d.trim()).includes(weekday)) {
    return { groupId, groupName: group.name, eligible: false, window: null, cutoffTime: null, members: [] };
  }

  const window = await prisma.availabilityWindow.findFirst({
    where: { resourcePoolId: group.resourcePoolId, startTime: expectedStart },
  });
  if (!window) return { groupId, groupName: group.name, eligible: false, window: null, cutoffTime: null, members: [] };

  const rule = group.resourcePool.bookingRules[0];
  const gracePeriodMinutes = rule ? rule.gracePeriodMinutes : 30;
  const cutoffTime = new Date(window.startTime.getTime() - gracePeriodMinutes * 60 * 1000);

  const assignments = await prisma.memberGroupAssignment.findMany({ where: { groupId, status: 'ACTIVE' } });
  if (assignments.length === 0) return { groupId, groupName: group.name, eligible: false, window, cutoffTime, members: [] };

  const userIds = Array.from(new Set(assignments.map((a) => a.userId)));
  const [bookings, subscriptions, users] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: { in: userIds }, windowId: window.id, isMemberBooking: true, status: { not: BookingStatus.CANCELLED } },
      select: { userId: true, status: true, memberAttendanceConfirmedAt: true },
    }),
    prisma.subscription.findMany({ where: { userId: { in: userIds }, status: 'active' }, select: { userId: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true } }),
  ]);
  const bookingByUser = new Map(bookings.map((b) => [b.userId, b]));
  const activeSubscriptions = new Set(subscriptions.map((s) => s.userId));
  const phoneByUser = new Map(users.map((u) => [u.id, u.phone || 'Phone not available']));

  const members = assignments.map((a) => {
    const booking = bookingByUser.get(a.userId);
    let status: MemberAttendanceState = 'PENDING_CONFIRMATION';
    if (!activeSubscriptions.has(a.userId)) {
      status = 'SUBSCRIPTION_INACTIVE';
    } else if (booking?.memberAttendanceConfirmedAt) {
      status = 'CONFIRMED';
    } else if (booking?.status === BookingStatus.RELEASED_NO_SHOW) {
      status = 'RELEASED_NO_SHOW';
    } else if (now >= cutoffTime) {
      status = 'PAST_CUTOFF';
    }
    return { userId: a.userId, phone: phoneByUser.get(a.userId) || 'Phone not available', status };
  });

  const eligible = now >= cutoffTime && !members.some((m) => m.status === 'CONFIRMED');
  return { groupId, groupName: group.name, eligible, window, cutoffTime, members };
}

// F-250: shared read for the Guest Occupancy Dashboard and Guest Slot Inventory grid. One pass
// over a branch's pools/resources/windows/bookings/member-assignments for a given day, on the
// branch's own clock (not `computePoolGuestOccupancy`'s UTC-day bounds — that function has two
// existing callers this deliberately doesn't touch, see the F-250 plan's blast-radius note).
// `MemberGroupAssignment` is pool-level, not resource-level (a member batch occupies every court
// in the pool for that hour), so a window's `memberBlocked` flag applies uniformly across the
// pool's resources — matching how `computeBranchMemberAttendance` above already treats it.
type GuestDayPool = {
  id: string;
  name: string;
  minBookingDurationMinutes: number;
  resources: { id: string; name: string; guestBookable: boolean }[];
};
type GuestDayBooking = {
  id: string;
  userId: string;
  resourceId: string | null;
  price: Prisma.Decimal | null;
  isMemberBooking: boolean;
  status: BookingStatus;
};
type GuestDayWindow = {
  id: string;
  resourcePoolId: string;
  resourceId: string | null;
  startTime: Date;
  endTime: Date;
  capacity: number;
  price: Prisma.Decimal | null;
  memberBlocked: boolean;
  memberBooked: boolean;
  // F-276: set only when memberBlocked is true AND the blocking assignment belongs to a real
  // Group (F-133) -- pre-F-133 assignments have groupId: null and are simply never release-
  // eligible, matching today's behavior exactly.
  memberBlockedGroupId: string | null;
  guestBookings: GuestDayBooking[];
  // F-252/F-254/F-256: a CANCELLED booking on an elapsed window with nothing rebooked into it
  // renders as its own "Cancelled" state — kept separate from guestBookings so the Dashboard's
  // and grid's own occupancy counts (which must only ever count real seats) never see it.
  cancelledBookings: GuestDayBooking[];
};
type BranchGuestDay = {
  timeZone: string;
  dateString: string;
  pools: GuestDayPool[];
  windows: GuestDayWindow[];
  guestUserMap: Map<string, { name: string | null; phone: string | null }>;
};

async function computeBranchGuestDay(branchId: string, date: string | undefined, now: Date): Promise<BranchGuestDay> {
  const timeZone = await getBranchTimeZone(branchId);
  const dateString = date || todayDateString(now, timeZone);
  let weekday: string;
  let startOfDay: Date;
  let endOfDay: Date;
  try {
    weekday = branchIsoWeekday(branchLocalToUtc(dateString, '12:00', timeZone), timeZone);
    ({ startOfDay, endOfDay } = branchDayBounds(dateString, timeZone));
  } catch (err: any) {
    const e = new Error(`Invalid date "${dateString}": ${err.message}`);
    (e as any).statusCode = 400;
    (e as any).code = 'INVALID_DATE';
    throw e;
  }

  const pools = await prisma.resourcePool.findMany({
    where: { branchId },
    select: {
      id: true,
      name: true,
      minBookingDurationMinutes: true,
      resources: { select: { id: true, name: true, guestBookable: true } },
    },
    orderBy: { name: 'asc' },
  });
  const poolIds = pools.map((pool) => pool.id);

  await Promise.all(poolIds.map((poolId) => ensureAvailabilityWindowsForDate(poolId, dateString)));

  const rawWindows = await prisma.availabilityWindow.findMany({
    where: { resourcePoolId: { in: poolIds }, startTime: { gte: startOfDay, lte: endOfDay } },
    orderBy: { startTime: 'asc' },
  });
  const windowIds = rawWindows.map((window) => window.id);

  const [bookings, assignments] = await Promise.all([
    windowIds.length > 0
      ? prisma.booking.findMany({
          where: {
            windowId: { in: windowIds },
            // F-183: exclude multi-hour child rows, same convention as guest-ledger.
            parentBookingId: null,
            // F-252/F-256: CANCELLED is fetched too (for the Cancelled cell state on an elapsed
            // window) but kept out of every occupancy count below — RELEASED_NO_SHOW is
            // deliberately NOT fetched, since a released hold never became a real booking and
            // renders as plain Elapsed (Chief-confirmed, F-252 Q&A).
            status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CANCELLED] },
          },
          select: {
            id: true,
            windowId: true,
            userId: true,
            resourceId: true,
            price: true,
            isMemberBooking: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    prisma.memberGroupAssignment.findMany({
      where: { status: 'ACTIVE', resourcePoolId: { in: poolIds } },
      select: { resourcePoolId: true, startTime: true, daysOfWeek: true, groupId: true },
    }),
  ]);

  const matchingAssignments = assignments.filter((assignment) => (
    assignment.daysOfWeek.split(',').map((day) => day.trim()).includes(weekday)
  ));
  const memberBlockedInstants = new Set<string>();
  // F-276: which real Group (if any) blocks a given instant -- last-write-wins is fine here since
  // two different groups sharing one exact pool+instant would already be a real scheduling
  // conflict the platform doesn't otherwise allow.
  const memberBlockedGroupByInstant = new Map<string, string>();
  for (const assignment of matchingAssignments) {
    try {
      const expectedStart = slotStartForDate(dateString, assignment.startTime, timeZone);
      const key = `${assignment.resourcePoolId}:${expectedStart.getTime()}`;
      memberBlockedInstants.add(key);
      if (assignment.groupId) memberBlockedGroupByInstant.set(key, assignment.groupId);
    } catch (err: any) {
      // Same tolerance as computeBranchMemberAttendance: a malformed stored startTime must not
      // fail the whole day's view.
      console.warn(`[guestDay] skipping assignment on pool ${assignment.resourcePoolId}: ${err.message}`);
    }
  }

  const bookingsByWindow = new Map<string, GuestDayBooking[]>();
  for (const booking of bookings) {
    const list = bookingsByWindow.get(booking.windowId) ?? [];
    list.push(booking);
    bookingsByWindow.set(booking.windowId, list);
  }

  const guestUserIds = [...new Set(bookings.filter((b) => !b.isMemberBooking).map((b) => b.userId))];
  const guestUsers = guestUserIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: guestUserIds } }, select: { id: true, name: true, phone: true } })
    : [];
  const guestUserMap = new Map(guestUsers.map((user) => [user.id, { name: user.name, phone: user.phone }]));

  const windows: GuestDayWindow[] = rawWindows.map((window) => {
    const windowBookings = bookingsByWindow.get(window.id) ?? [];
    const nonMemberBookings = windowBookings.filter((b) => !b.isMemberBooking);
    return {
      id: window.id,
      resourcePoolId: window.resourcePoolId,
      resourceId: window.resourceId,
      startTime: window.startTime,
      endTime: window.endTime,
      capacity: window.capacity,
      price: window.price,
      memberBlocked: memberBlockedInstants.has(`${window.resourcePoolId}:${window.startTime.getTime()}`),
      memberBlockedGroupId: memberBlockedGroupByInstant.get(`${window.resourcePoolId}:${window.startTime.getTime()}`) ?? null,
      memberBooked: windowBookings.some((b) => b.isMemberBooking),
      guestBookings: nonMemberBookings.filter((b) => b.status !== BookingStatus.CANCELLED),
      cancelledBookings: nonMemberBookings.filter((b) => b.status === BookingStatus.CANCELLED),
    };
  });

  return { timeZone, dateString, pools, windows, guestUserMap };
}

// F-258 Phase 1: This Month tab — branch-wide totals for a calendar month, reusing
// computeBranchGuestDay's pattern (pool-list → collect pool ids → query across all of them),
// NOT guest-ledger's per-pool route (guest-ledger is scoped to one resourcePoolId and caps
// `take` at 500 — wrong shape for a branch-wide monthly total). `Booking.price` is
// `Decimal? @db.Decimal(10,2)` (confirmed against packages/database/prisma/schema.prisma);
// `Number(...)` is the same conversion computeBranchGuestDay's own duesCollected total already
// uses above, reused here rather than guest-ledger's route, which returns the raw Decimal
// unconverted (fine there — its only consumer does its own `Number(r.price)` at render time).
async function computeBranchMonthTotals(branchId: string, month: string): Promise<{
  month: string;
  totalFees: number;
  totalBookings: number;
  rows: Array<{
    bookingId: string;
    windowStart: string;
    windowEnd: string;
    guestName: string | null;
    guestPhone: string | null;
    court: string | null;
    price: number;
    method: 'cash' | 'upi' | 'link' | 'other' | null;
  }>;
}> {
  const timeZone = await getBranchTimeZone(branchId);
  const { startOfMonth, endOfMonth } = branchMonthBounds(month, timeZone);

  const pools = await prisma.resourcePool.findMany({ where: { branchId }, select: { id: true } });
  const poolIds = pools.map((p) => p.id);

  const bookings = poolIds.length
    ? await prisma.booking.findMany({
        where: {
          resourcePoolId: { in: poolIds },
          isMemberBooking: false,
          // F-183: exclude multi-hour child rows, same convention as guest-ledger.
          parentBookingId: null,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
          window: { startTime: { gte: startOfMonth, lte: endOfMonth } },
        },
        include: { window: true, resource: true },
        orderBy: [{ window: { startTime: 'desc' } }],
      })
    : [];

  const bookingIds = bookings.map((b) => b.id);
  const userIds = [...new Set(bookings.map((b) => b.userId))];
  const [intents, users] = await Promise.all([
    bookingIds.length ? prisma.paymentIntent.findMany({ where: { referenceId: { in: bookingIds } } }) : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } }) : Promise.resolve([]),
  ]);
  const intentByBooking = new Map(intents.map((i) => [i.referenceId, i]));
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows = bookings.map((b) => ({
    bookingId: b.id,
    windowStart: b.window.startTime.toISOString(),
    windowEnd: b.window.endTime.toISOString(),
    guestName: userById.get(b.userId)?.name ?? null,
    guestPhone: userById.get(b.userId)?.phone ?? null,
    court: describeCourtAssignment(b.resource?.name, b.resourceId, b.courtSlotIndex),
    price: b.price != null ? Number(b.price) : 0,
    method: deriveLedgerMethod(intentByBooking.get(b.id)?.gatewayRef),
  }));

  return {
    month,
    totalFees: rows.reduce((sum, r) => sum + r.price, 0),
    totalBookings: rows.length,
    rows,
  };
}

// GET /branches/:id/guest-occupancy-dashboard?date= — F-250 Guest Occupancy Dashboard.
// Real branch-scoped metrics; no `computePoolGuestOccupancy` reuse (see computeBranchGuestDay's
// own comment on why: UTC-day bounds there vs. branch-local-day here).
server.get('/branches/:id/guest-occupancy-dashboard', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  const { date } = request.query as any;

  if (!isAuthorizedForBranch(auth, id)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  const day = await computeBranchGuestDay(id, date, new Date());
  const now = new Date();

  let totalCapacity = 0;
  let confirmedSeats = 0;
  let duesCollected = 0;
  const distinctGuestUsers = new Set<string>();
  for (const window of day.windows) {
    totalCapacity += window.capacity;
    confirmedSeats += window.guestBookings.length;
    for (const booking of window.guestBookings) {
      distinctGuestUsers.add(booking.userId);
      duesCollected += booking.price != null ? Number(booking.price) : 0;
    }
  }

  const slotMonitor = day.windows
    .filter((window) => !window.memberBlocked)
    .map((window) => ({
      windowId: window.id,
      resourcePoolId: window.resourcePoolId,
      startTime: window.startTime.toISOString(),
      endTime: window.endTime.toISOString(),
      capacity: window.capacity,
      bookedCount: window.guestBookings.length,
      booked: window.guestBookings.length > 0,
      // F-254: real 3-state model — the old `active: now < window.endTime` never checked
      // whether the window had actually STARTED, so a slot 49 minutes from starting showed
      // identically "Active" as one genuinely in progress (confirmed live, 16:11 UTC, F-254's
      // own repro). Vacancy/booked counts are unchanged either way (F-255 Q&A — Chief confirmed
      // the mock keeps them on Closed rows, correcting this finding's own earlier-written
      // "stop showing vacancy counts" wording).
      status: now >= window.endTime ? 'closed' as const : now >= window.startTime ? 'live' as const : 'upcoming' as const,
    }));

  // F-276: resolve group-release-eligibility once per distinct group blocking today's windows
  // (not per resource-loop iteration below, which would repeat the same query many times over for
  // a POOLED pool's several resources sharing one window). Keyed by groupId; the date is the same
  // for the whole request so one eligibility answer per group is correct for every window it
  // blocks today.
  const blockedGroupIds = Array.from(new Set(
    day.windows.map((w) => w.memberBlockedGroupId).filter((g): g is string => g !== null),
  ));
  const groupEligibilityByGroupId = new Map<string, GroupReleaseEligibility>(
    (await Promise.all(blockedGroupIds.map((gid) => computeGroupReleaseEligibility(gid, day.dateString, now))))
      .filter((g): g is GroupReleaseEligibility => g !== null)
      .map((g) => [g.groupId, g]),
  );

  // Live allocation is a per-resource snapshot of "now". For a POOLED pool (resourceId null on
  // the window), every resource in the pool shares the same window snapshot — POOLED pools have
  // no fixed per-court identity to disambiguate further, same limitation ReservationsPanel's own
  // "Court is assigned automatically for this pool" copy already accepts.
  const liveAllocation = day.pools.flatMap((pool) => pool.resources.map((resource) => {
    const currentWindow = day.windows.find((window) => (
      window.resourcePoolId === pool.id &&
      (window.resourceId === resource.id || window.resourceId == null) &&
      window.startTime <= now && now < window.endTime
    ));
    // F-262: `currentWindow` being undefined means nothing was ever scheduled for this resource
    // at this exact instant -- distinct from a real window that's genuinely vacant. Reuses the
    // same absence signal `guest-inventory-grid`'s own elapsed/empty vs. guest-vacant split
    // already keys off one level up; no new lookup, no new data.
    let status: 'open' | 'member' | 'guest' | 'unconfigured' | 'member_released' = currentWindow ? 'open' : 'unconfigured';
    let guestName: string | null = null;
    let groupId: string | null = null;
    if (currentWindow) {
      // F-276: a real guest booking already placed here (the admin used "Place a guest" on this
      // exact window) MUST outrank the group-released reading below -- caught live in browser
      // verification: without this ordering, a court a guest is genuinely occupying kept showing
      // "Member no-show — released" and offering "Place a guest" again after the fact, since the
      // group's own attendance state (zero members ever confirmed) never changes just because a
      // guest was placed into it. A real occupant is always the most current truth for a court.
      if (currentWindow.guestBookings.length > 0) {
        status = 'guest';
        const user = day.guestUserMap.get(currentWindow.guestBookings[0].userId);
        guestName = user?.name || user?.phone || null;
      } else {
        const groupEligibility = currentWindow.memberBlockedGroupId
          ? groupEligibilityByGroupId.get(currentWindow.memberBlockedGroupId)
          : undefined;
        if (groupEligibility?.eligible) {
          status = 'member_released';
          groupId = currentWindow.memberBlockedGroupId;
        } else if (currentWindow.memberBlocked || currentWindow.memberBooked) {
          status = 'member';
        }
      }
    }
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      resourcePoolId: pool.id,
      status,
      guestName,
      groupId,
      windowId: currentWindow?.id ?? null,
      windowStartTime: currentWindow?.startTime.toISOString() ?? null,
      windowEndTime: currentWindow?.endTime.toISOString() ?? null,
    };
  }));

  // F-276: forward-looking member-attendance summary for windows blocked by a real Group starting
  // within the next 2 hours -- same eligibility answers already computed above, just filtered and
  // reshaped for display rather than a second query.
  const twoHoursOut = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const memberAttendanceNext2Hours = day.windows
    .filter((w) => w.memberBlockedGroupId && w.startTime >= now && w.startTime <= twoHoursOut)
    .map((w) => {
      const eligibility = groupEligibilityByGroupId.get(w.memberBlockedGroupId!);
      return {
        windowId: w.id,
        resourcePoolId: w.resourcePoolId,
        startTime: w.startTime.toISOString(),
        endTime: w.endTime.toISOString(),
        groupId: w.memberBlockedGroupId!,
        groupName: eligibility?.groupName ?? '',
        cutoffTime: eligibility?.cutoffTime?.toISOString() ?? null,
        releaseEligible: eligibility?.eligible ?? false,
        members: eligibility?.members ?? [],
      };
    });

  return {
    date: day.dateString,
    totalGuestsToday: distinctGuestUsers.size,
    guestSlots: day.windows.length,
    utilizationPercentage: totalCapacity > 0 ? Math.round((confirmedSeats / totalCapacity) * 100) : 0,
    duesCollected,
    slotMonitor,
    liveAllocation,
    memberAttendanceNext2Hours,
    // F-255: the exact instant liveAllocation was computed against — rendered branch-local as
    // "as of <time>" so the label can never drift from what's actually shown, regardless of
    // client/server clock skew.
    liveAllocationAsOf: now.toISOString(),
  };
});

// GET /branches/:id/guest-inventory-grid?date=&poolId= — F-250 Guest Slot Inventory, 5-state
// model per F-252/F-256: member-blocked / elapsed / completed / cancelled / guest-booked /
// guest-vacant / empty. A cell's face never carries guest name/phone/price (F-252 Q1) — that
// only exists behind the tap-through GET /bookings/:id/guest-detail (below).
server.get('/branches/:id/guest-inventory-grid', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  const { date, poolId } = request.query as any;

  if (!isAuthorizedForBranch(auth, id)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }
  if (!poolId) {
    reply.status(400);
    const err = new Error('poolId query parameter is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const day = await computeBranchGuestDay(id, date, new Date());
  const pool = day.pools.find((p) => p.id === poolId);
  if (!pool) {
    reply.status(404);
    const err = new Error('Resource pool not found on this branch');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  const branch = await prisma.branch.findUnique({ where: { id }, select: { workingHoursStart: true, workingHoursEnd: true } });
  const duration = pool.minBookingDurationMinutes || 60;
  const rowStarts: Date[] = [];
  let cursor = branchLocalToUtc(day.dateString, branch?.workingHoursStart || '06:00', day.timeZone);
  const rangeEnd = branchLocalToUtc(day.dateString, branch?.workingHoursEnd || '22:00', day.timeZone);
  while (cursor.getTime() < rangeEnd.getTime()) {
    rowStarts.push(cursor);
    cursor = new Date(cursor.getTime() + duration * 60 * 1000);
  }

  const poolWindows = day.windows.filter((window) => window.resourcePoolId === poolId);
  const now = new Date();

  const cells = pool.resources.flatMap((resource) => rowStarts.map((rowStart) => {
    const window = poolWindows.find((w) => (
      w.startTime.getTime() === rowStart.getTime() && (w.resourceId === resource.id || w.resourceId == null)
    ));
    if (!window) {
      // A past hour with no window ever configured is equally "nothing to show" as an elapsed
      // window with no booking — never actionable either way, so it renders the same as Elapsed
      // rather than a stale-looking "+" for a slot that can no longer be created for real.
      const elapsed = rowStart.getTime() + duration * 60 * 1000 <= now.getTime();
      return elapsed
        ? { type: 'elapsed' as const, resourceId: resource.id, startTime: rowStart.toISOString() }
        : { type: 'empty' as const, resourceId: resource.id, startTime: rowStart.toISOString() };
    }
    if (window.memberBlocked) {
      return {
        type: 'member-blocked' as const,
        resourceId: resource.id,
        windowId: window.id,
        startTime: window.startTime.toISOString(),
        endTime: window.endTime.toISOString(),
      };
    }
    const isElapsed = now >= window.endTime;
    if (window.guestBookings.length > 0) {
      const booking = window.guestBookings[0];
      return {
        type: isElapsed ? ('completed' as const) : ('guest-booked' as const),
        resourceId: resource.id,
        windowId: window.id,
        bookingId: booking.id,
        startTime: window.startTime.toISOString(),
        endTime: window.endTime.toISOString(),
      };
    }
    // F-252: Cancelled is elapsed-only — a future slot cancelled and reopened with nothing
    // rebooked into it renders as plain Open (Q1, confirmed by the mock's own footnote), never
    // as its own state. Only an elapsed, unresolved cancellation gets the Cancelled treatment.
    if (isElapsed && window.cancelledBookings.length > 0) {
      const booking = window.cancelledBookings[0];
      return {
        type: 'cancelled' as const,
        resourceId: resource.id,
        windowId: window.id,
        bookingId: booking.id,
        startTime: window.startTime.toISOString(),
        endTime: window.endTime.toISOString(),
      };
    }
    if (isElapsed) {
      return {
        type: 'elapsed' as const,
        resourceId: resource.id,
        windowId: window.id,
        startTime: window.startTime.toISOString(),
        endTime: window.endTime.toISOString(),
      };
    }
    return {
      type: 'guest-vacant' as const,
      resourceId: resource.id,
      windowId: window.id,
      startTime: window.startTime.toISOString(),
      endTime: window.endTime.toISOString(),
    };
  }));

  return {
    date: day.dateString,
    poolId,
    resources: pool.resources,
    rows: rowStarts.map((r) => r.toISOString()),
    cells,
  };
});

// GET /branches/:id/guest-month-summary?month=YYYY-MM — F-258 Phase 1: the Dashboard's "This
// Month" tab. Same branch-scope gate as guest-occupancy-dashboard/guest-inventory-grid above
// (getInternalOrAdminAuth + isAuthorizedForBranch) — confirmed against the current code rather
// than introducing a differently-named guard for the same resource.
server.get('/branches/:id/guest-month-summary', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;

  if (!isAuthorizedForBranch(auth, id)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  const { month } = request.query as any;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    reply.status(400);
    const err = new Error('month is required, format YYYY-MM');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_MONTH';
    throw err;
  }

  try {
    return await computeBranchMonthTotals(id, month);
  } catch (err: any) {
    reply.status(400);
    const e = new Error(`Invalid month "${month}": ${err.message}`);
    (e as any).statusCode = 400;
    (e as any).code = 'INVALID_MONTH';
    throw e;
  }
});

// ---------------------------------------------------------------------------
// Price resolution helper
// ---------------------------------------------------------------------------

// F-224: guest-only Standard/Peak blanket rates, branch-wide. Supplied ONLY by the guest
// self-service booking call site; the member auto-booking call site passes no guestCtx and
// this whole branch is skipped, so member pricing is byte-for-byte unchanged. A per-window
// AvailabilityWindow.price override still wins ahead of all of this.
type GuestPricingCtx = {
  standardRate: Prisma.Decimal | null;
  peakRate: Prisma.Decimal | null;
  peakWindows: { start: string; end: string }[];
  windowStartInstant: Date;
  timeZone: string;
};

const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// F-266: matches admin-v2's own `RateSource` (`apps/admin-v2/src/screens/guestManagement/
// reservationHelpers.ts`) exactly, so a value threaded from here to a frontend can share that
// screen's existing label copy/convention rather than inventing a second one.
type RateSource = 'window' | 'peak' | 'standard' | 'default';

// F-224 resolution: peak when the window's branch-local start falls inside ANY configured peak
// window (half-open [start, end)). peakRate only applies when it's actually set — a branch with
// windows but no peak rate falls through to standard, and a branch with neither falls through
// to pool.defaultRate exactly as before F-224.
//
// F-266: also returns which branch was taken. Previously computed and discarded, leaving the
// frontend no way to show a guest which rate was actually applied.
const resolveGuestBlanketRate = (
  pool: any,
  ctx: GuestPricingCtx,
): { rate: Prisma.Decimal; source: 'peak' | 'standard' | 'default' } => {
  const startMin = branchMinutesOfDay(ctx.windowStartInstant, ctx.timeZone);
  const inPeak = ctx.peakWindows.some((w) => {
    const s = hhmmToMinutes(w.start);
    const e = hhmmToMinutes(w.end);
    return startMin >= s && startMin < e;
  });
  if (inPeak && ctx.peakRate != null) return { rate: ctx.peakRate, source: 'peak' };
  if (ctx.standardRate != null) return { rate: ctx.standardRate, source: 'standard' };
  return { rate: new Prisma.Decimal(pool.defaultRate), source: 'default' };
};

// WHY: Server-side price is ALWAYS resolved here; callers have no influence over it.
// Resolution chain: window override → guest blanket rate (F-224, guest path only) → pool default.
// Both pricingMode and price on the window must be set together (both-or-neither).
// groupSize = 1 (booker) + coPlayers.length.
//
// F-266: returns `{ price, source }` rather than a bare Decimal, for the same reason as
// `resolveGuestBlanketRate` above — every caller that only needs the number reads `.price`.
const resolvePrice = (
  pool: any,
  window: any,
  groupSize: number,
  guestCtx?: GuestPricingCtx,
): { price: Prisma.Decimal; source: RateSource } => {
  const activePricingMode: string = window.pricingMode ?? pool.pricingMode ?? PricingMode.FLAT;
  let activeRate: Prisma.Decimal;
  let source: RateSource;
  if (window.price != null) {
    activeRate = new Prisma.Decimal(window.price);
    source = 'window';
  } else if (guestCtx) {
    const resolved = resolveGuestBlanketRate(pool, guestCtx);
    activeRate = resolved.rate;
    source = resolved.source;
  } else {
    activeRate = new Prisma.Decimal(pool.defaultRate);
    source = 'default';
  }

  const price = activePricingMode === PricingMode.PER_PERSON ? activeRate.mul(groupSize) : activeRate;
  return { price, source };
};

// F-133 Slice B: per-assignment now, not platform-singular -- a member may hold more than one
// ACTIVE MemberGroupAssignment concurrently since Slice A dropped the one-active-per-member
// index. NO_ACTIVE_ASSIGNMENT is no longer a resolution state here: "no assignments at all" is
// an empty array from resolveTodayMemberAssignments, and "this specific assignmentId isn't the
// caller's active one" is resolveOneTodayMemberAssignment returning null (404 at the route).
type TodayAssignmentResolution =
  | { state: 'NO_SESSION_TODAY'; assignmentId: string; weekday: string; assignment: any }
  | { state: 'WINDOW_NOT_FOUND'; assignmentId: string; weekday: string; assignment: any }
  | { state: 'HAS_SESSION'; assignmentId: string; weekday: string; assignment: any; window: any; existingBooking: any | null; rule: any | null; cutoffTime: Date };

// F-066: "today" and "this weekday" are properties of the BRANCH, not of the server.
// These previously disagreed with each other — the date came from UTC and the weekday from
// the process's local clock — so a member with a Thursday session could be told there was
// no session today because the container's own clock still said Wednesday.
function todayDateString(now: Date, timeZone: string): string {
  return branchDateString(now, timeZone);
}

function isoWeekday(now: Date, timeZone: string): string {
  return branchIsoWeekday(now, timeZone);
}

function memberBookingIdempotencyKey(userId: string, windowId: string, now: Date, timeZone: string): string {
  return `member-booking-${userId}-${windowId}-${todayDateString(now, timeZone)}`;
}

/**
 * F-066: resolves a branch's timezone.
 *
 * WHY A SEPARATE QUERY: `ResourcePool.branchId` is a scalar with no Prisma relation (see
 * schema.prisma, "Scalar UUID, no DB relation yet"), so the branch cannot be `include`d
 * from a pool. This is a primary-key lookup on paths that already issue several queries.
 *
 * The stored value is passed through `safeTimeZone` because Tenant Management writes it
 * without validation and `Intl` throws on an unknown zone.
 */
async function getBranchTimeZone(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { timezone: true },
  });
  if (!branch) {
    console.warn(`[branchTime] branch ${branchId} not found — using ${DEFAULT_TIME_ZONE}`);
    return DEFAULT_TIME_ZONE;
  }
  return safeTimeZone(branch.timezone, `branch ${branchId}`);
}

/**
 * Batch form for the sweep, which iterates every active assignment across every branch.
 * One `findMany` instead of an N+1, and one bad row cannot poison the others because each
 * value is validated independently.
 */
async function getBranchTimeZones(branchIds: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(branchIds)];
  const branches = await prisma.branch.findMany({
    where: { id: { in: unique } },
    select: { id: true, timezone: true },
  });
  const map = new Map<string, string>();
  for (const b of branches) map.set(b.id, safeTimeZone(b.timezone, `branch ${b.id}`));
  for (const id of unique) {
    if (!map.has(id)) {
      console.warn(`[branchTime] branch ${id} not found — using ${DEFAULT_TIME_ZONE}`);
      map.set(id, DEFAULT_TIME_ZONE);
    }
  }
  return map;
}

async function getActiveSubscription(userId: string, tenantId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      tenantId,
      status: 'active',
    },
  });
}

// F-133 Slice B: the real per-assignment resolution logic, unchanged from the pre-Slice-B
// single-assignment version below it -- factored out so both the "list everything for today"
// path (GET) and the "resolve exactly one, ownership-checked" path (confirm/decline) share one
// implementation rather than two copies that could drift.
async function resolveAssignmentToday(assignment: any, now: Date): Promise<TodayAssignmentResolution> {
  const timeZone = await getBranchTimeZone(assignment.resourcePool.branchId);
  const weekday = isoWeekday(now, timeZone);

  const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
  if (!days.includes(weekday)) {
    return { state: 'NO_SESSION_TODAY', assignmentId: assignment.id, weekday, assignment };
  }

  // F-066: `startTime` is documented as branch local time in the schema, and is now read
  // as such instead of being pasted into a UTC ISO string.
  // F-172: guard the conversion, matching the sweep and the admin attendance path. A
  // malformed stored `startTime` previously threw out of this request; it now resolves to
  // WINDOW_NOT_FOUND, the identical state returned just below for an ordinary non-match.
  let windowStart: Date;
  try {
    windowStart = branchLocalToUtc(todayDateString(now, timeZone), assignment.startTime, timeZone);
  } catch (err: any) {
    console.warn(
      `[memberView] assignment ${assignment.id}: unusable startTime ` +
        `${JSON.stringify(assignment.startTime)} — ${err.message}`,
    );
    return { state: 'WINDOW_NOT_FOUND', assignmentId: assignment.id, weekday, assignment };
  }
  // F-170: exact match, no tolerance — see the note on the admin attendance path.
  const matchingWindow = await prisma.availabilityWindow.findFirst({
    where: {
      resourcePoolId: assignment.resourcePoolId,
      startTime: windowStart,
    },
  });
  if (!matchingWindow) return { state: 'WINDOW_NOT_FOUND', assignmentId: assignment.id, weekday, assignment };

  const existingBooking = await prisma.booking.findFirst({
    where: {
      userId: assignment.userId,
      windowId: matchingWindow.id,
      status: { not: BookingStatus.CANCELLED },
    },
  });
  const rule = assignment.resourcePool.bookingRules[0] ?? null;
  const gracePeriodMinutes = rule ? rule.gracePeriodMinutes : 30;
  const cutoffTime = new Date(matchingWindow.startTime.getTime() - gracePeriodMinutes * 60 * 1000);

  return {
    state: 'HAS_SESSION',
    assignmentId: assignment.id,
    weekday,
    assignment,
    window: matchingWindow,
    existingBooking,
    rule,
    cutoffTime,
  };
}

const MEMBER_ASSIGNMENT_INCLUDE = {
  resourcePool: { include: { bookingRules: { orderBy: { createdAt: 'asc' as const } } } },
};

// F-133 Slice B: one resolution per active assignment with a session today -- a member with two
// concurrent batches gets two entries, each independently confirmable/declinable. Replaces the
// old findFirst-based singular resolveTodayMemberAssignment.
async function resolveTodayMemberAssignments(userId: string, tenantId: string, now: Date): Promise<TodayAssignmentResolution[]> {
  const assignments = await prisma.memberGroupAssignment.findMany({
    where: { userId, status: 'ACTIVE', resourcePool: { tenantId } },
    include: MEMBER_ASSIGNMENT_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  const results: TodayAssignmentResolution[] = [];
  for (const assignment of assignments) {
    results.push(await resolveAssignmentToday(assignment, now));
  }
  return results;
}

// F-133 Slice B: resolves exactly one assignment by id, scoped to the caller (userId + tenantId)
// so confirm/decline can never act on someone else's assignment -- the same real-ownership check
// as requireBookingAccess elsewhere in this file, not a client-trusted id alone. Returns null
// when the id doesn't exist, isn't ACTIVE, or doesn't belong to this caller -- the route turns
// that into a 404, never a 403, to avoid confirming another user's assignment id even exists.
async function resolveOneTodayMemberAssignment(
  userId: string,
  tenantId: string,
  assignmentId: string,
  now: Date,
): Promise<TodayAssignmentResolution | null> {
  const assignment = await prisma.memberGroupAssignment.findFirst({
    where: { id: assignmentId, userId, status: 'ACTIVE', resourcePool: { tenantId } },
    include: MEMBER_ASSIGNMENT_INCLUDE,
  });
  if (!assignment) return null;
  return resolveAssignmentToday(assignment, now);
}

async function ensureTodayMemberBooking({
  assignment,
  matchingWindow,
  now,
  status,
  attendanceConfirmedAt,
  attendanceDeclinedAt = null,
  timeZone,
}: {
  assignment: any;
  matchingWindow: any;
  now: Date;
  status: BookingStatus;
  attendanceConfirmedAt: Date | null;
  // F-133 Slice B: the explicit-decline counterpart to attendanceConfirmedAt. Optional/defaults
  // null so every pre-existing caller (member confirm, the sweep's release) is unaffected.
  attendanceDeclinedAt?: Date | null;
  timeZone: string;
}) {
  // F-066: the key embeds the calendar date, which is now the BRANCH's date. Under a UTC
  // branch this is byte-identical to before. Safe to change because the duplicate guard
  // that actually prevents a second booking is the (userId, windowId) check inside the
  // transaction below — the key is a second line of defence, not the only one.
  const key = memberBookingIdempotencyKey(assignment.userId, matchingWindow.id, now, timeZone);

  try {
    return await prisma.$transaction(async (tx: any) => {
      // WHY: Member confirm and sweep are competing triggers for the same logical
      // daily booking. Locking the window and double-checking inside the transaction
      // preserves the Phase 9 sweep concurrency contract for both callers.
      await tx.$queryRaw`
        SELECT id FROM "AvailabilityWindow" WHERE id = ${matchingWindow.id} FOR UPDATE
      `;

      const existing = await tx.booking.findFirst({
        where: {
          userId: assignment.userId,
          windowId: matchingWindow.id,
          status: { not: BookingStatus.CANCELLED },
        },
      });
      if (existing) return { booking: existing, created: false };

      const pool = assignment.resourcePool;

      // F-207.2: defensive capacity guard, not the enforcement mechanism -- that's the
      // ongoing exclusion in windowBookable/POST /bookings, which should mean a window this
      // function reaches is never actually full. This is the safety net for whatever gets past
      // it anyway (a pre-existing occupying booking placed via the admin-discretionary
      // /bookings/negotiated path, which is deliberately NOT collision-checked, or any other
      // gap): fail loudly rather than silently insert a booking past real capacity.
      const activeOccupants = await tx.booking.findMany({
        where: { windowId: matchingWindow.id, status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] } },
        select: { resourceId: true },
      });
      const atCapacity = pool.allocationMode === AllocationMode.FIXED_INSTANCE
        ? activeOccupants.some((b: any) => b.resourceId === matchingWindow.resourceId)
        : activeOccupants.length >= matchingWindow.capacity;
      if (atCapacity) {
        const err = new Error('This window is already at capacity');
        (err as any).statusCode = 409;
        (err as any).code = 'MEMBER_SLOT_AT_CAPACITY';
        throw err;
      }

      const resolvedPrice = resolvePrice(pool, matchingWindow, 1).price;
      const booking = await tx.booking.create({
        data: {
          tenantId: pool.tenantId,
          branchId: pool.branchId,
          resourcePoolId: pool.id,
          resourceId: null,
          windowId: matchingWindow.id,
          userId: assignment.userId,
          status,
          heldAt: now,
          heldUntil: now,
          idempotencyKey: key,
          isMemberBooking: true,
          memberAttendanceConfirmedAt: attendanceConfirmedAt,
          memberAttendanceDeclinedAt: attendanceDeclinedAt,
          refundAmount: null,
          price: resolvedPrice,
        },
      });
      return { booking, created: true };
    });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.booking.findUnique({ where: { idempotencyKey: key } });
      if (existing) return { booking: existing, created: false };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

server.get('/health', async () => {
  // F-077: BUILD_GIT_SHA is baked in at image build; the deploy verifier compares it
    // against the SHA it intended to ship. 'unknown' locally, where there is no build step.
    return { status: 'ok', service: 'slot-engine', version: process.env.BUILD_GIT_SHA ?? 'unknown' };
});

// ---------------------------------------------------------------------------
// Resource Pool endpoints
// ---------------------------------------------------------------------------

// Create a Resource Pool.
// Phase 9: accepts new pricing / occupancy fields.
// AUTH (F-091): this route had none, and a real unauthenticated request was shown creating a
// pool. Authenticate first, then authorize against the branch — there is no pool yet, so
// requirePoolScope has nothing to re-read and isAuthorizedForBranch is the branch-level
// equivalent the file already uses.
//
// TENANT DERIVATION (F-091, following F-045): tenantId used to come straight from the body,
// unvalidated. An admin JWT now supplies it and any body value is ignored — the body is never a
// tenant authority. The internal key keeps the body value: it is the platform/bootstrap caller,
// has no token to derive from, and is how scripts/provision-tenant.mjs onboards a new tenant.
// This mirrors tenant-management's verifyTenantOwnerOrInternal treating the internal key as
// trusted bootstrap. Safe to change because no JWT caller existed — admin-web has no create-pool
// path at all, which is F-098.
// Shared field validation for resource pools, used by BOTH create and update.
//
// WHY (SCREEN-002): POST previously validated none of these fields — it went straight from the
// request body to `create` with `x ? Number(x) : default` coercion — while PATCH enforced the real
// rules. So a form posting to POST could create a pool that the very next PATCH would refuse to
// save: capacity below minOccupancy, a duration that does not divide a day, a negative rate. The
// onboarding wizard is the first caller that would hit that split routinely.
//
// This is F-068's precedent applied to pools: that finding fixed the identical split for booking
// rules by extracting `validateBookingRuleFields` and calling it from both verbs. One function is
// what stops the two paths drifting again.
//
// `existing` present  => PATCH semantics: only supplied fields are validated and emitted, and
//                        cross-field comparisons fall back to the stored row.
// `existing` absent    => POST semantics: the full set is validated, with defaults applied.
function validateResourcePoolFields(
  body: any,
  reply: any,
  existing?: { capacity: number; minOccupancy: number },
): Record<string, any> {
  const data: any = {};
  const isCreate = existing === undefined;
  const fail = (message: string, code: string) => {
    reply.status(400);
    const err = new Error(message);
    (err as any).statusCode = 400;
    (err as any).code = code;
    return err;
  };

  if (isCreate || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) throw fail('name cannot be empty', 'BAD_REQUEST');
    data.name = name;
  }

  // Cross-field, so it is evaluated even when only one side is supplied — the case that let a
  // PATCH-invalid pool be created through POST.
  const capacity = body.capacity !== undefined ? Number(body.capacity) : (existing ? existing.capacity : 1);
  const minOccupancy = body.minOccupancy !== undefined ? Number(body.minOccupancy) : (existing ? existing.minOccupancy : 1);
  if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(minOccupancy) || minOccupancy < 1 || capacity < minOccupancy) {
    throw fail('capacity must be >= minOccupancy and both must be positive integers', 'INVALID_OCCUPANCY');
  }
  if (isCreate || body.capacity !== undefined) data.capacity = capacity;
  if (isCreate || body.minOccupancy !== undefined) data.minOccupancy = minOccupancy;

  if (isCreate || body.minBookingDurationMinutes !== undefined) {
    const duration = body.minBookingDurationMinutes !== undefined ? Number(body.minBookingDurationMinutes) : 60;
    if (!Number.isInteger(duration) || duration <= 0 || 1440 % duration !== 0) {
      throw fail('minBookingDurationMinutes must be a positive slot increment that divides one day', 'INVALID_DURATION');
    }
    data.minBookingDurationMinutes = duration;
  }

  if (isCreate || body.pricingMode !== undefined) {
    const mode = body.pricingMode ?? PricingMode.FLAT;
    if (!Object.values(PricingMode).includes(mode)) throw fail('Invalid pricingMode', 'INVALID_PRICING_MODE');
    data.pricingMode = mode as PricingMode;
  }

  if (isCreate || body.defaultRate !== undefined) {
    const rate = body.defaultRate !== undefined ? Number(body.defaultRate) : 100.00;
    if (Number.isNaN(rate) || rate < 0) throw fail('defaultRate must be a non-negative number', 'INVALID_RATE');
    data.defaultRate = new Prisma.Decimal(rate);
    // Kept in step with defaultRate, exactly as PATCH already did.
    data.basePrice = new Prisma.Decimal(rate);
  }

  return data;
}

server.post('/resource-pools', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206

  const {
    tenantId: bodyTenantId, branchId, allocationMode, basePrice,
  } = request.body as any;

  if (!branchId) {
    reply.status(400);
    const err = new Error('branchId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const tenantId = auth.isInternal ? bodyTenantId : auth.tenantId;
  if (!tenantId) {
    reply.status(400);
    const err = new Error('tenantId could not be resolved');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  if (!isAuthorizedForBranch(auth, branchId)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  // The branch must belong to the resolved tenant, so a branch id from one tenant cannot be
  // used to plant a pool under another.
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } });
  if (!branch || branch.tenantId !== tenantId) {
    reply.status(403);
    const err = new Error('Forbidden: Branch does not belong to this tenant');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  // SCREEN-002: the same validator PATCH uses, so this endpoint can no longer create a pool the
  // edit screen would refuse to save. Runs after authorization, never before it.
  const validated = validateResourcePoolFields(request.body, reply);

  // WHY: We create a resource pool. For POOLED allocation mode, capacity defines the total capacity size.
  // Assembled as `any` for the same reason PATCH does: the validator returns a field bag, and
  // spreading it inline loses the compiler's view of the required keys it always sets.
  const createData: any = {
    tenantId,
    branchId,
    allocationMode: allocationMode as AllocationMode,
    ...validated,
  };
  // An explicit basePrice still wins, preserving the pre-existing create contract that
  // provisioning relies on; the validator otherwise keeps it in step with defaultRate.
  if (basePrice !== undefined) createData.basePrice = new Prisma.Decimal(basePrice);

  const pool = await prisma.resourcePool.create({ data: createData });
  return pool;
});

// Update Resource Pool configuration (admin-only).
// WHY: Admin Web edits operational settings after initial setup. Tenant/branch ownership
// is intentionally immutable here so a client cannot move a pool across authorization scopes.
server.patch('/resource-pools/:id', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id } = request.params as any;
  const existing = await requirePoolScope(auth, id, reply);
  const body = request.body as any;

  if ('tenantId' in body || 'branchId' in body || 'allocationMode' in body) {
    reply.status(400);
    const err = new Error('tenantId, branchId, and allocationMode cannot be changed through this endpoint');
    (err as any).statusCode = 400;
    (err as any).code = 'IMMUTABLE_FIELD';
    throw err;
  }

  // SCREEN-002: extracted to validateResourcePoolFields so POST enforces exactly these rules too.
  // Passing `existing` preserves this endpoint's partial-update semantics unchanged: only supplied
  // fields are validated and written, and the capacity/minOccupancy comparison still falls back to
  // the stored row when only one side is sent.
  const data = validateResourcePoolFields(body, reply, existing);

  return await prisma.resourcePool.update({
    where: { id },
    data,
    include: { resources: true, bookingRules: { orderBy: { createdAt: 'asc' } } },
  });
});

// Helper endpoint to add Resources to a pool.
// AUTH (F-091): same guard as every other pool-scoped admin route. requirePoolScope re-reads
// pool.branchId from the database, so the path id cannot assert branch authority it does not have.
server.post('/resource-pools/:id/resources', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const { name } = request.body as any;

  // WHY: Resources are specific nameable assets (e.g. Court_3) tied to a FIXED_INSTANCE pool.
  const resource = await prisma.resource.create({
    data: {
      resourcePoolId: id,
      name,
    },
  });
  return resource;
});

// F-225: which of a pool's courts a walk-in guest booking may be assigned. Whole-pool replace —
// the body's `authorizedResourceIds` become guestBookable:true, every other court in the pool
// guestBookable:false. Owner-only (verifyTenantOwnerOrInternal's slot-engine equivalent) +
// GUEST_BOOKING-gated. Only the guest self-service booking path reads guestBookable; the
// admin/negotiated and member paths ignore it.
server.patch('/resource-pools/:id/guest-court-eligibility', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  requireOwnerOrInternal(auth, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id } = request.params as any;
  const pool = await requirePoolScope(auth, id, reply);

  const { authorizedResourceIds } = (request.body ?? {}) as any;
  if (!Array.isArray(authorizedResourceIds) || authorizedResourceIds.some((x) => typeof x !== 'string')) {
    reply.status(400);
    const err = new Error('authorizedResourceIds must be an array of resource ids');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  const poolResourceIds = new Set(pool.resources.map((r) => r.id));
  const unknown = authorizedResourceIds.find((rid: string) => !poolResourceIds.has(rid));
  if (unknown) {
    reply.status(400);
    const err = new Error(`Resource ${unknown} does not belong to this pool`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_RESOURCE';
    throw err;
  }

  const authorized = new Set<string>(authorizedResourceIds);
  const toEnable = pool.resources.filter((r) => authorized.has(r.id)).map((r) => r.id);
  const toDisable = pool.resources.filter((r) => !authorized.has(r.id)).map((r) => r.id);

  await prisma.$transaction([
    prisma.resource.updateMany({ where: { id: { in: toEnable } }, data: { guestBookable: true } }),
    prisma.resource.updateMany({ where: { id: { in: toDisable } }, data: { guestBookable: false } }),
  ]);

  const resources = await prisma.resource.findMany({
    where: { resourcePoolId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, guestBookable: true },
  });
  return { resources };
});

// Add Availability Windows to a pool.
// Phase 9: accepts optional pricingMode + price per-release override.
// WHY: Both-or-neither validation — a partial pricing override (mode without rate or vice-versa)
// would silently mis-price bookings. We reject instead.
// AUTH (F-091): the worst-placed of the four — every sibling availability route (patterns and
// overrides) already used exactly this guard, and only this one did not. It creates bookable
// inventory, so an unauthenticated caller could put guest-sellable slots on any pool's calendar.
server.post('/resource-pools/:id/availability-windows', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const { resourceId, startTime, endTime, capacity, pricingMode, price } = request.body as any;

  const hasMode = pricingMode != null;
  const hasPrice = price != null;
  if (hasMode !== hasPrice) {
    reply.status(400);
    const err = new Error('pricingMode and price must both be provided or both omitted');
    (err as any).statusCode = 400;
    (err as any).code = 'PARTIAL_PRICING_OVERRIDE';
    throw err;
  }

  const pool = await prisma.resourcePool.findUnique({
    where: { id },
  });
  if (!pool) {
    reply.status(404);
    const err = new Error('Resource pool not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  const duration = pool.minBookingDurationMinutes || 60;
  // F-066: slot boundaries and the "did you mean 10:00 or 11:00?" hint are stated on the
  // branch's clock, not the server's.
  const poolTimeZone = await getBranchTimeZone(pool.branchId);
  // F-087: parse on the same clock the boundary check below judges against. This line used to be
  // `new Date(startTime)`, which resolved a naive datetime on the SERVER's clock while
  // `isAlignedToBoundary` immediately judged it on the branch's — two clocks, agreeing only by the
  // coincidence that both are currently UTC.
  let start: Date;
  let end: Date;
  try {
    start = parseBranchLocalDateTime(startTime, poolTimeZone, 'startTime');
    end = parseBranchLocalDateTime(endTime, poolTimeZone, 'endTime');
  } catch (e: any) {
    reply.status(400);
    const err = new Error(e.message);
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  if (!isAlignedToBoundary(start, duration, poolTimeZone)) {
    const enteredStr = formatHHMM(start, poolTimeZone);
    const lowerStr = formatHHMM(floorTimeToBoundary(start, duration, poolTimeZone), poolTimeZone);
    const upperStr = formatHHMM(ceilTimeToBoundary(start, duration, poolTimeZone), poolTimeZone);
    reply.status(400);
    const err = new Error(`Start time must align to ${duration}-minute slots for this court. You entered ${enteredStr} — did you mean ${lowerStr} or ${upperStr}?`);
    (err as any).statusCode = 400;
    (err as any).code = 'UNALIGNED_TIME_BOUNDARY';
    throw err;
  }

  if (!isAlignedToBoundary(end, duration, poolTimeZone)) {
    const enteredStr = formatHHMM(end, poolTimeZone);
    const lowerStr = formatHHMM(floorTimeToBoundary(end, duration, poolTimeZone), poolTimeZone);
    const upperStr = formatHHMM(ceilTimeToBoundary(end, duration, poolTimeZone), poolTimeZone);
    reply.status(400);
    const err = new Error(`End time must align to ${duration}-minute slots for this court. You entered ${enteredStr} — did you mean ${lowerStr} or ${upperStr}?`);
    (err as any).statusCode = 400;
    (err as any).code = 'UNALIGNED_TIME_BOUNDARY';
    throw err;
  }

  // Ensure window is at least one duration block long
  if (end.getTime() - start.getTime() < duration * 60 * 1000) {
    reply.status(400);
    const err = new Error(`Availability window duration must be at least ${duration} minutes.`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_WINDOW_DURATION';
    throw err;
  }

  const window = await prisma.availabilityWindow.create({
    data: {
      resourcePoolId: id,
      resourceId,
      startTime: start,
      endTime: end,
      capacity: capacity ? Number(capacity) : 1,
      pricingMode: pricingMode ? (pricingMode as PricingMode) : null,
      price: price != null ? new Prisma.Decimal(price) : null,
    },
  });
  return window;
});

// Occupancy for a pool (public, no auth).
// AUTH (F-091): its branch-level equivalents, /branches/:id/guest-occupancy and
// /branches/:id/member-attendance, were both already protected; only the pool-level one was not.
//
// The previous comment here claimed this was a non-sensitive aggregate that "guests and admins
// both need for display". A caller sweep found no guest caller at all — admin-web's OccupancyPage
// is the only product consumer, alongside two regression call sites. The guest apps never request
// it. So the stated justification for leaving it open did not match how it is actually used, and
// it is now scoped like the admin data it is.
server.get('/resource-pools/:id/occupancy', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const { date } = request.query as any;

  const pool = await prisma.resourcePool.findUnique({ where: { id } });
  if (!pool) {
    reply.status(404);
    throw new Error('Resource pool not found');
  }

  const [occupancy] = await computePoolGuestOccupancy([pool.id], date);
  return {
    totalCapacity: occupancy?.totalCapacity ?? 0,
    confirmedSeats: occupancy?.confirmedSeats ?? 0,
    occupancyPercentage: occupancy?.occupancyPercentage ?? 0,
  };
});

// GET /resource-pools/:id/guest-ledger — F-229: the admin "Ledger" screen's Guest tab.
//
// Every guest booking for this pool with its payment status joined. Owner / branch_manager
// (requirePoolScope — same gate as the other pool-scoped admin reads). Read-only.
//
// The Cash / UPI / Link method label is derived purely from the PaymentIntent.gatewayRef prefix
// set by POST /bookings/manual (Step 3) — there is deliberately no `method` column. `Booking`
// has no `user` relation and `PaymentIntent` has no relation to `Booking` (referenceId is a bare
// string), so both are joined in memory with one extra query each.
const deriveLedgerMethod = (gatewayRef: string | null | undefined): 'cash' | 'upi' | 'link' | 'other' | null => {
  if (!gatewayRef) return null;
  if (gatewayRef.startsWith('cash_')) return 'cash';
  if (gatewayRef.startsWith('upi_')) return 'upi';
  if (gatewayRef.startsWith('plink_') || gatewayRef.startsWith('pay_')) return 'link';
  return 'other';
};

server.get('/resource-pools/:id/guest-ledger', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  const pool = await requirePoolScope(auth, id, reply);

  const { status, limit } = request.query as any;
  if (status && !Object.values(BookingStatus).includes(status)) {
    reply.status(400);
    const err = new Error(`Invalid status. One of: ${Object.values(BookingStatus).join(', ')}`);
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  const take = Math.min(Math.max(Number(limit) || 200, 1), 500);

  const bookings = await prisma.booking.findMany({
    where: {
      resourcePoolId: pool.id,
      isMemberBooking: false,
      // F-183: child rows carry no price and no PaymentIntent of their own — same exclusion
      // GET /bookings/admin and GET /bookings/my already make.
      parentBookingId: null,
      ...(status ? { status: status as BookingStatus } : {}),
    },
    include: { window: true, resource: true },
    orderBy: [{ window: { startTime: 'desc' } }],
    take,
  });

  const bookingIds = bookings.map((b: any) => b.id);
  const userIds = [...new Set(bookings.map((b: any) => b.userId))];

  const [intents, users] = await Promise.all([
    bookingIds.length
      ? prisma.paymentIntent.findMany({ where: { referenceId: { in: bookingIds } } })
      : Promise.resolve([] as any[]),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true } })
      : Promise.resolve([] as any[]),
  ]);
  const intentByBooking = new Map(intents.map((i: any) => [i.referenceId, i]));
  const userById = new Map(users.map((u: any) => [u.id, u]));

  return bookings.map((b: any) => {
    const intent = intentByBooking.get(b.id) ?? null;
    return {
      bookingId: b.id,
      status: b.status,
      date: b.window.startTime,
      windowStart: b.window.startTime,
      windowEnd: b.window.endTime,
      guest: userById.get(b.userId) ?? { id: b.userId, name: null, phone: null },
      court: describeCourtAssignment(b.resource?.name, b.resourceId, b.courtSlotIndex),
      courtSlotIndex: b.courtSlotIndex,
      resourceId: b.resourceId,
      price: b.price,
      payment: intent
        ? {
            intentId: intent.id,
            amountPaise: intent.amount,
            status: intent.status,
            gatewayRef: intent.gatewayRef,
            method: deriveLedgerMethod(intent.gatewayRef),
          }
        : null,
    };
  });
});

// F-252: distinguishes an admin-created walk-in payment from a guest self-service one, for the
// Inventory detail modal's "Booked by"/"Cancelled by" field. Checks the raw gatewayRef prefix
// directly — NOT via deriveLedgerMethod's method bucket, which was tried first and confirmed
// wrong against real data: deriveLedgerMethod buckets both `plink_` (admin's payment-link
// intent, set by POST /bookings/manual) and `pay_` (a guest's own direct Razorpay checkout,
// generated in services/payment/src/index.ts right next to its termsAcceptedAt check — a
// guest-only requirement) into the same 'link' PAYMENT METHOD, which is correct for the
// Cash/UPI/Link display but conflates two different CHANNELS. Confirmed live: the real JBC
// booking 430244d5's gatewayRef is `pay_mock_...` — genuinely guest self-service — and the
// method-bucket approach would have mislabeled it "Front desk (walk-in)". `cash_`/`upi_`/
// `plink_` (never `pay_` alone) are set exclusively by POST /bookings/manual (confirmed sole
// caller) and are never overwritten by the payment webhook (it only updates `status`, not
// `gatewayRef` — confirmed by reading it directly), so checking for exactly these three
// prefixes is a permanent, reliable signal, not a heuristic — inferring from User.name was
// rejected for the same reason (nothing marks a User row as admin-entered vs. self-service).
const deriveBookingChannel = (gatewayRef: string | null | undefined): string => {
  if (!gatewayRef) return 'Online booking';
  const isWalkIn = gatewayRef.startsWith('cash_') || gatewayRef.startsWith('upi_') || gatewayRef.startsWith('plink_');
  return isWalkIn ? 'Front desk (walk-in)' : 'Online booking';
};

const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', link: 'Razorpay' };

// GET /bookings/:id/guest-detail — F-252/F-254/F-255/F-256/F-257 batch: the Inventory grid's
// tap-through detail for a Booked/Completed/Cancelled cell. Reuses guest-ledger's own
// PaymentIntent-join pattern for one booking instead of a pool's worth (rule 3) — deliberately a
// dedicated on-tap read rather than bloating guest-inventory-grid's per-cell payload with detail
// most cells never need. Same dual-path auth as cancel/cancel-preview.
server.get('/bookings/:id/guest-detail', async (request, reply) => {
  let isInternal = false;
  let decodedUser: any = null;
  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch (e) {
    try {
      decodedUser = await request.jwtVerify();
    } catch (jwtErr) {
      reply.status(401);
      throw new Error('Unauthorized');
    }
  }

  const { id } = request.params as any;
  const booking = await prisma.booking.findUnique({ where: { id }, include: { window: true, resource: true } });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
  }

  if (!isInternal && decodedUser) {
    requireBookingAccess(booking, decodedUser, reply);
  }

  if (booking.parentBookingId) {
    reply.status(400);
    const err = new Error('Cannot view detail for a child booking directly — act on the parent booking id');
    (err as any).statusCode = 400;
    (err as any).code = 'CHILD_BOOKING_NOT_VIEWABLE';
    throw err;
  }

  const [intent, user] = await Promise.all([
    prisma.paymentIntent.findFirst({ where: { referenceId: booking.id } }),
    prisma.user.findUnique({ where: { id: booking.userId }, select: { id: true, name: true, phone: true } }),
  ]);
  const method = deriveLedgerMethod(intent?.gatewayRef);
  const channel = deriveBookingChannel(intent?.gatewayRef);
  const courtLabel = describeCourtAssignment(booking.resource?.name, booking.resourceId, booking.courtSlotIndex);

  const base = {
    bookingId: booking.id,
    status: booking.status,
    courtLabel,
    windowStart: booking.window.startTime,
    windowEnd: booking.window.endTime,
    guestName: user?.name ?? null,
    guestPhone: user?.phone ?? null,
  };

  if (booking.status === BookingStatus.CANCELLED) {
    // F-252 Q3: three real variants, branched on whether a real captured payment ever existed
    // (refundAmount/refundPercent alone can't distinguish "never collected" from "paid but cancelled
    // too late for any refund" — both persist as refundAmount: null/0; confirmed by reading the
    // /cancel route's transaction directly).
    const methodLabel = method ? PAYMENT_METHOD_LABEL[method] ?? 'Payment' : 'Payment';
    const captured = intent?.status === 'captured';
    const refundAmount = Number(booking.refundAmount || 0);
    const originalPrice = Number(booking.price || 0);
    let payment: string;
    if (!captured) {
      payment = `${methodLabel} — not collected`;
    } else if (refundAmount > 0) {
      const refundPercent = originalPrice > 0 ? Math.round((refundAmount / originalPrice) * 100) : 0;
      payment = `${methodLabel} — ₹${refundAmount} refunded (${refundPercent}%)`;
    } else {
      payment = `${methodLabel} — no refund (cancelled after cutoff)`;
    }
    return {
      ...base,
      priceAtBooking: booking.price != null ? String(booking.price) : null,
      cancelledBy: channel,
      payment,
    };
  }

  return {
    ...base,
    price: booking.price != null ? String(booking.price) : null,
    // Friendly label ("Razorpay"/"Cash"/"UPI"), not the raw LedgerMethod enum — confirmed live
    // this needed fixing (first pass returned the bare enum value, e.g. "link", to the UI).
    paymentMethod: method ? PAYMENT_METHOD_LABEL[method] ?? 'Other' : null,
    bookedBy: channel,
  };
});

// ---------------------------------------------------------------------------
// Availability Patterns
// ---------------------------------------------------------------------------

server.get('/resource-pools/:id/availability-patterns', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: false }); // F-206
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);

  return prisma.availabilityPattern.findMany({
    where: { resourcePoolId: id },
    orderBy: { createdAt: 'asc' },
  });
});

server.post('/resource-pools/:id/availability-patterns', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  requireOwnerOrInternal(auth, reply); // F-237: same class of gap as F-223, this route family was missed
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id } = request.params as any;
  const pool = await requirePoolScope(auth, id, reply);
  const data = patternDataFromBody(request.body as any, reply);
  await validatePatternAgainstBranchHours(pool.branchId, data, reply); // F-211
  await validateNoOverlappingActivePatterns(id, data, null, reply); // F-268

  const pattern = await prisma.availabilityPattern.create({
    data: {
      resourcePoolId: id,
      ...data,
    },
  });
  reply.status(201);
  return pattern;
});

server.patch('/resource-pools/:id/availability-patterns/:patternId', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  requireOwnerOrInternal(auth, reply); // F-237
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id, patternId } = request.params as any;
  const pool = await requirePoolScope(auth, id, reply);

  const existing = await prisma.availabilityPattern.findFirst({ where: { id: patternId, resourcePoolId: id } });
  if (!existing) {
    reply.status(404);
    const err = new Error('Availability pattern not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  const body = request.body as any;
  const merged = {
    ...existing,
    ...body,
    slotDurationMinutes: body.slotDurationMinutes !== undefined ? Number(body.slotDurationMinutes) : existing.slotDurationMinutes,
  };
  const data = patternDataFromBody(merged, reply, false);
  await validatePatternAgainstBranchHours(pool.branchId, data, reply); // F-211
  await validateNoOverlappingActivePatterns(id, data, patternId, reply); // F-268

  // F-261: reconcile in the same transaction as the update -- a PATCH can change any field
  // (day/time/status/capacity/price), and an already-generated future window never picks up any
  // of those changes on its own (ensureAvailabilityWindowsForDate only ever adds). No diffing of
  // old vs. new definition: any date this pattern still legitimately covers regenerates
  // identically, correctly, next time it's queried.
  const [updated, windowReconciliation] = await prisma.$transaction(async (tx: any) => {
    const reconciliation = await reconcilePatternWindows(tx, id, patternId, new Date());
    const pattern = await tx.availabilityPattern.update({
      where: { id: patternId },
      data,
    });
    return [pattern, reconciliation];
  });

  return { ...updated, windowReconciliation };
});

server.delete('/resource-pools/:id/availability-patterns/:patternId', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  requireOwnerOrInternal(auth, reply); // F-237
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id, patternId } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const existing = await prisma.availabilityPattern.findFirst({ where: { id: patternId, resourcePoolId: id } });
  if (!existing) {
    reply.status(404);
    const err = new Error('Availability pattern not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  // F-261: reconcile in the same transaction as the delete -- see the PATCH route's identical
  // comment above for the full reasoning (bounds, cascade-hazard avoidance).
  const [deleted, windowReconciliation] = await prisma.$transaction(async (tx: any) => {
    const reconciliation = await reconcilePatternWindows(tx, id, patternId, new Date());
    const pattern = await tx.availabilityPattern.delete({ where: { id: patternId } });
    return [pattern, reconciliation];
  });

  return { ...deleted, windowReconciliation };
});

// F-207.1: extends a pattern's endDate by exactly one month from its CURRENT endDate (not from
// now()) -- a renewal that runs a week late still lands the new endDate one month past the old
// one, not one month past today. No body. Same owner-only auth as this pattern's siblings
// (POST/PATCH/DELETE above), since patterns are an owner-only route family (F-237). Deliberately
// skips F-211's branch-hours check and F-268's overlap check -- both only ever read
// daysOfWeek/startTime/endTime/status, none of which a renewal touches -- and skips F-261's
// window-reconciliation transaction, since nothing about the pattern's bookable definition
// changes.
server.post('/resource-pools/:id/availability-patterns/:patternId/renew', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  requireOwnerOrInternal(auth, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id, patternId } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const existing = await prisma.availabilityPattern.findFirst({ where: { id: patternId, resourcePoolId: id } });
  if (!existing) {
    reply.status(404);
    const err = new Error('Availability pattern not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  return prisma.availabilityPattern.update({
    where: { id: patternId },
    data: { endDate: addMonthsUtc(existing.endDate, 1) },
  });
});

// ---------------------------------------------------------------------------
// Availability Overrides
// ---------------------------------------------------------------------------

server.get('/resource-pools/:id/availability-overrides', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: false }); // F-206
  const { id } = request.params as any;
  const { fromDate, toDate } = request.query as any;
  await requirePoolScope(auth, id, reply);

  const where: any = { resourcePoolId: id };
  if (fromDate || toDate) {
    where.date = {
      ...(fromDate ? { gte: dateOnly(fromDate) } : {}),
      ...(toDate ? { lte: dateOnly(toDate) } : {}),
    };
  }

  return prisma.availabilityOverride.findMany({
    where,
    orderBy: { date: 'asc' },
  });
});

function overrideDataFromBody(body: any, reply: any) {
  if (!Object.values(AvailabilityOverrideType).includes(body.type)) {
    reply.status(400);
    const err = new Error('type must be CLOSED or MODIFIED');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_OVERRIDE_TYPE';
    throw err;
  }

  const data: any = {
    type: body.type,
    reason: body.reason ?? null,
  };

  if (body.type === AvailabilityOverrideType.CLOSED) {
    return {
      ...data,
      startTime: null,
      endTime: null,
      slotDurationMinutes: null,
      capacity: null,
      pricingMode: null,
      price: null,
    };
  }

  for (const field of ['startTime', 'endTime', 'slotDurationMinutes', 'capacity']) {
    if (body[field] === undefined || body[field] === null) {
      reply.status(400);
      const err = new Error(`${field} is required for a modified override`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_OVERRIDE';
      throw err;
    }
  }
  const slotDurationMinutes = Number(body.slotDurationMinutes);
  validateWholeSlotRange(String(body.startTime), String(body.endTime), slotDurationMinutes);
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    reply.status(400);
    const err = new Error('capacity must be a positive integer');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_CAPACITY';
    throw err;
  }

  const hasMode = body.pricingMode != null;
  const hasPrice = body.price != null;
  if (hasMode !== hasPrice) {
    reply.status(400);
    const err = new Error('pricingMode and price must both be provided or both omitted');
    (err as any).statusCode = 400;
    (err as any).code = 'PARTIAL_PRICING_OVERRIDE';
    throw err;
  }

  data.startTime = String(body.startTime);
  data.endTime = String(body.endTime);
  data.slotDurationMinutes = slotDurationMinutes;
  data.capacity = capacity;
  data.pricingMode = null;
  data.price = null;
  if (hasMode) {
    if (!Object.values(PricingMode).includes(body.pricingMode)) {
      reply.status(400);
      const err = new Error('Invalid pricingMode');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_PRICING_MODE';
      throw err;
    }
    const price = Number(body.price);
    if (Number.isNaN(price) || price < 0) {
      reply.status(400);
      const err = new Error('price must be a non-negative number');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_PRICE';
      throw err;
    }
    data.pricingMode = body.pricingMode;
    data.price = new Prisma.Decimal(price);
  }
  return data;
}

server.post('/resource-pools/:id/availability-overrides', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id } = request.params as any;
  const body = request.body as any;
  await requirePoolScope(auth, id, reply);

  const fromDate = body.fromDate ?? body.date;
  const toDate = body.toDate ?? body.date ?? body.fromDate;
  if (!fromDate || !toDate) {
    reply.status(400);
    const err = new Error('fromDate/toDate or date is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  const dates = datesInRange(String(fromDate), String(toDate), 90);
  const data = overrideDataFromBody(body, reply);

  const overrides = await prisma.$transaction(
    dates.map((date) => prisma.availabilityOverride.upsert({
      where: {
        resourcePoolId_date: {
          resourcePoolId: id,
          date,
        },
      },
      update: data,
      create: {
        resourcePoolId: id,
        date,
        ...data,
      },
    })),
  );
  reply.status(201);
  return overrides;
});

server.patch('/resource-pools/:id/availability-overrides/:overrideId', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id, overrideId } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const existing = await prisma.availabilityOverride.findFirst({ where: { id: overrideId, resourcePoolId: id } });
  if (!existing) {
    reply.status(404);
    const err = new Error('Availability override not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  const merged = { ...existing, ...(request.body as any) };
  const data = overrideDataFromBody(merged, reply);
  return prisma.availabilityOverride.update({
    where: { id: overrideId },
    data,
  });
});

server.delete('/resource-pools/:id/availability-overrides/:overrideId', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206
  const { id, overrideId } = request.params as any;
  await requirePoolScope(auth, id, reply);

  const existing = await prisma.availabilityOverride.findFirst({ where: { id: overrideId, resourcePoolId: id } });
  if (!existing) {
    reply.status(404);
    const err = new Error('Availability override not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

  return prisma.availabilityOverride.delete({ where: { id: overrideId } });
});

// F-222: read-only booking-conflict count for a prospective Special Hours override.
// WHY: Special Hours (F-220 §1b) upserts AvailabilityOverride rows with no awareness of bookings
// that already exist on that date. This gives the admin UI a non-blocking heads-up count only —
// it changes nothing, cancels nothing, notifies no one. The real resolution (conflict handling +
// notification) is deferred, tracked as F-222. Auth is identical to the availability-override
// siblings above: internal-or-admin, GUEST_BOOKING entitlement (read), then pool scope.
//   ?date=YYYY-MM-DD                              -> CLOSED: every active booking on that date
//   ?date=YYYY-MM-DD&startTime=HH:MM&endTime=HH:MM -> MODIFIED: only bookings outside the new hours
// F-066: all date/time math goes through the branch-clock helpers, never raw UTC.
server.get('/resource-pools/:id/booking-conflicts', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: false }); // F-206
  const { id } = request.params as any;
  const { date, startTime, endTime } = request.query as any;
  const pool = await requirePoolScope(auth, id, reply);

  if (!date) {
    reply.status(400);
    const err = new Error('date is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const timeZone = await getBranchTimeZone(pool.branchId);
  let startOfDay: Date;
  let endOfDay: Date;
  try {
    ({ startOfDay, endOfDay } = branchDayBounds(String(date), timeZone));
  } catch (err: any) {
    const e = new Error(`Invalid date "${date}": ${err.message}`);
    (e as any).statusCode = 400;
    (e as any).code = 'INVALID_DATE';
    throw e;
  }

  const activeOnDate = {
    startTime: { gte: startOfDay, lte: endOfDay },
  } as any;

  // MODIFIED: narrow to bookings whose window starts before the new opening instant or ends
  // after the new closing instant — i.e. the ones the shortened hours would strand.
  if (startTime && endTime) {
    let openInstant: Date;
    let closeInstant: Date;
    try {
      openInstant = slotStartForDate(String(date), String(startTime), timeZone);
      closeInstant = slotStartForDate(String(date), String(endTime), timeZone);
    } catch (err: any) {
      const e = new Error(`Invalid time: ${err.message}`);
      (e as any).statusCode = 400;
      (e as any).code = 'INVALID_TIME';
      throw e;
    }
    activeOnDate.OR = [{ startTime: { lt: openInstant } }, { endTime: { gt: closeInstant } }];
  }

  const count = await prisma.booking.count({
    where: {
      resourcePoolId: id,
      status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
      window: activeOnDate,
    },
  });
  return { count };
});

// Admin overview occupancy for all guest-bookable pools in a branch.
// WHY: This is operational branch data, so it uses branch-scoped admin auth instead
// of the public single-pool aggregate endpoint above.
server.get('/branches/:id/guest-occupancy', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  const { date } = request.query as any;

  if (!isAuthorizedForBranch(auth, id)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  const pools = await prisma.resourcePool.findMany({
    where: { branchId: id },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  return computePoolGuestOccupancy(pools.map((pool) => pool.id), date);
});

// Admin overview member attendance for confirmation windows that are currently open
// or already past cutoff. Uses the same branch authorization and F-022 cutoff semantics.
server.get('/branches/:id/member-attendance', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  const { date } = request.query as any;

  if (!isAuthorizedForBranch(auth, id)) {
    reply.status(403);
    const err = new Error('Forbidden: Not authorized for this branch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  return computeBranchMemberAttendance(id, date, new Date());
});

// GET /branches/:id/resource-pools
// WHY: Browse courts/resource pools at a branch, so the guest UI can list them.
//
// AUTH (F-091): the only guest-facing route of the six, called by BranchDashboard and
// CourtBooking on the core booking path, so an admin-only guard would break guest booking.
// Both callers already send the user's token, as does admin-web.
//
// A bare jwtVerify would not be enough. `:id` is a caller-supplied parameter naming any branch in
// any tenant — unlike GET /bookings/my, where the token's own userId does the scoping. That is the
// shape F-071 fixed for booking-scoped routes, so this reuses the same mechanism: read the tenant
// from the resource, compare it against the token, and never trust the path id to assert scope.
// Dual-path, matching GET /bookings/:id rather than inventing a shape: the internal service key
// is a trusted platform caller and bypasses, a JWT is tenant-scoped against the resource.
server.get('/branches/:id/resource-pools', async (request, reply) => {
  let isInternal = false;
  let decoded: any = null;
  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch {
    try {
      decoded = await request.jwtVerify();
    } catch {
      reply.status(401);
      const err = new Error('Unauthorized');
      (err as any).statusCode = 401;
      (err as any).code = 'UNAUTHORIZED';
      throw err;
    }
  }

  const { id } = request.params as any;

  // Tenant is the outer boundary, checked before anything is read or returned — so a caller
  // cannot probe which branch ids exist in another tenant by comparing 403 against an empty list.
  if (!isInternal) {
    const branch = await prisma.branch.findUnique({ where: { id }, select: { tenantId: true } });
    if (!decoded.tenantId || !branch || branch.tenantId !== decoded.tenantId) {
      reply.status(403);
      const err = new Error('Forbidden');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // F-206: this route serves two audiences. Guest / member tokens (roles: []) list the pools
    // they can browse and must pass through untouched, exactly as today. An admin token
    // (owner / branch_manager:*) is reading this as the Guest Booking module's admin surface —
    // so if that module is not entitled for the tenant, deny, matching "never UI-only": an
    // admin on a hidden module must not still get real pool data from the API directly. The
    // check is caller-aware (branch on roles), not route-level.
    const roles: string[] = decoded.roles ?? [];
    const isAdminCaller = roles.some((r) => r === 'owner' || r.startsWith('branch_manager:'));
    if (isAdminCaller) {
      await requireModuleEntitlement(
        { isInternal: false, userId: decoded.userId ?? null, roles, tenantId: decoded.tenantId },
        TenantModule.GUEST_BOOKING,
        reply,
        { write: false },
      );
    }
  }

  const pools = await prisma.resourcePool.findMany({
    where: { branchId: id },
    include: {
      resources: true,
      bookingRules: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });
  return pools;
});

// Manual release of a window to guests (admin-only).
// WHY: Dual-path auth — internal service key OR owner/branch-manager JWT.
// Both-or-neither validation on pricing override (same rule as window creation).
server.post('/resource-pools/:id/windows/:windowId/release', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206

  const { id, windowId } = request.params as any;
  const { pricingMode, price, expectedUpdatedAt } = request.body as any;
  await requirePoolScope(auth, id, reply);

  const hasMode = pricingMode != null;
  const hasPrice = price != null;
  if (hasMode !== hasPrice) {
    reply.status(400);
    const err = new Error('pricingMode and price must both be provided or both omitted');
    (err as any).statusCode = 400;
    (err as any).code = 'PARTIAL_PRICING_OVERRIDE';
      throw err;
  }

  if (!expectedUpdatedAt) {
    reply.status(400);
    const err = new Error('expectedUpdatedAt is required for release concurrency control');
    (err as any).statusCode = 400;
    (err as any).code = 'EXPECTED_UPDATED_AT_REQUIRED';
    throw err;
  }

  const existing = await prisma.availabilityWindow.findFirst({ where: { id: windowId, resourcePoolId: id } });
  if (!existing) {
    reply.status(404);
    throw new Error('Availability window not found');
  }

  const alreadyReleased = existing.pricingMode != null || existing.price != null;
  if (alreadyReleased) {
    reply.status(409);
    const err = new Error('This window has already been released to guests');
    (err as any).statusCode = 409;
    (err as any).code = 'WINDOW_ALREADY_RELEASED';
    throw err;
  }

  const updateResult = await prisma.availabilityWindow.updateMany({
    where: {
      id: windowId,
      resourcePoolId: id,
      updatedAt: new Date(expectedUpdatedAt),
      pricingMode: null,
      price: null,
    },
    data: {
      pricingMode: pricingMode ? (pricingMode as PricingMode) : null,
      price: price != null ? new Prisma.Decimal(price) : null,
    },
  });

  if (updateResult.count === 0) {
    const current = await prisma.availabilityWindow.findFirst({ where: { id: windowId, resourcePoolId: id } });
    if (!current) {
      reply.status(404);
      throw new Error('Availability window not found');
    }
    if (current.pricingMode != null || current.price != null) {
      reply.status(409);
      const err = new Error('This window was already released by another admin');
      (err as any).statusCode = 409;
      (err as any).code = 'WINDOW_ALREADY_RELEASED';
      throw err;
    }
    reply.status(409);
    const err = new Error('This window changed after it was loaded. Refresh and try again.');
    (err as any).statusCode = 409;
    (err as any).code = 'STALE_WINDOW';
    throw err;
  }

  const updated = await prisma.availabilityWindow.findUnique({ where: { id: windowId } });
  return updated;
});

// ---------------------------------------------------------------------------
// Booking Rules
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Booking-rule validation — shared by BOTH setters (F-068)
// ---------------------------------------------------------------------------

// WHY: the tiered default was duplicated verbatim in both setters. One definition means
// they cannot drift apart.
const DEFAULT_CANCELLATION_POLICY = {
  type: 'tiered',
  tiers: [
    { min_hours_before_slot: 24, refund_percent: 100 },
    { min_hours_before_slot: 6, refund_percent: 50 },
    { min_hours_before_slot: 0, refund_percent: 0 },
  ],
};

const BOOKING_RULE_INTEGER_FIELDS = [
  'memberWindowDays',
  'guestOpenWindowDays',
  'gracePeriodMinutes',
  'guestAccessCutoffMinutes',
  // F-183: 0 is legal here too (no extension allowed for this pool).
  'maxAdditionalWindows',
  // F-184: 0 is legal here too (no self-service bookings allowed for this pool's branch).
  'maxDailyBookingsPerGuest',
] as const;

// WHY (F-068): POST previously used truthiness — `x ? Number(x) : default` — so an explicit
// 0 was falsy and silently became the default, while a negative sailed through unchecked.
// A negative gracePeriodMinutes puts the confirmation cutoff AFTER the window starts and
// inverts every `now >= cutoffTime` comparison downstream.
//
// The rule, identical on both setters: 0 is legal (it means "confirm right up to slot
// start"), negatives/floats/NaN are not. Absence is the only thing that differs between
// them — POST creates and falls back to a default, PUT partial-updates and leaves the
// stored value alone — which is a difference in semantics, not in accepted values.
function isProvided(value: any) {
  return value !== undefined && value !== null;
}

function validateBookingRuleFields(body: any, reply: any): Record<string, any> {
  const data: Record<string, any> = {};

  for (const field of BOOKING_RULE_INTEGER_FIELDS) {
    if (!isProvided(body[field])) continue;
    const value = Number(body[field]);
    if (!Number.isInteger(value) || value < 0) {
      reply.status(400);
      const err = new Error(`${field} must be a non-negative integer`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_RULE_VALUE';
      throw err;
    }
    data[field] = value;
  }

  if (isProvided(body.lowOccupancyThresholdPct)) {
    const threshold = Number(body.lowOccupancyThresholdPct);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) {
      reply.status(400);
      const err = new Error('lowOccupancyThresholdPct must be an integer from 0 to 100');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_THRESHOLD';
      throw err;
    }
    data.lowOccupancyThresholdPct = threshold;
  }

  if (isProvided(body.prepaymentRequired)) {
    // WHY: previously `!== false` on POST and `Boolean()` on PUT — opposite coercions, so
    // the same payload could mean different things depending on the endpoint. Now only a
    // real boolean is accepted; anything else is a client error rather than a silent guess.
    if (typeof body.prepaymentRequired !== 'boolean') {
      reply.status(400);
      const err = new Error('prepaymentRequired must be a boolean');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_RULE_VALUE';
      throw err;
    }
    data.prepaymentRequired = body.prepaymentRequired;
  }

  if (isProvided(body.cancellationPolicyJson)) {
    data.cancellationPolicyJson = body.cancellationPolicyJson;
  }

  return data;
}

// Configure Booking Rules — Phase 9 adds guestAccessCutoffMinutes, lowOccupancyThresholdPct.
// AUTH (F-061): same guard as the sibling PUT /resource-pools/:id/booking-rule. This
// endpoint writes payment, refund and cutoff policy, and Caddy routes /api/slot-engine/*
// publicly. Authenticate first, then authorize against the pool — requirePoolScope re-reads
// pool.branchId from the database, so the body-supplied resourcePoolId cannot assert branch
// authority it does not have.
server.post('/booking-rules', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206

  const { resourcePoolId } = request.body as any;

  // WHY: checked after auth so an unauthenticated caller learns nothing about the schema,
  // and before requirePoolScope because that helper would otherwise query on undefined.
  if (!resourcePoolId) {
    reply.status(400);
    const err = new Error('resourcePoolId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  await requirePoolScope(auth, resourcePoolId, reply);

  // WHY: Establishes booking rules per pool, including guest/member reservation windows,
  // the two distinct cutoff mechanisms, and cancellation policies. Validation is the shared
  // one (F-068); only the create-time defaults are POST-specific.
  const data = validateBookingRuleFields(request.body, reply);

  try {
    const rule = await prisma.bookingRule.create({
      data: {
        resourcePoolId,
        memberWindowDays: data.memberWindowDays ?? 30,
        guestOpenWindowDays: data.guestOpenWindowDays ?? 7,
        gracePeriodMinutes: data.gracePeriodMinutes ?? 30,
        guestAccessCutoffMinutes: data.guestAccessCutoffMinutes ?? 120,
        lowOccupancyThresholdPct: data.lowOccupancyThresholdPct ?? 50,
        prepaymentRequired: data.prepaymentRequired ?? true,
        cancellationPolicyJson: data.cancellationPolicyJson ?? DEFAULT_CANCELLATION_POLICY,
        maxAdditionalWindows: data.maxAdditionalWindows ?? 1,
        maxDailyBookingsPerGuest: data.maxDailyBookingsPerGuest ?? 3,
      },
    });
    return rule;
  } catch (err: any) {
    // WHY: F-067's unique constraint turns "create a second rule" from a silent duplicate
    // into a P2002. Left unhandled that surfaced as a 500 carrying the raw Prisma message —
    // absolute source paths and all — which is precisely the F-034 leak pattern. Translate
    // it into the actionable answer: the pool already has a rule, update it via the PUT.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      reply.status(409);
      const conflict = new Error(
        'A booking rule already exists for this resource pool. Use PUT /resource-pools/:id/booking-rule to update it.',
      );
      (conflict as any).statusCode = 409;
      (conflict as any).code = 'BOOKING_RULE_EXISTS';
      throw conflict;
    }
    throw err;
  }
});

// Upsert Booking Rule for a Resource Pool (admin-only).
// WHY: Admin Web config should be recoverable for pools that were created before a
// rule existed; upsert avoids stranding those pools while keeping the rule pool-scoped.
server.put('/resource-pools/:id/booking-rule', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);
  // F-068: identical validation to POST /booking-rules — same accepted values, same error
  // codes. Only absence differs: here an omitted field leaves the stored value untouched.
  const data = validateBookingRuleFields(request.body, reply);

  const existing = await prisma.bookingRule.findFirst({
    where: { resourcePoolId: id },
    orderBy: { createdAt: 'asc' },
  });

  // WHY: preserve an existing custom policy across a partial update that doesn't mention it.
  const defaultPolicy = existing?.cancellationPolicyJson ?? DEFAULT_CANCELLATION_POLICY;

  // WHY (F-068): the previous THRESHOLD_REQUIRED gate rejected a create that omitted
  // lowOccupancyThresholdPct, while POST silently defaulted it to 50 — the same payload
  // succeeded on one setter and 400'd on the other. Aligned on the permissive side because
  // tightening would break both regression suites' base fixtures, neither of which sends
  // the field. Admin Web always sends it, so no real flow depended on the rejection.

  // WHY (F-067): keyed on resourcePoolId, now that it is unique. The previous
  // `where: { id: existing?.id ?? '__missing__' }` sentinel was a TOCTOU hazard — two
  // concurrent PUTs on a rule-less pool both saw existing === null and both took the
  // create branch, producing exactly the duplicate rows F-067 describes. Upserting on the
  // unique column makes the database arbitrate instead of the read-then-write gap.
  return await prisma.bookingRule.upsert({
    where: { resourcePoolId: id },
    update: data,
    create: {
      resourcePoolId: id,
      memberWindowDays: data.memberWindowDays ?? 30,
      guestOpenWindowDays: data.guestOpenWindowDays ?? 7,
      gracePeriodMinutes: data.gracePeriodMinutes ?? 30,
      guestAccessCutoffMinutes: data.guestAccessCutoffMinutes ?? 120,
      lowOccupancyThresholdPct: data.lowOccupancyThresholdPct ?? 50,
      prepaymentRequired: data.prepaymentRequired ?? true,
      cancellationPolicyJson: data.cancellationPolicyJson ?? defaultPolicy,
      maxAdditionalWindows: data.maxAdditionalWindows ?? 1,
      maxDailyBookingsPerGuest: data.maxDailyBookingsPerGuest ?? 3,
    },
  });
});

// ---------------------------------------------------------------------------
// Blocked Windows
// ---------------------------------------------------------------------------

// AUTH (F-091): copies POST /booking-rules exactly, including the ordering — the body id is
// validated before requirePoolScope, because that helper would otherwise query on undefined.
// Blocking a window removes real bookable capacity, so this is a mutation worth guarding.
server.post('/blocked-windows', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.GUEST_BOOKING, reply, { write: true }); // F-206

  const { resourcePoolId, resourceId, startTime, endTime, reason } = request.body as any;

  if (!resourcePoolId) {
    reply.status(400);
    const err = new Error('resourcePoolId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  await requirePoolScope(auth, resourcePoolId, reply);

  // F-087: the sibling the finding's text did not name. This route had the same naive
  // `new Date(startTime)` parse and, unlike availability-windows, resolved no branch timezone at
  // all — so it was naive in, naive out. Nothing in `apps/admin-web` calls it today, which made it
  // latent rather than live, and is exactly why it would have been missed until a branch flipped.
  // Same rule as its sibling, resolved through the pool so the two cannot drift apart again.
  const blockedPool = await prisma.resourcePool.findUnique({
    where: { id: resourcePoolId },
    select: { branchId: true },
  });
  if (!blockedPool) {
    reply.status(404);
    const err = new Error('Resource pool not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  const blockedTimeZone = await getBranchTimeZone(blockedPool.branchId);

  let blockedStart: Date;
  let blockedEnd: Date;
  try {
    blockedStart = parseBranchLocalDateTime(startTime, blockedTimeZone, 'startTime');
    blockedEnd = parseBranchLocalDateTime(endTime, blockedTimeZone, 'endTime');
  } catch (e: any) {
    reply.status(400);
    const err = new Error(e.message);
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // WHY: Creates a blocked slot where booking is prohibited (e.g. training sessions).
  const blocked = await prisma.blockedWindow.create({
    data: {
      resourcePoolId,
      resourceId,
      startTime: blockedStart,
      endTime: blockedEnd,
      reason,
    },
  });
  return blocked;
});

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

// F-207.2: the member-collision exclusion context for one resource pool -- prefetched ONCE per
// request/pool by every caller of windowBookable below (never per-window; a pool has at most a
// handful of ACTIVE assignments thanks to the Basic-tier one-active-slot-per-member unique
// index, so this is a small, bounded read). `assignments` is empty whenever MEMBER_MANAGEMENT
// isn't currently ACTIVE for the tenant -- resolveEntitlementState is reused (not
// entitlementAllows, whose read/write semantics don't apply here); disabling the module
// (`disabledAt` set -> READ_ONLY) or letting it lapse (HIDDEN) immediately stops excluding
// anything, with no manual assignment cleanup required, per this session's explicit decision.
export type MemberExclusionContext = {
  assignments: { daysOfWeek: string; startTime: string }[];
  timeZone: string;
};

async function fetchMemberExclusionContext(
  pool: { id: string; tenantId: string; branchId: string },
  timeZone?: string,
  // F-183-style client param: POST /bookings calls this from inside its own $transaction, and
  // must read through `tx` for the same consistency reasons every other read in that route does
  // (Prisma's interactive-transaction client is API-compatible with the plain client for the
  // model methods used here). Every caller outside a transaction omits this, defaulting to `prisma`.
  client: any = prisma,
): Promise<MemberExclusionContext> {
  const row = await client.moduleEntitlement.findUnique({
    where: { tenantId_module: { tenantId: pool.tenantId, module: TenantModule.MEMBER_MANAGEMENT } },
  });
  const active = resolveEntitlementState(row, new Date()) === 'ACTIVE';
  const assignments = active
    ? await client.memberGroupAssignment.findMany({
        where: { resourcePoolId: pool.id, status: 'ACTIVE' },
        select: { daysOfWeek: true, startTime: true },
      })
    : [];
  return { assignments, timeZone: timeZone ?? (await getBranchTimeZone(pool.branchId)) };
}

// F-207.2: does this window fall on a day/time an ACTIVE MemberGroupAssignment covers for this
// EXACT pool? Both branchIsoWeekday and branchHHMM are derived from the window's own real
// instant (never reconstructed from the assignment's stored strings), matching
// resolveTodayMemberAssignment's own two-part day+time test. The day check is not redundant
// with the time check -- two assignments sharing a startTime string on different weekdays would
// otherwise be indistinguishable if only time were compared.
function collidesWithMemberAssignment(
  window: { startTime: Date },
  exclusion: MemberExclusionContext,
): boolean {
  if (exclusion.assignments.length === 0) return false;
  const weekday = branchIsoWeekday(window.startTime, exclusion.timeZone);
  const hhmm = branchHHMM(window.startTime, exclusion.timeZone);
  return exclusion.assignments.some(
    (a) => a.startTime === hhmm && a.daysOfWeek.split(',').map((d) => d.trim()).includes(weekday),
  );
}

// F-212: the per-window bookability check, factored out of GET /availability's loop so the
// next-available-date search below reuses the exact same rules (F-155 started-window filter,
// blocked-window overlap, HELD/CONFIRMED capacity) rather than carrying a second copy that can
// drift. GET /availability still loops every window to build its full breakdown; this returns
// one window's verdict.
async function windowBookable(
  pool: { allocationMode: AllocationMode },
  window: { id: string; resourcePoolId: string; resourceId: string | null; capacity: number; startTime: Date; endTime: Date },
  nowInstant: Date,
  memberExclusion: MemberExclusionContext,
): Promise<{ bookable: boolean; remainingCapacity: number }> {
  if (window.startTime <= nowInstant) return { bookable: false, remainingCapacity: 0 };

  // F-207.2: cheapest check first, no DB call -- an active Member contract's slot is never
  // guest-bookable, mirroring F-155's display/write duality (POST /bookings steps 6-7 below is
  // the authoritative write-side half of this same rule).
  if (collidesWithMemberAssignment(window, memberExclusion)) {
    return { bookable: false, remainingCapacity: 0 };
  }

  const isBlocked = await prisma.blockedWindow.findFirst({
    where: {
      resourcePoolId: window.resourcePoolId,
      OR: [
        { resourceId: null },
        ...(window.resourceId ? [{ resourceId: window.resourceId }] : []),
      ],
      startTime: { lte: window.endTime },
      endTime: { gte: window.startTime },
    },
  });
  if (isBlocked) return { bookable: false, remainingCapacity: 0 };

  const activeBookings = await prisma.booking.findMany({
    where: {
      windowId: window.id,
      status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
    },
  });

  if (pool.allocationMode === AllocationMode.FIXED_INSTANCE) {
    const isReserved = activeBookings.some((b: any) => b.resourceId === window.resourceId);
    return { bookable: !isReserved, remainingCapacity: isReserved ? 0 : 1 };
  }

  const remainingCapacity = window.capacity - activeBookings.length;
  return { bookable: remainingCapacity > 0, remainingCapacity };
}

// F-212: does this pool have at least one bookable window on this date? Short-circuits on the
// first free window rather than scoring every one (GET /availability's job) — most candidate
// dates in a forward search either have an early free window (fast exit) or need a full scan
// to prove exhaustion, so this is the cheap check that search repeats per candidate date.
async function poolHasAvailabilityOnDate(
  pool: { id: string; allocationMode: AllocationMode },
  dateString: string,
  nowInstant: Date,
  memberExclusion: MemberExclusionContext,
): Promise<boolean> {
  const { startOfDay, endOfDay } = dayBounds(dateString);
  const windows = await prisma.availabilityWindow.findMany({
    where: {
      resourcePoolId: pool.id,
      startTime: { gte: startOfDay },
      endTime: { lte: endOfDay },
    },
    orderBy: { startTime: 'asc' },
  });
  for (const window of windows) {
    const { bookable } = await windowBookable(pool, window, nowInstant, memberExclusion);
    if (bookable) return true;
  }
  return false;
}

server.get('/resource-pools/:id/availability', async (request, reply) => {
  const { id } = request.params as any;
  const { date, from, to } = request.query as any;

  const pool = await prisma.resourcePool.findUnique({
    where: { id },
    include: { bookingRules: { orderBy: { createdAt: 'asc' } } },
  });
  if (!pool) {
    reply.status(404);
    throw new Error('Resource pool not found');
  }

  const guestOpenWindowDays = pool.bookingRules[0]?.guestOpenWindowDays ?? 7;
  const today = dateOnly(new Date());
  const maxBrowseDate = new Date(today.getTime() + guestOpenWindowDays * 24 * 60 * 60 * 1000);

  // WHY: Guests can browse only as far as the existing booking rule allows.
  // The recurring pattern can be durable indefinitely, but visible reach is capped.
  let startRange = new Date(today);
  let endRange = new Date(maxBrowseDate);
  endRange.setUTCHours(23, 59, 59, 999);

  if (date) {
    startRange = new Date(`${date}T00:00:00.000Z`);
    endRange = new Date(`${date}T23:59:59.999Z`);
  }
  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) startRange = fromDate;
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) endRange = toDate;
  }

  if (Number.isNaN(startRange.getTime()) || Number.isNaN(endRange.getTime()) || endRange < startRange) {
    reply.status(400);
    const err = new Error('Invalid availability date range');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DATE_RANGE';
    throw err;
  }

  if (dateOnly(endRange) > maxBrowseDate) {
    reply.status(400);
    const err = new Error(`Availability can only be browsed ${guestOpenWindowDays} days ahead`);
    (err as any).statusCode = 400;
    (err as any).code = 'BROWSE_AHEAD_LIMIT_EXCEEDED';
    throw err;
  }

  await ensureGenerationForPoolDates(id, datesInRange(dateOnlyString(startRange), dateOnlyString(endRange), guestOpenWindowDays + 1));

  // F-239: the guest-facing quote must resolve through the exact same function the real charge
  // does (resolvePrice/resolveGuestBlanketRate, POST /bookings' own source of truth), rather than
  // a second, drifted reimplementation client-side. Fetched once per request, same shape as
  // POST /bookings' own branchGuestPricing read -- this route isn't inside a transaction, so a
  // plain prisma call (not tx.branch...) is correct here.
  const horizonTimeZone = await getBranchTimeZone(pool.branchId);
  const branchGuestPricing = await prisma.branch.findUnique({
    where: { id: pool.branchId },
    select: { guestStandardRate: true, guestPeakRate: true, guestPeakWindows: true },
  });
  const guestPeakWindows: { start: string; end: string }[] = Array.isArray(branchGuestPricing?.guestPeakWindows)
    ? (branchGuestPricing!.guestPeakWindows as any[]).filter(
        (x) => x && typeof x.start === 'string' && typeof x.end === 'string',
      )
    : [];

  const windows = await prisma.availabilityWindow.findMany({
    where: {
      resourcePoolId: id,
      startTime: { gte: startRange },
      endTime: { lte: endRange },
    },
    orderBy: { startTime: 'asc' },
  });

  const availableSlots = [];

  // F-155: filtered here as well as rejected at POST /bookings, so a guest never sees a slot
  // they cannot book. The rejection is the authoritative guard; this is the display half.
  //
  // Unconditional by decision. This endpoint is unauthenticated, so it cannot tell an admin
  // caller from a guest, and admin-web reads the very same route
  // (apps/admin-web/src/main.tsx:545) — meaning admins also stop seeing today's already-started
  // slots. That consequence was accepted rather than overlooked: differentiating the two was
  // judged speculative scope on an urgent fix. F-162 tracks whether admins actually need that
  // visibility for reconciliation, to be settled with real evidence if it turns out to matter.
  const nowInstant = new Date();
  const memberExclusion = await fetchMemberExclusionContext(pool, horizonTimeZone);

  for (const window of windows) {
    // F-212: the per-window rules (started-window skip, blocked-window overlap, HELD/CONFIRMED
    // capacity) now live in windowBookable so the next-available-date search can't drift from
    // them. Behaviour here is unchanged — every window still scored, full breakdown returned.
    const { bookable, remainingCapacity } = await windowBookable(pool, window, nowInstant, memberExclusion);
    if (bookable) {
      // F-239: groupSize is always 1 here -- co-player collection has no UI path today (F-114),
      // so the real server-side groupSize at booking time is always 1 + 0 in practice. A sibling
      // field, not nested under `window`, matching remainingCapacity's own precedent as a
      // computed-not-stored value -- `window` stays a faithful mirror of the DB row.
      // F-266: rateSource lets the guest-facing UI show which rate was actually applied
      // (window override / peak / standard / pool default) — previously resolved and discarded.
      const { price: guestPrice, source: rateSource } = resolvePrice(pool, window, 1, {
        standardRate: branchGuestPricing?.guestStandardRate ?? null,
        peakRate: branchGuestPricing?.guestPeakRate ?? null,
        peakWindows: guestPeakWindows,
        windowStartInstant: window.startTime,
        timeZone: horizonTimeZone,
      });
      availableSlots.push({ window, remainingCapacity, guestPrice, rateSource });
    }
  }

  return availableSlots;
});

// ---------------------------------------------------------------------------
// GET /resource-pools/:id/next-available-date?from=<YYYY-MM-DD>
// F-212: when a guest lands on a fully-exhausted date, point them at the next date that has a
// bookable window instead of a dead-end "no slots" message. Forward-only, server-side search —
// mirrors F-187's period-level auto-advance, one level up (date, not time-of-day period).
//
// Search ceiling is the guest's REAL browse horizon, not a flat window. GET /availability
// hard-rejects any date past `today + guestOpenWindowDays` (BROWSE_AHEAD_LIMIT_EXCEEDED), so a
// date found beyond that is one the guest cannot actually book — pointing them at it, then
// failing when they act, is worse than the generic message. Ceiling =
// min(from + 14, today + guestOpenWindowDays): anchored at today (the same anchor
// GET /availability uses), with 14 as an outer cap so a pool with a very large
// guestOpenWindowDays can't drive an unbounded scan. Unauthenticated, matching GET /availability
// (pre-auth guest browsing). Returns { date: <first hit> } or { date: null }.
// ---------------------------------------------------------------------------
server.get('/resource-pools/:id/next-available-date', async (request, reply) => {
  const { id } = request.params as any;
  const { from } = request.query as any;

  const pool = await prisma.resourcePool.findUnique({
    where: { id },
    include: { bookingRules: { orderBy: { createdAt: 'asc' } } },
  });
  if (!pool) {
    reply.status(404);
    throw new Error('Resource pool not found');
  }

  if (!from) {
    reply.status(400);
    const err = new Error('from (YYYY-MM-DD) is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  const fromDate = dateOnly(String(from)); // throws 400 INVALID_DATE on a bad calendar date

  const guestOpenWindowDays = pool.bookingRules[0]?.guestOpenWindowDays ?? 7;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const today = dateOnly(new Date());
  const horizonEnd = new Date(today.getTime() + guestOpenWindowDays * DAY_MS);
  const outerCap = new Date(fromDate.getTime() + 14 * DAY_MS);
  const searchEnd = horizonEnd < outerCap ? horizonEnd : outerCap;

  // The caller already knows `from` itself is empty — start the day after.
  const firstCandidate = new Date(fromDate.getTime() + DAY_MS);
  if (firstCandidate > searchEnd) {
    return { date: null };
  }

  const candidates = datesInRange(dateOnlyString(firstCandidate), dateOnlyString(searchEnd), 15);

  // A future date's windows may not be materialised yet.
  await ensureGenerationForPoolDates(id, candidates);

  const nowInstant = new Date();
  const memberExclusion = await fetchMemberExclusionContext(pool);
  for (const candidate of candidates) {
    const candidateStr = dateOnlyString(candidate);
    if (await poolHasAvailabilityOnDate(pool, candidateStr, nowInstant, memberExclusion)) {
      return { date: candidateStr };
    }
  }
  return { date: null };
});

// ---------------------------------------------------------------------------
// POST /bookings — self-service path
// Phase 4 trust boundary: this endpoint NEVER accepts a price in the body.
// Server always resolves price from the window→pool chain.
// ---------------------------------------------------------------------------

server.post('/bookings', async (request, reply) => {
  // F-045: identity is established BEFORE anything else, including the
  // idempotency short-circuit below. If auth came after it, an unauthenticated
  // caller replaying a known key would still read back another user's booking.
  const claims = await requireUserJwt(request, reply);
  const userId = claims.userId;
  const tenantId = claims.tenantId;

  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey) {
    reply.status(400);
    const err = new Error('Idempotency-Key header is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // WHY: Return existing booking immediately if idempotency key matches.
  const existing = await prisma.booking.findUnique({ where: { idempotencyKey } });
  if (existing) {
    reply.status(200);
    return existing;
  }

  const {
    branchId,
    resourcePoolId,
    resourceId,
    windowId,
    additionalWindowIds,
    coPlayers,
    // WHY: identity, price and membership are intentionally destructured and
    // discarded. The self-service path must never honour a caller-supplied
    // price (Phase 4 trust boundary), identity (F-045), or membership claim
    // (F-048). All are ignored silently rather than rejected: presence is not
    // an error, it is simply never read — the same contract
    // /member/today-assignment/confirm uses.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    userId: _ignoredUserId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tenantId: _ignoredTenantId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    price: _ignoredPrice,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isMemberBooking: _ignoredIsMemberBooking,
    ...rest
  } = request.body as any;
  void rest; // suppresses unused-var lint for the spread remainder

  if (coPlayers && Array.isArray(coPlayers)) {
    for (const phone of coPlayers) {
      if (!isValidIndianPhone(phone)) {
        reply.status(400);
        const err = new Error(`Invalid co-player phone number format: ${phone}. Must be a valid 10-digit Indian mobile number.`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_PHONE_FORMAT';
        throw err;
      }
    }
  }

  const normalizedCoPlayers = coPlayers && Array.isArray(coPlayers)
    ? coPlayers.map(normalizePhone)
    : [];

  // F-183 Phase 1: additionalWindowIds lets a guest extend a booking by whole contiguous
  // hours. Combined with windowId and re-sorted server-side below — client-supplied order
  // is never trusted for lock order, which is what keeps two concurrent multi-window
  // requests naming the same windows from deadlocking each other.
  const normalizedAdditionalWindowIds: string[] = Array.isArray(additionalWindowIds)
    ? additionalWindowIds
    : [];
  const requestedWindowIds = [windowId, ...normalizedAdditionalWindowIds];

  try {
    const booking = await prisma.$transaction(async (tx: any) => {
      // 1. Determine real lock order from real data — an unlocked lookup just for
      // startTime, never trusting client-supplied ordering, then lock in that order below.
      const orderingRows = await tx.availabilityWindow.findMany({
        where: { id: { in: requestedWindowIds } },
        select: { id: true, startTime: true },
      });
      if (orderingRows.length !== requestedWindowIds.length) {
        const err = new Error('Availability window not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
      }
      const sortedWindowIds = [...orderingRows]
        .sort((a: any, b: any) => {
          const diff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
          if (diff !== 0) return diff;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        })
        .map((row: any) => row.id);

      // 2. Lock each AvailabilityWindow row FOR UPDATE, in that sorted order.
      // CASING TRAP: this is a RAW query, so the returned object carries the
      // database's real quoted-camelCase keys (startTime, endTime) — NOT the
      // lowercase forms. Reading `window.starttime` yields undefined, which
      // silently disabled the browse-ahead gate (Invalid Date compares false)
      // and stripped the time bounds from the blocked-window filter. Always
      // use startTime/endTime here.
      const lockedWindows: any[] = [];
      for (const id of sortedWindowIds) {
        const rows = await tx.$queryRaw<any[]>`
          SELECT * FROM "AvailabilityWindow" WHERE id = ${id} FOR UPDATE
        `;
        if (!rows || rows.length === 0) {
          const err = new Error('Availability window not found');
          (err as any).statusCode = 404;
          (err as any).code = 'NOT_FOUND';
          throw err;
        }
        lockedWindows.push(rows[0]);
      }
      // Earliest locked window — kept as `window` so every single-window check below
      // (unchanged from before F-183) reads exactly as it did before.
      const window = lockedWindows[0];

      // 3. Fetch resource pool details.
      const pool = await tx.resourcePool.findUnique({
        where: { id: resourcePoolId },
        // F-205: the pool's real Resource rows, stable order, for automatic court assignment.
        include: { resources: { orderBy: { createdAt: 'asc' } } },
      });
      if (!pool) {
        const err = new Error('Resource pool not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
      }

      // 4. Enforce group size against pool constraints.
      const groupSize = 1 + (Array.isArray(coPlayers) ? coPlayers.length : 0);
      if (groupSize < pool.minOccupancy) {
        const err = new Error(`Minimum group size for this pool is ${pool.minOccupancy}`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_GROUP_SIZE';
        throw err;
      }
      if (groupSize > pool.capacity) {
        const err = new Error(`Group size exceeds pool capacity of ${pool.capacity}`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_GROUP_SIZE';
        throw err;
      }

      // 5. Enforce the guest browse-ahead window.
      // F-048: this endpoint always applies guestOpenWindowDays. It previously
      // switched to the longer memberWindowDays on a client-supplied flag, so
      // any caller could bypass F-043's guest restriction by asserting
      // membership. Real member bookings never come through here — they are
      // created server-side by ensureTodayMemberBooking from a genuine
      // MemberGroupAssignment — so there is nothing legitimate to preserve.
      const rule = await tx.bookingRule.findFirst({ where: { resourcePoolId }, orderBy: { createdAt: 'asc' } });

      // F-183: rejected before any more work if the guest asked for more additional
      // hours than this pool allows. Placed immediately after the rule fetch — the
      // first point in this transaction where `rule` exists.
      if (normalizedAdditionalWindowIds.length > (rule?.maxAdditionalWindows ?? 1)) {
        const err = new Error(`This pool allows at most ${rule?.maxAdditionalWindows ?? 1} additional window(s) per booking`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_WINDOW_COUNT';
        throw err;
      }

      // F-183: every locked window must belong to the pool the caller named.
      for (const w of lockedWindows) {
        if (w.resourcePoolId !== resourcePoolId) {
          const err = new Error('All windows in a multi-window booking must belong to the same resource pool');
          (err as any).statusCode = 400;
          (err as any).code = 'MIXED_RESOURCE_POOL';
          throw err;
        }
      }

      // F-183: Phase 1 only supports contiguous whole-hour extension — each additional
      // window's start must equal the previous window's end, in the real chronological
      // order established in step 1 (not the order the caller sent them in).
      for (let i = 1; i < lockedWindows.length; i++) {
        if (new Date(lockedWindows[i].startTime).getTime() !== new Date(lockedWindows[i - 1].endTime).getTime()) {
          const err = new Error('Additional windows must be contiguous with the base booking');
          (err as any).statusCode = 400;
          (err as any).code = 'NON_CONTIGUOUS_WINDOWS';
          throw err;
        }
      }

      // F-183: for FIXED_INSTANCE pools, every window must resolve to the same physical
      // court — a guest extending a booking needs the SAME court, not a different one
      // that happens to be free. Real JBC pools are all POOLED today (confirmed against
      // production data during the F-183 investigation, so this path is currently
      // dormant there), which makes this the only real safety net for the case this
      // feature is designed for rather than a defensive extra.
      let targetResource: string | null = null;
      if (pool.allocationMode === AllocationMode.FIXED_INSTANCE) {
        targetResource = resourceId || window.resourceId;
        if (!targetResource) {
          const err = new Error('resourceId is required for FIXED_INSTANCE');
          (err as any).statusCode = 400;
          (err as any).code = 'BAD_REQUEST';
          throw err;
        }
        for (const w of lockedWindows) {
          const windowResource = w.resourceId || resourceId;
          if (windowResource !== targetResource) {
            const err = new Error('All windows in a multi-window booking must resolve to the same resource');
            (err as any).statusCode = 400;
            (err as any).code = 'RESOURCE_MISMATCH';
            throw err;
          }
        }
      }

      const windowDays = rule?.guestOpenWindowDays ?? 7;
      // F-066: an N-day horizon counted in branch-local days. setDate() counted them on
      // the server's clock, so the cutoff drifted by the UTC offset.
      const horizonTimeZone = await getBranchTimeZone(pool.branchId);

      // F-224: the branch's guest-only Standard/Peak rates + peak windows, read once for the
      // price resolution below. Absent columns => resolvePrice falls back to pool.defaultRate.
      const branchGuestPricing = await tx.branch.findUnique({
        where: { id: pool.branchId },
        select: { guestStandardRate: true, guestPeakRate: true, guestPeakWindows: true },
      });
      const guestPeakWindows: { start: string; end: string }[] = Array.isArray(branchGuestPricing?.guestPeakWindows)
        ? (branchGuestPricing!.guestPeakWindows as any[]).filter(
            (x) => x && typeof x.start === 'string' && typeof x.end === 'string',
          )
        : [];

      // F-184: guest-only daily booking cap, governed by the TARGET pool's own
      // BookingRule — if pools in the same branch carry different values, the
      // effective cap for a given request is whichever pool it targets (documented,
      // not solved in code). Counted across every pool in the branch via
      // window.resourcePool.branchId, not the untrusted Booking.branchId scalar
      // (see the booking-branchid-unvalidated-client-scalar candidate finding).
      // Gates on HELD + CONFIRMED, not CONFIRMED-only, so a guest cannot bypass the
      // cap by holding several bookings in parallel and confirming them independently
      // via separate payment webhooks. parentBookingId: null so an F-183 multi-window
      // booking counts once, matching the GET /bookings/admin and GET /bookings/my
      // precedent.
      const requestedDateString = branchDateString(window.startTime, horizonTimeZone);
      const dayStart = branchLocalToUtc(requestedDateString, '00:00', horizonTimeZone);
      const dayEnd = addBranchDays(dayStart, 1, horizonTimeZone);

      const dailyBookingCount = await tx.booking.count({
        where: {
          userId,
          status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
          parentBookingId: null,
          window: {
            startTime: { gte: dayStart, lt: dayEnd },
            resourcePool: { branchId: pool.branchId },
          },
        },
      });

      if (dailyBookingCount >= (rule?.maxDailyBookingsPerGuest ?? 3)) {
        const err = new Error(`Daily booking limit of ${rule?.maxDailyBookingsPerGuest ?? 3} reached for this branch`);
        (err as any).statusCode = 400;
        (err as any).code = 'DAILY_BOOKING_LIMIT_REACHED';
        throw err;
      }

      const maxBookingDate = addBranchDays(new Date(), windowDays, horizonTimeZone);

      // F-183: checked for every window, not just the first — a later window can
      // exceed the horizon even when the first is within it.
      for (const w of lockedWindows) {
        if (new Date(w.startTime) > maxBookingDate) {
          const err = new Error('Booking window is not open yet');
          (err as any).statusCode = 400;
          (err as any).code = 'BOOKING_WINDOW_CLOSED';
          throw err;
        }
      }

      // F-155: the horizon check above is only an UPPER bound. There was no lower bound at
      // all, so a slot that had already started stayed bookable — proven on the deployed
      // stack, where a booking was accepted for a slot 392 minutes after it began.
      //
      // WHY NO TIME ZONE MATHS HERE, deliberately. `startTime` is an absolute instant, so
      // comparing it to `now` is correct in every zone and needs none of F-087/F-088's
      // branch-clock handling. This is NOT the timezone defect it was first reported as:
      // the same bug exists with the branch set to IST, and F-100's UTC setting affects
      // day-boundary maths rather than this. Keeping the comparison instant-to-instant is
      // what stops this fix from quietly becoming the timezone rollout.
      //
      // The boundary is deliberately startTime, not endTime: a court time that has begun
      // cannot be sold, even though part of it remains. Slots still in the future are
      // untouched, so booking a slot minutes away keeps working — no lead-time policy is
      // introduced here, and none exists today.
      //
      // This sits inside the FOR UPDATE transaction above, so it cannot be raced.
      // F-183: looped over every window for consistency, though only the earliest one
      // can actually trip this — later windows are chronologically after it.
      for (const w of lockedWindows) {
        if (new Date(w.startTime) <= new Date()) {
          const err = new Error('This slot has already started and can no longer be booked');
          (err as any).statusCode = 400;
          (err as any).code = 'SLOT_ALREADY_STARTED';
          throw err;
        }
      }

      // F-207.2: the write-side authoritative half of the member-collision exclusion --
      // GET /availability's windowBookable check above is the display half (F-155-shaped
      // duality). Computed once per request (not per-window), reused across every locked window
      // in an F-183 multi-window booking. Only applies while MEMBER_MANAGEMENT is ACTIVE for
      // this tenant (fetchMemberExclusionContext's own contract).
      const memberExclusion = await fetchMemberExclusionContext(pool, undefined, tx);
      for (const w of lockedWindows) {
        if (collidesWithMemberAssignment(w, memberExclusion)) {
          const err = new Error('This slot is reserved for a Member contract');
          (err as any).statusCode = 409;
          (err as any).code = 'MEMBER_SLOT_RESERVED';
          throw err;
        }
      }

      // 6. Verify no overlap with blocked periods — every window (F-183: looped; the
      // OR clause is unchanged from before, still keyed off the raw body `resourceId`).
      for (const w of lockedWindows) {
        const blocked = await tx.blockedWindow.findFirst({
          where: {
            resourcePoolId,
            OR: [
              { resourceId: null },
              ...(resourceId ? [{ resourceId }] : []),
            ],
            startTime: { lte: w.endTime },
            endTime: { gte: w.startTime },
          },
        });
        if (blocked) {
          const err = new Error('Slot is blocked');
          (err as any).statusCode = 409;
          (err as any).code = 'SLOT_BLOCKED';
          throw err;
        }
      }

      // 7. Concurrency checks based on allocation mode — every window (F-183: looped;
      // targetResource was already validated as consistent across all windows above).
      for (const w of lockedWindows) {
        if (pool.allocationMode === AllocationMode.FIXED_INSTANCE) {
          const activeBooking = await tx.booking.findFirst({
            where: {
              windowId: w.id,
              resourceId: targetResource,
              status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
            },
          });
          if (activeBooking) {
            const err = new Error('Slot is already booked');
            (err as any).statusCode = 409;
            (err as any).code = 'SLOT_ALREADY_BOOKED';
            throw err;
          }
        } else {
          const activeCount = await tx.booking.count({
            where: {
              windowId: w.id,
              status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
            },
          });
          if (activeCount >= w.capacity) {
            const err = new Error('Pool capacity exceeded');
            (err as any).statusCode = 409;
            (err as any).code = 'POOL_CAPACITY_EXCEEDED';
            throw err;
          }
        }
      }

      // 8. Resolve price server-side — caller has no influence over this value.
      // F-183: summed across every locked window; identical to the original
      // single-window behavior when there are no additional windows.
      const resolvedPrice = lockedWindows.reduce(
        // F-224: guest self-service path — pass the branch's guest blanket rates so a peak
        // window start uses guestPeakRate and everything else guestStandardRate, both falling
        // back to pool.defaultRate when unset. A window.price override still wins inside resolvePrice.
        (sum: Prisma.Decimal, w: any) => sum.add(resolvePrice(pool, w, groupSize, {
          standardRate: branchGuestPricing?.guestStandardRate ?? null,
          peakRate: branchGuestPricing?.guestPeakRate ?? null,
          peakWindows: guestPeakWindows,
          windowStartInstant: w.startTime,
          timeZone: horizonTimeZone,
        }).price),
        new Prisma.Decimal(0),
      );

      // 9. Court assignment for POOLED pools. F-205: assign a real Resource (and derive
      // courtSlotIndex from its position — the cosmetic "Court N" and the real court are
      // forced to agree). Union the active bookings across every window this booking
      // touches — a multi-window booking is checked independently against each. If the
      // pool has no usable Resource list, assignPooledCourt falls back to F-186's original
      // occupancy-scan index with resourceId null. Neither is a rejection reason — the
      // capacity check above (step 7) already independently governs validity.
      // F-225: this is the guest self-service path, so pass { guestOnly: true } — a court an
      // owner hasn't authorised for guests is skipped here (but not on the negotiated path below).
      let courtSlotIndex: number | null = null;
      let pooledResourceId: string | null = null;
      if (pool.allocationMode === AllocationMode.POOLED) {
        const active: { courtSlotIndex: number | null; resourceId: string | null }[] = [];
        for (const w of lockedWindows) {
          const rows = await tx.booking.findMany({
            where: {
              windowId: w.id,
              status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
            },
            select: { courtSlotIndex: true, resourceId: true },
          });
          active.push(...rows);
        }
        const assigned = assignPooledCourt(pool, active, { guestOnly: true });
        pooledResourceId = assigned.resourceId;
        courtSlotIndex = assigned.courtSlotIndex;
      }

      // 10. Create booking(s) in HELD state. The parent carries the real price and
      // idempotencyKey and is the only row payment ever references (F-183); child rows
      // are lightweight placeholders occupying the remaining windows so every existing
      // windowId-keyed availability/capacity query keeps working unmodified.
      const now = new Date();
      const heldUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes TTL
      const bookingResourceId = pool.allocationMode === AllocationMode.FIXED_INSTANCE
        ? targetResource
        : pooledResourceId;

      const parent = await tx.booking.create({
        data: {
          tenantId,
          branchId,
          resourcePoolId,
          resourceId: bookingResourceId,
          courtSlotIndex,
          windowId: window.id,
          userId,
          status: BookingStatus.HELD,
          heldAt: now,
          heldUntil,
          idempotencyKey,
          // F-048: always false here. ensureTodayMemberBooking (the F-022 atomic
          // helper) is the ONLY legitimate producer of isMemberBooking: true,
          // and it derives that from a real MemberGroupAssignment server-side.
          // A forged flag on this row would also hide the booking from
          // computePoolGuestOccupancy, surface it on the member-attendance
          // dashboard, and make the grace sweep release a paid guest booking.
          isMemberBooking: false,
          refundAmount: null,
          price: resolvedPrice,
          players: normalizedCoPlayers.length > 0 ? {
            create: normalizedCoPlayers.map((phone: string) => ({ phone })),
          } : undefined,
        },
      });

      // F-183: one lightweight child per additional window, all in the same
      // transaction as the parent — no partial parent-without-children state is ever
      // reachable. Players belong to the group as a whole, not per hour, so they're
      // only ever attached to the parent above.
      for (const w of lockedWindows.slice(1)) {
        await tx.booking.create({
          data: {
            tenantId,
            branchId,
            resourcePoolId,
            resourceId: bookingResourceId,
            courtSlotIndex,
            windowId: w.id,
            userId,
            status: BookingStatus.HELD,
            heldAt: now,
            heldUntil,
            idempotencyKey: null,
            isMemberBooking: false,
            refundAmount: null,
            price: null,
            parentBookingId: parent.id,
          },
        });
      }

      return tx.booking.findUnique({
        where: { id: parent.id },
        include: { childBookings: true },
      });
    });

    reply.status(201);
    return booking;
  } catch (err: any) {
    // WHY: If two concurrent requests with the identical Idempotency-Key hit the DB at the same
    // millisecond, one fails with P2002. Catch and return the existing booking (200 OK).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const dupBooking = await prisma.booking.findUnique({ where: { idempotencyKey } });
      if (dupBooking) {
        reply.status(200);
        return dupBooking;
      }
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /bookings/negotiated — admin-only, accepts negotiatedPrice
// WHY: Separate endpoint from self-service path so the Phase 4 trust boundary on
// POST /bookings is never conditionally bypassed. Availability is still enforced;
// group-size constraints and pricing constraints are waived for admin-negotiated bookings.
// Auth: INTERNAL_SERVICE_KEY only (called by Payment service when creating a Payment Link).
// ---------------------------------------------------------------------------

server.post('/bookings/negotiated', async (request, reply) => {
  requireInternalKey(request, reply);

  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey) {
    reply.status(400);
    const err = new Error('Idempotency-Key header is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const existing = await prisma.booking.findUnique({ where: { idempotencyKey } });
  if (existing) {
    reply.status(200);
    return existing;
  }

  const {
    tenantId,
    branchId,
    resourcePoolId,
    resourceId,
    windowId,
    userId,
    negotiatedPrice,
    coPlayers,
    guestOnly,
  } = request.body as any;

  if (negotiatedPrice == null || isNaN(Number(negotiatedPrice))) {
    reply.status(400);
    const err = new Error('negotiatedPrice is required and must be a number');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  if (coPlayers && Array.isArray(coPlayers)) {
    for (const phone of coPlayers) {
      if (!isValidIndianPhone(phone)) {
        reply.status(400);
        const err = new Error(`Invalid co-player phone number format: ${phone}. Must be a valid 10-digit Indian mobile number.`);
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_PHONE_FORMAT';
        throw err;
      }
    }
  }

  const normalizedCoPlayersNegotiated = coPlayers && Array.isArray(coPlayers)
    ? coPlayers.map(normalizePhone)
    : [];

  try {
    const booking = await prisma.$transaction(async (tx: any) => {
      // 1. Lock window FOR UPDATE (same concurrency discipline as self-service path).
      const windows = await tx.$queryRaw<any[]>`
        SELECT * FROM "AvailabilityWindow" WHERE id = ${windowId} FOR UPDATE
      `;
      if (!windows || windows.length === 0) {
        const err = new Error('Availability window not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
      }
      const window = windows[0];

      // 2. Fetch pool.
      const pool = await tx.resourcePool.findUnique({
        where: { id: resourcePoolId },
        // F-205: the pool's real Resource rows, stable order, for automatic court assignment.
        include: { resources: { orderBy: { createdAt: 'asc' } } },
      });
      if (!pool) {
        const err = new Error('Resource pool not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
      }

      // 3. Verify no blocked window — double-booking is always prevented, even for admin.
      const blocked = await tx.blockedWindow.findFirst({
        where: {
          resourcePoolId,
          OR: [
            { resourceId: null },
            ...(resourceId ? [{ resourceId }] : []),
          ],
          startTime: { lte: window.endTime },
          endTime: { gte: window.startTime },
        },
      });
      if (blocked) {
        const err = new Error('Slot is blocked');
        (err as any).statusCode = 409;
        (err as any).code = 'SLOT_BLOCKED';
        throw err;
      }

      // 4. No-double-booking check (FIXED_INSTANCE).
      if (pool.allocationMode === AllocationMode.FIXED_INSTANCE) {
        const targetResource = resourceId || window.resourceId;
        const activeBooking = await tx.booking.findFirst({
          where: {
            windowId,
            resourceId: targetResource,
            status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
          },
        });
        if (activeBooking) {
          const err = new Error('Slot is already booked');
          (err as any).statusCode = 409;
          (err as any).code = 'SLOT_ALREADY_BOOKED';
          throw err;
        }
      } else {
        const activeCount = await tx.booking.count({
          where: {
            windowId,
            status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
          },
        });
        // WHY: Capacity check still applies for POOLED mode — can't overbook court slots.
        if (activeCount >= window.capacity) {
          const err = new Error('Pool capacity exceeded');
          (err as any).statusCode = 409;
          (err as any).code = 'POOL_CAPACITY_EXCEEDED';
          throw err;
        }
      }

      const now = new Date();
      const heldUntil = new Date(now.getTime() + 5 * 60 * 1000);

      // F-205 / F-186: same assignment as the self-service path, but single-window (no
      // lockedWindows array, no child cascade) — the union collapses to the one windowId.
      // The two endpoints share the same real capacity pool per window, so a negotiated
      // booking's court would otherwise be invisible to self-service's own computation and
      // vice versa. assignPooledCourt picks a real Resource + a matching courtSlotIndex,
      // or falls back to F-186's occupancy-scan index (resourceId null) for a pool with no
      // usable Resource list.
      // F-225: unfiltered by default — this is the admin/negotiated path. A court reserved from
      // walk-in guests must still be assignable by an admin acting for a member. F-230: a caller
      // may opt in with guestOnly (only /bookings/manual's walk-in-guest path does), which applies
      // the same guestBookable gate the self-service path (line 3127) already respects — a real
      // walk-in guest booked through the admin-assisted manual-booking route must never land on a
      // court the branch reserved away from guests.
      let courtSlotIndex: number | null = null;
      let pooledResourceId: string | null = null;
      if (pool.allocationMode === AllocationMode.POOLED) {
        const active = await tx.booking.findMany({
          where: {
            windowId,
            status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
          },
          select: { courtSlotIndex: true, resourceId: true },
        });
        const assigned = assignPooledCourt(pool, active, { guestOnly: guestOnly === true });
        pooledResourceId = assigned.resourceId;
        courtSlotIndex = assigned.courtSlotIndex;
      }

      return await tx.booking.create({
        data: {
          tenantId,
          branchId,
          resourcePoolId,
          resourceId: pool.allocationMode === AllocationMode.FIXED_INSTANCE
            ? (resourceId || window.resourceId)
            : pooledResourceId,
          courtSlotIndex,
          windowId,
          userId,
          status: BookingStatus.HELD,
          heldAt: now,
          heldUntil,
          idempotencyKey,
          isMemberBooking: false, // Negotiated bookings are always guest/admin-managed
          refundAmount: null,
          // WHY: negotiatedPrice is accepted here because this endpoint is gated behind
          // INTERNAL_SERVICE_KEY — only verified internal callers (Payment service) can set it.
          price: new Prisma.Decimal(negotiatedPrice),
          players: normalizedCoPlayersNegotiated.length > 0 ? {
            create: normalizedCoPlayersNegotiated.map((phone: string) => ({ phone })),
          } : undefined,
        },
      });
    });

    reply.status(201);
    return booking;
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const dupBooking = await prisma.booking.findUnique({ where: { idempotencyKey } });
      if (dupBooking) {
        reply.status(200);
        return dupBooking;
      }
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// Booking status transitions
// ---------------------------------------------------------------------------

// Confirm a booking (HELD → CONFIRMED). Internal only.
server.post('/bookings/:id/confirm', async (request, reply) => {
  requireInternalKey(request, reply);

  const { id } = request.params as any;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
  }

  // F-183: a child booking (one of the extra hours on a multi-window booking) is not
  // independently mutable — it has no price/idempotencyKey of its own. Callers act on
  // the parent id, which cascades to every child in the same transaction below.
  if (booking.parentBookingId) {
    reply.status(400);
    const err = new Error('Cannot confirm a child booking directly — act on the parent booking id');
    (err as any).statusCode = 400;
    (err as any).code = 'CHILD_BOOKING_NOT_MUTABLE';
    throw err;
  }

  if (booking.status === BookingStatus.CONFIRMED) return booking; // idempotent

  if (booking.status !== BookingStatus.HELD) {
    reply.status(400);
    throw new Error('Only held bookings can be confirmed');
  }

  return await prisma.$transaction(async (tx: any) => {
    const updated = await tx.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED },
    });
    // F-183: cascade the identical transition to every child, atomically with the parent.
    await tx.booking.updateMany({
      where: { parentBookingId: id },
      data: { status: BookingStatus.CONFIRMED },
    });
    return updated;
  });
});

// Check-in (CONFIRMED → CHECKED_IN).
//
// WHY (F-090): this route previously had no caller identity check at all — the only
// booking-scoped route in this file without one, sitting between `confirm` and `cancel`
// which both have one. An unauthenticated POST genuinely mutated a real booking, through
// the public gateway, and the mutation is irreversible: nothing transitions CHECKED_IN
// back and `cancel` accepts only HELD/CONFIRMED (:2357-2360 below), so flipping a booking
// permanently destroys its owner's refund path.
//
// It uses `cancel`'s dual-path guard rather than `confirm`'s internal-key-only one, because
// check-in is genuinely self-service today: the sole caller anywhere is the guest PWA's
// "I'm Here" button, which already sends the user's access token. Internal-key-only would
// have broken the one working caller. Whether check-in *should* be staff-operated instead
// is a product question deliberately left open as F-093, not settled by this fix.
//
// Built from `requireUserJwt` rather than copying `cancel`'s inline try/catch, because that
// block throws a bare Error after reply.status(401) and the envelope maps it to 500 — the
// separately-tracked F-092. Copying it would have propagated that bug into a second route.
server.post('/bookings/:id/check-in', async (request, reply) => {
  // WHY: identity is established BEFORE the booking lookup, following the ordering F-045
  // established for POST /bookings. If auth ran after, the 404-vs-401 difference would let
  // an unauthenticated caller probe which booking ids exist.
  let isInternal = false;
  let claims: any = null;

  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch {
    claims = await requireUserJwt(request, reply);
  }

  const { id } = request.params as any;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
  }

  // IDOR guard (F-071), same helper the cancel/read/cancel-preview routes use. Runs BEFORE
  // the idempotent early-return below, so an authenticated but unauthorised caller cannot
  // probe another booking's status through it.
  if (!isInternal) {
    requireBookingAccess(booking, claims, reply);
  }

  // F-183: same guard as /confirm and /cancel — a child booking is not independently
  // mutable. See /confirm above for the full rationale.
  if (booking.parentBookingId) {
    reply.status(400);
    const err = new Error('Cannot check in a child booking directly — act on the parent booking id');
    (err as any).statusCode = 400;
    (err as any).code = 'CHILD_BOOKING_NOT_MUTABLE';
    throw err;
  }

  if (booking.status === BookingStatus.CHECKED_IN) return booking; // idempotent

  if (booking.status !== BookingStatus.CONFIRMED) {
    reply.status(400);
    throw new Error('Only confirmed bookings can be checked in');
  }

  return await prisma.$transaction(async (tx: any) => {
    const updated = await tx.booking.update({
      where: { id },
      data: { status: BookingStatus.CHECKED_IN },
    });
    // F-183: cascade the identical transition to every child, atomically with the parent.
    await tx.booking.updateMany({
      where: { parentBookingId: id },
      data: { status: BookingStatus.CHECKED_IN },
    });
    return updated;
  });
});

// F-235 Slice B: T&C acceptance. Auth pattern copied verbatim from /cancel below (dual-auth,
// then requireBookingAccess IDOR guard) -- the only real precedent in this file for a
// guest-JWT-authenticated, IDOR-guarded, single-booking mutation route.
server.post('/bookings/:id/terms', async (request, reply) => {
  let isInternal = false;
  let decodedUser: any = null;

  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch (e) {
    try {
      decodedUser = await request.jwtVerify();
    } catch (jwtErr) {
      reply.status(401);
      throw new Error('Unauthorized');
    }
  }

  const { id } = request.params as any;
  const { termsVersion } = request.body as any;

  if (!termsVersion || typeof termsVersion !== 'string') {
    reply.status(400);
    const err = new Error('termsVersion is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
  }

  // IDOR Guard (F-071): same helper cancel/check-in/read use.
  if (!isInternal && decodedUser) {
    requireBookingAccess(booking, decodedUser, reply);
  }

  // F-183: same guard as /cancel and /check-in -- a child booking shares its parent's userId
  // and is not independently mutable. Terms acceptance is a parent-level fact (one acceptance
  // covers the whole multi-hour booking, and payment's enforcement check only ever reads the
  // parent), so writing it on a child id would be a real write that nothing ever reads.
  if (booking.parentBookingId) {
    reply.status(400);
    const err = new Error('Cannot accept terms on a child booking directly — act on the parent booking id');
    (err as any).statusCode = 400;
    (err as any).code = 'CHILD_BOOKING_NOT_MUTABLE';
    throw err;
  }

  if (booking.status === BookingStatus.CANCELLED) {
    reply.status(400);
    const err = new Error('Cannot accept terms on a cancelled booking');
    (err as any).statusCode = 400;
    (err as any).code = 'BOOKING_ALREADY_CANCELLED';
    throw err;
  }

  // Idempotent by construction -- re-calling just overwrites the timestamp/version.
  return await prisma.booking.update({
    where: { id },
    data: { termsAcceptedAt: new Date(), termsVersion },
  });
});

// Cancel (HELD | CONFIRMED → CANCELLED) with tiered refund calculation and IDOR check.
// F-207.2: extracted from the route below (behaviour byte-identical) so the relocate/cancel
// sweep can call this in-process rather than looping the request back through HTTP to itself --
// no precedent anywhere in this file for a service calling its own HTTP port, and
// ensureTodayMemberBooking already established the pattern this follows: factor shared logic
// into a function, call it from every real call site. Takes the already-fetched `booking`
// (every caller needs to read it first anyway -- the route for its IDOR check, the sweep for its
// own status/eligibility decisions) rather than re-querying. Throws plain Errors with
// `.statusCode`/`.code` set -- the global error handler (responseEnvelopePlugin) reads those
// directly, no `reply` needed, so this works identically whether the caller is an HTTP request
// or the sweep's own try/catch.
async function cancelBookingCore(
  booking: any,
  opts: { forceFullRefund?: boolean; reason?: string },
  logger: { info: (obj: any, msg: string) => void },
): Promise<any> {
  const { forceFullRefund, reason } = opts;
  const id = booking.id;

  // F-183: a guest's child booking carries the same userId as its parent, so the IDOR guard at
  // the route level legitimately passes for a guest calling this route directly on their own
  // child booking's id. Without this guard, that cancelled the child (whose price is always
  // null, so no refund is computed) while leaving the parent CONFIRMED with the full paid price
  // and freeing that window in every availability/capacity query — a real billing-integrity and
  // double-booking bug, confirmed during the F-183 investigation, not a theoretical one. Callers
  // act on the parent id, which cascades to every child in the same transaction below.
  if (booking.parentBookingId) {
    const err = new Error('Cannot cancel a child booking directly — act on the parent booking id');
    (err as any).statusCode = 400;
    (err as any).code = 'CHILD_BOOKING_NOT_MUTABLE';
    throw err;
  }

  if (booking.status === BookingStatus.CANCELLED) return booking; // idempotent

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.HELD) {
    const err = new Error('Only held or confirmed bookings can be cancelled');
    (err as any).statusCode = 400;
    throw err;
  }

  // F-245: neither branch below rejected a booking whose slot has already started or ended --
  // hoursBeforeSlot was only ever used to pick a refund tier, so a past-slot cancel silently
  // succeeded with no tier matching (refundAmount stays null) rather than surfacing that
  // anything unusual happened. Confirmed no real caller relies on cancelling a past-slot
  // booking: neither admin-web nor admin-v2 call this route at all (grepped directly), and the
  // only real caller anywhere is the guest-facing CancelBookingModal.tsx -- safe to reject
  // outright rather than allow a silent no-op-refund "cancellation" of a match that already
  // happened.
  if (new Date() >= new Date(booking.window.startTime)) {
    const err = new Error('This slot has already started or ended and can no longer be cancelled');
    (err as any).statusCode = 400;
    (err as any).code = 'SLOT_ALREADY_ENDED';
    throw err;
  }

  let refundAmount: Prisma.Decimal | null = null;

  if (booking.status === BookingStatus.CONFIRMED) {
    if (forceFullRefund === true) {
      // F-275: skips the tier lookup entirely -- booking.price is the exact value every
      // booking-creation path (self-service, negotiated, manual, member) also used to set the
      // captured PaymentIntent's amount, and is never mutated after creation, so this always
      // matches what was really paid.
      if (booking.price) {
        refundAmount = new Prisma.Decimal(booking.price);
      }
      logger.info(
        { bookingId: id, reason: reason ?? 'system_forced_full_refund' },
        'Booking force-cancelled with full refund (system-initiated)',
      );
    } else {
      const rule = await prisma.bookingRule.findFirst({ where: { resourcePoolId: booking.resourcePoolId }, orderBy: { createdAt: 'asc' } });
      const now = new Date();
      const startTime = new Date(booking.window.startTime);
      const hoursBeforeSlot = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursBeforeSlot > 0 && rule?.cancellationPolicyJson) {
        const policy = rule.cancellationPolicyJson as any;
        if (policy.type === 'tiered' && Array.isArray(policy.tiers)) {
          const sortedTiers = [...policy.tiers].sort((a, b) => b.min_hours_before_slot - a.min_hours_before_slot);
          const matchedTier = sortedTiers.find((tier) => hoursBeforeSlot >= tier.min_hours_before_slot);
          if (matchedTier && booking.price) {
            refundAmount = new Prisma.Decimal((Number(booking.price) * matchedTier.refund_percent) / 100);
          }
        }
      }
    }
  }

  // F-183: parent update and child cascade commit together — no reachable state where
  // the parent is CANCELLED but a child booking still holds its window, or vice versa.
  // Children never had a price, so they never get a refund of their own.
  return await prisma.$transaction(async (tx: any) => {
    const updated = await tx.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED, refundAmount },
    });
    await tx.booking.updateMany({
      where: { parentBookingId: id },
      data: { status: BookingStatus.CANCELLED, refundAmount: null },
    });
    return updated;
  });
}

server.post('/bookings/:id/cancel', async (request, reply) => {
  let isInternal = false;
  let decodedUser: any = null;

  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch (e) {
    try {
      decodedUser = await request.jwtVerify();
    } catch (jwtErr) {
      reply.status(401);
      throw new Error('Unauthorized');
    }
  }

  const { id } = request.params as any;

  // F-275: system-initiated forced full refund, bypassing the pool's normal cancellationPolicyJson
  // tiering entirely. internal-key-only -- this is the automated cancel-and-refund F-207.2's
  // relocate/cancel sweep needs (a displaced guest gets an unconditional 100% refund, never a
  // human's discretionary call), not something a guest/admin JWT caller can self-grant. Rejected
  // outright rather than silently ignored: a caller should never think this partially applied.
  // F-275: this route historically read no body at all, so most real callers (guest cancel,
  // internal-key cancels throughout this suite) send none -- request.body is undefined, not {},
  // and destructuring undefined throws. Default to {} rather than assume a body is present.
  const { forceFullRefund, reason } = (request.body as any) ?? {};
  if (forceFullRefund === true && !isInternal) {
    reply.status(403);
    const err = new Error('forceFullRefund is internal-only');
    (err as any).statusCode = 403;
    (err as any).code = 'FORCE_REFUND_INTERNAL_ONLY';
    throw err;
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { window: true },
  });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
  }

  // IDOR Guard (F-071): tenant-scoped, branch-aware, shared by all three booking routes.
  if (!isInternal && decodedUser) {
    requireBookingAccess(booking, decodedUser, reply);
  }

  return cancelBookingCore(booking, { forceFullRefund, reason }, request.log);
});

// ---------------------------------------------------------------------------
// Member self-confirm attendance
// ---------------------------------------------------------------------------

/**
 * Verifies the caller's JWT and returns the identity claims it carries.
 *
 * WHY THIS EXISTS SEPARATELY FROM requireMemberJwt: this is the identity core,
 * with no role gate. `requireMemberJwt` adds a MEMBER-only check on top, which
 * would wrongly reject guests — and guests are exactly who use POST /bookings.
 * Splitting it keeps one implementation of "who is calling" for both.
 *
 * Callers must treat the returned identity as the ONLY source of truth. Never
 * read an id out of the request body for identity purposes (F-045).
 */
async function requireUserJwt(request: any, reply: any) {
  try {
    const decodedUser: any = await request.jwtVerify();
    const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
    const tenantId = decodedUser.tenantId;
    if (!userId || !tenantId) {
      reply.status(401);
      const err = new Error('Unauthorized');
      (err as any).statusCode = 401;
      (err as any).code = 'UNAUTHORIZED';
      throw err;
    }
    return {
      userId,
      tenantId,
      userType: decodedUser.userType,
      roles: (decodedUser.roles ?? []) as string[],
    };
  } catch (err: any) {
    if (!err.statusCode && !err.code) {
      reply.status(401);
      const authErr = new Error('Unauthorized');
      (authErr as any).code = 'UNAUTHORIZED';
      throw authErr;
    }
    throw err;
  }
}

async function requireMemberJwt(request: any, reply: any) {
  const claims = await requireUserJwt(request, reply);
  if (claims.userType !== 'MEMBER') {
    reply.status(403);
    const err = new Error('Member access required');
    (err as any).statusCode = 403;
    (err as any).code = 'MEMBER_REQUIRED';
    throw err;
  }
  return { userId: claims.userId, tenantId: claims.tenantId };
}

// F-133 Slice B: canConfirm/canDecline now account for a RELEASED_NO_SHOW booking that came from
// an explicit pre-cutoff decline (previously the only way to reach RELEASED_NO_SHOW was the
// sweep, always post-cutoff, so `!booking` was a sufficient canConfirm gate). A declined-but-
// still-before-cutoff booking must still show canConfirm: true (the real bug fix's UI half) and
// canDecline: false (already declined); a confirmed one is the mirror -- canConfirm: false,
// canDecline: true (still changeable before cutoff).
function shapeTodayAssignment(resolution: TodayAssignmentResolution, subscriptionStatus?: string) {
  if (resolution.state !== 'HAS_SESSION') return resolution;
  const booking = resolution.existingBooking;
  const notYetCutoff = new Date() < resolution.cutoffTime;
  const isConfirmed = !!booking && booking.status === BookingStatus.CONFIRMED && !!booking.memberAttendanceConfirmedAt;
  const isDeclined = !!booking && booking.status === BookingStatus.RELEASED_NO_SHOW;
  return {
    state: subscriptionStatus && subscriptionStatus !== 'active' ? 'SUBSCRIPTION_INACTIVE' : 'HAS_SESSION',
    assignmentId: resolution.assignmentId,
    weekday: resolution.weekday,
    assignment: resolution.assignment,
    window: resolution.window,
    booking,
    cutoffTime: resolution.cutoffTime,
    canConfirm: !subscriptionStatus && notYetCutoff && !isConfirmed,
    canDecline: notYetCutoff && !isDeclined,
    reason: booking ? booking.status : undefined,
  };
}

// GET /member/today-assignment — member dashboard state for EVERY active batch's today's
// recurring slot (F-133 Slice B: array, one entry per ACTIVE assignment with a session today;
// an assignment with none today is still included, in its NO_SESSION_TODAY/WINDOW_NOT_FOUND
// shape -- the frontend's tab bar needs to know about every batch, not just ones with a session).
// A member with zero ACTIVE assignments gets an empty array.
// WHY: The dashboard needs deliberate states for no-session, inactive subscription,
// and missing-window cases instead of silently hiding the member attendance card.
server.get('/member/today-assignment', async (request, reply) => {
  const { userId, tenantId } = await requireMemberJwt(request, reply);
  const now = new Date();
  const resolutions = await resolveTodayMemberAssignments(userId, tenantId, now);
  const activeSubscription = await getActiveSubscription(userId, tenantId);

  return resolutions.map((resolution) => {
    if (resolution.state !== 'HAS_SESSION') return resolution;
    if (!activeSubscription) return shapeTodayAssignment(resolution, 'inactive');
    return {
      ...shapeTodayAssignment(resolution),
      subscriptionStatus: activeSubscription.status,
    };
  });
});

// Shared body/lookup for confirm+decline: both act on one caller-owned assignmentId, both 404 on
// an unknown/foreign/inactive one, both share the NO_SESSION_TODAY/WINDOW_NOT_FOUND handling.
async function requireOwnedTodayAssignment(request: any, reply: any, userId: string, tenantId: string, now: Date) {
  const { assignmentId } = (request.body as any) ?? {};
  if (!assignmentId) {
    reply.status(400);
    const err = new Error('assignmentId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const resolution = await resolveOneTodayMemberAssignment(userId, tenantId, assignmentId, now);
  if (!resolution) {
    reply.status(404);
    const err = new Error('No active member assignment with that id');
    (err as any).statusCode = 404;
    (err as any).code = 'NO_ACTIVE_ASSIGNMENT';
    throw err;
  }
  if (resolution.state === 'NO_SESSION_TODAY') {
    reply.status(409);
    const err = new Error('No recurring session today');
    (err as any).statusCode = 409;
    (err as any).code = 'NO_SESSION_TODAY';
    throw err;
  }
  if (resolution.state === 'WINDOW_NOT_FOUND') {
    reply.status(404);
    const err = new Error('Today recurring slot window was not found');
    (err as any).statusCode = 404;
    (err as any).code = 'WINDOW_NOT_FOUND';
    throw err;
  }
  return resolution;
}

// POST /member/today-assignment/confirm — creates today's member booking via the
// same atomic lazy-generation helper used by the grace-period sweep.
// F-133 Slice B: now takes { assignmentId } in the body -- one of possibly several concurrent
// ACTIVE assignments, resolved and ownership-checked by requireOwnedTodayAssignment.
server.post('/member/today-assignment/confirm', async (request, reply) => {
  const { userId, tenantId } = await requireMemberJwt(request, reply);
  const now = new Date();
  const resolution = await requireOwnedTodayAssignment(request, reply, userId, tenantId, now);

  const activeSubscription = await getActiveSubscription(userId, tenantId);
  if (!activeSubscription) {
    reply.status(409);
    const err = new Error('Active subscription is required to confirm attendance');
    (err as any).statusCode = 409;
    (err as any).code = 'SUBSCRIPTION_INACTIVE';
    throw err;
  }

  if (now >= resolution.cutoffTime) {
    reply.status(409);
    const err = new Error('Confirmation cutoff has passed');
    (err as any).statusCode = 409;
    (err as any).code = 'CONFIRMATION_CUTOFF_PASSED';
    throw err;
  }

  if (resolution.existingBooking) {
    // F-133 Slice B real bug fix: a RELEASED_NO_SHOW booking used to 409 here unconditionally,
    // which was correct ONLY because nothing but the post-cutoff sweep could ever produce that
    // status -- reaching this line already proves now < cutoffTime, so a RELEASED_NO_SHOW here
    // can now ONLY be a pre-cutoff explicit decline (the new /decline route below), and a member
    // changing their mind back to "coming" before cutoff must be allowed, not blocked.
    const alreadyConfirmed =
      resolution.existingBooking.status === BookingStatus.CONFIRMED &&
      !!resolution.existingBooking.memberAttendanceConfirmedAt;
    if (alreadyConfirmed) return resolution.existingBooking;

    return prisma.booking.update({
      where: { id: resolution.existingBooking.id },
      data: { status: BookingStatus.CONFIRMED, memberAttendanceConfirmedAt: now, memberAttendanceDeclinedAt: null },
    });
  }

  const ensured = await ensureTodayMemberBooking({
    assignment: resolution.assignment,
    matchingWindow: resolution.window,
    now,
    timeZone: await getBranchTimeZone(resolution.assignment.resourcePool.branchId),
    status: BookingStatus.CONFIRMED,
    attendanceConfirmedAt: now,
  });
  reply.status(ensured.created ? 201 : 200);
  return ensured.booking;
});

// POST /member/today-assignment/decline — F-133 Slice B: the real explicit "not attending"
// action, confirmed absent anywhere in this file before this (zero matches for decline/
// not-attending/opt-out). A new route rather than a flag on /confirm, matching this file's own
// convention of one route per real state transition (/confirm, /check-in, /cancel are all
// separate siblings, not one polymorphic route) -- and /confirm's body is empty today, so a flag
// would be new surface on an established route rather than a natural extension of it.
//
// Reuses RELEASED_NO_SHOW (zero BookingStatus enum growth, all existing downstream capacity/
// occupancy handling already treats it as "seat free") with the new memberAttendanceDeclinedAt
// timestamp distinguishing an explicit decline from a sweep-triggered no-show for display only --
// same shape as memberAttendanceConfirmedAt.
//
// Deliberately NOT subscription-gated (unlike /confirm): a member with a lapsed subscription
// can't get a CONFIRMED booking either way, but "I'm not coming" carries no billing implication
// and is exactly the signal admin/roster needs from a lapsed member -- gating it would silently
// suppress real attendance data for no real reason.
server.post('/member/today-assignment/decline', async (request, reply) => {
  const { userId, tenantId } = await requireMemberJwt(request, reply);
  const now = new Date();
  const resolution = await requireOwnedTodayAssignment(request, reply, userId, tenantId, now);

  if (now >= resolution.cutoffTime) {
    reply.status(409);
    const err = new Error('Cutoff has passed');
    (err as any).statusCode = 409;
    (err as any).code = 'CONFIRMATION_CUTOFF_PASSED';
    throw err;
  }

  if (resolution.existingBooking) {
    const alreadyDeclined = resolution.existingBooking.status === BookingStatus.RELEASED_NO_SHOW;
    if (alreadyDeclined) return resolution.existingBooking;

    return prisma.booking.update({
      where: { id: resolution.existingBooking.id },
      data: { status: BookingStatus.RELEASED_NO_SHOW, memberAttendanceDeclinedAt: now, memberAttendanceConfirmedAt: null },
    });
  }

  const ensured = await ensureTodayMemberBooking({
    assignment: resolution.assignment,
    matchingWindow: resolution.window,
    now,
    timeZone: await getBranchTimeZone(resolution.assignment.resourcePool.branchId),
    status: BookingStatus.RELEASED_NO_SHOW,
    attendanceConfirmedAt: null,
    attendanceDeclinedAt: now,
  });
  reply.status(ensured.created ? 201 : 200);
  return ensured.booking;
});

// GET /member/calendar — a real month's worth of day-status for one of the caller's own batches
// (assignmentId, the same id Slice B's tabs already carry). F-133 Slice C: per-batch attribution
// is a derived join, not a stored field (Booking has no FK back to MemberGroupAssignment) -- each
// calendar day is matched against THIS assignment's own startDate/endDate bound, so a day outside
// it (before the member joined, or -- once Slice D lands -- after they left) correctly reads as
// no data rather than borrowing another assignment's session. Ownership check deliberately does
// NOT require status: 'ACTIVE' (unlike the today-assignment routes) -- this shows real history,
// which must stay visible after a future removal/relocation, not just while currently active.
server.get('/member/calendar', async (request, reply) => {
  const { userId, tenantId } = await requireMemberJwt(request, reply);
  const { assignmentId, month } = request.query as any;
  if (!assignmentId) {
    reply.status(400);
    const err = new Error('assignmentId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const assignment = await prisma.memberGroupAssignment.findFirst({
    where: { id: assignmentId, userId, resourcePool: { tenantId } },
    include: { resourcePool: true },
  });
  if (!assignment) {
    reply.status(404);
    const err = new Error('No assignment with that id belongs to you');
    (err as any).statusCode = 404;
    (err as any).code = 'NO_ACTIVE_ASSIGNMENT';
    throw err;
  }

  const timeZone = await getBranchTimeZone(assignment.resourcePool.branchId);
  const now = new Date();
  const [yearStr, monthStr] = (month || todayDateString(now, timeZone).slice(0, 7)).split('-');
  const year = Number(yearStr);
  const mo = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(mo) || mo < 1 || mo > 12) {
    reply.status(400);
    const err = new Error('month must be "YYYY-MM"');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_MONTH';
    throw err;
  }

  const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
  const totalDays = daysInMonth(year, mo);

  // First pass: every real session date this specific assignment covers this month (within its
  // own startDate/endDate bound AND a weekday it actually runs) -- the join logic, applied once
  // per day rather than trusting a stored link that doesn't exist.
  const sessionDates: { dateString: string; windowStart: Date }[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const dateString = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let dayInstant: Date;
    let windowStart: Date;
    try {
      dayInstant = branchLocalToUtc(dateString, '12:00', timeZone);
      windowStart = branchLocalToUtc(dateString, assignment.startTime, timeZone);
    } catch {
      continue;
    }
    if (dayInstant < assignment.startDate || dayInstant > assignment.endDate) continue;
    if (!days.includes(branchIsoWeekday(dayInstant, timeZone))) continue;
    sessionDates.push({ dateString, windowStart });
  }

  const windowStarts = sessionDates.map((s) => s.windowStart);
  const windows = windowStarts.length
    ? await prisma.availabilityWindow.findMany({
        where: { resourcePoolId: assignment.resourcePoolId, startTime: { in: windowStarts } },
        select: { id: true, startTime: true },
      })
    : [];
  const windowByStart = new Map(windows.map((w: any) => [w.startTime.getTime(), w]));
  const windowIds = windows.map((w: any) => w.id);
  const bookings = windowIds.length
    ? await prisma.booking.findMany({
        where: { userId, windowId: { in: windowIds }, isMemberBooking: true, status: { not: BookingStatus.CANCELLED } },
        select: { windowId: true, status: true, memberAttendanceConfirmedAt: true, memberAttendanceDeclinedAt: true },
      })
    : [];
  const bookingByWindowId = new Map(bookings.map((b: any) => [b.windowId, b]));

  const stateByDate = new Map<string, GroupRosterState>();
  let hasEnoughHistory = false;
  for (const { dateString, windowStart } of sessionDates) {
    if (windowStart < now) hasEnoughHistory = true;
    const window = windowByStart.get(windowStart.getTime());
    const booking = window ? bookingByWindowId.get(window.id) : undefined;
    stateByDate.set(dateString, deriveDayState(booking));
  }

  const results: { date: string; state: GroupRosterState }[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const dateString = `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    results.push({ date: dateString, state: stateByDate.get(dateString) ?? 'NO_DATA' });
  }

  return { days: results, hasEnoughHistory };
});

// ---------------------------------------------------------------------------
// Member Group Assignments
// ---------------------------------------------------------------------------

// Create a member group assignment (admin-only).
// WHY: Dual-path auth — internal key OR owner/branch-manager JWT.
// F-133: the partial unique index on (userId) WHERE status = 'ACTIVE' that used to enforce
// one-active-slot-per-member platform-wide is gone -- a member may hold one ACTIVE row per
// batch now (F-133 Slice A). P2002 here is only the surviving @@unique([userId, resourcePoolId])
// firing on a same-pool double assignment.
// F-207.1: months added per term preset. termPreset itself is never persisted -- only the
// computed startDate/endDate -- so a later renewal can use a different preset than the
// original term without reconciling a stored "original preset" value.
const TERM_PRESET_MONTHS: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

// F-207.2: attempts to move `booking` to a sibling POOLED pool in the same branch at the exact
// same `startTime`, in `createdAt asc` order (assignPooledCourt's own tiebreak precedent -- no
// priority/precedence concept exists on ResourcePool today). A relocation target's window is
// force-generated (ensureAvailabilityWindowsForDate) since a legitimate alternative pool may
// simply never have been browsed yet; the original collision scan deliberately does NOT do this
// (nothing to collide with on an ungenerated window). Mutates the existing Booking row in place
// (resourcePoolId/windowId/resourceId/courtSlotIndex) rather than cancel+recreate: `price` stays
// exactly what the guest already paid, and `PaymentIntent.referenceId` (which points at this
// booking's id, never at its pool/window) never needs to change -- zero payment-side risk.
// Capacity is re-checked inside a FOR UPDATE transaction immediately before the move (not just
// trusted from the earlier windowBookable check) to close the race between that check and the
// actual write; a sibling that fills in between is skipped, not fatal -- the next sibling is tried.
async function tryRelocateBooking(
  booking: { id: string },
  originalWindow: { startTime: Date },
  originalPool: { id: string; branchId: string },
  timeZone: string,
): Promise<boolean> {
  const siblings = await prisma.resourcePool.findMany({
    where: { branchId: originalPool.branchId, id: { not: originalPool.id }, allocationMode: AllocationMode.POOLED },
    orderBy: { createdAt: 'asc' },
    include: { resources: { orderBy: { createdAt: 'asc' } } },
  });
  if (siblings.length === 0) return false;

  const dateString = branchDateString(originalWindow.startTime, timeZone);
  const nowInstant = new Date();

  for (const sibling of siblings) {
    await ensureAvailabilityWindowsForDate(sibling.id, dateString);
    const siblingWindow = await prisma.availabilityWindow.findFirst({
      where: { resourcePoolId: sibling.id, startTime: originalWindow.startTime },
    });
    if (!siblingWindow) continue;

    // The sibling's OWN active assignments matter too -- a relocation must never land a guest
    // on another member's slot.
    const siblingExclusion = await fetchMemberExclusionContext(sibling, timeZone);
    const { bookable } = await windowBookable(sibling, siblingWindow, nowInstant, siblingExclusion);
    if (!bookable) continue;

    try {
      await prisma.$transaction(async (tx: any) => {
        await tx.$queryRaw`SELECT id FROM "AvailabilityWindow" WHERE id = ${siblingWindow.id} FOR UPDATE`;
        const active = await tx.booking.findMany({
          where: { windowId: siblingWindow.id, status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] } },
          select: { courtSlotIndex: true, resourceId: true },
        });
        if (active.length >= siblingWindow.capacity) {
          throw new Error('sibling window filled before relocation could complete');
        }
        const { resourceId, courtSlotIndex } = assignPooledCourt(sibling, active);
        await tx.booking.update({
          where: { id: booking.id },
          data: { resourcePoolId: sibling.id, windowId: siblingWindow.id, resourceId, courtSlotIndex },
        });
      });
      return true;
    } catch {
      // This sibling filled in the race between the check above and the write -- try the next
      // one rather than treating this as fatal for the whole relocation attempt.
      continue;
    }
  }
  return false;
}

// F-207.2: one-time relocate/cancel sweep, run synchronously when a new MemberGroupAssignment is
// created. Scans EXISTING guest bookings on the exact resourcePoolId/day/time the assignment
// covers, bounded by guestOpenWindowDays (a guest cannot hold a booking further out -- already
// server-enforced at POST /bookings, so scanning further finds nothing). Never force-generates a
// window for the SCAN itself (unlike relocation targets above) -- an ungenerated window has
// nothing a guest could have booked against it.
//
// Best-effort, never all-or-nothing: cross-service atomicity is impossible here (this calls
// payment's POST /refunds over HTTP mid-operation), so each colliding booking is processed
// independently with its own try/catch. The MemberGroupAssignment itself is never rolled back by
// a sweep failure -- it's a valid entitled action on its own merits; the sweep is best-effort
// cleanup layered on top ("member contracts always win" applies to the assignment succeeding,
// not to every existing collision being auto-resolved).
// F-207.3: the pure-read half of the collision sweep -- extracted verbatim (same iteration,
// same guards, zero behaviour change) so a preview caller can reuse the exact "which bookings
// collide" logic without duplicating it (the F-212 windowBookable precedent for this kind of
// extraction). Deliberately stops here: it never decides relocate-vs-cancel and never probes a
// sibling pool's real-time availability, both of which are genuinely racy/side-effecting and out
// of scope for a preview per this session's investigation -- threading a dryRun flag through
// tryRelocateBooking/cancelBookingCore to simulate those would risk the just-verified F-207.2
// decision logic for a UI-only feature.
async function scanCollidingBookings(
  pool: { id: string; branchId: string },
  daysOfWeek: string,
  startTime: string,
): Promise<{ windowId: string; startTime: Date; activeBookings: any[] }[]> {
  const rule = await prisma.bookingRule.findFirst({ where: { resourcePoolId: pool.id }, orderBy: { createdAt: 'asc' } });
  const guestOpenWindowDays = rule?.guestOpenWindowDays ?? 7;
  const timeZone = await getBranchTimeZone(pool.branchId);
  const days = daysOfWeek.split(',').map((d) => d.trim());

  const results: { windowId: string; startTime: Date; activeBookings: any[] }[] = [];

  for (let i = 0; i <= guestOpenWindowDays; i++) {
    const candidateInstant = addBranchDays(new Date(), i, timeZone);
    const dateString = branchDateString(candidateInstant, timeZone);

    let windowStart: Date;
    try {
      windowStart = branchLocalToUtc(dateString, startTime, timeZone);
    } catch {
      continue; // unparseable startTime -- validateAssignmentSchedule already guards this at create time
    }
    // Weekday derived from the SAME resolved instant we're about to query with -- never
    // independently re-derived from dateString, avoiding any UTC/branch-local boundary mismatch.
    if (!days.includes(branchIsoWeekday(windowStart, timeZone))) continue;

    const window = await prisma.availabilityWindow.findFirst({
      where: { resourcePoolId: pool.id, startTime: windowStart },
    });
    if (!window) continue; // never generated -- nothing a guest could have booked against it

    const activeBookings = await prisma.booking.findMany({
      where: { windowId: window.id, status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] } },
    });

    results.push({ windowId: window.id, startTime: window.startTime, activeBookings });
  }

  return results;
}

async function runMemberCollisionSweep(
  assignment: { id: string; userId: string; resourcePoolId: string; daysOfWeek: string; startTime: string },
  pool: { id: string; branchId: string; allocationMode: AllocationMode },
  logger: { info: (obj: any, msg: string) => void; warn: (obj: any, msg: string) => void },
): Promise<{ scanned: number; relocated: number; cancelled: number; failed: { bookingId: string; error: string }[] }> {
  const summary = { scanned: 0, relocated: 0, cancelled: 0, failed: [] as { bookingId: string; error: string }[] };

  const paymentUrl = process.env.PAYMENT_URL || 'http://localhost:3004';
  const internalKeyHeader = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  // Needed below for tryRelocateBooking's own sibling-window lookup. A second cheap call rather
  // than threading it back out of scanCollidingBookings, which stays a plain "which bookings
  // collide" array shared as-is with the preview route.
  const timeZone = await getBranchTimeZone(pool.branchId);

  const dateWindows = await scanCollidingBookings(pool, assignment.daysOfWeek, assignment.startTime);

  for (const { windowId, startTime: windowStartTime, activeBookings } of dateWindows) {
    const window = { id: windowId, startTime: windowStartTime };
    for (const occupant of activeBookings) {
      summary.scanned += 1;
      try {
        // F-183: act on the parent, never a child directly -- same rule cancelBookingCore itself
        // enforces for a direct HTTP caller.
        let booking = occupant;
        if (booking.parentBookingId) {
          const parent = await prisma.booking.findUnique({ where: { id: booking.parentBookingId } });
          if (!parent) throw new Error(`parent booking ${booking.parentBookingId} not found`);
          booking = parent;
        }
        const hasChildren = (await prisma.booking.count({ where: { parentBookingId: booking.id } })) > 0;

        // HELD: mid-checkout, no captured payment, 5-minute TTL. Relocating risks silently
        // invalidating a payment link/intent the guest's client already has open against the
        // original pool/price -- cancel outright instead. Leaving it alone risks the payment
        // webhook confirming it later (it never re-checks availability), recreating the exact
        // collision this sweep exists to prevent.
        if (booking.status === BookingStatus.HELD) {
          const bookingWindow = booking.windowId === window.id ? window : await prisma.availabilityWindow.findUnique({ where: { id: booking.windowId } });
          await cancelBookingCore({ ...booking, window: bookingWindow }, {}, logger);
          summary.cancelled += 1;
          continue;
        }

        // CONFIRMED from here. Multi-window (F-183 parent+children) bookings never relocate --
        // relocating only the colliding window while sibling windows stayed on the original pool
        // would break F-183's same-pool contiguity assumption. Straight to cancel+refund instead.
        let relocated = false;
        if (!hasChildren && pool.allocationMode === AllocationMode.POOLED) {
          relocated = await tryRelocateBooking(booking, window, pool, timeZone);
        }
        if (relocated) {
          summary.relocated += 1;
          continue;
        }

        const cancelled = await cancelBookingCore(
          { ...booking, window },
          { forceFullRefund: true, reason: `displaced by Member contract assignment ${assignment.id}` },
          logger,
        );
        if (cancelled.status === BookingStatus.CANCELLED && cancelled.refundAmount) {
          const refundRes = await fetch(`${paymentUrl}/refunds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalKeyHeader}` },
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (!refundRes.ok) {
            const body = await refundRes.text().catch(() => '');
            throw new Error(`POST /refunds failed with ${refundRes.status}: ${body}`);
          }
        }
        summary.cancelled += 1;
      } catch (err: any) {
        logger.warn(
          { bookingId: occupant.id, error: err?.message ?? String(err) },
          '[F-207.2 sweep] failed to relocate or cancel a colliding booking',
        );
        summary.failed.push({ bookingId: occupant.id, error: err?.message ?? String(err) });
      }
    }
  }

  return summary;
}

// F-207.3: cheap pre-hoc signal before an admin commits a new assignment -- "this will affect N
// existing booking(s)" -- reusing scanCollidingBookings' exact "which bookings collide" logic
// rather than predicting the sweep's relocate-vs-cancel decision, which is out of scope for a
// preview (see scanCollidingBookings' own comment). Same dual-path auth + entitlement + pool
// scope as the create route below, write:false since this makes no change.
server.get('/resource-pools/:id/member-collision-preview', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: false }); // F-206

  const { id } = request.params as any;
  const { daysOfWeek, startTime } = request.query as any;

  if (!daysOfWeek || !startTime) {
    reply.status(400);
    const err = new Error('daysOfWeek and startTime are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const pool = await requirePoolScope(auth, id, reply);

  const dateWindows = await scanCollidingBookings(pool, daysOfWeek, startTime);
  const scanned = dateWindows.reduce((sum, dw) => sum + dw.activeBookings.length, 0);

  return { scanned };
});

// F-133 Slice A: create a batch (Group). A generic, vertical-agnostic entity whose only real
// consumer today is this badminton batch-creation flow -- see docs/discovery/f133_group_hierarchy.md.
// Auth/scoping mirrors POST /member-group-assignments below (its own established precedent for
// this same admin surface): getInternalOrAdminAuth + requirePoolScope, MEMBER_MANAGEMENT write
// entitlement.
server.post('/groups', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: true }); // F-206

  const { name, resourcePoolId, daysOfWeek, startTime, isPeak = false, customRate } = request.body as any;

  if (!name || !resourcePoolId || !daysOfWeek || !startTime) {
    reply.status(400);
    const err = new Error('name, resourcePoolId, daysOfWeek, and startTime are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  if (typeof isPeak !== 'boolean') {
    reply.status(400);
    const err = new Error('isPeak must be a boolean');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }
  if (customRate !== undefined && customRate !== null && (typeof customRate !== 'number' || !Number.isFinite(customRate) || customRate < 0)) {
    reply.status(400);
    const err = new Error('customRate must be a non-negative number when provided');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const pool = await requirePoolScope(auth, resourcePoolId, reply);

  // F-169 precedent, reused as-is: reject a schedule that no generated window could ever match.
  await validateAssignmentSchedule(resourcePoolId, daysOfWeek, startTime);

  // F-133 §5: block creation unless a rate genuinely resolves -- own customRate, else whichever
  // tenant-wide default matches isPeak. Validation only; the resolved value is never persisted
  // here (customRate stays exactly what the admin entered, possibly null) so a later tenant
  // default change is reflected for every batch that relies on it, not frozen at creation time.
  if (customRate === undefined || customRate === null) {
    const tenant = await prisma.tenant.findUnique({ where: { id: pool.tenantId } });
    const tenantDefault = isPeak ? tenant?.memberPeakDefaultRate : tenant?.memberNonPeakDefaultRate;
    if (tenantDefault === null || tenantDefault === undefined) {
      reply.status(400);
      const err = new Error(
        `No rate resolves for this batch: no customRate was given and Tenant.${isPeak ? 'memberPeakDefaultRate' : 'memberNonPeakDefaultRate'} is not set`,
      );
      (err as any).statusCode = 400;
      (err as any).code = 'NO_RESOLVABLE_RATE';
      throw err;
    }
  }

  // F-133 §4: calendar-month-aligned term. Created on the 1st -> starts today; otherwise queued
  // to the 1st of next month (no partial/prorated first cycle -- deliberate, ahead of F-209).
  // endDate is always the real last day of the starting month, via endOfNextCalendarMonthUtc
  // fed an anchor in the PRIOR month so its own "next calendar month" resolves to startDate's
  // month -- the same helper Slice E's renewal will reuse directly on an assignment's endDate.
  const now = new Date();
  const startDate = now.getUTCDate() === 1
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const priorMonthAnchor = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
  const endDate = endOfNextCalendarMonthUtc(priorMonthAnchor);

  const group = await prisma.group.create({
    data: {
      tenantId: pool.tenantId,
      name,
      resourcePoolId,
      daysOfWeek,
      startTime,
      isPeak,
      customRate: customRate ?? null,
      startDate,
      endDate,
    },
  });
  reply.status(201);
  return group;
});

// F-133 Slice C: list groups (internal only — admin tooling), mirroring GET
// /member-group-assignments's exact scoping pattern just below (branch_manager sees only its
// own branches' pools, owner/internal see everything, resourcePoolId narrows further).
//
// F-277: an owner caller had NO tenant scoping at all -- scopedPoolIds stayed undefined for the
// owner branch below, so the query fell through to an unfiltered prisma.group.findMany({}),
// returning every tenant's batches to any tenant's owner. Confirmed live (a JBC-authenticated
// request returned a courtowner1 batch) during F-133 Slice E's own dev-stack verification, while
// building the structurally identical GET /groups/expiring-renewals, which had the same gap and
// was fixed the same way there first. Fix: an owner caller (non-internal, no branch_manager
// scoping) is now filtered to their own auth.tenantId -- branch_manager stays unchanged below,
// already tenant-safe since a given branchId belongs to exactly one tenant.
server.get('/groups', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: false }); // F-206
  const { resourcePoolId } = request.query as any;
  let scopedPoolIds: string[] | undefined;
  let ownerTenantId: string | undefined;

  if (!auth.isInternal && !auth.roles.includes('owner')) {
    const branchIds = auth.roles
      .filter((role) => role.startsWith('branch_manager:'))
      .map((role) => role.split(':')[1])
      .filter(Boolean);
    if (branchIds.length === 0) {
      reply.status(403);
      const err = new Error('Forbidden: Branch scope required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
    const pools = await prisma.resourcePool.findMany({
      where: { branchId: { in: branchIds }, ...(resourcePoolId ? { id: resourcePoolId } : {}) },
      select: { id: true },
    });
    scopedPoolIds = pools.map((pool: any) => pool.id);
    if (resourcePoolId && scopedPoolIds.length === 0) {
      reply.status(403);
      const err = new Error('Forbidden: Not authorized for this resource pool');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
  } else if (!auth.isInternal && auth.roles.includes('owner')) {
    ownerTenantId = auth.tenantId ?? undefined;
  }

  return prisma.group.findMany({
    where: {
      ...(scopedPoolIds ? { resourcePoolId: { in: scopedPoolIds } } : resourcePoolId ? { resourcePoolId } : {}),
      ...(ownerTenantId ? { tenantId: ownerTenantId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
});

// F-133 Slice E — real batches with at least one ACTIVE member expiring this month, for the
// admin-v2 renewal UI. Reuses computeExpiringBatchesByBranch (defined further down, shared with
// the sweep's own reminder dispatch) -- same real query shape, not duplicated. Unlike the sweep's
// reminder, this has no "is it the 20th" gate -- an admin should be able to browse this any day
// of the month, not just when the reminder fires. Branch-scoped the same way GET /groups already
// is (branch_manager sees only its own branches).
//
// Real gap caught live in this slice's own dev-stack verification, fixed here: an owner caller
// (scopedBranchIds stays undefined) must be scoped to their OWN tenant -- passing no tenantId to
// computeExpiringBatchesByBranch returned every tenant's expiring batches, confirmed live as a
// JBC owner session being served a courtowner1 batch. auth.tenantId is populated from the JWT for
// every non-internal caller (see AdminAuthContext), so this is available with no new lookup.
// GET /groups itself (Slice C, already merged) has this identical gap on its own owner path --
// flagged separately as its own finding rather than silently fixed here, since that route's scope
// belongs to Slice C's own PR, not this one.
server.get('/groups/expiring-renewals', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: false }); // F-206

  let scopedBranchIds: string[] | undefined;
  if (!auth.isInternal && !auth.roles.includes('owner')) {
    scopedBranchIds = auth.roles
      .filter((role) => role.startsWith('branch_manager:'))
      .map((role) => role.split(':')[1])
      .filter(Boolean);
    if (scopedBranchIds.length === 0) {
      reply.status(403);
      const err = new Error('Forbidden: Branch scope required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
  }

  const ownerTenantId = !auth.isInternal && auth.roles.includes('owner') ? auth.tenantId ?? undefined : undefined;
  const byBranch = await computeExpiringBatchesByBranch(new Date(), ownerTenantId);
  return scopedBranchIds
    ? byBranch.filter((branch) => scopedBranchIds!.includes(branch.branchId))
    : byBranch;
});

// F-133 Slice C — the four-state day-status derivation, decided this round (real reasoning in
// chief-decision-f133-attendance-metric.md): memberAttendanceConfirmedAt/DeclinedAt, never
// CHECKED_IN -- members mark yes/no once and won't tap a second real-arrival check-in, so
// requiring CHECKED_IN would undercount against real behaviour. No new schema: purely derived
// from Booking's existing fields.
type GroupRosterState = 'ATTENDED' | 'DECLINED' | 'NO_RESPONSE' | 'NO_DATA';

type GroupRosterRow = {
  userId: string;
  memberPhone: string;
  assignmentId: string;
  state: GroupRosterState;
  confirmedAt: string | null;
  declinedAt: string | null;
};

function deriveDayState(booking: { status: BookingStatus; memberAttendanceConfirmedAt: Date | null; memberAttendanceDeclinedAt: Date | null } | undefined): GroupRosterState {
  if (!booking) return 'NO_DATA';
  if (booking.status === BookingStatus.CONFIRMED && booking.memberAttendanceConfirmedAt) return 'ATTENDED';
  if (booking.status === BookingStatus.RELEASED_NO_SHOW && booking.memberAttendanceDeclinedAt) return 'DECLINED';
  if (booking.status === BookingStatus.RELEASED_NO_SHOW) return 'NO_RESPONSE';
  return 'NO_DATA';
}

// Real query shape reuses computeBranchMemberAttendance's own pattern above (assignment lookup
// -> matching window -> booking join), scoped by groupId instead of branchId, and using the
// four-state derivation instead of that function's live "now vs cutoff" states -- this view
// answers "what happened on this date", not "what can still happen today".
async function computeGroupRoster(group: any, date: string | undefined, now: Date): Promise<GroupRosterRow[]> {
  const pool = await prisma.resourcePool.findUnique({ where: { id: group.resourcePoolId }, select: { branchId: true } });
  const timeZone = await getBranchTimeZone(pool!.branchId);
  const dateString = date || todayDateString(now, timeZone);

  let weekday: string;
  try {
    weekday = branchIsoWeekday(branchLocalToUtc(dateString, '12:00', timeZone), timeZone);
  } catch (err: any) {
    const e = new Error(`Invalid date "${dateString}": ${err.message}`);
    (e as any).statusCode = 400;
    (e as any).code = 'INVALID_DATE';
    throw e;
  }

  const assignments = await prisma.memberGroupAssignment.findMany({
    where: { groupId: group.id, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });
  if (assignments.length === 0) return [];

  const userIds = Array.from(new Set(assignments.map((assignment: any) => assignment.userId)));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true } });
  const phoneById = new Map(users.map((user: any) => [user.id, user.phone || 'Phone not available']));

  // Every ACTIVE member of a group shares the group's own schedule (POST /member-group-assignments
  // derives resourcePoolId/daysOfWeek/startTime from the group when groupId is given) -- so there
  // is exactly one matching window for the whole roster, not one per member.
  const days = group.daysOfWeek.split(',').map((d: string) => d.trim());
  let matchingWindow: any = null;
  if (days.includes(weekday)) {
    try {
      const expectedStart = branchLocalToUtc(dateString, group.startTime, timeZone);
      matchingWindow = await prisma.availabilityWindow.findFirst({
        where: { resourcePoolId: group.resourcePoolId, startTime: expectedStart },
      });
    } catch {
      matchingWindow = null;
    }
  }

  const bookings = matchingWindow
    ? await prisma.booking.findMany({
        where: { userId: { in: userIds }, windowId: matchingWindow.id, isMemberBooking: true, status: { not: BookingStatus.CANCELLED } },
        select: { userId: true, status: true, memberAttendanceConfirmedAt: true, memberAttendanceDeclinedAt: true },
      })
    : [];
  const bookingByUser = new Map(bookings.map((booking: any) => [booking.userId, booking]));

  return assignments.map((assignment: any) => ({
    userId: assignment.userId,
    memberPhone: phoneById.get(assignment.userId) || 'Phone not available',
    assignmentId: assignment.id,
    state: deriveDayState(bookingByUser.get(assignment.userId)),
    confirmedAt: bookingByUser.get(assignment.userId)?.memberAttendanceConfirmedAt?.toISOString() ?? null,
    declinedAt: bookingByUser.get(assignment.userId)?.memberAttendanceDeclinedAt?.toISOString() ?? null,
  }));
}

// GET /groups/:id/roster — every ACTIVE member of a batch, each with their status on a given
// date (defaults to today, branch-local). Auth mirrors POST /groups (requirePoolScope resolved
// from the group's own resourcePoolId) -- the same scoping pattern as every other group/pool
// admin route in this file, not a new one. A group with zero ACTIVE members returns [], the
// real empty state (a member with an assignment whose groupId is still null never appears in
// ANY group's roster -- a known, real gap this slice does not build a cross-group view for).
server.get('/groups/:id/roster', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: false }); // F-206
  const { id } = request.params as any;
  const { date } = request.query as any;

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) {
    reply.status(404);
    const err = new Error('Group not found');
    (err as any).statusCode = 404;
    (err as any).code = 'GROUP_NOT_FOUND';
    throw err;
  }
  await requirePoolScope(auth, group.resourcePoolId, reply);

  return computeGroupRoster(group, date, new Date());
});

// GET /groups/:id/release-eligibility?date= — F-276. Real-time "has every member in this batch
// failed to confirm past cutoff" answer for a given date (default today), reusing
// computeGroupReleaseEligibility (see its own comment for the CONFIRMED/PAST_CUTOFF/etc. logic).
// Two real callers: GuestOccupancyDashboard's own preview click (admin-JWT, F-207.3-shaped cheap
// read before routing into WalkInBookingFlow), and Payment's server-to-server re-verification at
// booking-write time (internal key) -- the SAME function backs both, so a stale client-side read
// can never be the thing that actually authorizes the write; the write path always re-asks this.
server.get('/groups/:id/release-eligibility', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: false }); // F-206
  const { id } = request.params as any;
  const { date } = request.query as any;

  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) {
    reply.status(404);
    const err = new Error('Group not found');
    (err as any).statusCode = 404;
    (err as any).code = 'GROUP_NOT_FOUND';
    throw err;
  }
  await requirePoolScope(auth, group.resourcePoolId, reply);

  const result = await computeGroupReleaseEligibility(id, date, new Date());
  if (!result) {
    reply.status(404);
    const err = new Error('Group not found');
    (err as any).statusCode = 404;
    (err as any).code = 'GROUP_NOT_FOUND';
    throw err;
  }
  return {
    ...result,
    window: result.window ? { ...result.window, startTime: result.window.startTime.toISOString(), endTime: result.window.endTime.toISOString() } : null,
    cutoffTime: result.cutoffTime?.toISOString() ?? null,
  };
});

server.post('/member-group-assignments', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: true }); // F-206

  const {
    userId,
    resourcePoolId: bodyResourcePoolId,
    daysOfWeek: bodyDaysOfWeek,
    startTime: bodyStartTime,
    startDate: rawStartDate,
    termPreset = 'MONTHLY',
    groupId,
  } = request.body as any;

  // F-133 Slice C: real membership link, previously missing entirely -- nothing set groupId
  // anywhere, so no assignment could ever join a batch. When groupId is given, the group's own
  // schedule (resourcePoolId/daysOfWeek/startTime) is authoritative -- a batch has one schedule
  // by definition, so a member joining it inherits that schedule rather than independently
  // supplying one that could silently drift from the batch the roster/calendar attribute them to.
  let resourcePoolId = bodyResourcePoolId;
  let daysOfWeek = bodyDaysOfWeek;
  let startTime = bodyStartTime;
  // F-133 Slice D: the same reasoning extends to startDate -- a batch also has one real
  // cycle-start by definition. This was found incomplete in review: the block above already
  // derived the other three fields from the group, but startDate silently kept defaulting to
  // now() regardless of the target's own cycle, making the server not actually authoritative
  // for it (any caller other than the one admin-v2 flow this slice wired up -- a future admin
  // screen, an internal script -- would have silently created a live ACTIVE row for a batch
  // that hasn't started yet). groupStartDate is the later of "the group's own start" and "now":
  // a not-yet-live target's own future startDate is used as-is (queued correctly); an
  // already-live target's own (possibly long-past) startDate is clamped up to now (effective
  // immediately, not backdated to the batch's original cycle start).
  let groupStartDate: Date | undefined;
  if (groupId) {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      reply.status(404);
      const err = new Error('Group not found');
      (err as any).statusCode = 404;
      (err as any).code = 'GROUP_NOT_FOUND';
      throw err;
    }
    resourcePoolId = group.resourcePoolId;
    daysOfWeek = group.daysOfWeek;
    startTime = group.startTime;
    const now = new Date();
    groupStartDate = group.startDate > now ? group.startDate : now;
  }

  if (!userId || !resourcePoolId || !daysOfWeek || !startTime) {
    reply.status(400);
    const err = new Error('userId, resourcePoolId, daysOfWeek, and startTime are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  if (!Object.prototype.hasOwnProperty.call(TERM_PRESET_MONTHS, termPreset)) {
    reply.status(400);
    const err = new Error('termPreset must be MONTHLY, QUARTERLY, or YEARLY');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TERM_PRESET';
    throw err;
  }

  const startDate = rawStartDate !== undefined ? new Date(rawStartDate) : (groupStartDate ?? new Date());
  if (Number.isNaN(startDate.getTime())) {
    reply.status(400);
    const err = new Error('startDate must be a valid datetime');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_START_DATE';
    throw err;
  }
  const endDate = addMonthsUtc(startDate, TERM_PRESET_MONTHS[termPreset]);

  const pool = await requirePoolScope(auth, resourcePoolId, reply);

  // F-169: reject a schedule that no generated window could ever match, instead of
  // persisting an assignment that is silently inert.
  await validateAssignmentSchedule(resourcePoolId, daysOfWeek, startTime);

  try {
    const assignment = await prisma.memberGroupAssignment.create({
      data: { userId, resourcePoolId, daysOfWeek, startTime, groupId: groupId ?? null, status: 'ACTIVE', startDate, endDate },
    });
    // F-207.2: one-time relocate/cancel sweep for guest bookings that already existed on this
    // exact day/time before this assignment did. Never rolls back the assignment on failure --
    // see runMemberCollisionSweep's own comment. This outer try/catch is a further guard: the
    // assignment has already been created successfully by this point, so a bug in the sweep's
    // own control flow (outside any single booking's try/catch inside it) must never surface as
    // a 500 that makes the caller think assignment creation itself failed.
    let collisionSweep: any = { scanned: 0, relocated: 0, cancelled: 0, failed: [] };
    try {
      collisionSweep = await runMemberCollisionSweep(assignment, pool, request.log);
    } catch (sweepErr: any) {
      request.log.warn(
        { assignmentId: assignment.id, error: sweepErr?.message ?? String(sweepErr) },
        '[F-207.2 sweep] the sweep itself failed outside any single booking\'s handling -- assignment was still created',
      );
      collisionSweep = { scanned: 0, relocated: 0, cancelled: 0, failed: [{ bookingId: '(sweep-level failure)', error: sweepErr?.message ?? String(sweepErr) }] };
    }
    reply.status(201);
    return { ...assignment, collisionSweep };
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // WHY: F-133 dropped the partial "one ACTIVE assignment per member" index -- P2002 here
      // can now only come from @@unique([userId, resourcePoolId]), i.e. a same-pool double
      // assignment. A member may hold concurrent ACTIVE assignments across different pools.
      reply.status(409);
      const e = new Error('Member already has an active slot assignment');
      (e as any).statusCode = 409;
      (e as any).code = 'ASSIGNMENT_ALREADY_EXISTS';
      throw e;
    }
    throw err;
  }
});

// List assignments (internal only — admin tooling).
server.get('/member-group-assignments', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: false }); // F-206
  const { resourcePoolId, userId } = request.query as any;
  let scopedPoolIds: string[] | undefined;

  // WHY: Branch managers are scoped to branch-specific role claims. Listing without
  // filtering would leak assignments from other branches in the same tenant.
  if (!auth.isInternal && !auth.roles.includes('owner')) {
    const branchIds = auth.roles
      .filter((role) => role.startsWith('branch_manager:'))
      .map((role) => role.split(':')[1])
      .filter(Boolean);
    if (branchIds.length === 0) {
      reply.status(403);
      const err = new Error('Forbidden: Branch scope required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const pools = await prisma.resourcePool.findMany({
      where: {
        branchId: { in: branchIds },
        ...(resourcePoolId ? { id: resourcePoolId } : {}),
      },
      select: { id: true },
    });
    scopedPoolIds = pools.map((pool: any) => pool.id);
    if (resourcePoolId && scopedPoolIds.length === 0) {
      reply.status(403);
      const err = new Error('Forbidden: Not authorized for this resource pool');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
  }

  const assignments = await prisma.memberGroupAssignment.findMany({
    where: {
      ...(scopedPoolIds ? { resourcePoolId: { in: scopedPoolIds } } : resourcePoolId ? { resourcePoolId } : {}),
      ...(userId ? { userId } : {}),
    },
    include: { resourcePool: true },
    orderBy: { createdAt: 'desc' },
  });

  const userIds = [...new Set(assignments.map((assignment: any) => assignment.userId))];
  const tenantIds = [...new Set(assignments.map((assignment: any) => assignment.resourcePool.tenantId))];
  const users = userIds.length
    ? await prisma.user.findMany({
      where: {
        id: { in: userIds },
        tenantId: { in: tenantIds },
      },
      select: { id: true, tenantId: true, phone: true, userType: true },
    })
    : [];
  const usersByTenantAndId = new Map(users.map((user: any) => [`${user.tenantId}:${user.id}`, user]));

  return assignments.map((assignment: any) => ({
    ...assignment,
    member: usersByTenantAndId.get(`${assignment.resourcePool.tenantId}:${assignment.userId}`) || null,
  }));
});

// Update assignment status (ACTIVE ↔ SUSPENDED). Internal or owner/branch_manager (requirePoolScope).
// F-133 Slice D: the real fix, deferred through Slices A-C -- transitioning to SUSPENDED now also
// sets endDate to the real suspension moment (now()), never left at the original month-end.
// Server-computed only, not client-suppliable: a "Remove" action's whole point is recording WHEN
// a member actually left, which only the server's own clock can honestly answer. This is also
// half of "Relocate" (Slice D §7) -- relocating into an already-live target batch is exactly
// "suspend the old assignment right now" + a normal POST /member-group-assignments for the new
// one; no new endpoint, the admin-v2 UI composes these two existing calls. Slice C's calendar/
// roster derived join (by userId, date within [startDate, endDate]) now attributes correctly
// across a relocation because endDate is finally real -- unchanged code, corrected input.
server.patch('/member-group-assignments/:id', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: true }); // F-206

  const { id } = request.params as any;
  const { status } = request.body as any;

  if (!status || !['ACTIVE', 'SUSPENDED'].includes(status)) {
    reply.status(400);
    const err = new Error('status must be ACTIVE or SUSPENDED');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const existing = await prisma.memberGroupAssignment.findUnique({ where: { id } });
  if (!existing) {
    reply.status(404);
    throw new Error('Assignment not found');
  }
  await requirePoolScope(auth, existing.resourcePoolId, reply);

  try {
    return await prisma.memberGroupAssignment.update({
      where: { id },
      data: status === 'SUSPENDED' ? { status, endDate: new Date() } : { status },
    });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      reply.status(409);
      const e = new Error('Member already has an active slot assignment');
      (e as any).statusCode = 409;
      (e as any).code = 'ASSIGNMENT_ALREADY_EXISTS';
      throw e;
    }
    throw err;
  }
});

// F-207.1: extends an assignment's endDate by termPreset's duration from its CURRENT endDate
// (not from now()). termPreset is required -- unlike CREATE it has no persisted prior value to
// default from, since termPreset itself is never stored. Auth deliberately mirrors this table's
// own siblings above (getInternalOrAdminAuth + requirePoolScope, no requireOwnerOrInternal) --
// member-group-assignments is a branch_manager-permitted route family, unlike availability-
// patterns, so this renewal does not gain an owner-only guard just because the pattern renewal
// above has one.
//
// F-133 Slice E: this route is shared by batch and non-batch assignments -- branches on
// existing.groupId rather than replacing the non-batch path. A batch assignment (groupId set)
// is always monthly by definition (no admin choice of cadence, per the original design), so a
// termPreset in the body is rejected rather than silently ignored -- an admin who thinks they
// can pick QUARTERLY for a batch should be told no, not have it silently do something else.
// endDate = endOfNextCalendarMonthUtc(existing.endDate), fed DIRECTLY with no "day-before"
// anchor adjustment (unlike POST /groups's own use of that helper for creation): the helper
// only ever reads the input's year+month, and existing.endDate is already the real last instant
// of ITS OWN current month (Slice A's creation logic, Slice D's suspend-correctness), so asking
// "end of the month after THIS instant's month" directly gives "end of next month" with no
// adjustment needed -- verified by hand across a 30->31-day rollover and a year rollover before
// shipping (see the regression suite), same rigor as Slice A's own helper verification.
// A non-batch assignment (groupId null) is completely unchanged below -- termPreset required,
// addMonthsUtc as before F-133 -- this is F-207.1's real, currently-passing regression path.
server.post('/member-group-assignments/:id/renew', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  await requireModuleEntitlement(auth, TenantModule.MEMBER_MANAGEMENT, reply, { write: true }); // F-206

  const { id } = request.params as any;
  const { termPreset } = request.body as any;

  const existing = await prisma.memberGroupAssignment.findUnique({ where: { id } });
  if (!existing) {
    reply.status(404);
    const err = new Error('Assignment not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  await requirePoolScope(auth, existing.resourcePoolId, reply);

  if (existing.groupId) {
    if (termPreset !== undefined) {
      reply.status(400);
      const err = new Error('termPreset is not accepted for a batch assignment -- batches renew monthly by definition');
      (err as any).statusCode = 400;
      (err as any).code = 'TERM_PRESET_NOT_APPLICABLE';
      throw err;
    }
    return prisma.memberGroupAssignment.update({
      where: { id },
      data: { endDate: endOfNextCalendarMonthUtc(existing.endDate) },
    });
  }

  if (!termPreset || !Object.prototype.hasOwnProperty.call(TERM_PRESET_MONTHS, termPreset)) {
    reply.status(400);
    const err = new Error('termPreset is required and must be MONTHLY, QUARTERLY, or YEARLY');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TERM_PRESET';
    throw err;
  }

  return prisma.memberGroupAssignment.update({
    where: { id },
    data: { endDate: addMonthsUtc(existing.endDate, TERM_PRESET_MONTHS[termPreset]) },
  });
});

// F-133 Slice E: real batches with at least one ACTIVE member assignment expiring THIS UTC
// calendar month, grouped by branch. Shared by the sweep's own renewal-reminder dispatch below
// and the admin-facing GET /groups/expiring-renewals listing route -- one real query shape, not
// duplicated logic between "notify about this" and "let an admin browse this".
//
// UTC month, deliberately not branch-local: a batch's startDate/endDate are themselves UTC-
// calendar-based (Slice A's own endOfNextCalendarMonthUtc design -- "there's no branch-local
// time of day to preserve" for a term boundary), so "is this assignment expiring this month"
// compares against the same UTC calendar its own endDate was computed on. Branch-local time
// zone still matters separately for WHEN an admin gets pinged (the 20th check in the sweep step
// below uses branch-local date), just not for what counts as "this month" here.
type ExpiringBatch = { groupId: string; groupName: string; resourcePoolId: string; assignmentIds: string[] };
type ExpiringBranch = { branchId: string; tenantId: string; batches: ExpiringBatch[] };

// tenantId is optional and deliberately so: the sweep's own call (system job, dispatches
// reminders branch-by-branch across every tenant) passes none, same system-wide scope as
// low_occupancy_alert's own sweep step. GET /groups/expiring-renewals passes auth.tenantId for
// an owner caller -- without it, an owner sees every OTHER tenant's expiring batches too, a real
// cross-tenant leak caught live in this slice's own dev-stack verification (a JBC owner session
// was served a courtowner1 batch). internal callers keep seeing everything, matching GET
// /groups's own internal path.
async function computeExpiringBatchesByBranch(now: Date, tenantId?: string): Promise<ExpiringBranch[]> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const assignments = await prisma.memberGroupAssignment.findMany({
    where: {
      status: 'ACTIVE',
      groupId: { not: null },
      endDate: { gte: monthStart, lt: monthEnd },
      ...(tenantId ? { resourcePool: { tenantId } } : {}),
    },
    include: { group: true, resourcePool: { select: { branchId: true, tenantId: true } } },
  });

  const byBranch = new Map<string, ExpiringBranch>();
  const batchByBranchAndGroup = new Map<string, ExpiringBatch>();

  for (const assignment of assignments) {
    if (!assignment.group) continue; // groupId set but the row is gone -- defensive, should not happen
    const branchId = assignment.resourcePool.branchId;
    const tenantId = assignment.resourcePool.tenantId;
    let branch = byBranch.get(branchId);
    if (!branch) {
      branch = { branchId, tenantId, batches: [] };
      byBranch.set(branchId, branch);
    }
    const batchKey = `${branchId}:${assignment.group.id}`;
    let batch = batchByBranchAndGroup.get(batchKey);
    if (!batch) {
      batch = { groupId: assignment.group.id, groupName: assignment.group.name, resourcePoolId: assignment.resourcePoolId, assignmentIds: [] };
      batchByBranchAndGroup.set(batchKey, batch);
      branch.batches.push(batch);
    }
    batch.assignmentIds.push(assignment.id);
  }

  return Array.from(byBranch.values());
}

// ---------------------------------------------------------------------------
// Sweep — lazy member booking generation + low-occupancy alert
// ---------------------------------------------------------------------------

// TEST & OPS ONLY: Sweep route to manually trigger background cleanup sweeps.
// WHY: In production this runs as a cron/background job. Exposed as an endpoint for
// deterministic automated and manual testing.
// AUTH: internal service key only (F-053). This endpoint releases real reservations,
// so it must never be callable anonymously — Caddy routes /api/slot-engine/* publicly.
// requireInternalKey (not getInternalOrAdminAuth) is deliberate: no admin UI triggers a
// sweep, so the tighter guard costs nothing today. An ops-facing trigger would need the
// admin path instead.
server.post('/bookings/sweep', async (request, reply) => {
  requireInternalKey(request, reply);
  const now = new Date();

  // 1. Expire stale HELD bookings past their 5-minute hold TTL.
  const expiredHolds = await prisma.booking.updateMany({
    where: { status: BookingStatus.HELD, heldUntil: { lt: now } },
    data: { status: BookingStatus.RELEASED_NO_SHOW },
  });

  // F-065: the former step 2 — a scan for member bookings CONFIRMED with attendance still
  // null, released at gracePeriodMinutes — was UNREACHABLE and has been removed.
  // ensureTodayMemberBooking is the only producer of isMemberBooking: true (every other
  // write sets it false explicitly). F-133 Slice B added a third call site (member decline,
  // POST /member/today-assignment/decline) alongside the original two -- member confirm, which
  // always sets memberAttendanceConfirmedAt, and the sweep below, which always writes
  // RELEASED_NO_SHOW with no attendanceDeclinedAt (decline is the only caller that sets it).
  // Member bookings are never created HELD, so the HELD -> CONFIRMED route cannot reach them
  // either. No row could satisfy all three original conditions.
  // Member release is now step 2 below, driven by the SAME gracePeriodMinutes the member
  // is shown and confirm enforces — which is the whole point of F-065.

  // 2. Member release, and 3. the low-occupancy alert — two INDEPENDENT triggers.
  // WHY: For each active assignment matching today's weekday, ensure a booking exists
  // for today's matching window. Creates RELEASED_NO_SHOW if past guestAccessCutoffMinutes
  // so the slot can be opened to guests if occupancy is low.
  const activeAssignments = await prisma.memberGroupAssignment.findMany({
    where: { status: 'ACTIVE' },
    include: {
      resourcePool: { include: { bookingRules: { orderBy: { createdAt: 'asc' } } } },
    },
  });

  let lazyGeneratedCount = 0;
  let releasedMembersCount = 0;
  const alertsDispatched: string[] = [];

  // F-066: one weekday cannot be correct for branches in different timezones, so the
  // weekday and date are derived PER ASSIGNMENT from its own branch's clock. They were
  // previously hoisted out of this loop, computed once from the server's local weekday and
  // the UTC date — two clocks that disagree for part of every day.
  const branchTimeZones = await getBranchTimeZones(
    activeAssignments.map((a: any) => a.resourcePool.branchId),
  );

  for (const assignment of activeAssignments) {
    const timeZone = branchTimeZones.get(assignment.resourcePool.branchId) ?? DEFAULT_TIME_ZONE;
    // ISO weekday: 1=Mon … 7=Sun (same convention as the daysOfWeek field)
    const todayIsoWeekday = isoWeekday(now, timeZone);

    const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
    if (!days.includes(todayIsoWeekday)) continue;

    // Find today's availability window for this pool starting at assignment.startTime,
    // which the schema documents as branch local time.
    // F-066: `startTime` is stored as a free-form String with no format constraint, so a
    // malformed value would throw here. One bad assignment row must not abort the sweep
    // for every other branch, which is what an unguarded throw in this loop would do.
    const todayDateStr = todayDateString(now, timeZone);
    let windowStart: Date;
    try {
      windowStart = branchLocalToUtc(todayDateStr, assignment.startTime, timeZone);
    } catch (err: any) {
      console.warn(
        `[sweep] skipping assignment ${assignment.id}: unusable startTime ` +
          `${JSON.stringify(assignment.startTime)} — ${err.message}`,
      );
      continue;
    }
    // F-170: exact match, no tolerance — see the note on the admin attendance path.
    const matchingWindow = await prisma.availabilityWindow.findFirst({
      where: {
        resourcePoolId: assignment.resourcePoolId,
        startTime: windowStart,
      },
    });
    if (!matchingWindow) {
      // F-170: previously a silent `continue`. The unparseable-startTime case above
      // already warns; a parseable time that simply finds no window was invisible, so the
      // three consumers reported inconsistently. Both now say why nothing happened.
      console.warn(
        `[sweep] skipping assignment ${assignment.id}: no window for pool ` +
          `${assignment.resourcePoolId} at ${assignment.startTime} on ${todayDateStr}`,
      );
      continue;
    }

    // Check if a booking already exists for this member + window (any non-cancelled status).
    const existingBooking = await prisma.booking.findFirst({
      where: {
        userId: assignment.userId,
        windowId: matchingWindow.id,
        status: { not: BookingStatus.CANCELLED },
      },
    });
    const rule = assignment.resourcePool.bookingRules[0];
    const graceMinutesForCutoff = rule?.gracePeriodMinutes ?? 30;
    const cutoffTime = new Date(matchingWindow.startTime.getTime() - graceMinutesForCutoff * 60 * 1000);

    // 2. ATTENDANCE REMINDERS — F-133 Slice B: T-2h and T-1h15m before the cutoff, reusing
    // slot_release_reminder (services/notification/src/index.ts, already dual-channel push+SMS,
    // already regression-covered, never dispatched until now). Only fires while no action has
    // been taken yet (!existingBooking) -- a member who already confirmed or declined doesn't
    // need reminding. Same insert-first dedup pattern as the low-occupancy alert below (step 4),
    // against the same @@unique([jobName, dedupKey]) on ScheduledJobDispatch -- but keyed per
    // assignment+window+offset (`${assignmentId}:${windowId}:2h`/`:75m`), not per pool, since
    // this targets one member, not the whole pool.
    if (!existingBooking) {
      const reminderOffsets: { label: '2h' | '75m'; minutesBefore: number }[] = [
        { label: '2h', minutesBefore: 120 },
        { label: '75m', minutesBefore: 75 },
      ];
      for (const { label, minutesBefore } of reminderOffsets) {
        const reminderTime = new Date(cutoffTime.getTime() - minutesBefore * 60 * 1000);
        if (now < reminderTime || now >= cutoffTime) continue;

        try {
          await prisma.scheduledJobDispatch.create({
            data: {
              jobName: 'slot_release_reminder',
              tenantId: assignment.resourcePool.tenantId,
              subjectId: assignment.userId,
              dedupKey: `${assignment.id}:${matchingWindow.id}:${label}`,
              status: 'SENT',
              occurrenceAt: matchingWindow.startTime,
              dispatchedAt: new Date(),
            },
          });
        } catch (err: any) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            continue; // already reminded for this assignment + window + offset
          }
          throw err;
        }
        try {
          await fetch(`${notificationUrl}/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalKey}` },
            body: JSON.stringify({
              tenantId: assignment.resourcePool.tenantId,
              recipient: assignment.userId,
              event_type: 'slot_release_reminder',
              variables: {
                poolName: assignment.resourcePool.name,
                cutoffTime: cutoffTime.toISOString(),
                windowStart: matchingWindow.startTime.toISOString(),
              },
            }),
          });
        } catch (e) {
          // Non-blocking, same posture as low_occupancy_alert below.
        }
      }
    }

    // 3. MEMBER RELEASE — gracePeriodMinutes.
    // F-065: this is the exact value the member is shown (their own today-assignment view) and
    // that confirm enforces. It previously read guestAccessCutoffMinutes, so a member was
    // locked out 90 minutes before the deadline still on their screen, and confirm then
    // rejected them with CONFIRMATION_CUTOFF_PASSED. The moment a member can no longer
    // confirm is the moment the slot is abandoned — one deadline, not two.
    //
    // No timezone conversion here, deliberately: startTime is an absolute instant and
    // subtracting minutes from it is timezone-invariant. F-066 Stage 1 fixed WHICH window
    // is selected, which is the lookup above; routing this subtraction through branchTime
    // would add a conversion where none belongs.
    if (!existingBooking) {
      const graceMinutes = rule?.gracePeriodMinutes ?? 30;
      const releaseTime = new Date(matchingWindow.startTime.getTime() - graceMinutes * 60 * 1000);
      if (now >= releaseTime) {
        // Create through the same atomic helper used by member self-confirm.
        // WHY: Sweep and confirm are competing triggers for one logical daily member
        // booking, so the lock/double-check/create path must not drift between callers.
        try {
          const ensured = await ensureTodayMemberBooking({
            assignment,
            matchingWindow,
            now,
            timeZone,
            status: BookingStatus.RELEASED_NO_SHOW,
            attendanceConfirmedAt: null,
          });
          if (ensured.created) {
            // One event, two honest readings: a booking row was created, and a member lost
            // their slot. This is now the sole member-release path.
            lazyGeneratedCount++;
            releasedMembersCount++;
          }
        } catch (err: any) {
          // P2002 = concurrent sweep already created this booking — safe to skip.
          // F-207.2: MEMBER_SLOT_AT_CAPACITY = ensureTodayMemberBooking's defensive guard fired
          // for this one assignment. Rethrowing here would abort the ENTIRE sweep mid-loop,
          // silently skipping held-booking expiry and low-occupancy alerts for every other pool
          // still queued behind it -- log and continue, matching the "no window" skip above.
          const isDuplicateRace = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
          const isCapacityGuard = err?.code === 'MEMBER_SLOT_AT_CAPACITY';
          if (isCapacityGuard) {
            console.warn(`[sweep] skipping assignment ${assignment.id}: window already at capacity (MEMBER_SLOT_AT_CAPACITY)`);
          } else if (!isDuplicateRace) {
            throw err;
          }
        }
      }
    }

    // 4. LOW-OCCUPANCY ALERT — guestAccessCutoffMinutes, unchanged.
    // F-065: this is why guestAccessCutoffMinutes is NOT vestigial. It governs how much
    // lead time an admin gets to sell a freed slot to guests, which is a different question
    // from when a member loses their seat. Collapsing the two onto gracePeriodMinutes would
    // have moved this to T-30 — too late to act on — while looking like a simplification.
    //
    // The `existingBooking` precondition is preserved EXACTLY as it was, using the value
    // read before the release above. It means a pool where every member already has a
    // booking never gets an occupancy check at all, which is a real defect — tracked as
    // F-089 rather than silently widened here.
    if (existingBooking) continue;
    const alertMinutes = rule?.guestAccessCutoffMinutes ?? 120;
    const alertTime = new Date(matchingWindow.startTime.getTime() - alertMinutes * 60 * 1000);
    if (now < alertTime) continue;

    const thresholdPct = rule?.lowOccupancyThresholdPct ?? 50;
    const totalCapacity = assignment.resourcePool.capacity;
    if (totalCapacity > 0) {
      const confirmedSeats = await prisma.booking.count({
        where: {
          windowId: matchingWindow.id,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
        },
      });
      const occupancyPercentage = Math.round((confirmedSeats / totalCapacity) * 100);

      if (occupancyPercentage < thresholdPct) {
        const poolId = assignment.resourcePoolId;
        if (!alertsDispatched.includes(poolId)) {
          // F-065: dedupe ACROSS sweep runs, not just within one.
          // Previously the alert fired once by accident: the same iteration that passed the
          // cutoff also created the booking, so every later run hit `if (existingBooking)`
          // first. Decoupling release to gracePeriodMinutes removes that, leaving a 90-minute
          // span with no booking — so an unguarded alert would fire on EVERY run, which is
          // about 90 duplicate admin alerts per session once F-044 Phase B schedules this
          // every 60 seconds. That is the very feature F-065 unblocks, so it is solved here.
          //
          // Insert-first against the existing @@unique([jobName, dedupKey]) on
          // ScheduledJobDispatch — the same atomic-gate pattern as payment's webhook
          // idempotency. Insert-first rather than record-after-send because only the insert
          // is atomic: two concurrent sweeps would both pass a read-then-send check. The
          // trade-off is that a failed send is not retried, which matches the existing
          // non-blocking behaviour below, where a fetch failure is already swallowed.
          // Written with Prisma directly rather than through the ScheduledJobStore port,
          // per F-057.
          try {
            await prisma.scheduledJobDispatch.create({
              data: {
                jobName: 'low_occupancy_alert',
                tenantId: assignment.resourcePool.tenantId,
                subjectId: poolId,
                dedupKey: `${poolId}:${matchingWindow.id}`,
                status: 'SENT',
                occurrenceAt: matchingWindow.startTime,
                dispatchedAt: new Date(),
              },
            });
          } catch (err: any) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              continue; // already alerted for this pool + window
            }
            throw err;
          }
          alertsDispatched.push(poolId);
          try {
            await fetch(`${notificationUrl}/notifications/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalKey}`,
              },
              body: JSON.stringify({
                tenantId: assignment.resourcePool.tenantId,
                // WHY: low_occupancy_alert targets the tenant admin, not the member.
                // Using tenantId as recipient — Notification service resolves to admin contact.
                recipient: assignment.resourcePool.tenantId,
                event_type: 'low_occupancy_alert',
                variables: {
                  poolId,
                  poolName: assignment.resourcePool.name,
                  confirmedSeats,
                  totalCapacity,
                  occupancyPercentage,
                  thresholdPct,
                },
              }),
            });
          } catch (e) {
            // Non-blocking — sweep continues even if notification fails.
          }
        }
      }
    }
  }

  // 5. BATCH RENEWAL REMINDER — F-133 Slice E, admin-facing, once per branch per month.
  // WHY reusing THIS sweep rather than a new trigger mechanism: /bookings/sweep's real
  // production invocation frequency isn't directly inspectable from this repo (its own comment
  // says "runs as a cron/background job" with the actual config external to the repo, and the
  // in-repo job-scheduler package is not wired into slot-engine's runtime at all -- confirmed by
  // grep, zero references). But F-133 Slice B's own T-2h/T-1h15m reminders already depend on
  // sweep firing frequently enough to catch a 2-hour-wide window, and that shipped and was
  // signed off -- real, already-accepted evidence sweep's true cadence is frequent in practice,
  // which comfortably covers a once-a-day (the 20th) check too. Reusing the proven mechanism
  // per rule 3, not inventing a new one on a guess.
  //
  // Branch-local "is it the 20th": admin-facing, so it's evaluated on the branch's own clock,
  // same as every other branch-local check in this file -- unlike computeExpiringBatchesByBranch
  // itself, which compares a batch's endDate against the UTC calendar month its own endDate was
  // computed on (see that function's own comment for why those two are deliberately different).
  //
  // Dedup key ${branchId}:${YYYY-MM} (branch-local month) -- once per branch per month, not per
  // sweep invocation, not combined across a multi-branch owner's branches. Real precedent:
  // low_occupancy_alert dispatches per-pool, never combined across a tenant's pools, so one
  // admin alert per real trigger unit (here, per branch) matches this project's own established
  // pattern rather than inventing tenant-wide digesting.
  const expiringByBranch = await computeExpiringBatchesByBranch(now);
  const renewalRemindersDispatched: string[] = [];
  if (expiringByBranch.length > 0) {
    const renewalBranchTimeZones = await getBranchTimeZones(expiringByBranch.map((b) => b.branchId));
    for (const branch of expiringByBranch) {
      const timeZone = renewalBranchTimeZones.get(branch.branchId) ?? DEFAULT_TIME_ZONE;
      const branchToday = branchDateString(now, timeZone); // 'YYYY-MM-DD'
      if (!isRenewalReminderDay(branchToday)) continue;
      const branchMonth = branchToday.slice(0, 7); // 'YYYY-MM'

      try {
        await prisma.scheduledJobDispatch.create({
          data: {
            jobName: 'batch_renewal_reminder',
            tenantId: branch.tenantId,
            subjectId: branch.branchId,
            dedupKey: `${branch.branchId}:${branchMonth}`,
            status: 'SENT',
            occurrenceAt: now,
            dispatchedAt: new Date(),
          },
        });
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          continue; // already reminded for this branch this month
        }
        throw err;
      }
      renewalRemindersDispatched.push(branch.branchId);
      try {
        await fetch(`${notificationUrl}/notifications/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalKey}` },
          body: JSON.stringify({
            tenantId: branch.tenantId,
            // WHY: batch_renewal_reminder targets the tenant admin, not a member -- same
            // recipient-resolution convention as low_occupancy_alert above.
            recipient: branch.tenantId,
            event_type: 'batch_renewal_reminder',
            variables: {
              branchId: branch.branchId,
              batchNames: branch.batches.map((b) => b.groupName),
              batchCount: branch.batches.length,
            },
          }),
        });
      } catch (e) {
        // Non-blocking, same posture as low_occupancy_alert above.
      }
    }
  }

  return {
    expiredHoldsCount: expiredHolds.count,
    releasedMembersCount,
    lazyGeneratedCount,
    lowOccupancyAlertsDispatched: alertsDispatched.length,
    renewalRemindersDispatched: renewalRemindersDispatched.length,
  };
});

// ---------------------------------------------------------------------------
// F-044 Phase 2 — job-scheduler-backed decomposition of the sweep above.
//
// /bookings/sweep (above) is untouched and keeps running exactly as-is throughout this build and
// the parallel-run cutover window -- these are new, additive jobs, not a rewrite of it. Three
// JobDefinitions, not five: HELD-expiry is fully independent, but the attendance-reminder/member-
// release/low-occupancy-alert steps above all iterate the SAME activeAssignments list and resolve
// the SAME per-assignment window/rule data -- splitting them into three separate jobs would triple
// that DB work for zero real scheduling benefit, since all three genuinely want the same cadence.
// The batch-renewal reminder is fully independent and wants a much coarser interval (it fires at
// most once per branch per month).
//
// F-057 (docs/findings_register.md): "the ScheduledJobStore port must not be exposed as a domain-
// facing handler API -- handlers only ever interact through the intended boundary API [ctx.store]
// ... enforce this as an architectural constraint in Phase B and beyond." The three dispatch-dedup
// sites above write ScheduledJobDispatch via raw prisma.scheduledJobDispatch.create() + a manual
// P2002 catch specifically because job-scheduler wasn't wired into any runtime until now -- this is
// the real moment F-057 anticipated. Every dedup site below goes through ctx.store.claimDispatch/
// markDispatched/failDispatch instead. One genuine, disclosed behavior difference from the code
// above: the old sites inserted status: 'SENT' before even attempting the notification fetch (a
// failed send was never retried, silently). claimDispatch/markDispatched/failDispatch is a real
// two-phase claim-then-record flow -- a failed send now gets a real failDispatch instead of a false
// SENT, so it can be genuinely retried on a later tick. The core guarantee (never send twice for
// the same dedupKey) is unchanged; this is a real improvement the migration enables, not hidden.
// ---------------------------------------------------------------------------

class PrismaSqlExecutor implements SqlExecutor {
  constructor(private readonly client: PrismaClient) {}
  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.client.$queryRawUnsafe<T[]>(sql, ...params);
  }
  async execute(sql: string, params: unknown[] = []): Promise<number> {
    return this.client.$executeRawUnsafe(sql, ...params);
  }
}

const heldBookingExpiryJob: JobDefinition = {
  name: 'held_booking_expiry',
  schedule: { everySeconds: 60 },
  minimumViableWindowSeconds: 180,
  async handler(ctx) {
    // Step 1, verbatim from /bookings/sweep above.
    const expiredHolds = await prisma.booking.updateMany({
      where: { status: BookingStatus.HELD, heldUntil: { lt: ctx.now } },
      data: { status: BookingStatus.RELEASED_NO_SHOW },
    });
    return { processed: expiredHolds.count };
  },
};

const memberAssignmentSweepJob: JobDefinition = {
  name: 'member_assignment_sweep',
  schedule: { everySeconds: 60 },
  minimumViableWindowSeconds: 180,
  async handler(ctx) {
    const now = ctx.now;
    // Steps 2-4, verbatim shared per-assignment loop from /bookings/sweep above.
    const activeAssignments = await prisma.memberGroupAssignment.findMany({
      where: { status: 'ACTIVE' },
      include: {
        resourcePool: { include: { bookingRules: { orderBy: { createdAt: 'asc' } } } },
      },
    });

    let lazyGeneratedCount = 0;
    let releasedMembersCount = 0;
    let remindersDispatched = 0;
    let alertsDispatchedCount = 0;

    const branchTimeZones = await getBranchTimeZones(
      activeAssignments.map((a: any) => a.resourcePool.branchId),
    );

    for (const assignment of activeAssignments) {
      const timeZone = branchTimeZones.get(assignment.resourcePool.branchId) ?? DEFAULT_TIME_ZONE;
      const todayIsoWeekday = isoWeekday(now, timeZone);
      const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
      if (!days.includes(todayIsoWeekday)) continue;

      const todayDateStr = todayDateString(now, timeZone);
      let windowStart: Date;
      try {
        windowStart = branchLocalToUtc(todayDateStr, assignment.startTime, timeZone);
      } catch (err: any) {
        ctx.logger.warn('skipping assignment: unusable startTime', { assignmentId: assignment.id, startTime: assignment.startTime, error: err.message });
        continue;
      }
      const matchingWindow = await prisma.availabilityWindow.findFirst({
        where: { resourcePoolId: assignment.resourcePoolId, startTime: windowStart },
      });
      if (!matchingWindow) {
        ctx.logger.warn('skipping assignment: no window', { assignmentId: assignment.id, resourcePoolId: assignment.resourcePoolId, startTime: assignment.startTime, date: todayDateStr });
        continue;
      }

      const existingBooking = await prisma.booking.findFirst({
        where: { userId: assignment.userId, windowId: matchingWindow.id, status: { not: BookingStatus.CANCELLED } },
      });
      const rule = assignment.resourcePool.bookingRules[0];
      const graceMinutesForCutoff = rule?.gracePeriodMinutes ?? 30;
      const cutoffTime = new Date(matchingWindow.startTime.getTime() - graceMinutesForCutoff * 60 * 1000);

      // --- Attendance reminders (F-133 Slice B) ---
      if (!existingBooking) {
        const reminderOffsets: { label: '2h' | '75m'; minutesBefore: number }[] = [
          { label: '2h', minutesBefore: 120 },
          { label: '75m', minutesBefore: 75 },
        ];
        for (const { label, minutesBefore } of reminderOffsets) {
          const reminderTime = new Date(cutoffTime.getTime() - minutesBefore * 60 * 1000);
          if (now < reminderTime || now >= cutoffTime) continue;

          const dedupKey = `${assignment.id}:${matchingWindow.id}:${label}`;
          const claimed = await ctx.store.claimDispatch('slot_release_reminder', {
            dedupKey,
            tenantId: assignment.resourcePool.tenantId,
            subjectId: assignment.userId,
            occurrenceAt: matchingWindow.startTime,
          });
          if (!claimed) continue;
          try {
            await fetch(`${notificationUrl}/notifications/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalKey}` },
              body: JSON.stringify({
                tenantId: assignment.resourcePool.tenantId,
                recipient: assignment.userId,
                event_type: 'slot_release_reminder',
                variables: {
                  poolName: assignment.resourcePool.name,
                  cutoffTime: cutoffTime.toISOString(),
                  windowStart: matchingWindow.startTime.toISOString(),
                },
              }),
            });
            await ctx.store.markDispatched('slot_release_reminder', dedupKey);
            remindersDispatched++;
          } catch (e: any) {
            await ctx.store.failDispatch('slot_release_reminder', dedupKey, String(e?.message ?? e));
          }
        }
      }

      // --- Member release, unchanged (no dispatch dedup involved) ---
      if (!existingBooking) {
        const graceMinutes = rule?.gracePeriodMinutes ?? 30;
        const releaseTime = new Date(matchingWindow.startTime.getTime() - graceMinutes * 60 * 1000);
        if (now >= releaseTime) {
          try {
            const ensured = await ensureTodayMemberBooking({
              assignment,
              matchingWindow,
              now,
              timeZone,
              status: BookingStatus.RELEASED_NO_SHOW,
              attendanceConfirmedAt: null,
            });
            if (ensured.created) {
              lazyGeneratedCount++;
              releasedMembersCount++;
            }
          } catch (err: any) {
            const isDuplicateRace = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
            const isCapacityGuard = err?.code === 'MEMBER_SLOT_AT_CAPACITY';
            if (isCapacityGuard) {
              ctx.logger.warn('skipping assignment: window at capacity', { assignmentId: assignment.id });
            } else if (!isDuplicateRace) {
              throw err;
            }
          }
        }
      }

      // --- Low-occupancy alert ---
      if (existingBooking) continue;
      const alertMinutes = rule?.guestAccessCutoffMinutes ?? 120;
      const alertTime = new Date(matchingWindow.startTime.getTime() - alertMinutes * 60 * 1000);
      if (now < alertTime) continue;

      const thresholdPct = rule?.lowOccupancyThresholdPct ?? 50;
      const totalCapacity = assignment.resourcePool.capacity;
      if (totalCapacity > 0) {
        const confirmedSeats = await prisma.booking.count({
          where: { windowId: matchingWindow.id, status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] } },
        });
        const occupancyPercentage = Math.round((confirmedSeats / totalCapacity) * 100);

        if (occupancyPercentage < thresholdPct) {
          const poolId = assignment.resourcePoolId;
          const dedupKey = `${poolId}:${matchingWindow.id}`;
          const claimed = await ctx.store.claimDispatch('low_occupancy_alert', {
            dedupKey,
            tenantId: assignment.resourcePool.tenantId,
            subjectId: poolId,
            occurrenceAt: matchingWindow.startTime,
          });
          if (claimed) {
            try {
              await fetch(`${notificationUrl}/notifications/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalKey}` },
                body: JSON.stringify({
                  tenantId: assignment.resourcePool.tenantId,
                  recipient: assignment.resourcePool.tenantId,
                  event_type: 'low_occupancy_alert',
                  variables: { poolId, poolName: assignment.resourcePool.name, confirmedSeats, totalCapacity, occupancyPercentage, thresholdPct },
                }),
              });
              await ctx.store.markDispatched('low_occupancy_alert', dedupKey);
              alertsDispatchedCount++;
            } catch (e: any) {
              await ctx.store.failDispatch('low_occupancy_alert', dedupKey, String(e?.message ?? e));
            }
          }
        }
      }
    }

    return {
      processed: activeAssignments.length,
      skipped: activeAssignments.length - (releasedMembersCount + remindersDispatched + alertsDispatchedCount),
    };
  },
};

const batchRenewalReminderJob: JobDefinition = {
  name: 'batch_renewal_reminder',
  schedule: { everySeconds: 3600 },
  minimumViableWindowSeconds: 7200,
  async handler(ctx) {
    const now = ctx.now;
    // Step 5, verbatim from /bookings/sweep above.
    const expiringByBranch = await computeExpiringBatchesByBranch(now);
    let remindersDispatched = 0;
    if (expiringByBranch.length > 0) {
      const renewalBranchTimeZones = await getBranchTimeZones(expiringByBranch.map((b) => b.branchId));
      for (const branch of expiringByBranch) {
        const timeZone = renewalBranchTimeZones.get(branch.branchId) ?? DEFAULT_TIME_ZONE;
        const branchToday = branchDateString(now, timeZone);
        if (!isRenewalReminderDay(branchToday)) continue;
        const branchMonth = branchToday.slice(0, 7);
        const dedupKey = `${branch.branchId}:${branchMonth}`;

        const claimed = await ctx.store.claimDispatch('batch_renewal_reminder', {
          dedupKey,
          tenantId: branch.tenantId,
          subjectId: branch.branchId,
          occurrenceAt: now,
        });
        if (!claimed) continue;
        try {
          await fetch(`${notificationUrl}/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalKey}` },
            body: JSON.stringify({
              tenantId: branch.tenantId,
              recipient: branch.tenantId,
              event_type: 'batch_renewal_reminder',
              variables: { branchId: branch.branchId, batchNames: branch.batches.map((b) => b.groupName), batchCount: branch.batches.length },
            }),
          });
          await ctx.store.markDispatched('batch_renewal_reminder', dedupKey);
          remindersDispatched++;
        } catch (e: any) {
          await ctx.store.failDispatch('batch_renewal_reminder', dedupKey, String(e?.message ?? e));
        }
      }
    }
    return { processed: expiringByBranch.length, skipped: expiringByBranch.length - remindersDispatched };
  },
};

const jobScheduler = createScheduler({
  store: createSqlScheduledJobStore(new PrismaSqlExecutor(prisma)),
  jobs: [heldBookingExpiryJob, memberAssignmentSweepJob, batchRenewalReminderJob],
});

const SCHEDULED_JOB_SEEDS: { name: string; intervalSeconds: number }[] = [
  { name: 'held_booking_expiry', intervalSeconds: 60 },
  { name: 'member_assignment_sweep', intervalSeconds: 60 },
  { name: 'batch_renewal_reminder', intervalSeconds: 3600 },
];

// Idempotent -- safe to call on every startup. A missing row (first deploy, or one deleted by
// accident) is created with nextRunAt: now() so the very next tick picks it up immediately rather
// than waiting a full interval; an existing row is left untouched (never resets a real
// consecutiveFailures/circuitOpenedAt/nextRunAt in flight).
async function seedScheduledJobs() {
  for (const seed of SCHEDULED_JOB_SEEDS) {
    await prisma.scheduledJob.upsert({
      where: { name: seed.name },
      update: {},
      create: { name: seed.name, intervalSeconds: seed.intervalSeconds, nextRunAt: new Date() },
    });
  }
}

// POST /bookings/sweep/tick — F-044 Phase 2: the real job-scheduler-backed trigger. Calls
// runDueJobsOnce() exactly once per invocation -- GCP Cloud Scheduler (the same job Phase 1 already
// created) is the sole external heartbeat; job-scheduler's own internal setInterval loop (.start())
// is never used in production. Sibling to /bookings/sweep above, not a replacement -- both routes
// are safe to call throughout the parallel-run cutover window described in the F-044 Phase 2 plan.
server.post('/bookings/sweep/tick', async (request, reply) => {
  requireInternalKey(request, reply);
  const summaries = await jobScheduler.runDueJobsOnce(new Date());
  return { jobs: summaries };
});

// ---------------------------------------------------------------------------
// Internal lookup endpoints
// ---------------------------------------------------------------------------

server.post('/bookings/resolve-invites', async (request, reply) => {
  requireInternalKey(request, reply);

  const { phone, userId } = request.body as any;
  if (!phone || !userId) {
    reply.status(400);
    const err = new Error('phone and userId are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const updatedPlayers = await prisma.bookingPlayer.updateMany({
    where: { phone, userId: null },
    data: { userId },
  });
  return { resolvedCount: updatedPlayers.count };
});

// GET /bookings/admin (admin-only)
// WHY: Admin Web refund override needs a phone-first booking picker. This listing
// keeps raw booking UUIDs out of the primary UI while enforcing branch scope server-side.
server.get('/bookings/admin', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { userId, status } = request.query as any;

  if (!userId) {
    reply.status(400);
    const err = new Error('userId is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const bookings = await prisma.booking.findMany({
    where: {
      userId,
      // F-183: a child booking (an extra hour on a multi-window booking) has no price
      // and no PaymentIntent of its own — it isn't a real refund-override candidate, so
      // it never enters this picker in the first place. Act on the parent id instead.
      parentBookingId: null,
      ...(status ? { status: status as BookingStatus } : {}),
    },
    include: {
      window: {
        include: {
          resourcePool: true,
        },
      },
      players: true,
    },
    orderBy: { heldAt: 'desc' },
  });

  return bookings.filter((booking: any) => isAuthorizedForBranch(auth, booking.branchId));
});

// Retrieve a booking by ID (dual-path auth: internal key OR owner JWT or admin JWT with IDOR check).
server.get('/bookings/:id', async (request, reply) => {
  let isInternal = false;
  let decodedUser: any = null;

  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch (e) {
    try {
      decodedUser = await request.jwtVerify();
    } catch (jwtErr) {
      console.error('JWT VERIFY ERROR:', jwtErr);
      reply.status(401);
      throw new Error('Unauthorized');
    }
  }

  const { id } = request.params as any;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      window: {
        include: {
          resourcePool: true,
        }
      },
      players: true,
      // F-189: the real assigned court (F-205), for the guest confirmation screen's
      // "Court N" row. Nullable — a legacy pre-F-205 booking has no resource.
      resource: true,
      // F-187: guest-facing multi-window display (BookingConfirmation.tsx, BookingPay.tsx)
      // needs every additional hour's time range, not just the parent's own window.
      childBookings: {
        include: { window: true },
      },
    },
  });

  if (!booking) {
    reply.status(404);
    const err = new Error('Booking not found');
    (err as any).statusCode = 404;
    (err as any).code = 'BOOKING_NOT_FOUND';
    throw err;
  }

  // IDOR Guard (F-071): tenant-scoped, branch-aware, shared by all three booking routes.
  if (!isInternal && decodedUser) {
    requireBookingAccess(booking, decodedUser, reply);
  }

  return booking;
});

// GET /bookings/my (requires JWT)
// WHY: Allow logged-in guests or members to retrieve their own booking history.
server.get('/bookings/my', async (request, reply) => {
  let decodedUser: any = null;
  try {
    decodedUser = await request.jwtVerify();
  } catch (jwtErr) {
    reply.status(401);
    throw new Error('Unauthorized');
  }

  const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
  if (!userId) {
    reply.status(401);
    throw new Error('Unauthorized');
  }

  const bookings = await prisma.booking.findMany({
    where: {
      userId,
      // F-183: hide child rows (the extra hours on a multi-window booking) from the
      // guest's own history — they carry no independent price or refund of their own,
      // and exposing their ids here is what let a guest reach /cancel directly on one
      // (see the CHILD_BOOKING_NOT_MUTABLE guard on /confirm, /cancel, /check-in).
      // Displaying a multi-window booking as one entry (rather than N-1 hours simply
      // missing from this list) is a real guest-PWA product question, deliberately
      // left for that workstream — this filter is the minimal backend-safety fix.
      parentBookingId: null,
    },
    include: {
      window: {
        include: {
          resourcePool: true,
        }
      },
      players: true,
      // F-189: the real assigned court (F-205), for BookingHistory.tsx's per-card court
      // row. Nullable — a legacy pre-F-205 booking has no resource.
      resource: true,
      // F-187: guest-facing multi-window display (BookingHistory.tsx) needs every
      // additional hour's time range, not just the parent's own window. The
      // parentBookingId: null filter above is unchanged and still governs which rows
      // are top-level — this only adds what's nested under each of those rows.
      childBookings: {
        include: { window: true },
      },
    },
    orderBy: { heldAt: 'desc' },
  });

  return bookings;
});

// GET /bookings/:id/cancel-preview (requires JWT / internal)
// WHY: Preview the computed refund amount based on current date/time and cancellation policy.
server.get('/bookings/:id/cancel-preview', async (request, reply) => {
  let isInternal = false;
  let decodedUser: any = null;

  try {
    requireInternalKey(request, reply);
    isInternal = true;
  } catch (e) {
    try {
      decodedUser = await request.jwtVerify();
    } catch (jwtErr) {
      reply.status(401);
      throw new Error('Unauthorized');
    }
  }

  const { id } = request.params as any;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { window: true },
  });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
  }

  // IDOR Guard (F-071): tenant-scoped, branch-aware, shared by all three booking routes.
  if (!isInternal && decodedUser) {
    requireBookingAccess(booking, decodedUser, reply);
  }

  // F-183: a child booking's price is always null, so the CANCELLED-branch math below
  // would otherwise silently compute a confident-looking {refundAmount: 0, refundPercent:
  // 0} rather than erroring. Reject explicitly instead — act on the parent booking id.
  if (booking.parentBookingId) {
    reply.status(400);
    const err = new Error('Cannot preview a child booking directly — act on the parent booking id');
    (err as any).statusCode = 400;
    (err as any).code = 'CHILD_BOOKING_NOT_PREVIEWABLE';
    throw err;
  }

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.HELD && booking.status !== BookingStatus.CANCELLED) {
    reply.status(400);
    throw new Error('Only held, confirmed, or cancelled bookings can be previewed');
  }

  let refundAmount = 0;
  let refundPercent = 0;

  if (booking.status === BookingStatus.CANCELLED) {
    refundAmount = Number(booking.refundAmount || 0);
    const originalPrice = Number(booking.price || 0);
    refundPercent = originalPrice > 0 ? Math.round((refundAmount / originalPrice) * 100) : 0;
  } else if (booking.status === BookingStatus.CONFIRMED) {
    const rule = await prisma.bookingRule.findFirst({ where: { resourcePoolId: booking.resourcePoolId }, orderBy: { createdAt: 'asc' } });
    const now = new Date();
    const startTime = new Date(booking.window.startTime);
    const hoursBeforeSlot = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursBeforeSlot > 0 && rule?.cancellationPolicyJson) {
      const policy = rule.cancellationPolicyJson as any;
      if (policy.type === 'tiered' && Array.isArray(policy.tiers)) {
        const sortedTiers = [...policy.tiers].sort((a, b) => b.min_hours_before_slot - a.min_hours_before_slot);
        const matchedTier = sortedTiers.find((tier) => hoursBeforeSlot >= tier.min_hours_before_slot);
        if (matchedTier && booking.price) {
          refundPercent = matchedTier.refund_percent;
          refundAmount = (Number(booking.price) * matchedTier.refund_percent) / 100;
        }
      }
    }
  } else {
    // HELD bookings get 100% refund since they aren't paid yet (or are in process)
    refundPercent = 100;
    refundAmount = Number(booking.price || 0);
  }

  return {
    bookingId: booking.id,
    originalPrice: Number(booking.price || 0),
    refundAmount,
    refundPercent,
  };
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const start = async () => {
  try {
    await seedScheduledJobs();
    const port = Number(process.env.PORT) || 3001;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Slot Engine service running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
