/**
 * F-066: branch-local date and time resolution.
 *
 * THE PROBLEM THIS EXISTS FOR
 * Three clocks disagreed in one date-resolution path: `todayDateString` used UTC,
 * `isoWeekday` used the SERVER's local time, and branch-local `startTime` strings were
 * parsed as if they were UTC. `Branch.timezone` was declared, collected at tenant setup
 * and written by Tenant Management — and read nowhere in this service.
 *
 * The observed failure: a member whose recurring session is on Thursday, with the window
 * present in the database, is told "no session today" because the process computed the
 * weekday from its own local clock while the window was looked up on the UTC date.
 *
 * WHY `Intl` AND NOT A LIBRARY
 * No date library is a dependency anywhere in this repo, and none is needed. The runtime
 * image (`node:22-bookworm-slim`) ships FULL ICU — verified directly in the image, not
 * assumed — so IANA zones resolve correctly, including DST transitions.
 *
 * THE STORED VALUE IS UNTRUSTED INPUT
 * `Branch.timezone` is NOT NULL with default 'UTC', but Tenant Management stores whatever
 * it is given with no validation at all, and `Intl` throws a RangeError on an unknown
 * zone. A single malformed row would otherwise abort the sweep for EVERY branch, not just
 * its own. So every entry point resolves the zone through `safeTimeZone` first.
 */

export const DEFAULT_TIME_ZONE = 'UTC';

const validZoneCache = new Map<string, boolean>();

/**
 * WHY a cache: `Intl.DateTimeFormat` construction is the expensive part, and the sweep
 * calls this once per assignment. Keyed by the raw string, so a corrected branch row is
 * still re-validated under its new value — only the verdict for a given string is reused,
 * and that verdict cannot change.
 */
export function isValidTimeZone(timeZone: unknown): boolean {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  const cached = validZoneCache.get(timeZone);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    ok = false;
  }
  validZoneCache.set(timeZone, ok);
  return ok;
}

/**
 * Resolves a stored timezone to one that is safe to use, falling back to UTC.
 *
 * WHY IT WARNS RATHER THAN THROWS: refusing to serve a member because an admin typed
 * "Asia/Bangalore" is a worse outcome than serving them on UTC, which is exactly what the
 * system did before this module existed. The fallback is therefore the pre-existing
 * behaviour, not a new guess — but it is announced, because silence is how F-066 survived.
 */
export function safeTimeZone(timeZone: unknown, context = 'unknown'): string {
  if (isValidTimeZone(timeZone)) return timeZone as string;
  console.warn(
    `[branchTime] invalid timezone ${JSON.stringify(timeZone)} (${context}) — falling back to ${DEFAULT_TIME_ZONE}. ` +
      'Branch.timezone is stored unvalidated; fix the branch record.',
  );
  return DEFAULT_TIME_ZONE;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

function wallClockParts(instant: Date, timeZone: string): Parts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset in ms that must be SUBTRACTED from a wall-clock reading to get the instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = wallClockParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Second-resolution only; ms are carried separately and never affect the offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` on the branch's calendar. Identical to `toISOString().slice(0,10)` for UTC. */
export function branchDateString(instant: Date, timeZone: string): string {
  const p = wallClockParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * ISO weekday as a string, `"1"` (Monday) … `"7"` (Sunday) — the convention
 * `MemberGroupAssignment.daysOfWeek` uses.
 */
export function branchIsoWeekday(instant: Date, timeZone: string): string {
  const p = wallClockParts(instant, timeZone);
  const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return String(day === 0 ? 7 : day);
}

/** `HH:mm` on the branch's clock. */
export function branchHHMM(instant: Date, timeZone: string): string {
  const p = wallClockParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Minutes elapsed since branch-local midnight — for slot-boundary alignment. */
export function branchMinutesOfDay(instant: Date, timeZone: string): number {
  const p = wallClockParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * The instant at which a branch-local wall-clock time occurs.
 *
 * DST HONESTY: converting local → instant is genuinely ambiguous during a fall-back (the
 * wall time happens twice) and non-existent during a spring-forward (it never happens).
 * This implements the conventional "compatible" disambiguation, matching Temporal and
 * Luxon: the FIRST occurrence for an ambiguous time, and for a non-existent time the
 * instant the wall clock jumps to (02:30 on a US spring-forward resolves to 03:30 local,
 * not back to 01:30). India observes no DST, so neither case is reachable for the current
 * deployment — but the behaviour is asserted in the regression suite rather than assumed,
 * because "region-agnostic" is a stated goal of this platform.
 */
export function branchLocalToUtc(dateString: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  const [hh, mi] = hhmm.split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mi)) {
    throw new Error(`branchLocalToUtc: invalid date "${dateString}" or time "${hhmm}"`);
  }
  const wantUtcMs = Date.UTC(y, m - 1, d, hh, mi, 0);

  const matchesRequest = (candidate: Date) => {
    const p = wallClockParts(candidate, timeZone);
    return p.year === y && p.month === m && p.day === d && p.hour === hh && p.minute === mi;
  };

  // Probe with the offset in effect at the naive instant, then re-probe at the result.
  const offsetA = offsetMs(new Date(wantUtcMs), timeZone);
  const candidateA = new Date(wantUtcMs - offsetA);
  const offsetB = offsetMs(candidateA, timeZone);
  if (offsetB === offsetA) return candidateA;

  // The probes disagree, so a transition sits between them. If the second offset yields
  // the requested wall time, that is the real instant (the first probe simply landed on
  // the wrong side). If neither does, the time does not exist — return candidateA, which
  // is the post-gap instant, giving the forward shift described above.
  const candidateB = new Date(wantUtcMs - offsetB);
  return matchesRequest(candidateB) ? candidateB : candidateA;
}

/** Advances by whole branch-local days, preserving the wall-clock time across DST shifts. */
export function addBranchDays(instant: Date, days: number, timeZone: string): Date {
  const p = wallClockParts(instant, timeZone);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  const dateString = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  return branchLocalToUtc(dateString, `${pad(p.hour)}:${pad(p.minute)}`, timeZone);
}

/**
 * F-087: resolve a caller-supplied datetime, interpreting a naive one on the BRANCH's clock.
 *
 * `new Date("2026-07-31T22:16:00")` — no offset, no `Z` — is parsed by Node as process-local
 * time, so the instant a caller creates depended on how the container happened to be configured
 * rather than on anything the caller said. That was invisible while every layer was naive-local
 * together, and stayed harmless only because the server and every branch are both `UTC`. It
 * becomes a real defect the moment a branch carries a real timezone (F-088): an admin entering
 * `22:16` would have it stored as 22:16 UTC and then judged, displayed and aligned as 03:46 IST.
 *
 * The decision, stated rather than left to fall out of the parser: **naive input means branch
 * local time**, which is what an admin typing a time on a venue's schedule actually means, and
 * matches the schema's own "branch local time" convention. Input carrying an explicit offset is
 * unchanged — it already says exactly which instant it means.
 *
 * A branch on `UTC` is unaffected, which is what makes this safe to land before any flip.
 */
const NAIVE_LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;

export function parseBranchLocalDateTime(value: unknown, timeZone: string, field: string): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required and must be a datetime string`);
  }
  const naive = NAIVE_LOCAL.exec(value.trim());
  const parsed = naive
    ? branchLocalToUtc(naive[1], naive[2], timeZone)
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} is not a valid datetime: "${value}"`);
  }
  return parsed;
}
