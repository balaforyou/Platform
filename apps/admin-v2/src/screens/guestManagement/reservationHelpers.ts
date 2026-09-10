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

/** The window's hour-of-day in the branch's own timezone (JBC = UTC). */
export function branchHour(iso: string, timezone: string | undefined): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour: 'numeric',
    hour12: false,
  }).format(new Date(iso));
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
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  const start = fmt(window.startTime).replace(/\s?[AP]M$/i, '');
  return `${start} – ${fmt(window.endTime)}`;
}

const hhmmToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
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
      const s = hhmmToMinutes(w.start);
      const e = hhmmToMinutes(w.end);
      return startMin >= s && startMin < e;
    });
    if (inPeak) return { amount: peak, source: 'peak' };
  }
  if (standard != null) return { amount: standard, source: 'standard' };
  return { amount: pool?.defaultRate != null ? Number(pool.defaultRate) : 0, source: 'default' };
}

function branchLocalMinutes(iso: string, timezone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso));
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
