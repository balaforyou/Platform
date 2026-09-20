import {
  AllocationMode,
  AvailabilityOverrideType,
  Prisma,
  PrismaClient,
  PricingMode,
} from '@badminton/database';
import { DEFAULT_TIME_ZONE, branchLocalToUtc, safeTimeZone } from './branchTime.js';

const prisma = new PrismaClient();

// F-088 Stage 2 (part 4): mirrors index.ts's own getBranchTimeZone — this module has no access
// to that function (separate file), so a minimal equivalent lives here rather than exporting
// index.ts's copy across an otherwise-clean module boundary.
async function getBranchTimeZoneFor(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { timezone: true } });
  if (!branch) return DEFAULT_TIME_ZONE;
  return safeTimeZone(branch.timezone, `branch ${branchId}`);
}

export type EnsureAvailabilityWindowsResult = {
  resourcePoolId: string;
  date: string;
  createdCount: number;
  skippedExistingCount: number;
  source: 'CLOSED_OVERRIDE' | 'MODIFIED_OVERRIDE' | 'PATTERN' | 'NONE';
  windowIds: string[];
};

type GenerationCandidate = {
  resourcePoolId: string;
  resourceId: string | null;
  startTime: Date;
  endTime: Date;
  capacity: number;
  pricingMode: PricingMode | null;
  price: Prisma.Decimal | null;
  generatedFromPatternId: string | null;
  generationDate: Date;
};

function normalizeDate(date: string | Date) {
  const parsed = typeof date === 'string' ? new Date(`${date}T00:00:00.000Z`) : new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    const err = new Error('Invalid generation date');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DATE';
    throw err;
  }
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isoWeekday(date: Date) {
  const day = date.getUTCDay();
  return String(day === 0 ? 7 : day);
}

function parseTime(value: string, fieldName: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    const err = new Error(`${fieldName} must be HH:mm`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TIME';
    throw err;
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

// F-088 Stage 2 (part 4): previously ignored the branch's real timezone entirely, treating a
// pattern's HH:mm as literal UTC (`setUTCHours`) regardless of what Branch.timezone said — the
// exact mismatch F-100/F-088 describe. Now resolves the same way branchLocalToUtc/branchDayBounds
// already do everywhere else in this file's sibling (`index.ts`), so a `06:00` pattern on an
// Asia/Kolkata branch generates at 00:30 UTC (06:00 IST), not 06:00 UTC.
function atLocalUtcDate(date: Date, time: string, fieldName: string, timeZone: string) {
  parseTime(time, fieldName); // validates HH:mm shape; branchLocalToUtc re-parses for the actual conversion
  return branchLocalToUtc(dateKey(date), time, timeZone);
}

function validateSlotDefinition(startTime: string, endTime: string, slotDurationMinutes: number, capacity: number) {
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0 || 1440 % slotDurationMinutes !== 0) {
    const err = new Error('slotDurationMinutes must be a positive slot increment that divides one day');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_DURATION';
    throw err;
  }
  if (!Number.isInteger(capacity) || capacity <= 0) {
    const err = new Error('capacity must be a positive integer');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_CAPACITY';
    throw err;
  }
  const start = parseTime(startTime, 'startTime');
  const end = parseTime(endTime, 'endTime');
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  if (endMinutes <= startMinutes || (endMinutes - startMinutes) % slotDurationMinutes !== 0) {
    const err = new Error('time range must contain whole slots');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TIME_RANGE';
    throw err;
  }
}

function buildCandidatesFromDefinition({
  resourcePoolId,
  resourceIds,
  allocationMode,
  date,
  startTime,
  endTime,
  slotDurationMinutes,
  capacity,
  pricingMode,
  price,
  generatedFromPatternId,
  timeZone,
}: {
  resourcePoolId: string;
  resourceIds: string[];
  allocationMode: AllocationMode;
  date: Date;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  capacity: number;
  pricingMode: PricingMode | null;
  price: Prisma.Decimal | null;
  generatedFromPatternId: string | null;
  timeZone: string;
}) {
  validateSlotDefinition(startTime, endTime, slotDurationMinutes, capacity);
  const start = atLocalUtcDate(date, startTime, 'startTime', timeZone);
  const end = atLocalUtcDate(date, endTime, 'endTime', timeZone);
  const stepMs = slotDurationMinutes * 60 * 1000;
  const candidates: GenerationCandidate[] = [];
  const generationDate = new Date(date);

  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += stepMs) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor + stepMs);
    const scopedResourceIds = allocationMode === AllocationMode.FIXED_INSTANCE
      ? resourceIds
      : [null];

    for (const resourceId of scopedResourceIds) {
      candidates.push({
        resourcePoolId,
        resourceId,
        startTime: slotStart,
        endTime: slotEnd,
        capacity: allocationMode === AllocationMode.FIXED_INSTANCE ? 1 : capacity,
        pricingMode,
        price,
        generatedFromPatternId,
        generationDate,
      });
    }
  }

  return candidates;
}

export async function ensureAvailabilityWindowsForDate(
  resourcePoolId: string,
  date: string | Date,
): Promise<EnsureAvailabilityWindowsResult> {
  const generationDate = normalizeDate(date);
  const generationDateKey = dateKey(generationDate);

  const pool = await prisma.resourcePool.findUnique({
    where: { id: resourcePoolId },
    include: { resources: true },
  });
  if (!pool) {
    const err = new Error('Resource pool not found');
    (err as any).statusCode = 404;
    (err as any).code = 'NOT_FOUND';
    throw err;
  }
  const timeZone = await getBranchTimeZoneFor(pool.branchId);

  try {
    await prisma.generationLock.create({
      data: {
        resourcePoolId,
        date: generationDate,
      },
    });
  } catch (err: any) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      throw err;
    }
  }

  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`
      SELECT id FROM "GenerationLock"
      WHERE "resourcePoolId" = ${resourcePoolId}
        AND "date" = ${generationDate}
      FOR UPDATE
    `;

    const existingForDate = await tx.availabilityWindow.findMany({
      where: {
        resourcePoolId,
        startTime: { gte: generationDate },
        endTime: { lte: new Date(generationDate.getTime() + 24 * 60 * 60 * 1000 - 1) },
      },
      orderBy: { startTime: 'asc' },
    });

    const override = await tx.availabilityOverride.findUnique({
      where: {
        resourcePoolId_date: {
          resourcePoolId,
          date: generationDate,
        },
      },
    });

    let source: EnsureAvailabilityWindowsResult['source'] = 'NONE';
    let candidates: GenerationCandidate[] = [];
    const resourceIds = pool.resources.map((resource) => resource.id);

    if (override?.type === AvailabilityOverrideType.CLOSED) {
      return {
        resourcePoolId,
        date: generationDateKey,
        createdCount: 0,
        skippedExistingCount: existingForDate.length,
        source: 'CLOSED_OVERRIDE' as const,
        windowIds: existingForDate.map((window: any) => window.id),
      };
    }

    if (override?.type === AvailabilityOverrideType.MODIFIED) {
      if (!override.startTime || !override.endTime || !override.slotDurationMinutes || !override.capacity) {
        const err = new Error('Modified override requires startTime, endTime, slotDurationMinutes, and capacity');
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_OVERRIDE';
        throw err;
      }
      source = 'MODIFIED_OVERRIDE';
      candidates = buildCandidatesFromDefinition({
        resourcePoolId,
        resourceIds,
        allocationMode: pool.allocationMode,
        date: generationDate,
        startTime: override.startTime,
        endTime: override.endTime,
        slotDurationMinutes: override.slotDurationMinutes,
        capacity: override.capacity,
        pricingMode: override.pricingMode,
        price: override.price,
        generatedFromPatternId: null,
        timeZone,
      });
    } else {
      const patterns = await tx.availabilityPattern.findMany({
        where: {
          resourcePoolId,
          status: 'ACTIVE',
        },
        orderBy: { createdAt: 'asc' },
      });
      const weekday = isoWeekday(generationDate);
      const matchingPatterns = patterns.filter((pattern: any) =>
        pattern.daysOfWeek.split(',').map((day: string) => day.trim()).includes(weekday),
      );

      if (matchingPatterns.length > 0) source = 'PATTERN';
      for (const pattern of matchingPatterns) {
        candidates.push(...buildCandidatesFromDefinition({
          resourcePoolId,
          resourceIds,
          allocationMode: pool.allocationMode,
          date: generationDate,
          startTime: pattern.startTime,
          endTime: pattern.endTime,
          slotDurationMinutes: pattern.slotDurationMinutes,
          capacity: pattern.capacity,
          pricingMode: pattern.pricingMode,
          price: pattern.price,
          generatedFromPatternId: pattern.id,
          timeZone,
        }));
      }
    }

    let createdCount = 0;
    let skippedExistingCount = 0;
    const windowIds = existingForDate.map((window: any) => window.id);

    for (const candidate of candidates) {
      const existing = await tx.availabilityWindow.findFirst({
        where: {
          resourcePoolId,
          resourceId: candidate.resourceId,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
        },
      });
      if (existing) {
        skippedExistingCount++;
        windowIds.push(existing.id);
        continue;
      }

      const created = await tx.availabilityWindow.create({
        data: candidate,
      });
      createdCount++;
      windowIds.push(created.id);
    }

    return {
      resourcePoolId,
      date: generationDateKey,
      createdCount,
      skippedExistingCount,
      source,
      windowIds,
    };
  });
}

export type PatternWindowReconciliation = {
  removed: number;
  preservedWithBookings: number;
};

/**
 * F-261: `ensureAvailabilityWindowsForDate` above is purely additive -- editing or deleting a
 * pattern never touches windows it already generated, since `generatedFromPatternId` is a bare
 * `String?` with no relation. Called from the pattern DELETE/PATCH routes (never from generation
 * itself, which stays side-effect-light) to retract the future slots this exact pattern produced,
 * except any that already carry a real booking.
 *
 * Bounds, both deliberately conservative:
 * - `startTime > now` only -- never touches a window that has already started, a stricter bound
 *   than the display-only "elapsed" convention used elsewhere, since deletion is a much
 *   higher-stakes action than a display label.
 * - Excludes a window with a `Booking` of ANY status, not just an active one. `Booking.windowId`
 *   is `onDelete: Cascade` -- a window with even a CANCELLED booking on it carries real
 *   audit/refund history that a cascade-delete would destroy, so it's left alone entirely rather
 *   than risk that history for a window that isn't bookable again anyway.
 *
 * No diffing of the pattern's old vs. new definition is needed: any date the pattern still
 * legitimately covers regenerates identically, correctly, the next time it's queried -- the
 * existing lazy/additive model already guarantees that. Reconciliation just clears the slate.
 */
export async function reconcilePatternWindows(
  tx: any,
  resourcePoolId: string,
  patternId: string,
  now: Date,
): Promise<PatternWindowReconciliation> {
  const removable = await tx.availabilityWindow.findMany({
    where: {
      resourcePoolId,
      generatedFromPatternId: patternId,
      startTime: { gt: now },
      bookings: { none: {} },
    },
    select: { id: true },
  });

  const totalFuture = await tx.availabilityWindow.count({
    where: {
      resourcePoolId,
      generatedFromPatternId: patternId,
      startTime: { gt: now },
    },
  });

  if (removable.length > 0) {
    await tx.availabilityWindow.deleteMany({
      where: { id: { in: removable.map((w: any) => w.id) } },
    });
  }

  return { removed: removable.length, preservedWithBookings: totalFuture - removable.length };
}

export async function disconnectAvailabilityGenerationPrisma() {
  await prisma.$disconnect();
}
