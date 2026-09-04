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

/* -------------------------------------------------------------------------- */
/* F-220 §3.2 / F-224 — guest-only Standard/Peak pricing                       */
/* -------------------------------------------------------------------------- */

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A reusable non-negative amount validator with a readable, field-named message — the shared
 * form of the `z.coerce.number().min(0)` idiom `poolSchema.defaultRate` already uses.
 * `z.coerce.number()` already rejects non-numeric input (coerces via Number(), then the NaN
 * check fails it); this just names the field in both messages.
 */
export const nonNegativeAmount = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} can't be negative`);

export type TimeWindow = { start: string; end: string };

/**
 * Generic (not pricing-specific): validate a list of `{ start, end }` HH:mm windows. Returns
 * one message per row, `''` when that row is fine — per-row HH:mm shape + `start < end`, then a
 * pairwise pass for exact duplicates and interval overlaps. Mirrors the server's own check in
 * `tenant-management`'s `PATCH /branches/:id/guest-pricing`.
 */
export function validateTimeWindows(windows: TimeWindow[]): string[] {
  return windows.map((w, i) => {
    if (!HHMM_RE.test(w.start) || !HHMM_RE.test(w.end)) return 'Enter a valid start and end time.';
    if (w.start >= w.end) return 'End time must be after start time.';
    for (let j = 0; j < windows.length; j++) {
      if (i === j) continue;
      const o = windows[j];
      if (w.start === o.start && w.end === o.end) return 'Same as another peak window.';
      if (w.start < o.end && o.start < w.end) return 'Overlaps another peak window.';
    }
    return '';
  });
}

/**
 * The guest-pricing form. `guestPeakRate` is required only once at least one peak window
 * exists; with no windows a branch is flat-rate on `guestStandardRate` alone.
 */
export const guestPricingSchema = z
  .object({
    guestStandardRate: nonNegativeAmount('Standard Rate'),
    guestPeakRate: nonNegativeAmount('Peak Rate').optional(),
    guestPeakWindows: z.array(z.object({ start: z.string(), end: z.string() })),
  })
  .superRefine((v, ctx) => {
    if (v.guestPeakWindows.length > 0 && (v.guestPeakRate === undefined || Number.isNaN(v.guestPeakRate))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guestPeakRate'],
        message: 'Set a peak rate — you have peak hours configured.',
      });
    }
    if (validateTimeWindows(v.guestPeakWindows).some((e) => e)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['guestPeakWindows'], message: 'Fix the peak hours before saving.' });
    }
  });
