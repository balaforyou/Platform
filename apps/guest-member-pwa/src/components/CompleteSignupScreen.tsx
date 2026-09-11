import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { ChevronRight, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

// F-228 Step 3: reached only when a session is authenticated but the account has no phone on
// file yet (a brand-new Google signup — see main.tsx's ProtectedRoute and LoginScreen's
// post-login redirect, both keyed on `user?.phone`). Same visual language as LoginScreen's
// phone/OTP steps, driving requestOtp + attachPhone (F-228 Step 2's route) instead of verifyOtp.
const primaryBtn =
  'w-full min-h-[54px] rounded-[14px] border-none cursor-pointer flex items-center justify-center gap-2 font-bold text-[15px] transition-colors ' +
  'bg-[var(--color-accent-700)] text-[var(--color-accent-100)] hover:bg-[var(--color-accent-800)] active:bg-[var(--color-accent-900)] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-700)] ' +
  'disabled:opacity-45 disabled:cursor-not-allowed';

export default function CompleteSignupScreen() {
  const { tenant } = useTenant();
  const { requestOtp, attachPhone, logout } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err: any) {
      setError(err.message || 'Failed to request OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAttachPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.trim().length < 4) {
      setError('Please enter a valid verification code.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await attachPhone(phone, code);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const errorBanner = error && (
    <div
      className="flex items-center gap-2 border p-4 text-sm"
      style={{
        background: 'var(--color-neutral-100)',
        borderColor: 'var(--color-neutral-300)',
        color: 'var(--color-destructive)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <AlertCircle className="h-5 w-5 shrink-0" />
      <span>{error}</span>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-neutral-100)' }}>
      <div className="flex-none flex items-center justify-between" style={{ background: 'var(--color-neutral-900)', padding: '15px 18px' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '19px', color: 'var(--color-bg)' }}>
          {tenant?.appName || 'Courts'}
        </span>
        <span style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-neutral-400)' }}>
          ONE LAST STEP
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-5 px-5 pt-7 pb-6 mx-auto w-full max-w-md">
        {errorBanner}

        <div className="flex flex-col gap-2">
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '28px', lineHeight: 1.15, color: 'var(--color-text)' }}>
            {otpSent ? 'Enter the code' : 'Add your phone number'}
          </h2>
          <p style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--color-neutral-800)' }}>
            {otpSent ? (
              <>
                Sent by SMS to +91 {phone}.{' '}
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="underline font-semibold bg-transparent border-none cursor-pointer p-0"
                  style={{ color: 'var(--color-accent-700)' }}
                >
                  Wrong number?
                </button>
              </>
            ) : (
              'We use your phone number for booking confirmations and court check-in.'
            )}
          </p>
        </div>

        {otpSent ? (
          <form onSubmit={handleAttachPhone} className="flex flex-col gap-5">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 4 or 6 digit OTP"
              className="w-full text-center font-bold text-xl tracking-widest outline-none transition-colors border bg-white border-[var(--color-neutral-300)] focus:border-2 focus:border-[var(--color-accent-700)]"
              style={{ minHeight: '60px', borderRadius: '14px', color: 'var(--color-text)' }}
            />
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
        ) : (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-[9px]">
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
        )}

        <button
          type="button"
          onClick={() => logout()}
          className="mt-auto text-xs font-semibold text-center underline bg-transparent border-none cursor-pointer"
          style={{ color: 'var(--color-neutral-600)' }}
        >
          Signed in with the wrong account? Sign out
        </button>
      </div>
    </div>
  );
}
