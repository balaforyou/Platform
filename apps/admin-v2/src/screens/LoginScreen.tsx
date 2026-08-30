import { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Button, Card, Banner, TextField } from '../components';
import { renderGoogleButton, googleClientId } from '../lib/googleIdentity';
import { passkeysSupported, PasskeyCancelled } from '../lib/webauthn';
import { friendlyAuthError } from '../lib/errors';

export function LoginScreen() {
  const { loginWithGoogle, loginWithDevToken, loginWithPasskey } = useAdminAuth();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'google' | 'passkey' | 'dev'>(null);
  const [devEmail, setDevEmail] = useState('balaforyou@gmail.com');
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (!googleBtnRef.current || !googleClientId) return;
    let alive = true;
    renderGoogleButton(googleBtnRef.current, async (idToken) => {
      if (!alive) return;
      setBusy('google');
      setError(null);
      try {
        await loginWithGoogle(idToken);
      } catch (e) {
        setError(friendlyAuthError(e));
      } finally {
        setBusy(null);
      }
    })
      .then(() => alive && setGoogleReady(true))
      .catch((e) => alive && setError(friendlyAuthError(e)));
    return () => {
      alive = false;
    };
  }, [loginWithGoogle]);

  const onPasskey = async () => {
    setBusy('passkey');
    setError(null);
    try {
      await loginWithPasskey();
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) setError(friendlyAuthError(e));
    } finally {
      setBusy(null);
    }
  };

  const onDev = async () => {
    setBusy('dev');
    setError(null);
    try {
      await loginWithDevToken(devEmail.trim().toLowerCase());
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background:
          'radial-gradient(1200px 600px at 50% -10%, var(--av2-accent-soft), transparent), var(--av2-bg)',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 380, boxShadow: 'var(--av2-shadow-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/icon-192.png" alt="" width={48} height={48} style={{ borderRadius: 12 }} />
          <h1 style={{ fontSize: 20, margin: '12px 0 4px' }}>Slotflow Admin</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--av2-muted)' }}>
            Sign in with your Google account.
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {googleClientId ? (
            <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 40 }} />
          ) : (
            <Banner tone="info">
              Google sign-in isn’t configured (<code>VITE_GOOGLE_CLIENT_ID</code> unset).
            </Banner>
          )}
          {!googleReady && googleClientId && (
            <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: 'var(--av2-muted)' }}>
              Loading Google sign-in…
            </p>
          )}

          {passkeysSupported() && (
            <Button
              variant="secondary"
              fullWidth
              leadingIcon={<Fingerprint size={16} />}
              loading={busy === 'passkey'}
              disabled={busy !== null && busy !== 'passkey'}
              onClick={onPasskey}
            >
              Use fingerprint / passkey
            </Button>
          )}
        </div>

        {import.meta.env.DEV && (
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px dashed var(--av2-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--av2-muted)' }}>
              DEV SIGN-IN (no Google)
            </span>
            <TextField
              label="Seeded admin email"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              autoComplete="off"
            />
            <Button variant="ghost" fullWidth loading={busy === 'dev'} onClick={onDev}>
              Dev sign-in
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
