import LoadingState from './ui/LoadingState';

// F-235 Phase 0: compiling placeholder only -- the real merged Branch Select + Court Booking
// screen (venue-switcher chip, About badge, day-picker, slot grid, sticky reserve bar) is a
// future per-screen slice, not part of this Phase 0 (tokens/theming/components/shell). This
// route (`/book`) replaces the current live `/branches`, `/branches/:id`, `/branches/:id/about`,
// `/branches/:id/book/:poolId` routes per claude/guestPWA2/05-*.md §4.1 -- those routes' real,
// working navigation (from MainDashboard, BranchSelect.tsx, BranchDashboard.tsx,
// CourtBooking.tsx) is deliberately not rewired here (flagged in the implementation report,
// per the reviewed decision to collapse now and accept the interim breakage).
export default function BranchBooking() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingState variant="full" label="Court booking is being rebuilt for v2" />
    </div>
  );
}
