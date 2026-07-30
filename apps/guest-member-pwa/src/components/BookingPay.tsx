import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '@badminton/ui-shared';
import { useAuth } from '@badminton/ui-shared';
import { Smartphone, Activity, HelpCircle, ShieldCheck } from 'lucide-react';

export default function BookingPay() {
  const { bookingId } = useParams();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<any>(null);
  const [intent, setIntent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

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

      // Call secure server-side webhook simulation endpoint
      await apiRequest('/payment/payments/test/simulate-capture', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({ bookingId }),
      });

      // Optimistic redirect to confirmation screen
      navigate(`/bookings/${bookingId}/confirmation`);
    } catch (err: any) {
      setError(err.message || 'Simulation payment capture failed.');
    } finally {
      setPaying(false);
    }
  };

  const handleRazorpayCheckout = () => {
    if (!intent || !booking) return;

    // Load Razorpay Standard Checkout SDK
    const options = {
      key: 'rzp_test_mockkey', // Razorpay test API key
      amount: intent.amount,
      currency: 'INR',
      name: 'Badminton Hub',
      description: 'Court Booking Payment',
      order_id: intent.gatewayRef.startsWith('pay_') ? undefined : intent.gatewayRef,
      handler: function (response: any) {
        console.log('Razorpay success:', response);
        // Redirect client-side for optimistic feedback
        navigate(`/bookings/${bookingId}/confirmation`);
      },
      prefill: {
        contact: booking.phone || '',
      },
      theme: {
        color: '#e11d48',
      }
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white">
        <Activity className="h-10 w-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-gray-400 text-sm font-medium">Securing payment gateway...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-white p-4">
        <HelpCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold">Failed to load booking details</h3>
        <p className="text-gray-400 text-sm mt-1 text-center max-w-md">{error}</p>
        <button
          onClick={() => navigate('/bookings/my')}
          className="mt-4 py-2 px-6 bg-white/5 border border-white/10 rounded-xl text-xs hover:bg-white/10"
        >
          View Bookings
        </button>
      </div>
    );
  }

  const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1');

  return (
    <div className="flex-1 max-w-md w-full mx-auto px-4 py-10 space-y-6 text-white">
      <div className="space-y-1 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight font-outfit">
          Complete <span className="text-[var(--brand-primary)]">Checkout</span>
        </h2>
        <p className="text-gray-400 text-xs">
          Your court slot is held for 5 minutes. Select a payment method below.
        </p>
      </div>

      {/* Booking Summary */}
      <div className="bg-white/5 border border-white/5 p-6 rounded-2xl space-y-4">
        <h3 className="text-sm font-bold font-outfit text-gray-300 uppercase tracking-wider">
          Booking Summary
        </h3>
        
        <div className="space-y-2 text-xs text-gray-400 font-mono">
          <div className="flex justify-between">
            <span>Booking ID:</span>
            <span className="text-gray-200">{booking.id.slice(0, 8)}...</span>
          </div>
          <div className="flex justify-between">
            <span>Slot Date:</span>
            <span className="text-gray-200">
              {new Date(booking.window?.startTime).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Slot Time:</span>
            <span className="text-gray-200">
              {new Date(booking.window?.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(booking.window?.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Total Players:</span>
            <span className="text-gray-200">{1 + (booking.players?.length || 0)} Players</span>
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 flex justify-between items-end">
          <span className="text-sm font-bold text-gray-300 font-outfit">Amount to Pay:</span>
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
            className="w-full bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl flex items-center justify-between text-left group transition-all"
            id="simulate-success-pay-btn"
          >
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Simulate Payment (Dev)</div>
                <div className="text-[10px] text-gray-400">Triggers secure server-side signature webhook</div>
              </div>
            </div>
            {paying ? (
              <Activity className="h-4 w-4 animate-spin text-emerald-400" />
            ) : (
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-mono font-bold">Local</span>
            )}
          </button>
        )}

        {/* Real SDK trigger */}
        <button
          onClick={handleRazorpayCheckout}
          className="w-full bg-white/5 hover:bg-white/10 border border-white/5 p-4 rounded-xl flex items-center justify-between text-left group transition-all"
          id="real-razorpay-btn"
        >
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Razorpay Standard checkout</div>
              <div className="text-[10px] text-gray-400 font-medium">UPI / Card / Netbanking</div>
            </div>
          </div>
          <span className="text-xs bg-white/5 text-gray-400 group-hover:text-white px-2 py-0.5 rounded font-semibold transition-colors">SDK</span>
        </button>
      </div>
    </div>
  );
}
