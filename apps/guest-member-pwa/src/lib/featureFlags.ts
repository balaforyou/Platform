// F-325 (re-scoped, 8 Oct 2026): the guest "I'm Here" check-in is hidden because no business logic is
// attached to check-in yet. ONE named constant gates it, so bringing it back is a one-line change:
// set SHOW_CHECK_IN to true. Hidden: the BookingHistory button (and with it the confirm dialog, which
// can only be opened from that button) plus the two copy lines that mention check-in. Not touched: the
// backend (POST /bookings/:id/check-in), the admin apps, and the "Checked in" status pill for bookings
// already in that state. Reopen the UI side of F-325 (the missing lower bound on isCheckInOpen, and the
// backend time gate) when check-in gets real logic.
export const SHOW_CHECK_IN = false;
