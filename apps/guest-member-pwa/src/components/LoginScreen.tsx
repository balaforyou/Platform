import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTenant, renderGoogleButton } from '@badminton/ui-shared';
import { verifyGoogle as verifyGoogleCall } from '../lib/auth';
import { AlertCircle, ShieldCheck } from 'lucide-react';

export default function LoginScreen() {
  const { tenant } = useTenant();
  const { setSession, isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  // F-235 Slice D: Gmail-only sign-in -- phone capture no longer gates entry to the app at all,
  // it moves to its real point of need (Reserve, via VerifyPhoneDialog's phone-entry mode). Every
  // authenticated user, phone or no phone, goes straight to the dashboard now.
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const [error, setError] = useState<string | null>(null);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  const handleGoogleToken = async (idToken: string) => {
    try {
      setError(null);
      if (!tenant) throw new Error('Tenant context is required to verify Google login');
      await verifyGoogleCall(idToken, tenant.id, setSession);
      console.log('Login successful via Google.');
      // Navigation happens via the isAuthenticated effect above once `user` updates.
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    }
  };

  // F-228 Step 3: real GIS button. Same pattern as admin-v2's LoginScreen (src/screens/LoginScreen.tsx) —
  // GIS is handed a detached child <div>, never the React-managed ref node directly, so its own DOM
  // churn (an injected <iframe> + wrapper) never collides with React's commit/cleanup on this component.
  useEffect(() => {
    const host = googleBtnRef.current;
    if (!host) return;
    let alive = true;

    const mount = document.createElement('div');
    mount.style.cssText = 'display:flex;justify-content:center';
    host.appendChild(mount);

    renderGoogleButton(mount, (idToken) => {
      if (alive) handleGoogleToken(idToken);
    }).catch((e) => {
      if (alive) console.error('Failed to render Google sign-in button:', e);
    });

    return () => {
      alive = false;
      try {
        mount.remove();
      } catch {
        /* GIS may already have detached it */
      }
    };
    // Deliberately run once on mount only, same as admin-v2's LoginScreen.tsx's identical effect
    // (no react-hooks lint plugin is configured in this repo's .eslintrc.json, so no disable
    // comment is needed or checked here).
  }, []);

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--color-bg)' }}>
        <div
          className="relative w-full max-w-md p-8 text-center"
          style={{ background: 'var(--color-neutral-100)', border: '1px solid var(--color-neutral-300)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 h-24 w-24 rounded-full p-1"
            style={{ background: 'var(--color-accent-700)', boxShadow: 'var(--shadow-md)' }}
          >
            <div className="flex h-full w-full items-center justify-center rounded-full" style={{ background: 'var(--color-bg)' }}>
              <ShieldCheck className="h-12 w-12 animate-pulse" style={{ color: 'var(--color-accent-700)' }} />
            </div>
          </div>

          <div className="mt-12 mb-6">
            <h2 className="text-2xl tracking-tight" style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, color: 'var(--color-text)' }}>Welcome to {tenant?.appName}!</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-neutral-600)' }}>Logged in successfully.</p>
          </div>

          <div
            className="rounded-2xl p-6 text-left mb-8 space-y-3 font-mono text-xs"
            style={{ background: '#fff', border: '1px solid var(--color-neutral-300)' }}
          >
            <div className="flex justify-between" style={{ color: 'var(--color-neutral-600)' }}>
              <span>User ID:</span>
              <span className="font-semibold">{user?.userId || user?.id}</span>
            </div>
            <div className="flex justify-between" style={{ color: 'var(--color-neutral-600)' }}>
              <span>Tenant ID:</span>
              <span>{user?.tenantId}</span>
            </div>
            <div className="flex justify-between" style={{ color: 'var(--color-neutral-600)' }}>
              <span>Roles:</span>
              <span className="font-semibold" style={{ color: 'var(--color-accent-700)' }}>
                {user?.roles?.length ? user.roles.join(', ') : 'member'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full py-4 rounded-xl font-medium transition-colors active:scale-[0.98]"
            style={{ background: 'var(--color-destructive)', color: '#fff' }}
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

  // F-235 Slice D: Gmail-only sign-in. Phone/OTP form and the "or" divider removed --
  // phone capture moves to Reserve-time (VerifyPhoneDialog's phone-entry mode).
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* F-192 Slice F: the shared dark band -- the wordmark moves here off the gradient strip. */}
      <div className="flex-none flex items-center justify-between mx-auto w-full max-w-md" style={{ background: 'var(--color-neutral-900)', padding: '15px 18px' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '19px', color: 'var(--color-bg)' }}>
          {tenant?.appName || 'Courts'}
        </span>
        <span style={{ fontFamily: 'var(--font-body-organic)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-neutral-400)' }}>
          SIGN IN
        </span>
      </div>
      <div
        className="flex-none flex flex-col justify-end px-6 pt-8 pb-6 mx-auto w-full max-w-md"
        style={{
          minHeight: '200px',
          background: 'repeating-linear-gradient(115deg, var(--color-accent-700) 0 12px, var(--color-accent-800) 12px 24px)',
        }}
      >
        <span
          className="self-start px-2.5 py-1.5 rounded-full text-[10.5px] font-semibold tracking-wide"
          style={{ fontFamily: 'var(--font-body-organic)', color: 'var(--color-accent-100)', background: 'rgba(32,30,29,0.55)' }}
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
            Sign in with Google so we know the courts are going to real players.
          </p>
        </div>

        <div className="flex flex-col gap-[9px]">
          {/* F-228 Step 3 / F-235 Slice D: real GIS button (packages/ui-shared/src/lib/googleIdentity.ts),
              not a styled button of our own -- Google renders its own iframe into this container.
              Now the ONLY sign-in path -- the phone/OTP form and "or" divider are gone. */}
          <div ref={googleBtnRef} className="flex justify-center min-h-[54px]" />
          <div className="flex flex-col gap-0.5" style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
            <span>We'll confirm a few details before your first booking.</span>
          </div>
        </div>

        <div className="mt-auto" style={{ fontSize: '11.5px', lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
          By continuing you accept the court rules and cancellation policy.
        </div>
      </div>
    </div>
  );
}
