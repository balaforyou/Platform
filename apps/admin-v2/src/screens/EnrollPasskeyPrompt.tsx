import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { Button, Card, Banner } from '../components';
import { passkeysSupported, PasskeyCancelled } from '../lib/webauthn';
import { friendlyAuthError } from '../lib/errors';

function dismissKey(userId: string) {
  return `av2-passkey-prompt-dismissed:${userId}`;
}

export function wasPasskeyPromptDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Post-first-login enrolment prompt (acceptance criterion 4). Skippable — once
 * skipped or enrolled it does not reappear for that account on this device.
 */
export function EnrollPasskeyPrompt({ onResolved }: { onResolved: () => void }) {
  const { user, enrollPasskey } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Nothing to enrol (no passkey support — e.g. an insecure-context LAN URL on mobile,
  // where `window.PublicKeyCredential` is undefined). Resolve from an effect, never
  // during render — calling the parent's setter mid-render is the "Cannot update a
  // component while rendering a different component" anti-pattern and corrupts the commit.
  const canEnrol = !!user && passkeysSupported();
  useEffect(() => {
    if (!canEnrol) onResolved();
  }, [canEnrol, onResolved]);

  if (!canEnrol) return null;

  const remember = () => {
    try {
      localStorage.setItem(dismissKey(user.userId), '1');
    } catch {
      /* ignore */
    }
  };

  const skip = () => {
    remember();
    onResolved();
  };

  const enrol = async () => {
    setBusy(true);
    setError(null);
    try {
      await enrollPasskey(navigator.userAgent.slice(0, 60));
      remember();
      setDone(true);
      setTimeout(onResolved, 1200);
    } catch (e) {
      if (e instanceof PasskeyCancelled) {
        setError('Enrolment was dismissed. You can set this up later from the account menu.');
      } else {
        setError(friendlyAuthError(e));
      }
    } finally {
      setBusy(false);
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
      }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--av2-accent-soft)',
            color: 'var(--av2-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Fingerprint size={22} />
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Faster sign-in next time?</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--av2-muted)', lineHeight: 1.5 }}>
          Enrol this device’s fingerprint or passkey. Google sign-in stays available as the
          fallback — this is just a shortcut on a device you trust.
        </p>

        {error && (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        {done && (
          <div style={{ marginBottom: 14 }}>
            <Banner tone="success">Device enrolled.</Banner>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button fullWidth loading={busy} disabled={done} onClick={enrol}>
            Enable fingerprint
          </Button>
          <Button variant="ghost" disabled={busy || done} onClick={skip}>
            Skip for now
          </Button>
        </div>
      </Card>
    </div>
  );
}
