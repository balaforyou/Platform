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
// Auth helpers
// ---------------------------------------------------------------------------

// WHY: Guards endpoints that require a verified INTERNAL_SERVICE_KEY.
// Used on service-to-service paths where a JWT is not appropriate.
const requireInternalKey = (request: any, reply: any) => {
  const authHeader = request.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${internalKey}`) {
    reply.status(401);
    const err = new Error('Unauthorized internal service access');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
};

// WHY: Guards admin-only endpoints (member assignment, manual release) using the same
// dual-path pattern established in tenant-management (Phase 3).
// Accepts INTERNAL_SERVICE_KEY OR a JWT with role OWNER or BRANCH_MANAGER.
const requireInternalOrAdmin = async (request: any, reply: any) => {
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
    return;
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
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
};

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

  const window = await prisma.availabilityWindow.create({
    data: {
      resourcePoolId: id,
      resourceId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
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

  // WHY: Default to today's windows when no date supplied.
  const day = date ? new Date(date) : new Date();
  const startOfDay = new Date(day);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(day);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const windows = await prisma.availabilityWindow.findMany({
    where: {
      resourcePoolId: id,
      startTime: { gte: startOfDay, lte: endOfDay },
    },
  });

  const windowIds = windows.map((w: any) => w.id);
  const confirmedSeats = await prisma.booking.count({
    where: {
      windowId: { in: windowIds },
      status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN] },
    },
  });

  const totalCapacity = pool.capacity;
  const occupancyPercentage = totalCapacity > 0
    ? Math.round((confirmedSeats / totalCapacity) * 100)
    : 0;

  return { totalCapacity, confirmedSeats, occupancyPercentage };
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
  await requireInternalOrAdmin(request, reply);

  const { windowId } = request.params as any;
  const { pricingMode, price } = request.body as any;

  const hasMode = pricingMode != null;
  const hasPrice = price != null;
  if (hasMode !== hasPrice) {
    reply.status(400);
    const err = new Error('pricingMode and price must both be provided or both omitted');
    (err as any).statusCode = 400;
    (err as any).code = 'PARTIAL_PRICING_OVERRIDE';
    throw err;
  }

  const existing = await prisma.availabilityWindow.findUnique({ where: { id: windowId } });
  if (!existing) {
    reply.status(404);
    throw new Error('Availability window not found');
  }

  const updated = await prisma.availabilityWindow.update({
    where: { id: windowId },
    data: {
      pricingMode: pricingMode ? (pricingMode as PricingMode) : null,
      price: price != null ? new Prisma.Decimal(price) : null,
    },
  });
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
          players: coPlayers && Array.isArray(coPlayers) ? {
            create: coPlayers.map((phone: string) => ({ phone })),
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
          players: coPlayers && Array.isArray(coPlayers) ? {
            create: coPlayers.map((phone: string) => ({ phone })),
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

// Cancel (HELD | CONFIRMED → CANCELLED) with tiered refund calculation.
server.post('/bookings/:id/cancel', async (request, reply) => {
  const { id } = request.params as any;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { window: true },
  });
  if (!booking) {
    reply.status(404);
    throw new Error('Booking not found');
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
// Member Group Assignments
// ---------------------------------------------------------------------------

// Create a member group assignment (admin-only).
// WHY: Dual-path auth — internal key OR owner/branch-manager JWT.
// The partial unique index on (userId) WHERE status = 'ACTIVE' enforces the
// one-active-slot-per-member Basic-tier rule at DB level; P2002 is the enforcement signal.
server.post('/member-group-assignments', async (request, reply) => {
  await requireInternalOrAdmin(request, reply);

  const { userId, resourcePoolId, daysOfWeek, startTime } = request.body as any;

  if (!userId || !resourcePoolId || !daysOfWeek || !startTime) {
    reply.status(400);
    const err = new Error('userId, resourcePoolId, daysOfWeek, and startTime are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const pool = await prisma.resourcePool.findUnique({ where: { id: resourcePoolId } });
  if (!pool) {
    reply.status(404);
    const err = new Error('Resource pool not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }

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
  requireInternalKey(request, reply);
  const { resourcePoolId, userId } = request.query as any;

  const assignments = await prisma.memberGroupAssignment.findMany({
    where: {
      ...(resourcePoolId ? { resourcePoolId } : {}),
      ...(userId ? { userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  return assignments;
});

// Update assignment status (ACTIVE ↔ SUSPENDED). Internal or owner only.
server.patch('/member-group-assignments/:id', async (request, reply) => {
  await requireInternalOrAdmin(request, reply);

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

    // Create the lazy booking inside a transaction with FOR UPDATE to prevent concurrent sweeps
    // creating duplicate bookings for the same member + window.
    try {
      await prisma.$transaction(async (tx: any) => {
        // Lock the window row to prevent concurrent sweep runs.
        await tx.$queryRaw`
          SELECT id FROM "AvailabilityWindow" WHERE id = ${matchingWindow.id} FOR UPDATE
        `;

        // Double-check inside transaction (race-safe).
        const doubleCheck = await tx.booking.findFirst({
          where: {
            userId: assignment.userId,
            windowId: matchingWindow.id,
            status: { not: BookingStatus.CANCELLED },
          },
        });
        if (doubleCheck) return;

        const pool = assignment.resourcePool;
        const resolvedPrice = resolvePrice(pool, matchingWindow, 1);

        await tx.booking.create({
          data: {
            tenantId: pool.tenantId,
            branchId: pool.branchId,
            resourcePoolId: pool.id,
            resourceId: null,
            windowId: matchingWindow.id,
            userId: assignment.userId,
            status: BookingStatus.RELEASED_NO_SHOW,
            heldAt: now,
            heldUntil: now, // Released immediately — no hold window for sweep-generated bookings
            idempotencyKey: `sweep-${assignment.userId}-${matchingWindow.id}-${todayDateStr}`,
            isMemberBooking: true,
            refundAmount: null,
            price: resolvedPrice,
          },
        });
        lazyGeneratedCount++;
      });
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

// Retrieve a booking by ID (internal lookup for other services).
server.get('/bookings/:id', async (request, reply) => {
  requireInternalKey(request, reply);

  const { id } = request.params as any;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { window: true },
  });
  if (!booking) {
    reply.status(404);
    const err = new Error('Booking not found');
    (err as any).statusCode = 404;
    (err as any).code = 'BOOKING_NOT_FOUND';
    throw err;
  }
  return booking;
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
