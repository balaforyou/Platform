import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { Phone, Lock, ChevronRight, RefreshCw, Mail, AlertCircle, ShieldCheck } from 'lucide-react';

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
      setError(err.message || 'Google mock login failed.');
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

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-surface-alt via-surface-mint to-surface-alt px-4 py-8">
      {/* Dynamic Header */}
      <div className="text-center mb-8 flex flex-col items-center">
        {tenant?.logo ? (
          <img src={tenant.logo} alt={tenant.name} className="h-16 w-auto mb-4 object-contain rounded-xl" />
        ) : (
          <div className="h-16 w-16 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4 border border-brand-primary/20 shadow-inner">
            <span className="text-2xl font-black">{tenant?.appName?.[0]?.toUpperCase() ?? 'B'}</span>
          </div>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{tenant?.appName}</h1>
        <p className="text-ink-muted text-sm mt-2 max-w-xs">{tenant?.name} Client Shell App</p>
      </div>

      {/* Main Glassmorphic Card */}
      <div className="w-full max-w-md bg-surface backdrop-blur-xl rounded-3xl p-8 border border-edge-strong shadow-2xl shadow-black/40">
        
        {/* Alerts and errors */}
        {error && (
          <div className="flex items-center space-x-2 bg-red-100 border border-red-200 text-red-800 p-4 rounded-2xl mb-6 text-sm">
            <AlertCircle className="h-5 w-5 text-red-700 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth Forms */}
        {!showGoogleMockInput ? (
          <div>
            {!otpSent ? (
              // Stage 1: Request OTP Form
              <form onSubmit={handleRequestOtp} className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                    Enter Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">
                      +91
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="99999 99999"
                      className="w-full pl-14 pr-4 py-4 rounded-2xl bg-surface-alt border border-edge-strong text-ink placeholder-gray-600 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all text-lg font-semibold tracking-wider"
                    />
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-muted" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-2xl bg-brand-primary hover:opacity-95 text-white font-semibold flex items-center justify-center space-x-2 transition-all active:scale-[0.98] shadow-lg shadow-brand-primary/20"
                >
                  {loading ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>Get Verification Code</span>
                      <ChevronRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              // Stage 2: Verify OTP Form
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider">
                      Verification Code (OTP)
                    </label>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="text-xs text-brand-primary hover:underline font-semibold"
                    >
                      Change Number
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 4 or 6 digit OTP"
                      className="w-full px-4 py-4 rounded-2xl bg-surface-alt border border-edge-strong text-ink placeholder-gray-600 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all text-center text-xl font-bold tracking-widest"
                    />
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-muted" />
                  </div>
                  <p className="text-xs text-ink-muted mt-2 text-center">
                    SMS OTP dev-fallback is active. Code is printed in the backend service logs.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-2xl bg-brand-primary hover:opacity-95 text-white font-semibold flex items-center justify-center space-x-2 transition-all active:scale-[0.98] shadow-lg shadow-brand-primary/20"
                >
                  {loading ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>Verify & Sign In</span>
                      <ShieldCheck className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Google OAuth Login Action */}
            <div className="mt-8 pt-8 border-t border-edge space-y-4">
              <div className="text-center text-xs text-ink-muted font-semibold tracking-wider uppercase mb-4">
                Fast Members Login
              </div>
              <button
                onClick={() => setShowGoogleMockInput(true)}
                className="w-full py-3.5 px-4 rounded-2xl bg-surface-mint border border-edge-strong hover:bg-edge text-ink hover:text-ink font-medium flex items-center justify-center space-x-3 transition-all active:scale-[0.98]"
              >
                <Mail className="h-5 w-5 text-rose-700" />
                <span className="text-sm font-semibold">[Dev Mock] Sign in with Google</span>
              </button>
            </div>
          </div>
        ) : (
          // Stage 3: Google Login Mock Input Form
          <form onSubmit={handleGoogleMockLogin} className="space-y-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold text-ink">Google OAuth Simulation</h2>
              <button
                type="button"
                onClick={() => {
                  setShowGoogleMockInput(false);
                  setError(null);
                }}
                className="text-xs text-brand-primary hover:underline font-semibold"
              >
                Back
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              Simulates Google Single Sign-On (OAuth). Enter an email to verify membership or link phone.
            </p>

            <div>
              <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                Simulated Google Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={mockEmail}
                  onChange={(e) => setMockEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full pl-4 pr-12 py-4 rounded-2xl bg-surface-alt border border-edge-strong text-ink placeholder-gray-600 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all text-base"
                />
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-muted" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl bg-brand-primary hover:opacity-95 text-white font-semibold flex items-center justify-center space-x-2 transition-all active:scale-[0.98] shadow-lg shadow-brand-primary/20"
            >
              {loading ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <span>Simulate Token Verification</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
