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
 * duplicate/overlap pass **against earlier rows only** so a conflict is flagged on the *later*
 * row (the one just added or edited), not retroactively on the pristine row above it. Save is
 * still blocked whenever any row has an error, and the server re-runs a full pairwise check —
 * this is display positioning only. Mirrors the server's check in `tenant-management`'s
 * `PATCH /branches/:id/guest-pricing`.
 */
export function validateTimeWindows(windows: TimeWindow[]): string[] {
  return windows.map((w, i) => {
    if (!HHMM_RE.test(w.start) || !HHMM_RE.test(w.end)) return 'Enter a valid start and end time.';
    if (w.start >= w.end) return 'End time must be after start time.';
    for (let j = 0; j < i; j++) {
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

/* -------------------------------------------------------------------------- */
/* F-220 §3.3 — tiered guest cancellation / refund policy                      */
/* -------------------------------------------------------------------------- */

/**
 * Exactly three tiers, both sides editable (Bala, 4 Sep 2026 — nothing hardcodes 24/12/0
 * server-side). Refund percent: independent 0–100 integer per row, no cross-row ordering.
 * Hour threshold: non-negative integer, and the three must be strictly descending
 * (`h1 > h2 > h3 >= 0`) — the cancellation-time tier match (`slot-engine`) sorts descending and
 * takes the first tier whose `min_hours_before_slot <= hoursBeforeSlot`, so a non-descending
 * list produces a policy that reads wrong. Same "catch before save, not after a 400" instinct
 * as `validateTimeWindows`; the PUT route does not validate tier shape itself.
 */
export const refundPercent = z.coerce.number().int().min(0).max(100);
export const hourThreshold = z.coerce.number().int().min(0);

const cancellationTierInput = z.object({ hours: hourThreshold, percent: refundPercent });

/* -------------------------------------------------------------------------- */
/* F-220 §3.4 / F-238 — Dynamic Guest Scheduler (Daily/Weekly only)             */
/* -------------------------------------------------------------------------- */

/**
 * Backs the "Add a guest slot" form. Writes `AvailabilityPattern` directly — Daily/Weekly share
 * one schema, no stored distinction (Daily forces `daysOfWeek` to all 7, never shown to the
 * admin). Single-Day is deliberately not offered here (Bala, 10 Sep 2026 — Option A): a one-off
 * date goes through Branch Settings → Special Hours instead, avoiding the real collision risk
 * two independent surfaces writing the same `AvailabilityOverride` row would create.
 *
 * `branchHours` (optional) is the F-211 client-side mirror of the server's write-time guard —
 * when the branch has real hours configured, catch a day/time outside them before submit rather
 * than only after a 400 `PATTERN_OUTSIDE_OPERATING_HOURS`.
 */
export const guestSlotSchema = (branchHours?: { workingDays: string[]; workingHoursStart: string | null; workingHoursEnd: string | null }) =>
  z
    .object({
      recurrence: z.enum(['Daily', 'Weekly']),
      daysOfWeek: z.array(z.enum(['1', '2', '3', '4', '5', '6', '7'])),
      startTime: z.string().regex(HHMM_RE),
      endTime: z.string().regex(HHMM_RE),
      slotDurationMinutes: z.coerce.number().int().positive().refine(dividesADay, DIVIDES_A_DAY_MESSAGE),
      capacity: z.coerce.number().int().positive(),
      customRate: z.boolean(),
      price: z.coerce.number().min(0).optional(),
    })
    .superRefine((v, ctx) => {
      const effectiveDays = v.recurrence === 'Daily' ? ['1', '2', '3', '4', '5', '6', '7'] : v.daysOfWeek;
      if (v.recurrence === 'Weekly' && v.daysOfWeek.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['daysOfWeek'], message: 'Pick at least one day' });
      }
      const [sh, sm] = v.startTime.split(':').map(Number);
      const [eh, em] = v.endTime.split(':').map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      // Mirrors the server's real INVALID_TIME_RANGE check (validateWholeSlotRange,
      // slot-engine/src/index.ts) — catch it client-side, not after a 400.
      if (end <= start) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time must be after start time' });
      } else if ((end - start) % v.slotDurationMinutes !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['slotDurationMinutes'],
          message: `Time range must divide evenly into ${v.slotDurationMinutes}-minute slots`,
        });
      }
      if (v.customRate && v.price === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'Enter a price, or turn off Custom Rate' });
      }
      // F-211 client-side mirror: only checked once the branch's own hours are real and configured.
      if (branchHours?.workingHoursStart && branchHours?.workingHoursEnd && branchHours.workingDays.length > 0) {
        const outsideDays = effectiveDays.filter((d) => !DAY_NAME_TO_ISO_SET(branchHours.workingDays).has(d));
        if (outsideDays.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['daysOfWeek'],
            message: `Branch is closed on the day(s) selected — open days: ${branchHours.workingDays.join(', ')}`,
          });
        }
        if (v.startTime < branchHours.workingHoursStart || v.endTime > branchHours.workingHoursEnd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['startTime'],
            message: `Outside branch hours (${branchHours.workingHoursStart}–${branchHours.workingHoursEnd})`,
          });
        }
      }
    });

const DAY_NAME_TO_ISO_MAP: Record<string, string> = {
  Monday: '1', Tuesday: '2', Wednesday: '3', Thursday: '4', Friday: '5', Saturday: '6', Sunday: '7',
};
const DAY_NAME_TO_ISO_SET = (workingDays: string[]) => new Set(workingDays.map((d) => DAY_NAME_TO_ISO_MAP[d]).filter(Boolean));

export const cancellationPolicySchema = z
  .object({ tiers: z.tuple([cancellationTierInput, cancellationTierInput, cancellationTierInput]) })
  .superRefine((v, ctx) => {
    const [a, b, c] = v.tiers;
    if (!(a.hours > b.hours && b.hours > c.hours)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tiers'],
        message: 'Notice hours must decrease down the list (e.g. 24, 6, 0).',
      });
    }
  });
