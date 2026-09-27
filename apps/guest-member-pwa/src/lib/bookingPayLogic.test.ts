import { describe, expect, it } from 'vitest';
import { buildRazorpayPrefill, resolveConfirmedRedirect } from './bookingPayLogic';

describe('buildRazorpayPrefill', () => {
  it('prefills the verified phone read-only, with no name when none is set', () => {
    const result = buildRazorpayPrefill({ phone: '+919812399099' });
    expect(result.prefill.contact).toBe('+919812399099');
    expect(result.readonly.contact).toBe(true);
    expect(result.prefill.name).toBeUndefined();
  });

  it('falls back through displayName || name || email for the prefill name', () => {
    const result = buildRazorpayPrefill({ phone: '+919812399099', displayName: 'Priya' });
    expect(result.prefill.name).toBe('Priya');
  });
});

describe('resolveConfirmedRedirect', () => {
  it('redirects to confirmation with a history-replace when the booking is CONFIRMED', () => {
    expect(resolveConfirmedRedirect('abc123', 'CONFIRMED')).toEqual({
      to: '/bookings/abc123/confirmation',
      options: { replace: true },
    });
  });

  it('does nothing for a non-CONFIRMED status', () => {
    expect(resolveConfirmedRedirect('abc123', 'PENDING')).toBeNull();
  });
});
