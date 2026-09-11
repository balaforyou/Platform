/**
 * F-229 Step 5 — pure helpers for the Reservations walk-in form.
 */
import type { AvailabilitySlot, Branch, ResourcePool } from './types';

/** 10-digit Indian mobile, no country code. Matches identity-auth's `normalizePhone` input. */
export function isValidPhone10(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(raw.replace(/\D/g, ''));
}
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 10);
}

// --- timezone / date safety --------------------------------------------------
// `new Intl.DateTimeFormat(_, { timeZone })` throws RangeError on a non-IANA string, and a
// malformed ISO date makes `.format()` throw too. Every formatter below runs during render
// (useMemo, slotsInBand, table column renderers), so an unguarded throw white-screens the
// screen. `branch.timezone` comes from the DB — JBC is "UTC" (fine), but a legacy/misconfigured
// branch could carry "" or "IST" or garbage. Validate the zone once, fall back to UTC.

const tzCache = new Map<string, string>();
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

/** The window's hour-of-day in the branch's own timezone (JBC = UTC). */
export function branchHour(iso: string, timezone: string | undefined): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timezone),
    hour: 'numeric',
    hour12: false,
  }).format(safeDate(iso));
  // Intl can render midnight as "24" in some engines — normalise.
  return Number(h) % 24;
}

export type Band = 'morning' | 'afternoon' | 'evening';

export const BANDS: { key: Band; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
];

export function bandOf(hour: number): Band {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** Bookable slots (remaining capacity > 0) for a band, sorted by start time. */
export function slotsInBand(
  slots: AvailabilitySlot[] | undefined,
  band: Band,
  timezone: string | undefined,
): AvailabilitySlot[] {
  return (slots ?? [])
    .filter((s) => s.remainingCapacity > 0 && bandOf(branchHour(s.window.startTime, timezone)) === band)
    .sort((a, b) => a.window.startTime.localeCompare(b.window.startTime));
}

export function bandsWithSlots(
  slots: AvailabilitySlot[] | undefined,
  timezone: string | undefined,
): Set<Band> {
  const set = new Set<Band>();
  for (const s of slots ?? []) {
    if (s.remainingCapacity > 0) set.add(bandOf(branchHour(s.window.startTime, timezone)));
  }
  return set;
}

/** "6:00 – 7:00 PM" in the branch timezone. */
export function formatSlotLabel(window: AvailabilitySlot['window'], timezone: string | undefined): string {
  const tz = safeTimeZone(timezone);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(safeDate(iso));
  const start = fmt(window.startTime).replace(/\s?[AP]M$/i, '');
  return `${start} – ${fmt(window.endTime)}`;
}

const hhmmToMinutes = (hhmm: unknown): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export type RateSource = 'window' | 'peak' | 'standard' | 'default';

/**
 * Mirrors slot-engine's `resolveGuestBlanketRate` (`services/slot-engine/src/index.ts`):
 * per-window price override → branch guest peak (start inside a peak window AND a peak rate set)
 * → branch guest standard → pool default rate.
 */
export function resolveGuestRate(
  branch: Branch | undefined,
  pool: ResourcePool | undefined,
  window: AvailabilitySlot['window'] | undefined,
): { amount: number; source: RateSource } {
  if (window?.price != null && window.price !== '') {
    return { amount: Number(window.price), source: 'window' };
  }
  const standard = branch?.guestStandardRate != null && branch.guestStandardRate !== '' ? Number(branch.guestStandardRate) : null;
  const peak = branch?.guestPeakRate != null && branch.guestPeakRate !== '' ? Number(branch.guestPeakRate) : null;
  const peakWindows = branch?.guestPeakWindows ?? [];

  if (window && peak != null && peakWindows.length > 0) {
    const startMin = branchLocalMinutes(window.startTime, branch?.timezone);
    const inPeak = peakWindows.some((w) => {
      const s = hhmmToMinutes(w?.start);
      const e = hhmmToMinutes(w?.end);
      return Number.isFinite(s) && Number.isFinite(e) && startMin >= s && startMin < e;
    });
    if (inPeak) return { amount: peak, source: 'peak' };
  }
  if (standard != null) return { amount: standard, source: 'standard' };
  return { amount: pool?.defaultRate != null ? Number(pool.defaultRate) : 0, source: 'default' };
}

function branchLocalMinutes(iso: string, timezone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timezone),
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(safeDate(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

export const RATE_SOURCE_LABEL: Record<RateSource, string> = {
  window: 'this slot’s set price',
  peak: 'the guest peak rate',
  standard: 'the guest standard rate',
  default: 'the pool’s default rate',
};

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A unique client-side idempotency key. `crypto.randomUUID()` is only defined in a **secure
 * context** (HTTPS or localhost) — on a plain-IP dev URL (`http://192.168.x.x:5175`, phone
 * testing) it is undefined and throws. `crypto.getRandomValues` is NOT secure-context-gated,
 * so fall back to a v4 UUID built from it, then to a timestamp+random string.
 */
export function newIdempotencyKey(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
