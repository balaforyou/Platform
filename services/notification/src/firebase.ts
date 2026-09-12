import admin from 'firebase-admin';

// WHY (F-197/F-025): real push dispatch is opt-in based on whether a service-account
// credential is actually configured. Absent (CI/regression/local dev without the real
// secret), push falls back to the existing mock — this is what keeps
// dispatch-and-routing.regression.ts's mock-push assertions passing unmodified.
let app: admin.app.App | null = null;
let initAttempted = false;

function getApp(): admin.app.App | null {
  if (initAttempted) return app;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const serviceAccount = JSON.parse(raw);
  app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return app;
}

export function isFirebaseConfigured(): boolean {
  return getApp() !== null;
}

// WHY: templateBody/NotificationTemplate is stored but never rendered for any channel
// today (confirmed: no dispatch code path reads it) — out of scope here. Titles are a
// small static map instead of wiring up that unrelated, pre-existing gap.
const EVENT_TITLES: Record<string, string> = {
  booking_confirmed: 'Booking Confirmed',
  refund_processed: 'Refund Processed',
  tournament_fixture_scheduled: 'Fixture Scheduled',
  slot_release_reminder: 'Slot Release Reminder',
  subscription_charge_failed: 'Payment Failed',
  low_occupancy_alert: 'Low Occupancy Alert',
};

export class StaleTokenError extends Error {
  constructor(public token: string) {
    super(`FCM token no longer registered: ${token}`);
  }
}

// WHY: `req.recipient` for the push channel is the DeviceToken.token string itself
// (resolveAndQueue queues one push request per token), not a userId.
export async function sendPush(token: string, eventType: string, variables: unknown): Promise<string> {
  const firebaseApp = getApp();
  if (!firebaseApp) {
    throw new Error('sendPush called without a configured Firebase app');
  }

  try {
    const messageId = await admin.messaging(firebaseApp).send({
      token,
      notification: {
        title: EVENT_TITLES[eventType] ?? 'Slotflow Admin',
        body: 'Tap to view details.',
      },
      data: {
        eventType,
        variables: JSON.stringify(variables ?? {}),
      },
    });
    return messageId;
  } catch (err: any) {
    if (err?.code === 'messaging/registration-token-not-registered') {
      throw new StaleTokenError(token);
    }
    throw err;
  }
}
