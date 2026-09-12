import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, type Messaging } from 'firebase/messaging';
import { apiRequest } from '@badminton/ui-shared';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!messaging) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  }
  return messaging;
}

export type PushOptInResult = 'granted' | 'denied' | 'unsupported';

/**
 * Requests notification permission (if not already decided), fetches a real FCM
 * registration token via the existing /sw.js service worker registration (main.tsx
 * already registers it — no separate firebase-messaging-sw.js needed), and registers
 * it with the backend's existing POST /devices/register endpoint.
 *
 * Idempotent: safe to call again once permission is already granted (e.g. on app load)
 * to re-register — POST /devices/register upserts on the unique token, so this covers
 * token rotation without needing the (removed, in the modular SDK) onTokenRefresh event.
 */
export async function requestAndRegisterPushToken(
  userId: string,
  accessToken: string | null,
): Promise<PushOptInResult> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  const permission =
    Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;

  if (permission !== 'granted') {
    return 'denied';
  }

  const instance = getMessagingInstance();
  if (!instance) return 'unsupported';

  const registration = await navigator.serviceWorker.ready;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  const token = await getToken(instance, { vapidKey, serviceWorkerRegistration: registration });

  if (!token) return 'unsupported';

  await apiRequest('/notification/devices/register', {
    method: 'POST',
    body: JSON.stringify({ userId, token }),
    token: accessToken,
  });

  return 'granted';
}

export function currentPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
