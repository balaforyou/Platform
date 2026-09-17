import './StatusPill.css';

export type BookingStatusValue = 'CONFIRMED' | 'HELD' | 'CANCELLED' | 'CHECKED_IN' | 'RELEASED_NO_SHOW';

interface StatusPillProps {
  status: BookingStatusValue;
}

// F-235 Phase 0: centralizes BookingHistory.tsx's existing getStatusBadge color/label mapping.
// Matches the real `BookingStatus` Prisma enum exactly (5 values) -- the handover's original
// spec (claude/guestPWA2/05-*.md §3) only listed 4 and omitted RELEASED_NO_SHOW, which
// BookingHistory.tsx already renders today ("Expired", neutral tokens); added here as
// Correction 2 (see plan) rather than silently shipping a StatusPill that can't represent a
// real, currently-displayed status. Light/dark colors live in StatusPill.css, keyed by
// data-status, since CSS custom properties can't be swapped per-theme from inline styles alone.
const LABELS: Record<BookingStatusValue, string> = {
  CONFIRMED: 'Confirmed',
  HELD: 'Hold Pending',
  CANCELLED: 'Cancelled',
  CHECKED_IN: 'Checked In',
  RELEASED_NO_SHOW: 'Expired',
};

export default function StatusPill({ status }: StatusPillProps) {
  return (
    <span className="gpwa-status-pill px-2.5 py-1 rounded-full text-[10px] font-bold font-mono uppercase" data-status={status}>
      {LABELS[status]}
    </span>
  );
}
