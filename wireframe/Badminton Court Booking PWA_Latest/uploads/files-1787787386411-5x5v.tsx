import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { ChevronRight, RefreshCw, Mail, AlertCircle, ShieldCheck } from 'lucide-react';

// F-190 Slice 1: shared button styling for 3a/3b's 54px touch-first controls. ds.css's own
// .btn-primary/.btn-secondary classes don't exist in this app's CSS (100% Tailwind here) --
// these replicate their real color/hover/active/focus-visible behavior via arbitrary-value
// classes against Slice 0's tokens instead of a literal class name.
const primaryBtn =
  'w-full min-h-[54px] rounded-[14px] border-none cursor-pointer flex items-center justify-center gap-2 font-bold text-[15px] transition-colors ' +
  'bg-[var(--color-accent-700)] text-[var(--color-accent-100)] hover:bg-[var(--color-accent-800)] active:bg-[var(--color-accent-900)] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-700)] ' +
  'disabled:opacity-45 disabled:cursor-not-allowed';

const secondaryBtn =
  'w-full min-h-[54px] rounded-[14px] flex items-center justify-center gap-[11px] font-bold text-[15px] cursor-pointer bg-white ' +
  'text-[var(--color-text)] border border-[var(--color-neutral-300)] hover:bg-[var(--color-neutral-100)] active:bg-[var(--color-neutral-200)] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-700)]';

export default function LoginScreen() {
  const { tenant } = useTenant();
  const { requestOtp, verifyOtp, verifyGoogleMock, isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For Dev Mock Google Sign In
  const [showGoogleMockInput, setShowGoogleMockInput] = useState(false);
  const [mockEmail, setMockEmail] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 10) {
      setError('Please enter a valid mobile number.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await requestOtp(phone);
      setOtpSent(true);
      console.log('OTP request successfully processed.');
    } catch (err: any) {
      setError(err.message || 'Failed to request OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim().length < 4) {
      setError('Please enter a valid verification code.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await verifyOtp(phone, code);
      console.log('Login successful via OTP.');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleMockLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mockEmail || !mockEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await verifyGoogleMock(mockEmail);
      console.log('Login successful via mock Google Account.');
    } catch (err: any) {
      // F-187: identity-auth already returns a readable err.message for both codes
      // (e.g. "Google authentication is restricted to members only.") — these two branches
      // exist to redirect the guest toward a path that actually works, not to reword an
      // otherwise-raw string.
      if (err.code === 'GOOGLE_LOGIN_ONLY_FOR_MEMBERS') {
        setError('Google sign-in is for members only. Please use phone verification below instead.');
      } else if (err.code === 'PHONE_VERIFICATION_REQUIRED') {
        setError('This Google account needs phone verification first. Please sign in with your phone number below.');
      } else {
        setError(err.message || 'Google mock login failed.');
      }
    } finally {
      setLoading(false);
      setShowGoogleMockInput(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-alt via-surface-mint to-surface-alt px-4">
        <div className="relative w-full max-w-md bg-surface backdrop-blur-xl rounded-3xl p-8 border border-edge-strong shadow-2xl text-center text-ink">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-24 rounded-full bg-gradient-to-tr from-brand-primary to-rose-400 p-1 shadow-lg shadow-brand-primary/30">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-surface-alt">
              <ShieldCheck className="h-12 w-12 text-brand-primary animate-pulse" />
            </div>
          </div>

          <div className="mt-12 mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Welcome to {tenant?.appName}!</h2>
            <p className="text-ink-muted text-sm mt-1">Logged in successfully.</p>
          </div>

          <div className="bg-surface-mint rounded-2xl p-6 border border-edge text-left mb-8 space-y-3 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-ink-muted">User ID:</span>
              <span className="text-ink-muted font-semibold">{user?.userId || user?.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Tenant ID:</span>
              <span className="text-ink-muted">{user?.tenantId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Roles:</span>
              <span className="text-brand-primary font-semibold">
                {user?.roles?.length ? user.roles.join(', ') : 'member'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full py-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium transition-all shadow-lg shadow-rose-600/20 active:scale-[0.98]"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Shared error banner (F-187's messages render through here unchanged) -- used by all three
  // screen states below.
  const errorBanner = error && (
    <div
      className="flex items-center gap-2 border p-4 text-sm"
      style={{
        background: '#fee2e2',
        borderColor: '#fecaca',
        color: '#991b1b',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <AlertCircle className="h-5 w-5 shrink-0" style={{ color: '#b91c1c' }} />
      <span>{error}</span>
    </div>
  );

  if (showGoogleMockInput) {
    // Stage 3: no wireframe equivalent -- kept as its own centered card (not the 3a/3b
    // full-bleed header treatment), restyled with Slice 0's tokens for visual consistency.
    return (
      <div
        className="min-h-screen flex flex-col justify-center items-center px-4 py-8"
        style={{ background: 'var(--color-bg)' }}
      >
        <div
          className="w-full max-w-md flex flex-col gap-6 p-7"
          style={{ background: 'var(--color-neutral-100)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}
        >
          {errorBanner}
          <form onSubmit={handleGoogleMockLogin} className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <span
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-700)' }}
              >
                <Mail className="h-5 w-5" />
              </span>
              <div className="flex-1 flex justify-between items-center">
                <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
                  Google OAuth Simulation
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowGoogleMockInput(false);
                    setError(null);
                  }}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--color-accent-700)' }}
                >
                  Back
                </button>
              </div>
            </div>
            <p
              className="text-xs p-3"
              style={{ background: 'var(--color-neutral-200)', color: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)' }}
            >
              Simulates Google Single Sign-On (OAuth). Enter an email to verify membership or link phone.
            </p>

            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-neutral-700)' }}
              >
                Simulated Google Email
              </label>
              <input
                type="email"
                value={mockEmail}
                onChange={(e) => setMockEmail(e.target.value)}
                placeholder="member@example.com"
                className="w-full px-4 outline-none transition-colors border bg-white border-[var(--color-neutral-300)] focus:border-2 focus:border-[var(--color-accent-700)]"
                style={{ minHeight: '54px', borderRadius: '14px', color: 'var(--color-text)', fontSize: '15px' }}
              />
            </div>

            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <span>Simulate Token Verification</span>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (otpSent) {
    // 3b -- Verify (JBC Booking.dc.html:208-239)
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-neutral-100)' }}>
        <div className="flex-none flex items-center gap-3.5 p-5" style={{ background: 'var(--color-neutral-900)' }}>
          <button
            type="button"
            onClick={() => setOtpSent(false)}
            aria-label="Change number"
            className="h-11 w-11 flex items-center justify-center rounded-full border-none cursor-pointer bg-transparent"
          >
            <span
              className="h-[38px] w-[38px] rounded-full flex items-center justify-center text-[17px]"
              style={{ background: 'var(--color-neutral-800)', color: 'var(--color-neutral-100)' }}
            >
              ←
            </span>
          </button>
          <div className="text-base font-bold" style={{ color: 'var(--color-neutral-100)' }}>
            Verify your number
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-5 px-5 pt-7 pb-6 mx-auto w-full max-w-md">
          {errorBanner}

          <div className="flex flex-col gap-2">
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '28px', lineHeight: 1.15, color: 'var(--color-text)' }}>
              Enter the code
            </h2>
            <p style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--color-neutral-800)' }}>
              Sent by SMS to +91 {phone}.{' '}
              <button
                type="button"
                onClick={() => setOtpSent(false)}
                className="underline font-semibold bg-transparent border-none cursor-pointer p-0"
                style={{ color: 'var(--color-accent-700)' }}
              >
                Wrong number?
              </button>
            </p>
          </div>

          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              {/* F-190 Slice 1: kept as one input rather than rebuilt as 6 separate boxes -- a
                  pure-CSS 6-box illusion needs per-character divider alignment that shifts as the
                  user types, which is fragile for a cosmetic effect and risks the 8 e2e specs that
                  depend on this exact placeholder. This still carries the wireframe's "empty vs
                  active box" states via border color/width instead. */}
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 4 or 6 digit OTP"
                className="w-full text-center font-bold text-xl tracking-widest outline-none transition-colors border bg-white border-[var(--color-neutral-300)] focus:border-2 focus:border-[var(--color-accent-700)]"
                style={{ minHeight: '60px', borderRadius: '14px', color: 'var(--color-text)' }}
              />
              <p className="text-center text-xs" style={{ color: 'var(--color-neutral-700)' }}>
                SMS OTP dev-fallback is active. Code is printed in the backend service logs.
              </p>
            </div>

            <button type="submit" disabled={loading} className={primaryBtn}>
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <span>Verify and continue</span>
                  <ShieldCheck className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          {/* F-190 Slice 1: real-mechanism copy, not the wireframe's fabricated "locked for 15
              minutes" -- see services/identity-auth/src/index.ts:175-182 (3 requests/10min rate
              limit) and :279 (3-attempt invalidation). The wireframe's "one booking per number per
              day" line is dropped entirely: this screen has no resourcePoolId to read the real
              maxDailyBookingsPerGuest from, and the correct number already renders where it
              belongs (CourtBooking.tsx, F-187). */}
          <div
            className="mt-auto rounded-2xl px-4 py-3.5"
            style={{ background: 'var(--color-accent-100)', color: 'var(--color-accent-800)', fontSize: '12.5px', lineHeight: 1.55 }}
          >
            Three wrong codes and you'll need to request a new one — you can request up to 3 codes every 10 minutes.
          </div>
        </div>
      </div>
    );
  }

  // 3a -- Sign in (JBC Booking.dc.html:168-205)
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <div
        className="flex-none flex flex-col justify-between px-6 pt-8 pb-6 mx-auto w-full max-w-md"
        style={{
          minHeight: '290px',
          background: 'repeating-linear-gradient(115deg, var(--color-accent-2-700) 0 12px, var(--color-accent-2-800) 12px 24px)',
        }}
      >
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '30px', color: 'var(--color-bg)' }}>
          {tenant?.appName}
        </div>
        <span
          className="self-start px-2.5 py-1.5 rounded-full text-[10.5px] font-semibold tracking-wide"
          style={{ fontFamily: 'var(--font-body-organic)', color: 'var(--color-accent-2-100)', background: 'rgba(32,30,29,0.55)' }}
        >
          court photo
        </span>
      </div>

      <div
        className="flex-1 flex flex-col gap-5 px-[22px] pt-7 pb-6 mx-auto w-full max-w-md -mt-6 rounded-t-[28px]"
        style={{ background: 'var(--color-neutral-100)' }}
      >
        {errorBanner}

        <div className="flex flex-col gap-2">
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '28px', lineHeight: 1.15, color: 'var(--color-text)' }}>
            Book a court at {tenant?.appName}
          </h2>
          <p style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--color-neutral-800)' }}>
            Sign in once so we know the courts are going to real players.
          </p>
        </div>

        <form onSubmit={handleRequestOtp} className="flex flex-col gap-[9px]">
          <div style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.09em', color: 'var(--color-neutral-700)' }}>
            GUEST · PHONE NUMBER
          </div>
          <div
            className="flex items-center gap-2.5 px-4"
            style={{ border: '1px solid var(--color-neutral-300)', background: '#fff', borderRadius: '14px', minHeight: '56px' }}
          >
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-neutral-700)' }}>+91</span>
            <span style={{ width: '1px', height: '22px', background: 'var(--color-neutral-300)' }} />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="99999 99999"
              className="flex-1 bg-transparent border-none outline-none"
              style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}
            />
          </div>
          <button type="submit" disabled={loading} className={primaryBtn}>
            {loading ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <span>Send me a code</span>
                <ChevronRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <span className="flex-1" style={{ height: '1px', background: 'var(--color-neutral-300)' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-neutral-700)' }}>or</span>
          <span className="flex-1" style={{ height: '1px', background: 'var(--color-neutral-300)' }} />
        </div>

        <div className="flex flex-col gap-[9px]">
          <button type="button" onClick={() => setShowGoogleMockInput(true)} className={secondaryBtn}>
            <span
              className="h-[22px] w-[22px] rounded-full shrink-0"
              style={{ background: 'repeating-linear-gradient(135deg, var(--color-neutral-300) 0 4px, var(--color-neutral-200) 4px 8px)' }}
            />
            <span>Continue with Google</span>
          </button>
          <div className="flex flex-col gap-0.5" style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
            <span>Members keep their booking history and skip the code next time.</span>
            {/* Not real Google OAuth (Chief's Q1 answer, F-187 kickoff) -- kept quiet but visible
                rather than dropped, so nobody mistakes this for a live integration. */}
            <span className="font-semibold" style={{ color: 'var(--color-neutral-500)' }}>
              [Dev Mock] — does not use real Google sign-in.
            </span>
          </div>
        </div>

        <div className="mt-auto" style={{ fontSize: '11.5px', lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
          By continuing you accept the court rules and cancellation policy.
        </div>
      </div>
    </div>
  );
}
