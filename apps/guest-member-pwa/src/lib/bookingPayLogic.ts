// Extracted from BookingPay.tsx (F-308/F-309 evidence pass) so this logic can be exercised by a
// real unit test -- no behavior change, same values the component previously inlined.

export function buildRazorpayPrefill(
  user: { phone?: string; displayName?: string; name?: string; email?: string } | null | undefined,
) {
  return {
    prefill: {
      contact: user?.phone || '',
      name: user?.displayName || user?.name || user?.email || undefined,
    },
    readonly: { contact: true as const },
  };
}

export function resolveConfirmedRedirect(bookingId: string, status: string) {
  if (status !== 'CONFIRMED') return null;
  return { to: `/bookings/${bookingId}/confirmation`, options: { replace: true as const } };
}
