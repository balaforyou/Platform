/**
 * F-234: branch-local time formatting for the frontend.
 *
 * THE PROBLEM THIS EXISTS FOR
 * `guest-member-pwa` rendered every slot/booking time with unguarded `toLocaleTimeString()` /
 * `toLocaleDateString()` / `.getHours()` calls — no `timeZone` option anywhere — so a time is
 * rendered in the VIEWER's browser timezone, not the branch's. For any real India-based guest of
 * this India-market product, that is a live, real-user-facing +5:30 shift on every screen, not a
 * theoretical one: a window genuinely stored at `07:00Z` (7am branch-local, JBC's branches are
 * genuinely `Branch.timezone = 'UTC'` today) renders as `12:30 PM` to an IST browser.
 *
 * `apps/admin-v2/src/screens/guestManagement/reservationHelpers.ts` (F-229 Step 5) already solved
 * this correctly for one screen, with `safeTimeZone`/`branchHour`/`formatSlotLabel`. This module
 * ports that proven approach into a shared home so a third local copy never gets pasted in a third
 * place — the same reasoning `format.ts` in this package already states for a prior recurring bug
 * (F-029/F-034/F-037). `reservationHelpers.ts` itself is left as-is; it already works.
 *
 * `formatBranchTime` is more general than `reservationHelpers.ts`'s single-purpose
 * `formatSlotLabel` (hardcoded "H:MM – H:MM" range) because guest-member-pwa's render sites need
 * several different shapes — time-only, date-only, weekday-only, date+time combined — so one
 * `Intl.DateTimeFormat` wrapper taking real `Intl.DateTimeFormatOptions` covers all of them
 * instead of growing one bespoke function per screen.
 */

const tzCache = new Map<string, string>();

/**
 * Resolves a stored timezone to one safe to hand to `Intl.DateTimeFormat`, falling back to UTC.
 * `new Intl.DateTimeFormat(_, { timeZone })` throws a `RangeError` on a non-IANA string, and every
 * formatter below runs during render — an unguarded throw here would white-screen the app on a
 * legacy/misconfigured branch (`branch.timezone` is stored unvalidated; see
 * `services/slot-engine/src/branchTime.ts`'s identical justification for the identical fallback).
 */
export function safeTimeZone(tz: string | undefined): string {
  const key = (tz || 'UTC').trim();
  const cached = tzCache.get(key);
  if (cached) return cached;
  let resolved = 'UTC';
  try {
    // The constructor is what validates the zone.
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: key });
    resolved = key;
  } catch {
    resolved = 'UTC';
  }
  tzCache.set(key, resolved);
  return resolved;
}

function safeDate(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * The instant's hour-of-day (0-23) in the branch's own timezone — for bucketing logic (e.g. a
 * Morning/Afternoon/Evening filter), not display. Using the viewer's browser hour for this is a
 * correctness bug, not just a cosmetic one: a slot can land in the wrong bucket entirely.
 */
export function branchHour(iso: string, timezone: string | undefined): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timezone),
    hour: 'numeric',
    hour12: false,
  }).format(safeDate(iso));
  // Intl can render midnight as "24" in some engines — normalise.
  return Number(h) % 24;
}

/**
 * Formats an ISO instant in the branch's own timezone. A drop-in replacement for
 * `new Date(iso).toLocaleTimeString(...)` / `.toLocaleDateString(...)` — same `Intl`-backed
 * options shape, but resolved against the branch's clock instead of the viewer's.
 */
export function formatBranchTime(
  iso: string,
  timezone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone: safeTimeZone(timezone),
  }).format(safeDate(iso));
}
