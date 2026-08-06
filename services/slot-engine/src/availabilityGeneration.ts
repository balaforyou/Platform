import {
  AllocationMode,
  AvailabilityOverrideType,
  Prisma,
  PrismaClient,
  PricingMode,
} from '@badminton/database';

const prisma = new PrismaClient();

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

function atLocalUtcDate(date: Date, time: string, fieldName: string) {
  const parsed = parseTime(time, fieldName);
  const result = new Date(date);
  result.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
  return result;
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
}) {
  validateSlotDefinition(startTime, endTime, slotDurationMinutes, capacity);
  const start = atLocalUtcDate(date, startTime, 'startTime');
  const end = atLocalUtcDate(date, endTime, 'endTime');
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

  return prisma.$transaction(async (tx: any) => {
    await tx.generationLock.upsert({
      where: {
        resourcePoolId_date: {
          resourcePoolId,
          date: generationDate,
        },
      },
      update: {},
      create: {
        resourcePoolId,
        date: generationDate,
      },
    });
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

export async function disconnectAvailabilityGenerationPrisma() {
  await prisma.$disconnect();
}
