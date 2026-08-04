import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, BookingStatus, AllocationMode, PricingMode, Prisma } from '@badminton/database';

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
function isAlignedToBoundary(date: Date, durationMinutes: number): boolean {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();
  return totalMinutes % durationMinutes === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

function floorTimeToBoundary(date: Date, durationMinutes: number): Date {
  const result = new Date(date);
  result.setSeconds(0);
  result.setMilliseconds(0);
  const totalMinutes = result.getHours() * 60 + result.getMinutes();
  const snappedMinutes = Math.floor(totalMinutes / durationMinutes) * durationMinutes;
  result.setHours(0, snappedMinutes, 0, 0);
  return result;
}

function ceilTimeToBoundary(date: Date, durationMinutes: number): Date {
  const result = new Date(date);
  result.setSeconds(0);
  result.setMilliseconds(0);
  const totalMinutes = result.getHours() * 60 + result.getMinutes();
  const snappedMinutes = Math.ceil(totalMinutes / durationMinutes) * durationMinutes;
  result.setHours(0, snappedMinutes, 0, 0);
  return result;
}

function alignTimeToBoundary(date: Date, durationMinutes: number): Date {
  const result = new Date(date);
  result.setSeconds(0);
  result.setMilliseconds(0);
  const totalMinutes = result.getHours() * 60 + result.getMinutes();
  const snappedMinutes = Math.round(totalMinutes / durationMinutes) * durationMinutes;
  
  // NOTE: Passing minutes > 59 to setHours is a standard JS Date behavior.
  // The Date engine automatically handles minute overflows, cleanly rolling over
  // hours and days without introducing timezone shift side-effects.
  result.setHours(0, snappedMinutes, 0, 0);
  return result;
}

function formatHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
    include: { resources: true, bookingRules: true },
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

type GuestOccupancyRow = {
  resourcePoolId: string;
  resourcePoolName: string;
  totalCapacity: number;
  confirmedSeats: number;
  occupancyPercentage: number;
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

async function computePoolGuestOccupancy(resourcePoolIds: string[], date?: string): Promise<GuestOccupancyRow[]> {
  if (resourcePoolIds.length === 0) return [];

  const pools = await prisma.resourcePool.findMany({
    where: { id: { in: resourcePoolIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
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

function todayDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isoWeekday(now: Date): string {
  return String(now.getDay() === 0 ? 7 : now.getDay());
}

function memberBookingIdempotencyKey(userId: string, windowId: string, now: Date): string {
  return `member-booking-${userId}-${windowId}-${todayDateString(now)}`;
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
  const weekday = isoWeekday(now);
  const assignment = await prisma.memberGroupAssignment.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      resourcePool: { tenantId },
    },
    include: {
      resourcePool: { include: { bookingRules: true } },
    },
  });

  if (!assignment) return { state: 'NO_ACTIVE_ASSIGNMENT', weekday };

  const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
  if (!days.includes(weekday)) {
    return { state: 'NO_SESSION_TODAY', weekday, assignment };
  }

  const windowStart = new Date(`${todayDateString(now)}T${assignment.startTime}:00.000Z`);
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
}: {
  assignment: any;
  matchingWindow: any;
  now: Date;
  status: BookingStatus;
  attendanceConfirmedAt: Date | null;
}) {
  const key = memberBookingIdempotencyKey(assignment.userId, matchingWindow.id, now);

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
  return { status: 'ok', service: 'slot-engine' };
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
    include: { resources: true, bookingRules: true },
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
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (!isAlignedToBoundary(start, duration)) {
    const enteredStr = formatHHMM(start);
    const lowerStr = formatHHMM(floorTimeToBoundary(start, duration));
    const upperStr = formatHHMM(ceilTimeToBoundary(start, duration));
    reply.status(400);
    const err = new Error(`Start time must align to ${duration}-minute slots for this court. You entered ${enteredStr} — did you mean ${lowerStr} or ${upperStr}?`);
    (err as any).statusCode = 400;
    (err as any).code = 'UNALIGNED_TIME_BOUNDARY';
    throw err;
  }

  if (!isAlignedToBoundary(end, duration)) {
    const enteredStr = formatHHMM(end);
    const lowerStr = formatHHMM(floorTimeToBoundary(end, duration));
    const upperStr = formatHHMM(ceilTimeToBoundary(end, duration));
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

// GET /branches/:id/resource-pools (public, no auth)
// WHY: Browse courts/resource pools at a branch. Gathers all resource pools associated
// with the specified branchId so the guest UI can list them.
server.get('/branches/:id/resource-pools', async (request) => {
  const { id } = request.params as any;
  const pools = await prisma.resourcePool.findMany({
    where: { branchId: id },
    include: {
      resources: true,
      bookingRules: true,
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

// Configure Booking Rules — Phase 9 adds guestAccessCutoffMinutes, lowOccupancyThresholdPct.
server.post('/booking-rules', async (request) => {
  const {
    resourcePoolId,
    memberWindowDays,
    guestOpenWindowDays,
    gracePeriodMinutes,
    guestAccessCutoffMinutes,
    lowOccupancyThresholdPct,
    prepaymentRequired,
    cancellationPolicyJson,
  } = request.body as any;

  // WHY: Establishes booking rules per pool, including guest/member reservation windows,
  // the two distinct cutoff mechanisms, and cancellation policies.
  const rule = await prisma.bookingRule.create({
    data: {
      resourcePoolId,
      memberWindowDays: memberWindowDays ? Number(memberWindowDays) : 30,
      guestOpenWindowDays: guestOpenWindowDays ? Number(guestOpenWindowDays) : 7,
      gracePeriodMinutes: gracePeriodMinutes ? Number(gracePeriodMinutes) : 30,
      guestAccessCutoffMinutes: guestAccessCutoffMinutes ? Number(guestAccessCutoffMinutes) : 120,
      lowOccupancyThresholdPct: lowOccupancyThresholdPct ? Number(lowOccupancyThresholdPct) : 50,
      prepaymentRequired: prepaymentRequired !== false,
      cancellationPolicyJson: cancellationPolicyJson || {
        type: 'tiered',
        tiers: [
          { min_hours_before_slot: 24, refund_percent: 100 },
          { min_hours_before_slot: 6, refund_percent: 50 },
          { min_hours_before_slot: 0, refund_percent: 0 },
        ],
      },
    },
  });
  return rule;
});

// Upsert Booking Rule for a Resource Pool (admin-only).
// WHY: Admin Web config should be recoverable for pools that were created before a
// rule existed; upsert avoids stranding those pools while keeping the rule pool-scoped.
server.put('/resource-pools/:id/booking-rule', async (request, reply) => {
  const auth = await getInternalOrAdminAuth(request, reply);
  const { id } = request.params as any;
  await requirePoolScope(auth, id, reply);
  const body = request.body as any;

  const existing = await prisma.bookingRule.findFirst({ where: { resourcePoolId: id } });
  const data: any = {};

  const integerFields = [
    'memberWindowDays',
    'guestOpenWindowDays',
    'gracePeriodMinutes',
    'guestAccessCutoffMinutes',
  ];
  for (const field of integerFields) {
    if (body[field] !== undefined) {
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
  }

  if (body.lowOccupancyThresholdPct !== undefined) {
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

  if (body.prepaymentRequired !== undefined) {
    data.prepaymentRequired = Boolean(body.prepaymentRequired);
  }

  if (body.cancellationPolicyJson !== undefined) {
    data.cancellationPolicyJson = body.cancellationPolicyJson;
  }

  const defaultPolicy = existing?.cancellationPolicyJson || {
    type: 'tiered',
    tiers: [
      { min_hours_before_slot: 24, refund_percent: 100 },
      { min_hours_before_slot: 6, refund_percent: 50 },
      { min_hours_before_slot: 0, refund_percent: 0 },
    ],
  };

  if (!existing && data.lowOccupancyThresholdPct === undefined) {
    reply.status(400);
    const err = new Error('lowOccupancyThresholdPct is required when creating a booking rule');
    (err as any).statusCode = 400;
    (err as any).code = 'THRESHOLD_REQUIRED';
    throw err;
  }

  return await prisma.bookingRule.upsert({
    where: { id: existing?.id ?? '__missing__' },
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
  });
  if (!pool) {
    reply.status(404);
    throw new Error('Resource pool not found');
  }

  // WHY: Parse search range. Default to returning windows starting in the next 30 days.
  let startRange = new Date();
  let endRange = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

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
    tenantId,
    branchId,
    resourcePoolId,
    resourceId,
    windowId,
    userId,
    isMemberBooking,
    coPlayers,
    // WHY: price is intentionally destructured and discarded. The self-service path
    // must never honour a caller-supplied price — this is the Phase 4 trust boundary.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    price: _ignoredPrice,
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

      // 4. Enforce booking window (guest vs member limits).
      const rule = await tx.bookingRule.findFirst({ where: { resourcePoolId } });
      const windowDays = isMemberBooking ? (rule?.memberWindowDays ?? 30) : (rule?.guestOpenWindowDays ?? 7);
      const maxBookingDate = new Date();
      maxBookingDate.setDate(maxBookingDate.getDate() + windowDays);

      if (new Date(window.starttime) > maxBookingDate) {
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
          startTime: { lte: window.endtime },
          endTime: { gte: window.starttime },
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
          isMemberBooking: !!isMemberBooking,
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
          startTime: { lte: window.endtime },
          endTime: { gte: window.starttime },
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
server.post('/bookings/:id/check-in', async (request, reply) => {
  const { id } = request.params as any;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
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

  // IDOR Guard: Verify ownership or admin privileges if not internal service
  if (!isInternal && decodedUser) {
    const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
    const roles = decodedUser.roles || [];
    const isOwner = booking.userId === userId;
    const isAdmin = roles.includes('owner') || roles.includes('branch_manager');

    if (!isOwner && !isAdmin) {
      reply.status(403);
      throw new Error('Forbidden');
    }
  }

  if (booking.status === BookingStatus.CANCELLED) return booking; // idempotent

  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.HELD) {
    reply.status(400);
    throw new Error('Only held or confirmed bookings can be cancelled');
  }

  let refundAmount: Prisma.Decimal | null = null;

  if (booking.status === BookingStatus.CONFIRMED) {
    const rule = await prisma.bookingRule.findFirst({ where: { resourcePoolId: booking.resourcePoolId } });
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

async function requireMemberJwt(request: any, reply: any) {
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
    if (decodedUser.userType !== 'MEMBER') {
      reply.status(403);
      const err = new Error('Member access required');
      (err as any).statusCode = 403;
      (err as any).code = 'MEMBER_REQUIRED';
      throw err;
    }
    return { userId, tenantId };
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
server.post('/bookings/sweep', async () => {
  const now = new Date();

  // 1. Expire stale HELD bookings past their 5-minute hold TTL.
  const expiredHolds = await prisma.booking.updateMany({
    where: { status: BookingStatus.HELD, heldUntil: { lt: now } },
    data: { status: BookingStatus.RELEASED_NO_SHOW },
  });

  // 2. Auto-release unconfirmed member bookings past gracePeriodMinutes.
  // WHY: gracePeriodMinutes governs individual member seat release — distinct from guestAccessCutoffMinutes.
  const activeMemberBookings = await prisma.booking.findMany({
    where: {
      isMemberBooking: true,
      status: BookingStatus.CONFIRMED,
      memberAttendanceConfirmedAt: null,
      window: { startTime: { gte: now } },
    },
    include: {
      window: true,
      resourcePool: { include: { bookingRules: true } },
    },
  });

  let releasedMembersCount = 0;
  for (const b of activeMemberBookings) {
    const rule = b.resourcePool.bookingRules[0];
    const gracePeriodMinutes = rule ? rule.gracePeriodMinutes : 30;
    const startTime = new Date(b.window.startTime);
    const limitTime = new Date(startTime.getTime() - gracePeriodMinutes * 60 * 1000);
    if (now >= limitTime) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: BookingStatus.RELEASED_NO_SHOW },
      });
      releasedMembersCount++;
    }
  }

  // 3. Lazy member booking generation from MemberGroupAssignment.
  // WHY: For each active assignment matching today's weekday, ensure a booking exists
  // for today's matching window. Creates RELEASED_NO_SHOW if past guestAccessCutoffMinutes
  // so the slot can be opened to guests if occupancy is low.
  const activeAssignments = await prisma.memberGroupAssignment.findMany({
    where: { status: 'ACTIVE' },
    include: {
      resourcePool: { include: { bookingRules: true } },
    },
  });

  let lazyGeneratedCount = 0;
  const alertsDispatched: string[] = [];

  // ISO weekday: 1=Mon … 7=Sun (same convention as the daysOfWeek field)
  const todayIsoWeekday = String(now.getDay() === 0 ? 7 : now.getDay());

  for (const assignment of activeAssignments) {
    const days = assignment.daysOfWeek.split(',').map((d: string) => d.trim());
    if (!days.includes(todayIsoWeekday)) continue;

    // Find today's availability window for this pool starting at assignment.startTime.
    const todayDateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const windowStart = new Date(`${todayDateStr}T${assignment.startTime}:00.000Z`);
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
    if (existingBooking) continue;

    // WHY: guestAccessCutoffMinutes governs when the lazy booking is generated.
    // Only create the RELEASED_NO_SHOW booking once we're past the cutoff window.
    const rule = assignment.resourcePool.bookingRules[0];
    const cutoffMinutes = rule?.guestAccessCutoffMinutes ?? 120;
    const cutoffTime = new Date(matchingWindow.startTime.getTime() - cutoffMinutes * 60 * 1000);
    if (now < cutoffTime) continue;

    // Create through the same atomic helper used by member self-confirm.
    // WHY: Sweep and confirm are competing triggers for one logical daily member booking,
    // so the lock/double-check/create path must not drift between callers.
    try {
      const ensured = await ensureTodayMemberBooking({
        assignment,
        matchingWindow,
        now,
        status: BookingStatus.RELEASED_NO_SHOW,
        attendanceConfirmedAt: null,
      });
      if (ensured.created) {
        lazyGeneratedCount++;
      }
    } catch (err: any) {
      // P2002 = concurrent sweep already created this booking — safe to skip.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
    }

    // 4. After generation, check occupancy and dispatch alert if below threshold.
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

  // IDOR Guard: Verify ownership or admin privileges if not internal service
  if (!isInternal && decodedUser) {
    const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
    const roles = decodedUser.roles || [];
    const isOwner = booking.userId === userId;
    const isAdmin = roles.includes('owner') || roles.includes('branch_manager');

    if (!isOwner && !isAdmin) {
      reply.status(403);
      throw new Error('Forbidden');
    }
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

  // IDOR Guard: Verify ownership or admin privileges if not internal service
  if (!isInternal && decodedUser) {
    const userId = decodedUser.userId || decodedUser.sub || decodedUser.id;
    const roles = decodedUser.roles || [];
    const isOwner = booking.userId === userId;
    const isAdmin = roles.includes('owner') || roles.includes('branch_manager');

    if (!isOwner && !isAdmin) {
      reply.status(403);
      throw new Error('Forbidden');
    }
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
    const rule = await prisma.bookingRule.findFirst({ where: { resourcePoolId: booking.resourcePoolId } });
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
