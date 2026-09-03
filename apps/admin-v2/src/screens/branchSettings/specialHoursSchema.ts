import { z } from 'zod';

// Same HH:MM regex as branchSettingsSchema — mirrors slot-engine's validateTimeString.
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * F-220 §1b — Add / Edit Special Hours form. `CLOSED` needs only a date + reason; `MODIFIED`
 * additionally needs a valid, non-degenerate time range. Same `.refine` shape and message
 * idiom as `branchSettingsSchema`'s same-time guard.
 *
 * `slotDurationMinutes` / `capacity` are NOT in this schema — they're auto-filled from the
 * pool at save time (Finding 1), never entered by the admin. The whole-slot-multiple
 * constraint (Finding 3) is enforced upstream by the picker's `minuteStep`, not here.
 */
export const specialHoursSchema = z
  .object({
    date: z.string().min(1, 'Pick a date'),
    type: z.enum(['CLOSED', 'MODIFIED']),
    reason: z.string().trim().min(1, 'Add a reason'),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'MODIFIED') return;
    if (!HHMM.test(v.startTime ?? '')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Set an opening time' });
    }
    if (!HHMM.test(v.endTime ?? '')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Set a closing time' });
    }
    if (v.startTime && v.endTime && v.startTime === v.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: "Opening and closing time can't be the same",
      });
    }
  });

export type SpecialHoursForm = z.infer<typeof specialHoursSchema>;
