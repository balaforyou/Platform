import { useEffect, useState } from 'react';
import { Smartphone, Download, Share, X } from 'lucide-react';

/**
 * PWA install prompt (F-197). Install-detection, platform-branching and 7-day
 * dismissal logic ported from apps/guest-member-pwa/src/components/PwaInstallPrompt.tsx;
 * the tenant-branding source is dropped — admin-v2 has fixed "Slotflow Admin" branding.
 * The `beforeinstallprompt` event is captured globally in main.tsx before React mounts.
 */

const DISMISS_KEY = 'av2-pwa-install-dismissed';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'android' | 'ios' | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < SEVEN_DAYS) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    let timer: ReturnType<typeof setTimeout>;
    const reveal = () => {
      timer = setTimeout(() => setShow(true), 2500);
    };

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('android');
      reveal();
    };

    if ((window as any).__av2DeferredPrompt) {
      setDeferredPrompt((window as any).__av2DeferredPrompt);
      setPlatform('android');
      reveal();
    }
    (window as any).__av2OnBeforeInstallPrompt = onBeforeInstall;
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onInstalled = () => {
      setInstalled(true);
      setShow(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    if (isIOS) {
      setPlatform('ios');
      reveal();
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      (window as any).__av2OnBeforeInstallPrompt = null;
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setShow(false);
    } else {
      dismiss();
    }
    setDeferredPrompt(null);
  };

  if (!show || installed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 16,
        right: 16,
        maxWidth: 380,
        marginLeft: 'auto',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--av2-surface)',
          border: '1px solid var(--av2-border)',
          borderRadius: 'var(--av2-radius)',
          boxShadow: 'var(--av2-shadow-lg)',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'var(--av2-accent-soft)',
              color: 'var(--av2-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            {platform === 'ios' ? <Share size={18} /> : <Smartphone size={18} />}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>Install Slotflow Admin</strong>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--av2-muted)', lineHeight: 1.45 }}>
              {platform === 'ios'
                ? 'Add to your Home Screen for one-tap access.'
                : 'Install it on this device for quick access.'}
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--av2-muted)', padding: 2 }}
          >
            <X size={16} />
          </button>
        </div>

        {platform === 'ios' ? (
          <ol
            style={{
              margin: '12px 0 0',
              paddingLeft: 18,
              fontSize: 12,
              color: 'var(--av2-muted)',
              lineHeight: 1.6,
            }}
          >
            <li>Tap the Share button.</li>
            <li>Choose “Add to Home Screen”.</li>
          </ol>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={install}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 'var(--av2-radius-sm)',
                border: 'none',
                background: 'var(--av2-accent)',
                color: 'var(--av2-accent-fg)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Download size={14} />
              Install
            </button>
            <button
              onClick={dismiss}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--av2-radius-sm)',
                border: '1px solid var(--av2-border)',
                background: 'var(--av2-surface)',
                color: 'var(--av2-muted)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
