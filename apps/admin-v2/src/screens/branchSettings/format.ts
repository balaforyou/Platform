import { WEEKDAYS } from './schema';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "18:30" -> "06:30 PM". Passes anything that isn't HH:MM straight through. */
export function to12h(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const suffix = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${pad2(h)}:${m[2]} ${suffix}`;
}

/**
 * Best-effort "city" line for the branch card. Addresses in this app are stored as free text,
 * usually "<place>, <city>, <state>, <country>" — so the 2nd segment is the city. Falls back to
 * the whole string when it isn't comma-structured.
 */
export function cityFromAddress(address?: string | null): string {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[1] : address.trim();
}

const short = (day: string) => day.slice(0, 3);

/** "Open every day" / "Open Mon–Fri" / "Open Mon, Wed, Fri" / "No open days set". */
export function describeDays(days: string[]): string {
  if (days.length === 7) return 'Open every day';
  if (days.length === 0) return 'No open days set';
  const idx = WEEKDAYS.map((d, i) => (days.includes(d) ? i : -1)).filter((i) => i >= 0);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length > 1) {
    return `Open ${short(WEEKDAYS[idx[0]])}–${short(WEEKDAYS[idx[idx.length - 1]])}`;
  }
  return `Open ${idx.map((i) => short(WEEKDAYS[i])).join(', ')}`;
}

/** Full one-line summary for the "Schedule overview" card. */
export function describeSchedule(days: string[], start: string, end: string): string {
  const dayPart = describeDays(days);
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    return days.length === 0 ? 'Hours and days not set yet' : `${dayPart} · hours not set`;
  }
  return `${dayPart} · ${to12h(start)} – ${to12h(end)}`;
}
