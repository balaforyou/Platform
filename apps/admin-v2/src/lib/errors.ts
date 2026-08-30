import { APIError } from '@badminton/ui-shared';

/**
 * Map the admin auth endpoints' error codes to copy an admin can act on
 * (acceptance criterion 6 — a clear message, never a crash or blank screen).
 */
const MESSAGES: Record<string, string> = {
  ADMIN_ACCOUNT_NOT_FOUND:
    'This Google account isn’t registered as an admin. Ask an owner to add you, then try again.',
  ADMIN_ROLE_REQUIRED:
    'This account doesn’t have an owner or branch-manager role. Front-desk accounts can’t sign in here.',
  MULTIPLE_TENANT_MATCH:
    'This Google account manages more than one venue. Contact support to resolve the ambiguity.',
  INVALID_GOOGLE_TOKEN: 'Google sign-in couldn’t be verified. Try again.',
  DEV_LOGIN_DISABLED: 'The developer sign-in shortcut is disabled in this environment.',
  WEBAUTHN_CREDENTIAL_NOT_FOUND:
    'This device isn’t set up for fingerprint sign-in. Use Google to sign in, then enrol it.',
  WEBAUTHN_VERIFICATION_FAILED: 'Fingerprint sign-in couldn’t be verified. Try Google sign-in instead.',
  WEBAUTHN_COUNTER_REGRESSION:
    'This passkey looks compromised and was rejected. Sign in with Google and re-enrol the device.',
  WEBAUTHN_CHALLENGE_INVALID: 'That took too long. Start the fingerprint step again.',
  WEBAUTHN_CREDENTIAL_EXISTS: 'This device is already enrolled.',
};

export function friendlyAuthError(err: unknown): string {
  if (err instanceof APIError && MESSAGES[err.code]) return MESSAGES[err.code];
  if (err instanceof APIError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Try again.';
}
