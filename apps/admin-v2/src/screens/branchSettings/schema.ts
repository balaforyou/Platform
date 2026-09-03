import { z } from 'zod';

/** Full English day names, Mon-first — the exact shape `Branch.workingDays` stores. */
export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

// Mirrors tenant-management's WORKING_HOURS_RE (validateBranchFields) byte-for-byte, so the form
// rejects the same values the PATCH would 400 on.
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * F-210 / F-220: branch operating-hours settings. First pass = only the fields that already
 * exist on `Branch` (workingHoursStart / workingHoursEnd / workingDays), saved via the
 * existing `PATCH /tenant/branches/:id`.
 */
export const branchSettingsSchema = z.object({
  workingHoursStart: z.string().regex(HHMM, 'Opening time must be HH:MM, e.g. 06:00'),
  workingHoursEnd: z.string().regex(HHMM, 'Closing time must be HH:MM, e.g. 22:00'),
  workingDays: z.array(z.enum(WEEKDAYS)).min(1, 'Pick at least one open day'),
});

export type BranchSettingsInput = z.infer<typeof branchSettingsSchema>;
