import { z } from 'zod';

/**
 * F-220: the five validation schemas from admin-web's court/slot-config screens
 * (`apps/admin-web/src/main.tsx`), ported byte-identical — every refine mirrors a real
 * server rule so a form can't submit something the API will reject. Not "improved".
 *
 * SCREEN-002: the server rejects a duration that doesn't divide a day (INVALID_DURATION);
 * pool and pattern durations both carry the check. overrideSchema's slotDurationMinutes
 * deliberately does NOT — that asymmetry is preserved from admin-web as-is.
 */

const dividesADay = (minutes: number) => 1440 % minutes === 0;
const DIVIDES_A_DAY_MESSAGE = 'Must divide evenly into 24 hours (e.g. 30, 60, 90, 120)';

export const poolSchema = z
  .object({
    name: z.string().min(1),
    capacity: z.coerce.number().int().min(1),
    minOccupancy: z.coerce.number().int().min(1),
    minBookingDurationMinutes: z.coerce.number().int().positive().refine(dividesADay, DIVIDES_A_DAY_MESSAGE),
    pricingMode: z.enum(['FLAT', 'PER_PERSON']),
    defaultRate: z.coerce.number().min(0),
  })
  .refine((v) => v.capacity >= v.minOccupancy, {
    // Mirrors the server's INVALID_OCCUPANCY cross-field rule.
    message: 'Capacity must be greater than or equal to minimum occupancy',
    path: ['capacity'],
  });

export const ruleSchema = z.object({
  guestAccessCutoffMinutes: z.coerce.number().int().min(0),
  lowOccupancyThresholdPct: z.coerce.number().int().min(0).max(100),
});

export const branchScheduleSchema = z.object({
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
});

export const patternSchema = z.object({
  daysOfWeek: z.string().min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  slotDurationMinutes: z.coerce.number().int().positive().refine(dividesADay, DIVIDES_A_DAY_MESSAGE),
  capacity: z.coerce.number().int().positive(),
  pricingMode: z.enum(['FLAT', 'PER_PERSON']).optional(),
  price: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const overrideSchema = z.object({
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  type: z.enum(['CLOSED', 'MODIFIED']),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  slotDurationMinutes: z.coerce.number().int().positive().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  pricingMode: z.enum(['FLAT', 'PER_PERSON']).optional(),
  price: z.coerce.number().min(0).optional(),
  reason: z.string().optional(),
});
