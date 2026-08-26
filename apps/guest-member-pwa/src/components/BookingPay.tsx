import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, formatBookingReference } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { Smartphone, Activity, HelpCircle, ShieldCheck, ShieldAlert } from 'lucide-react';

export default function BookingPay() {
  const { bookingId } = useParams();
  const { accessToken } = useAuth();
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
        name: 'Badminton Hub',
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
          color: '#e11d48',
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-ink-muted text-sm font-medium">Securing payment gateway...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-ink p-4">
        <HelpCircle className="h-12 w-12 text-red-600 mb-4" />
        <h3 className="text-lg font-bold">Failed to load booking details</h3>
        <p className="text-ink-muted text-sm mt-1 text-center max-w-md">{error}</p>
        <button
          onClick={() => navigate('/bookings/my')}
          className="mt-4 py-2 px-6 bg-surface-mint border border-edge-strong rounded-xl text-xs hover:bg-edge"
        >
          View Bookings
        </button>
      </div>
    );
  }

  const isDev = import.meta.env.DEV;

  return (
    <div className="flex-1 max-w-md w-full mx-auto px-4 py-10 space-y-6 text-ink">
      <div className="space-y-1 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit">
          Complete <span className="text-[var(--brand-primary)]">Checkout</span>
        </h2>
        <p className="text-ink-muted text-xs">
          Your court slot is held for 5 minutes. Select a payment method below.
        </p>
      </div>

      {/* Booking Summary */}
      <div className="bg-surface-mint border border-edge p-6 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold font-outfit text-ink-muted uppercase tracking-wider">
          Booking Summary
        </h3>
        
        <div className="space-y-2 text-xs text-ink-muted font-mono">
          {/* F-037: this showed `booking.id.slice(0, 8)` under the label "Booking ID" — a truncated
              raw UUID, which is meaningless to the customer AND incomplete to quote back. The label
              changes with it: calling the value an "ID" is what made showing a raw identifier feel
              appropriate. Display only — booking.id is unchanged in the URL and in every API call
              below. */}
          <div className="flex justify-between">
            <span>Booking Reference:</span>
            <span className="text-ink">{formatBookingReference(booking.id)}</span>
          </div>
          <div className="flex justify-between">
            <span>Slot Date:</span>
            <span className="text-ink">
              {new Date(booking.window?.startTime).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Slot Time:</span>
            <div className="text-ink text-right">
              <div>
                {new Date(booking.window?.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(booking.window?.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {/* F-187: this is the screen shown immediately before payment, right after the
                  duration stepper — showing only the first hour here next to a price that
                  already correctly sums every hour (F-183's resolvedPrice) would read as being
                  charged double for a single hour, worse than the same gap on the confirmation
                  screen since it sits directly on the pay decision. */}
              {Array.isArray(booking.childBookings) && booking.childBookings.length > 0 && (
                <div id="pay-additional-windows">
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
          </div>
          <div className="flex justify-between">
            <span>Total Players:</span>
            <span className="text-ink">{1 + (booking.players?.length || 0)} Players</span>
          </div>
        </div>

        <div className="pt-4 border-t border-edge flex justify-between items-end">
          <span className="text-sm font-bold text-ink-muted font-outfit">Amount to Pay:</span>
          <span className="text-2xl font-extrabold text-[var(--brand-primary)] font-mono" id="pay-amount-display">
            ₹{Number(booking.price)}
          </span>
        </div>
      </div>

      {/* Payment methods list */}
      <div className="space-y-3">
        {/* Mock Dev Method */}
        {isDev && (
          <button
            onClick={handleMockPayment}
            disabled={paying}
            className="w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 p-4 rounded-xl flex items-center justify-between text-left group transition-all"
            id="simulate-success-pay-btn"
          >
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-ink">Simulate Payment (Dev)</div>
                <div className="text-[10px] text-ink-muted">Triggers secure server-side signature webhook</div>
              </div>
            </div>
            {paying ? (
              <Activity className="h-4 w-4 animate-spin text-emerald-700" />
            ) : (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono font-bold">Local</span>
            )}
          </button>
        )}

        {/* F-163: recoverable failures render here, beside the payment methods that can be retried,
            instead of replacing the page. Markup matches CourtBooking.tsx:323 so the app shows a
            recoverable error one way rather than two. */}
        {paymentError && (
          <div
            className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-start space-x-2 text-xs text-red-700"
            id="payment-error-banner"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{paymentError}</span>
          </div>
        )}

        {/* Real SDK trigger */}
        <button
          onClick={handleRazorpayCheckout}
          className="w-full bg-surface-mint hover:bg-edge border border-edge p-4 rounded-xl flex items-center justify-between text-left group transition-all"
          id="real-razorpay-btn"
        >
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-ink">Razorpay Standard checkout</div>
              <div className="text-[10px] text-ink-muted font-medium">UPI / Card / Netbanking</div>
            </div>
          </div>
          <span className="text-xs bg-surface-mint text-ink-muted group-hover:text-ink px-2 py-0.5 rounded font-semibold transition-colors">SDK</span>
        </button>
      </div>
    </div>
  );
}
