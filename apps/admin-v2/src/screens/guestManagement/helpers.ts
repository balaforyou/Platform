/**
 * F-220: display/formatting helpers ported verbatim from admin-web's `main.tsx`.
 */

export const weekdayOptions = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
];

export function formatDaysOfWeek(daysOfWeek: string) {
  return daysOfWeek
    .split(',')
    .map((day) => {
      const trimmed = day.trim();
      return weekdayOptions.find((option) => option.value === trimmed)?.label || trimmed;
    })
    .join(', ');
}

// F-267: a bare "HH:mm" wall-clock string, not an instant -- no date or timezone to convert
// against, so a plain hour/minute parse is the right shape here, not the ISO-based
// formatHourLabel/formatSlotLabel (reservationHelpers.ts), which are built for real
// AvailabilityWindow instances and would need an arbitrary placeholder Date to call on pattern
// data at all.
export function formatWallClockTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeRange(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return 'Closed';
  return `${formatWallClockTime(startTime)} - ${formatWallClockTime(endTime)}`;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const resourcePoolFieldLabels: Record<string, string> = {
  name: 'Pool Name',
  capacity: 'Capacity',
  minOccupancy: 'Min. Occupancy',
  minBookingDurationMinutes: 'Min. Booking Duration (minutes)',
  defaultRate: 'Default Rate (₹)',
  pricingMode: 'Pricing Mode',
  guestAccessCutoffMinutes: 'Guest Access Cutoff (minutes)',
  lowOccupancyThresholdPct: 'Low-Occupancy Threshold (%)',
};

/** owner sees every branch; branch_manager:<id> sees only the branches its roles scope it to. */
export const branchScopes = (roles: string[] = []) =>
  roles
    .filter((role) => role.startsWith('branch_manager:'))
    .map((role) => role.split(':')[1])
    .filter(Boolean);
