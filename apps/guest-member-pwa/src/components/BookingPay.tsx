import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, formatBookingReference } from '@badminton/ui-shared';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { Smartphone, Activity, MapPin, ArrowLeft, ShieldCheck, ShieldAlert } from 'lucide-react';

export default function BookingPay() {
  const { bookingId } = useParams();
  const { accessToken, user } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<any>(null);
  const [intent, setIntent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  // F-163: two genuinely different failures were previously funnelled into one state, and the
  // render guard below turns any non-null value into a full-page takeover.
  //
  //   error        FATAL. The booking or the payment intent could not be loaded, so there is
  //                nothing to pay for and the page cannot proceed. Taking over the page is right.
  //   paymentError RECOVERABLE. An attempt failed but the customer can simply try again. Razorpay
  //                emits payment.failed for a failed ATTEMPT while its checkout stays open, so
  //                replacing the page here removed the retry button out from under a customer who
  //                was still mid-payment, and the page only "recovered" because a later success
  //                navigated away. Proven on the deployed app before this change.
  //
  // Splitting them also fixes the copy defect without rewording anything: once only genuine load
  // failures reach the screen below, its "Failed to load booking details" heading is accurate. It
  // previously sat above messages like "Your payment was declined by the bank".
  //
  // Shape and clearing discipline are copied from CourtBooking's bookingError (CourtBooking.tsx:323
  // for the banner, :122 for clearing on each new attempt) rather than invented, so the app has one
  // way of showing a recoverable error instead of two subtly different ones.
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;

    const initPayment = async () => {
      try {
        setLoading(true);
        // 1. Fetch booking details to display summary
        const bookingRes = await apiRequest<any>(`/slot-engine/bookings/${bookingId}`, {
          token: accessToken,
        });
        setBooking(bookingRes);

        // 2. Create or fetch payment intent
        const intentRes = await apiRequest<any>('/payment/intents', {
          method: 'POST',
          token: accessToken,
          body: JSON.stringify({ bookingId }),
        });
        setIntent(intentRes);
      } catch (err: any) {
        setError(err.message || 'Failed to initialize payment process.');
      } finally {
        setLoading(false);
      }
    };

    initPayment();
  }, [bookingId, accessToken]);

  const handleMockPayment = async () => {
    try {
      setPaying(true);
      setError(null);
      setPaymentError(null);

      // Call secure server-side webhook simulation endpoint
      await apiRequest('/payment/payments/test/simulate-capture', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ bookingId }),
      });

      // Optimistic redirect to confirmation screen
      navigate(`/bookings/${bookingId}/confirmation`);
    } catch (err: any) {
      setPaymentError(err.message || 'Simulation payment capture failed.');
    } finally {
      setPaying(false);
    }
  };

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayCheckout = async () => {
    if (!intent || !booking) return;
    setPaying(true);
    // F-163: clearing on each new attempt is the half CourtBooking has (:122) and this screen did
    // not. Without it a banner from a previous failed attempt would still be on screen during the
    // retry that succeeds.
    setPaymentError(null);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setPaymentError('Failed to load Razorpay SDK. Please check your internet connection.');
      setPaying(false);
      return;
    }

    try {
      // 1. Call create-order backend API to create a real Razorpay Order
      const orderRes = await apiRequest<any>('/payment/create-order', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({
          bookingId,
          amount: intent.amount,
          currency: 'INR',
          receipt: bookingId,
        }),
      });

      const orderId = orderRes.order_id;
      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID || import.meta.env.VITE_RAZORPAY_KEY;
      if (!razorpayKey) {
        setError('Razorpay key is not configured. Please contact support.');
        setPaying(false);
        return;
      }

      // 2. Open standard checkout overlay with order_id
      const options = {
        key: razorpayKey,
        amount: orderRes.amount,
        currency: orderRes.currency,
        // F-192 Slice E: the checkout overlay's merchant name + theme were hardcoded
        // ('Badminton Hub' / '#e11d48') -- the one place the payment sheet left the tenant's
        // brand. Both now come from the resolved tenant. themeColor is the exact hex the tenant
        // configured; the getComputedStyle fallback covers the (unreachable -- TenantProvider
        // blocks children until resolved) missing-tenant case.
        name: tenant?.appName || tenant?.name || 'Court Booking',
        description: 'Court Booking Payment',
        order_id: orderId,
        handler: async function (response: any) {
          try {
            setPaying(true);
            // 3. Send all three validation fields to verify endpoint
            await apiRequest('/payment/verify-payment', {
              method: 'POST',
              token: accessToken,
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            // Navigate to confirmation page
            navigate(`/bookings/${bookingId}/confirmation`);
          } catch (err: any) {
            // F-165, deliberately UNCHANGED here. This fires when our own verify call fails, by
            // which point Razorpay's checkout has already closed and the payment may well have
            // been captured by the webhook regardless — DECISION-006 makes those two paths
            // independent. So this message can be shown for a payment that actually succeeded.
            // Whether it should instead route to the confirmation screen and let its poll resolve
            // the truth is a real behaviour change, unreported and unproven, so it is left exactly
            // as it was rather than riding along with F-163.
            setError(err.message || 'Signature verification failed.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
            console.log('Payment modal dismissed by user');
          }
        },
        prefill: {
          contact: booking.phone || '',
        },
        theme: {
          color:
            tenant?.themeColor ||
            getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() ||
            '#e11d48',
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (resp: any) {
        // F-163: this is the event that caused the reported flicker. Razorpay emits it for a failed
        // ATTEMPT and leaves its checkout open so the customer can pick another method, so it must
        // never take over the page. It is recoverable by definition.
        setPaymentError(resp.error?.description || 'Payment failed. Please try again.');
        setPaying(false);
      });
      rzp.open();
    } catch (err: any) {
      // Recoverable: the order call failed, the customer can press pay again.
      setPaymentError(err.message || 'Failed to create payment order.');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-[14px]" style={{ background: 'var(--color-bg)' }}>
        <style>{'@keyframes booking-pay-spin { to { transform: rotate(360deg); } }'}</style>
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '999px',
            border: '4px solid var(--color-accent-200)',
            borderTopColor: 'var(--color-accent-700)',
            animation: 'booking-pay-spin 1s linear infinite',
          }}
        />
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '14px', color: 'var(--color-neutral-600)' }}>
          Securing payment gateway&hellip;
        </p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-4 gap-3 text-center" style={{ background: 'var(--color-bg)' }}>
        <span
          className="flex items-center justify-center"
          style={{ width: '48px', height: '48px', borderRadius: '999px', background: 'var(--color-neutral-200)', color: 'var(--color-neutral-600)' }}
        >
          <MapPin className="h-6 w-6" />
        </span>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '19px', color: 'var(--color-text)' }}>
          Couldn&rsquo;t load booking details
        </h3>
        <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--color-neutral-600)', maxWidth: '260px' }}>
          {error}
        </p>
        <button
          onClick={() => navigate('/bookings/my')}
          style={{
            marginTop: '4px',
            minHeight: '44px',
            padding: '0 20px',
            background: '#fff',
            border: '1px solid var(--color-neutral-300)',
            borderRadius: '14px',
            fontFamily: 'var(--font-body-organic)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--color-text)',
          }}
        >
          View bookings
        </button>
      </div>
    );
  }

  const isDev = import.meta.env.DEV;
  const payAmount = Number(intent?.amount ? intent.amount / 100 : booking.price);

  return (
    // text-ink here is the F-190 Slice 3 wrapper default; every text element below sets its own
    // colour, so this inherited base is inert -- kept as-is so the Slice 3-migrated summary card /
    // YOUR NUMBER / pay button stay byte-identical.
    <div className="flex-1 w-full mx-auto text-ink" style={{ maxWidth: '480px' }}>
      {/* F-192 Slice E: the F-190 Slice 3 dark header shell is removed -- the shared Layout band
          (Slice B) already carries the wordmark + "CONFIRM AND PAY" + account control. Per
          wireframe frame 09 the back control becomes a "Back to slots" pill in the page.
          navigate(-1) is plain browser-back semantics, unchanged. */}
      <div className="px-5 py-6 space-y-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 transition-colors"
          style={{
            minHeight: '44px',
            padding: '0 16px 0 12px',
            background: 'var(--color-neutral-200)',
            border: '1px solid var(--color-neutral-300)',
            borderRadius: '999px',
            fontFamily: 'var(--font-body-organic)',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--color-text)',
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to slots</span>
        </button>

        {/* Booking Summary */}
        <div style={{ background: '#fff', border: '1px solid var(--color-neutral-300)', borderRadius: '16px', overflow: 'hidden' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
            {/* F-037: this showed `booking.id.slice(0, 8)` under the label "Booking ID" — a
                truncated raw UUID, meaningless to the customer AND incomplete to quote back.
                Display only — booking.id is unchanged in the URL and in every API call below. */}
            <div className="text-[15px] font-bold" style={{ color: 'var(--color-text)' }}>
              {formatBookingReference(booking.id)}
            </div>
            <div className="text-[12.5px]" style={{ color: 'var(--color-neutral-700)' }}>
              {new Date(booking.window?.startTime).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} &middot;{' '}
              {new Date(booking.window?.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
              {new Date(booking.window?.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {/* F-187: this is the screen shown immediately before payment, right after the
                duration stepper — showing only the first hour here next to a price that already
                correctly sums every hour (F-183's resolvedPrice) would read as being charged
                double for a single hour, worse than the same gap on the confirmation screen since
                it sits directly on the pay decision. Court row deliberately skipped -- F-189's own
                decision on courtSlotIndex display, not this slice's. */}
            {Array.isArray(booking.childBookings) && booking.childBookings.length > 0 && (
              <div id="pay-additional-windows" className="text-[12.5px]" style={{ color: 'var(--color-neutral-700)' }}>
                {booking.childBookings
                  .slice()
                  .sort((a: any, b: any) => new Date(a.window.startTime).getTime() - new Date(b.window.startTime).getTime())
                  .map((child: any) => (
                    <div key={child.id}>
                      + {new Date(child.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {new Date(child.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid var(--color-neutral-200)' }}>
            <span className="text-[13.5px]" style={{ color: 'var(--color-neutral-700)' }}>Players</span>
            <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-text)' }}>{1 + (booking.players?.length || 0)}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-[13.5px] font-bold" style={{ color: 'var(--color-neutral-700)' }}>Amount to Pay</span>
            <span className="text-xl font-extrabold font-mono" style={{ color: 'var(--color-accent-700)' }} id="pay-amount-display">
              ₹{Number(booking.price)}
            </span>
          </div>
        </div>

        {/* F-190 Slice 3: "YOUR NUMBER" -- real data, zero new fetch. booking.phone (used below in
            Razorpay's prefill.contact) is confirmed dead: Booking has no phone column and
            GET /bookings/:id never joins one in, so that reference has always silently resolved to
            undefined. useAuth().user.phone is the JWT's own phone claim, already decoded into
            AuthContext -- real, already-available, no new request. "Verified" is accurate, not
            decorative: every path to an access token requires phone OTP first (direct phone login,
            or Google-mock login's own PHONE_VERIFICATION_REQUIRED gate). */}
        {user?.phone && (
          <div className="flex flex-col gap-2">
            <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
              YOUR NUMBER
            </div>
            <div
              className="flex items-center gap-2.5 px-4"
              style={{ border: '1px solid var(--color-neutral-300)', background: '#fff', borderRadius: '14px', minHeight: '52px' }}
            >
              <span className="text-[14px] font-bold" style={{ color: 'var(--color-text)' }}>{user.phone}</span>
              <span
                className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: 'var(--color-accent-2-800)', background: 'var(--color-accent-2-200)' }}
              >
                Verified
              </span>
            </div>
            {/* Generic, non-numeric -- not the wireframe's hardcoded "Free cancellation until 3:00
                PM today". The real tiered policy was already shown one screen earlier on
                CourtBooking.tsx; re-fetching pool/BookingRule here for a value the guest just saw
                seconds ago isn't worth a new fetch for this slice. */}
            <p className="text-[11.5px]" style={{ color: 'var(--color-neutral-700)' }}>
              Your booking confirmation and cancellation link go to this number.
            </p>
          </div>
        )}

        {/* Payment methods */}
        <div className="space-y-3">
          {/* Mock Dev Method -- restyle only, unchanged position/behavior/dev-gating. */}
          {isDev && (
            <button
              onClick={handleMockPayment}
              disabled={paying}
              className="w-full p-4 flex items-center justify-between text-left transition-colors"
              style={{
                background: 'var(--color-accent-2-100)',
                border: '1px solid var(--color-accent-2-300)',
                borderRadius: '16px',
                fontFamily: 'var(--font-body-organic)',
              }}
              id="simulate-success-pay-btn"
            >
              <div className="flex items-center space-x-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--color-accent-2-200)', color: 'var(--color-accent-2-800)' }}
                >
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Simulate payment (dev)</div>
                  <div className="text-[10px]" style={{ color: 'var(--color-neutral-600)' }}>Triggers the server-side signature webhook</div>
                </div>
              </div>
              {paying ? (
                <Activity className="h-4 w-4 animate-spin" style={{ color: 'var(--color-accent-2-800)' }} />
              ) : (
                <span
                  className="text-xs px-2 py-0.5 rounded font-mono font-bold"
                  style={{ background: 'var(--color-accent-2-300)', color: 'var(--color-accent-2-800)' }}
                >
                  Local
                </span>
              )}
            </button>
          )}

          {/* F-163: recoverable failures render here, beside the payment methods that can be
              retried, instead of replacing the page. Markup matches CourtBooking.tsx's bookingError
              banner so the app shows a recoverable error one way rather than two. */}
          {paymentError && (
            <div
              className="p-3 flex items-start space-x-2 text-xs"
              style={{
                background: 'var(--color-neutral-100)',
                border: '1px solid var(--color-neutral-300)',
                borderRadius: '14px',
                color: 'var(--color-destructive)',
              }}
              id="payment-error-banner"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{paymentError}</span>
            </div>
          )}

          {/* F-190 Slice 3: one real button, not two -- UPI needs no separate button or
              config.display work, Razorpay's Standard Checkout already surfaces it as a selectable
              method inside the one overlay and hands off to the device's UPI apps (Intent)
              directly. handleRazorpayCheckout is entirely unchanged -- same order-creation/verify/
              navigate flow, same unrestricted options. Restyled to the wireframe's actual
              payment-CTA color, a deliberate departure from 3a/3b's accent-700: accent-400
              background, neutral-900 text, 54px height. Label is dynamic (real amount), matching
              the wireframe's own {{pay.payLabel}} convention minus the fake UPI-app-name suffix it
              originally paired with. #pay-amount-display above is not duplicated here -- the
              button repeating the amount is the wireframe's own intentional redundancy, not a
              mistake to fix. */}
          <button
            onClick={handleRazorpayCheckout}
            disabled={paying}
            className="w-full min-h-[54px] rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-accent-400)', color: 'var(--color-neutral-900)', border: 'none' }}
            id="real-razorpay-btn"
          >
            {paying ? (
              <Activity className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Smartphone className="h-4 w-4" />
                <span>Pay ₹{payAmount}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
