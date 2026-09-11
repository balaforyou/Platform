/**
 * Google Identity Services — client-side ID-token flow. GIS issues an ID token to the browser;
 * identity-auth verifies its signature against Google's JWKS. Only VITE_GOOGLE_CLIENT_ID is
 * needed (no client secret). Shared by admin-v2 (POST /auth/admin/google/verify) and
 * guest-member-pwa (POST /auth/google/verify, F-228 Step 3) — the caller decides what to do
 * with the raw ID token via `onToken`; this module has no route-specific behavior.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Render Google's official "Sign in with Google" button into `container`.
 * `onToken` receives the raw ID-token JWT to POST to the caller's own verify endpoint.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onToken: (idToken: string) => void,
): Promise<void> {
  if (!googleClientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not configured');
  await loadGis();
  const gid = (window as any).google.accounts.id;
  gid.initialize({
    client_id: googleClientId,
    callback: (resp: { credential?: string }) => {
      if (resp.credential) onToken(resp.credential);
    },
    ux_mode: 'popup',
  });
  gid.renderButton(container, { theme: 'outline', size: 'large', width: 320, text: 'signin_with' });
}
