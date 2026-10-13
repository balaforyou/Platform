/**
 * S1: branch-local calendar-date helpers for the global branch/date context.
 *
 * WHY: the admin screens used `new Date().toISOString().slice(0, 10)` for "today", which is the
 * UTC date. For a branch in `Asia/Kolkata` (UTC+5:30) that is the PREVIOUS day between 00:00 and
 * 05:30 local - the F-335 / F-336 / F-339 class of bug. A selected date is a CALENDAR DATE
 * (`YYYY-MM-DD`); each branch interprets it in its OWN time zone. It is never turned into a single
 * instant shared across branches.
 */

export const DEFAULT_TIME_ZONE = 'UTC';

/** True when the runtime accepts `timeZone` (a bad stored zone must not throw in the UI). */
export function isValidTimeZone(timeZone: string | undefined | null): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(timeZone: string | undefined | null): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** The branch-local calendar date (`YYYY-MM-DD`) at `instant`. */
export function branchLocalDate(instant: Date, timeZone: string | undefined | null): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The branch-local month (`YYYY-MM`) at `instant`. */
export function branchLocalMonth(instant: Date, timeZone: string | undefined | null): string {
  return branchLocalDate(instant, timeZone).slice(0, 7);
}

/** Offset of `timeZone` from UTC, in minutes, at `instant` (positive east of UTC). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * The half-open UTC interval `[start, end)` that the calendar date `date` covers in `timeZone`.
 * Two branches in different zones give two different intervals for the same `date` - that is the
 * rule when "All" is selected.
 */
export function branchDayBounds(date: string, timeZone: string | undefined | null): { start: Date; end: Date } {
  const tz = safeTimeZone(timeZone);
  const [y, m, d] = date.split('-').map(Number);
  const bound = (day: number) => {
    // Local midnight of (y, m, day): start from the UTC guess and correct by the zone offset at
    // that moment (twice, so a DST step between guess and result cannot leave it an hour off).
    let guess = Date.UTC(y, m - 1, day);
    for (let i = 0; i < 2; i++) guess = Date.UTC(y, m - 1, day) - zoneOffsetMinutes(new Date(guess), tz) * 60000;
    return new Date(guess);
  };
  return { start: bound(d), end: bound(d + 1) };
}

/** `YYYY-MM-DD` validity (calendar-real, not just the shape). */
export function isCalendarDate(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * The date the context shows. An explicit pick wins; otherwise "today" in the SELECTED branch's
 * own zone. With "All" selected and no explicit pick there is no single "today": each branch's
 * own today applies when that branch's data is read (see `perBranchDates`).
 */
export function resolveDate(
  explicit: string | null,
  selection: string,
  branches: { id: string; timezone?: string }[],
  now: Date,
): string {
  if (isCalendarDate(explicit)) return explicit;
  const one = branches.find((b) => b.id === selection) ?? branches[0];
  return branchLocalDate(now, one?.timezone);
}

/**
 * "All" rule: the selected calendar date, interpreted by every branch in its own zone. Returns,
 * per branch, the date label and the UTC interval that branch's day covers. With no explicit
 * date each branch uses ITS OWN today (they can differ by a day around midnight).
 */
export function perBranchDates(
  explicit: string | null,
  branches: { id: string; timezone?: string }[],
  now: Date,
): Record<string, { date: string; start: Date; end: Date; timeZone: string }> {
  const out: Record<string, { date: string; start: Date; end: Date; timeZone: string }> = {};
  for (const b of branches) {
    const timeZone = safeTimeZone(b.timezone);
    const date = isCalendarDate(explicit) ? explicit : branchLocalDate(now, timeZone);
    const { start, end } = branchDayBounds(date, timeZone);
    out[b.id] = { date, start, end, timeZone };
  }
  return out;
}

// ── remembered branch (per user), storage can throw: every access is wrapped ────────────────────

const storageKey = (userId: string) => `av2.branch.${userId}`;

export function readRememberedBranch(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function writeRememberedBranch(userId: string | undefined, branchId: string): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), branchId);
  } catch {
    /* private window / blocked storage: correctness never depends on this */
  }
}

/**
 * Initial branch: the remembered one if the user can still see it, else the first (stable order)
 * branch they can see, else ''. `allowed` is already role-scoped by `useBranches`.
 */
export function initialBranch(remembered: string | null, allowed: { id: string }[]): string {
  if (remembered && allowed.some((b) => b.id === remembered)) return remembered;
  return allowed[0]?.id ?? '';
}

/** Switcher shape: segmented up to this many BRANCHES, a dropdown beyond (ruled 13 Oct). */
export const SEGMENTED_MAX = 4;

export type SwitcherKind = 'hidden' | 'segmented' | 'dropdown';

/**
 * Which switcher to show. Hidden for a single branch (a one-branch manager). "All" is an extra
 * option only when the screen supports it AND there are two or more branches (reads only).
 */
export function switcherModel(
  branches: { id: string; name: string }[],
  allowAll: boolean,
): { kind: SwitcherKind; options: { id: string; label: string }[] } {
  if (branches.length <= 1) return { kind: 'hidden', options: [] };
  const options = branches.map((b) => ({ id: b.id, label: b.name }));
  if (allowAll) options.unshift({ id: 'all', label: 'All' });
  return { kind: branches.length <= SEGMENTED_MAX ? 'segmented' : 'dropdown', options };
}
