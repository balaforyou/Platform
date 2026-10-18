/**
 * Fixture time zone for regression suites (F-337).
 *
 * WHY: fixtures that build "today" windows from the UTC wall clock run out of
 * same-day room between ~21:00 and 24:00 UTC. Instead of clamping hours in each
 * section, the suite's fixture branch lives in a per-run whole-hour `Etc/GMT±N`
 * zone chosen so branch-local time is ~07:00 when the suite starts. Every window
 * a section needs ("an hour from now, today") then has ~16 hours of headroom
 * whatever the real UTC time is.
 *
 * Note the POSIX-style inversion: `Etc/GMT-N` means UTC+N.
 */

const TARGET_LOCAL_HOUR = 7;
const MS_HOUR = 3_600_000;

/** UTC offset in hours, in [-11, +12], that puts local time at ~07:00. */
export function pickFixtureOffsetHours(now: Date = new Date()): number {
  let offset = TARGET_LOCAL_HOUR - now.getUTCHours();
  if (offset > 12) offset -= 24;
  if (offset < -11) offset += 24;
  return offset;
}

export function fixtureZoneName(offsetHours: number): string {
  if (offsetHours === 0) return 'Etc/GMT';
  return offsetHours > 0 ? `Etc/GMT-${offsetHours}` : `Etc/GMT+${-offsetHours}`;
}

export interface FixtureZone {
  name: string;
  offsetHours: number;
}

export function pickFixtureZone(now: Date = new Date()): FixtureZone {
  const offsetHours = pickFixtureOffsetHours(now);
  return { name: fixtureZoneName(offsetHours), offsetHours };
}

let memo: FixtureZone | undefined;
/** The zone for this process, chosen once so every section agrees. */
export function fixtureZone(): FixtureZone {
  memo ??= pickFixtureZone();
  return memo;
}

/** A Date whose UTC fields read as zone-local wall-clock fields. */
function shifted(zone: FixtureZone, instant: Date): Date {
  return new Date(instant.getTime() + zone.offsetHours * MS_HOUR);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Zone-local calendar date, YYYY-MM-DD. */
export function zoneLocalDate(zone: FixtureZone, instant: Date = new Date()): string {
  return shifted(zone, instant).toISOString().slice(0, 10);
}

/** Zone-local ISO weekday, 1 = Monday .. 7 = Sunday. */
export function zoneLocalIsoWeekday(zone: FixtureZone, instant: Date = new Date()): number {
  const d = shifted(zone, instant).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Zone-local HH:mm. */
export function zoneLocalHHmm(zone: FixtureZone, instant: Date): string {
  const s = shifted(zone, instant);
  return `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
}

/**
 * Whole zone-local hour near `minutesAhead` from `now`, which must still fall on today's
 * zone-local date. `round: 'up'` (default) gives the first hour at or after the offset;
 * `'down'` the last hour at or before it (the start is then in (offset-60min, offset]), for
 * sections whose cutoff arithmetic needs the window no further out than the offset.
 * Throws rather than clamping: a section that cannot get its window is a harness bug, not
 * something to paper over.
 */
export function windowStartInZoneToday(
  zone: FixtureZone,
  minutesAhead: number,
  now: Date = new Date(),
  round: 'up' | 'down' = 'up',
): Date {
  const target = now.getTime() + minutesAhead * 60_000;
  const start = new Date((round === 'up' ? Math.ceil(target / MS_HOUR) : Math.floor(target / MS_HOUR)) * MS_HOUR);
  if (start.getTime() <= now.getTime()) {
    throw new Error(`fixtureZone: ${minutesAhead}min ahead rounds to a window that has already started`);
  }
  if (zoneLocalDate(zone, start) !== zoneLocalDate(zone, now)) {
    throw new Error(
      `fixtureZone: no whole-hour window ${minutesAhead}min ahead within today in ${zone.name}`,
    );
  }
  return start;
}

/**
 * Exact-minute variant of `windowStartInZoneToday` for sections that need a precise offset
 * (e.g. reminder timing) rather than a pattern-aligned hour. Seconds are zeroed.
 */
export function minuteAheadInZoneToday(
  zone: FixtureZone,
  minutesAhead: number,
  now: Date = new Date(),
): Date {
  const start = new Date(Math.floor((now.getTime() + minutesAhead * 60_000) / 60_000) * 60_000);
  if (zoneLocalDate(zone, start) !== zoneLocalDate(zone, now)) {
    throw new Error(`fixtureZone: ${minutesAhead}min ahead is not within today in ${zone.name}`);
  }
  return start;
}
