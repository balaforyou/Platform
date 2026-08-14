import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, BookingStatus, AllocationMode, PricingMode, Prisma, AvailabilityOverrideType } from '@badminton/database';
import { ensureAvailabilityWindowsForDate } from './availabilityGeneration.js';
import {
  DEFAULT_TIME_ZONE,
  addBranchDays,
  branchDateString,
  branchHHMM,
  branchIsoWeekday,
  branchLocalToUtc,
  branchMinutesOfDay,
  safeTimeZone,
} from './branchTime.js';

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
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
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
    return { isInternal: true, userId: null, roles: [] };
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
  const isScopedAdmin = isAuthorizedForBranch({ isInternal: false, userId, roles }, booking.branchId);

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

function dateOnly(value: string | Date) {
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
  // Midday anchor: any instant inside the branch's day names that day, and noon is the one
  // choice no DST transition can move across a date boundary.
  const weekday = branchIsoWeekday(branchLocalToUtc(dateString, '12:00', timeZone), timeZone);
  const { startOfDay, endOfDay } = branchDayBounds(dateString, timeZone);

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
    const expectedStart = slotStartForDate(dateString, assignment.startTime, timeZone);
    const expectedEnd = new Date(expectedStart.getTime() + 60 * 60 * 1000);
    const matchingWindow = windows.find((window) => (
      window.resourcePoolId === assignment.resourcePoolId &&
      window.startTime >= expectedStart &&
      window.startTime <= expectedEnd
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

// ---------------------------------------------------------------------------
// Price resolution helper
// ---------------------------------------------------------------------------

// WHY: Server-side price is ALWAYS resolved here; callers have no influence over it.
// Resolution chain: window override → pool default.
// Both pricingMode and price on the window must be set together (both-or-neither).
// groupSize = 1 (booker) + coPlayers.length.
const resolvePrice = (
  pool: any,
  window: any,
  groupSize: number,
): Prisma.Decimal => {
  const activePricingMode: string = window.pricingMode ?? pool.pricingMode ?? PricingMode.FLAT;
  const activeRate: Prisma.Decimal = window.price != null
    ? new Prisma.Decimal(window.price)
    : new Prisma.Decimal(pool.defaultRate);

  if (activePricingMode === PricingMode.PER_PERSON) {
    return activeRate.mul(groupSize);
  }
  // FLAT — rate applies once regardless of group size
  return activeRate;
};

type TodayAssignmentResolution =
  | { state: 'NO_ACTIVE_ASSIGNMENT'; weekday: string }
  | { state: 'NO_SESSION_TODAY'; weekday: string; assignment: any }
  | { state: 'WINDOW_NOT_FOUND'; weekday: string; assignment: any }
  | { state: 'HAS_SESSION'; weekday: string; assignment: any; window: any; existingBooking: any | null; rule: any | null; cutoffTime: Date };

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

async function resolveTodayMemberAssignment(userId: string, tenantId: string, now: Date): Promise<TodayAssignmentResolution> {
  // F-066: the assignment lookup is not date-dependent, so it runs FIRST — the weekday
  // cannot be computed until we know which branch's clock to read. Only the
  // NO_ACTIVE_ASSIGNMENT case has no branch to consult, and it reports UTC.
  const assignment = await prisma.memberGroupAssignment.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      resourcePool: { tenantId },
    },
    include: {
      resourcePool: { include: { bookingRules: { orderBy: { createdAt: 'asc' } } } },
    },
  });

  if (!assignment) {
    return { state: 'NO_ACTIVE_ASSIGNMENT', weekday: branchIsoWeekday(now, DEFAULT_TIME_ZONE) };
  }

  const timeZone = await getBranchTimeZone(assignment.resourcePool.branchId);
  const weekday = isoWeekday(now, timeZone);

  const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
  if (!days.includes(weekday)) {
    return { state: 'NO_SESSION_TODAY', weekday, assignment };
  }

  // F-066: `startTime` is documented as branch local time in the schema, and is now read
  // as such instead of being pasted into a UTC ISO string.
  const windowStart = branchLocalToUtc(todayDateString(now, timeZone), assignment.startTime, timeZone);
  const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000);
  const matchingWindow = await prisma.availabilityWindow.findFirst({
    where: {
      resourcePoolId: assignment.resourcePoolId,
      startTime: { gte: windowStart, lte: windowEnd },
    },
  });
  if (!matchingWindow) return { state: 'WINDOW_NOT_FOUND', weekday, assignment };

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
    weekday,
    assignment,
    window: matchingWindow,
    existingBooking,
    rule,
    cutoffTime,
  };
}

async function ensureTodayMemberBooking({
  assignment,
  matchingWindow,
  now,
  status,
  attendanceConfirmedAt,
  timeZone,
}: {
  assignment: any;
  matchingWindow: any;
  now: Date;
  status: BookingStatus;
  attendanceConfirmedAt: Date | null;
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
      const resolvedPrice = resolvePrice(pool, matchingWindow, 1);
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
server.post('/resource-pools', async (request) => {
  const {
    tenantId, branchId, name, allocationMode, capacity, basePrice,
    minOccupancy, minBookingDurationMinutes, pricingMode, defaultRate,
  } = request.body as any;

  // WHY: We create a resource pool. For POOLED allocation mode, capacity defines the total capacity size.
  const pool = await prisma.resourcePool.create({
    data: {
      tenantId,
      branchId,
      name,
      allocationMode: allocationMode as AllocationMode,
      capacity: capacity ? Number(capacity) : 1,
      basePrice: basePrice ? new Prisma.Decimal(basePrice) : new Prisma.Decimal(100.00),
      minOccupancy: minOccupancy ? Number(minOccupancy) : 1,
      minBookingDurationMinutes: minBookingDurationMinutes ? Number(minBookingDurationMinutes) : 60,
      pricingMode: (pricingMode as PricingMode) ?? PricingMode.FLAT,
      defaultRate: defaultRate ? new Prisma.Decimal(defaultRate) : new Prisma.Decimal(100.00),
    },
  });
  return pool;
});

// Update Resource Pool configuration (admin-only).
// WHY: Admin Web edits operational settings after initial setup. Tenant/branch ownership
// is intentionally immutable here so a client cannot move a pool across authorization scopes.
server.patch('/resource-pools/:id', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
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

  const data: any = {};
  if (body.name !== undefined) {
    if (!String(body.name).trim()) {
      reply.status(400);
      const err = new Error('name cannot be empty');
      (err as any).statusCode = 400;
      (err as any).code = 'BAD_REQUEST';
      throw err;
    }
    data.name = String(body.name).trim();
  }

  const capacity = body.capacity !== undefined ? Number(body.capacity) : existing.capacity;
  const minOccupancy = body.minOccupancy !== undefined ? Number(body.minOccupancy) : existing.minOccupancy;
  if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(minOccupancy) || minOccupancy < 1 || capacity < minOccupancy) {
    reply.status(400);
    const err = new Error('capacity must be >= minOccupancy and both must be positive integers');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_OCCUPANCY';
    throw err;
  }
  if (body.capacity !== undefined) data.capacity = capacity;
  if (body.minOccupancy !== undefined) data.minOccupancy = minOccupancy;

  if (body.minBookingDurationMinutes !== undefined) {
    const duration = Number(body.minBookingDurationMinutes);
    if (!Number.isInteger(duration) || duration <= 0 || 1440 % duration !== 0) {
      reply.status(400);
      const err = new Error('minBookingDurationMinutes must be a positive slot increment that divides one day');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_DURATION';
      throw err;
    }
    data.minBookingDurationMinutes = duration;
  }

  if (body.pricingMode !== undefined) {
    if (!Object.values(PricingMode).includes(body.pricingMode)) {
      reply.status(400);
      const err = new Error('Invalid pricingMode');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_PRICING_MODE';
      throw err;
    }
    data.pricingMode = body.pricingMode as PricingMode;
  }

  if (body.defaultRate !== undefined) {
    const rate = Number(body.defaultRate);
    if (Number.isNaN(rate) || rate < 0) {
      reply.status(400);
      const err = new Error('defaultRate must be a non-negative number');
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_RATE';
      throw err;
    }
    data.defaultRate = new Prisma.Decimal(rate);
    data.basePrice = new Prisma.Decimal(rate);
  }

  return await prisma.resourcePool.update({
    where: { id },
    data,
    include: { resources: true, bookingRules: { orderBy: { createdAt: 'asc' } } },
  });
});

// Helper endpoint to add Resources to a pool.
server.post('/resource-pools/:id/resources', async (request) => {
  const { id } = request.params as any;
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

// Add Availability Windows to a pool.
// Phase 9: accepts optional pricingMode + price per-release override.
// WHY: Both-or-neither validation — a partial pricing override (mode without rate or vice-versa)
// would silently mis-price bookings. We reject instead.
server.post('/resource-pools/:id/availability-windows', async (request, reply) => {
  const { id } = request.params as any;
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
  const start = new Date(startTime);
  const end = new Date(endTime);

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
// WHY: Non-sensitive aggregate — guests and admins both need this for display.
server.get('/resource-pools/:id/occupancy', async (request, reply) => {
  const { id } = request.params as any;
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

// ---------------------------------------------------------------------------
// Availability Patterns
// ---------------------------------------------------------------------------

server.get('/resource-pools/:id/availability-patterns', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);

  return prisma.availabilityPattern.findMany({
    where: { resourcePoolId: id },
    orderBy: { createdAt: 'asc' },
  });
});

server.post('/resource-pools/:id/availability-patterns', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);
  const data = patternDataFromBody(request.body as any, reply);

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

  const body = request.body as any;
  const merged = {
    ...existing,
    ...body,
    slotDurationMinutes: body.slotDurationMinutes !== undefined ? Number(body.slotDurationMinutes) : existing.slotDurationMinutes,
  };
  const data = patternDataFromBody(merged, reply, false);

  return prisma.availabilityPattern.update({
    where: { id: patternId },
    data,
  });
});

server.delete('/resource-pools/:id/availability-patterns/:patternId', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
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

  return prisma.availabilityPattern.delete({ where: { id: patternId } });
});

// ---------------------------------------------------------------------------
// Availability Overrides
// ---------------------------------------------------------------------------

server.get('/resource-pools/:id/availability-overrides', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
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

// GET /branches/:id/resource-pools (public, no auth)
// WHY: Browse courts/resource pools at a branch. Gathers all resource pools associated
// with the specified branchId so the guest UI can list them.
server.get('/branches/:id/resource-pools', async (request) => {
  const { id } = request.params as any;
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
    },
  });
});

// ---------------------------------------------------------------------------
// Blocked Windows
// ---------------------------------------------------------------------------

server.post('/blocked-windows', async (request) => {
  const { resourcePoolId, resourceId, startTime, endTime, reason } = request.body as any;

  // WHY: Creates a blocked slot where booking is prohibited (e.g. training sessions).
  const blocked = await prisma.blockedWindow.create({
    data: {
      resourcePoolId,
      resourceId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      reason,
    },
  });
  return blocked;
});

// ---------------------------------------------------------------------------
// Availability check
// ---------------------------------------------------------------------------

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

  const windows = await prisma.availabilityWindow.findMany({
    where: {
      resourcePoolId: id,
      startTime: { gte: startRange },
      endTime: { lte: endRange },
    },
    orderBy: { startTime: 'asc' },
  });

  const availableSlots = [];

  for (const window of windows) {
    const isBlocked = await prisma.blockedWindow.findFirst({
      where: {
        resourcePoolId: id,
        OR: [
          { resourceId: null },
          ...(window.resourceId ? [{ resourceId: window.resourceId }] : []),
        ],
        startTime: { lte: window.endTime },
        endTime: { gte: window.startTime },
      },
    });

    if (isBlocked) continue;

    const activeBookings = await prisma.booking.findMany({
      where: {
        windowId: window.id,
        status: { in: [BookingStatus.HELD, BookingStatus.CONFIRMED] },
      },
    });

    if (pool.allocationMode === AllocationMode.FIXED_INSTANCE) {
      const isReserved = activeBookings.some((b: any) => b.resourceId === window.resourceId);
      if (!isReserved) {
        availableSlots.push({ window, remainingCapacity: 1 });
      }
    } else {
      const remainingCapacity = window.capacity - activeBookings.length;
      if (remainingCapacity > 0) {
        availableSlots.push({ window, remainingCapacity });
      }
    }
  }

  return availableSlots;
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

  try {
    const booking = await prisma.$transaction(async (tx: any) => {
      // 1. Lock the AvailabilityWindow row FOR UPDATE.
      // CASING TRAP: this is a RAW query, so the returned object carries the
      // database's real quoted-camelCase keys (startTime, endTime) — NOT the
      // lowercase forms. Reading `window.starttime` yields undefined, which
      // silently disabled the browse-ahead gate (Invalid Date compares false)
      // and stripped the time bounds from the blocked-window filter. Always
      // use startTime/endTime here.
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

      // 2. Fetch resource pool details.
      const pool = await tx.resourcePool.findUnique({ where: { id: resourcePoolId } });
      if (!pool) {
        const err = new Error('Resource pool not found');
        (err as any).statusCode = 404;
        (err as any).code = 'NOT_FOUND';
        throw err;
      }

      // 3. Enforce group size against pool constraints.
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

      // 4. Enforce the guest browse-ahead window.
      // F-048: this endpoint always applies guestOpenWindowDays. It previously
      // switched to the longer memberWindowDays on a client-supplied flag, so
      // any caller could bypass F-043's guest restriction by asserting
      // membership. Real member bookings never come through here — they are
      // created server-side by ensureTodayMemberBooking from a genuine
      // MemberGroupAssignment — so there is nothing legitimate to preserve.
      const rule = await tx.bookingRule.findFirst({ where: { resourcePoolId }, orderBy: { createdAt: 'asc' } });
      const windowDays = rule?.guestOpenWindowDays ?? 7;
      // F-066: an N-day horizon counted in branch-local days. setDate() counted them on
      // the server's clock, so the cutoff drifted by the UTC offset.
      const horizonTimeZone = await getBranchTimeZone(pool.branchId);
      const maxBookingDate = addBranchDays(new Date(), windowDays, horizonTimeZone);

      if (new Date(window.startTime) > maxBookingDate) {
        const err = new Error('Booking window is not open yet');
        (err as any).statusCode = 400;
        (err as any).code = 'BOOKING_WINDOW_CLOSED';
        throw err;
      }

      // 5. Verify no overlap with blocked periods.
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

      // 6. Concurrency checks based on allocation mode.
      if (pool.allocationMode === AllocationMode.FIXED_INSTANCE) {
        const targetResource = resourceId || window.resourceId;
        if (!targetResource) {
          const err = new Error('resourceId is required for FIXED_INSTANCE');
          (err as any).statusCode = 400;
          (err as any).code = 'BAD_REQUEST';
          throw err;
        }
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
        if (activeCount >= window.capacity) {
          const err = new Error('Pool capacity exceeded');
          (err as any).statusCode = 409;
          (err as any).code = 'POOL_CAPACITY_EXCEEDED';
          throw err;
        }
      }

      // 7. Resolve price server-side — caller has no influence over this value.
      const resolvedPrice = resolvePrice(pool, window, groupSize);

      // 8. Create booking in HELD state.
      const now = new Date();
      const heldUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes TTL

      return await tx.booking.create({
        data: {
          tenantId,
          branchId,
          resourcePoolId,
          resourceId: pool.allocationMode === AllocationMode.FIXED_INSTANCE
            ? (resourceId || window.resourceId)
            : null,
          windowId,
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
      const pool = await tx.resourcePool.findUnique({ where: { id: resourcePoolId } });
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

      return await tx.booking.create({
        data: {
          tenantId,
          branchId,
          resourcePoolId,
          resourceId: pool.allocationMode === AllocationMode.FIXED_INSTANCE
            ? (resourceId || window.resourceId)
            : null,
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

  if (booking.status === BookingStatus.CONFIRMED) return booking; // idempotent

  if (booking.status !== BookingStatus.HELD) {
    reply.status(400);
    throw new Error('Only held bookings can be confirmed');
  }

  return await prisma.booking.update({
    where: { id },
    data: { status: BookingStatus.CONFIRMED },
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

  if (booking.status === BookingStatus.CHECKED_IN) return booking; // idempotent

  if (booking.status !== BookingStatus.CONFIRMED) {
    reply.status(400);
    throw new Error('Only confirmed bookings can be checked in');
  }

  return await prisma.booking.update({
    where: { id },
    data: { status: BookingStatus.CHECKED_IN },
  });
});

// Cancel (HELD | CONFIRMED → CANCELLED) with tiered refund calculation and IDOR check.
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

  if (booking.status === BookingStatus.CANCELLED) return booking; // idempotent

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.HELD) {
    reply.status(400);
    throw new Error('Only held or confirmed bookings can be cancelled');
  }

  let refundAmount: Prisma.Decimal | null = null;

  if (booking.status === BookingStatus.CONFIRMED) {
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

  return await prisma.booking.update({
    where: { id },
    data: { status: BookingStatus.CANCELLED, refundAmount },
  });
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

function shapeTodayAssignment(resolution: TodayAssignmentResolution, subscriptionStatus?: string) {
  if (resolution.state !== 'HAS_SESSION') return resolution;
  const booking = resolution.existingBooking;
  return {
    state: subscriptionStatus && subscriptionStatus !== 'active' ? 'SUBSCRIPTION_INACTIVE' : 'HAS_SESSION',
    weekday: resolution.weekday,
    assignment: resolution.assignment,
    window: resolution.window,
    booking,
    cutoffTime: resolution.cutoffTime,
    canConfirm: !booking && !subscriptionStatus && new Date() < resolution.cutoffTime,
    reason: booking ? booking.status : undefined,
  };
}

// GET /member/today-assignment — member dashboard state for today's recurring slot.
// WHY: The dashboard needs deliberate states for no-session, inactive subscription,
// and missing-window cases instead of silently hiding the member attendance card.
server.get('/member/today-assignment', async (request, reply) => {
  const { userId, tenantId } = await requireMemberJwt(request, reply);
  const now = new Date();
  const resolution = await resolveTodayMemberAssignment(userId, tenantId, now);
  if (resolution.state !== 'HAS_SESSION') return resolution;

  const activeSubscription = await getActiveSubscription(userId, tenantId);
  if (!activeSubscription) {
    return shapeTodayAssignment(resolution, 'inactive');
  }

  return {
    ...shapeTodayAssignment(resolution),
    subscriptionStatus: activeSubscription.status,
  };
});

// POST /member/today-assignment/confirm — creates today's member booking via the
// same atomic lazy-generation helper used by the grace-period sweep.
server.post('/member/today-assignment/confirm', async (request, reply) => {
  const { userId, tenantId } = await requireMemberJwt(request, reply);
  const now = new Date();
  const resolution = await resolveTodayMemberAssignment(userId, tenantId, now);

  if (resolution.state === 'NO_ACTIVE_ASSIGNMENT') {
    reply.status(404);
    const err = new Error('No active member assignment');
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
    if (resolution.existingBooking.status === BookingStatus.RELEASED_NO_SHOW) {
      reply.status(409);
      const err = new Error('Confirmation cutoff has passed');
      (err as any).statusCode = 409;
      (err as any).code = 'CONFIRMATION_CUTOFF_PASSED';
      throw err;
    }
    if (!resolution.existingBooking.memberAttendanceConfirmedAt) {
      return prisma.booking.update({
        where: { id: resolution.existingBooking.id },
        data: { memberAttendanceConfirmedAt: now },
      });
    }
    return resolution.existingBooking;
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

// ---------------------------------------------------------------------------
// Member Group Assignments
// ---------------------------------------------------------------------------

// Create a member group assignment (admin-only).
// WHY: Dual-path auth — internal key OR owner/branch-manager JWT.
// The partial unique index on (userId) WHERE status = 'ACTIVE' enforces the
// one-active-slot-per-member Basic-tier rule at DB level; P2002 is the enforcement signal.
server.post('/member-group-assignments', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);

  const { userId, resourcePoolId, daysOfWeek, startTime } = request.body as any;

  if (!userId || !resourcePoolId || !daysOfWeek || !startTime) {
    reply.status(400);
    const err = new Error('userId, resourcePoolId, daysOfWeek, and startTime are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  await requirePoolScope(auth, resourcePoolId, reply);

  try {
    const assignment = await prisma.memberGroupAssignment.create({
      data: { userId, resourcePoolId, daysOfWeek, startTime, status: 'ACTIVE' },
    });
    reply.status(201);
    return assignment;
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // WHY: P2002 from the partial index = this member already has an active assignment
      // somewhere (possibly a different pool). From the @@unique constraint = same-pool
      // double assignment. Both are surfaced as the same 409.
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

// Update assignment status (ACTIVE ↔ SUSPENDED). Internal or owner only.
server.patch('/member-group-assignments/:id', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);

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
      data: { status },
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
  // write sets it false explicitly), and its two call sites are member confirm, which
  // always sets memberAttendanceConfirmedAt, and the sweep below, which always writes
  // RELEASED_NO_SHOW. Member bookings are never created HELD, so the HELD -> CONFIRMED
  // route cannot reach them either. No row could satisfy all three conditions.
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
    const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000); // search 1-hour span

    const matchingWindow = await prisma.availabilityWindow.findFirst({
      where: {
        resourcePoolId: assignment.resourcePoolId,
        startTime: { gte: windowStart, lte: windowEnd },
      },
    });
    if (!matchingWindow) continue;

    // Check if a booking already exists for this member + window (any non-cancelled status).
    const existingBooking = await prisma.booking.findFirst({
      where: {
        userId: assignment.userId,
        windowId: matchingWindow.id,
        status: { not: BookingStatus.CANCELLED },
      },
    });
    const rule = assignment.resourcePool.bookingRules[0];

    // 2. MEMBER RELEASE — gracePeriodMinutes.
    // F-065: this is the exact value the member is shown (resolveTodayMemberAssignment) and
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
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
            throw err;
          }
        }
      }
    }

    // 3. LOW-OCCUPANCY ALERT — guestAccessCutoffMinutes, unchanged.
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

  return {
    expiredHoldsCount: expiredHolds.count,
    releasedMembersCount,
    lazyGeneratedCount,
    lowOccupancyAlertsDispatched: alertsDispatched.length,
  };
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
    where: { userId },
    include: {
      window: {
        include: {
          resourcePool: true,
        }
      },
      players: true,
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
    const port = Number(process.env.PORT) || 3001;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Slot Engine service running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
