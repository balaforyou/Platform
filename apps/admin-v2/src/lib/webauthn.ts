import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { apiRequest } from '@badminton/ui-shared';

export const passkeysSupported = browserSupportsWebAuthn;

export class PasskeyCancelled extends Error {
  constructor() {
    super('Passkey prompt was dismissed');
    this.name = 'PasskeyCancelled';
  }
}

function isCancellation(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'NotAllowedError' || err.name === 'AbortError')
  );
}

/**
 * Enrol a passkey for the signed-in admin. `token` is the current access token —
 * the register endpoints require a valid admin session.
 */
export async function enrollPasskey(token: string, deviceLabel?: string): Promise<void> {
  const options = await apiRequest<PublicKeyCredentialCreationOptionsJSON>(
    '/identity/auth/admin/webauthn/register/options',
    { method: 'POST', token, body: JSON.stringify({}) },
  );

  let attResp;
  try {
    attResp = await startRegistration({ optionsJSON: options });
  } catch (err) {
    if (isCancellation(err)) throw new PasskeyCancelled();
    throw err;
  }

  await apiRequest('/identity/auth/admin/webauthn/register/verify', {
    method: 'POST',
    token,
    body: JSON.stringify({ response: attResp, deviceLabel }),
  });
}

interface AdminSessionResponse {
  accessToken: string;
  user: { id: string; email: string | null };
}

/** Fingerprint fast-path login. Resolves to the new session, or throws PasskeyCancelled. */
export async function loginWithPasskey(): Promise<AdminSessionResponse> {
  const options = await apiRequest<PublicKeyCredentialRequestOptionsJSON>(
    '/identity/auth/admin/webauthn/login/options',
    { method: 'POST', body: JSON.stringify({}) },
  );

  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    if (isCancellation(err)) throw new PasskeyCancelled();
    throw err;
  }

  return apiRequest<AdminSessionResponse>('/identity/auth/admin/webauthn/login/verify', {
    method: 'POST',
    body: JSON.stringify({ response: assertion }),
  });
}

// Minimal structural aliases — @simplewebauthn/types isn't a direct dependency and
// the options are round-tripped opaque anyway.
type PublicKeyCredentialCreationOptionsJSON = Parameters<typeof startRegistration>[0]['optionsJSON'];
type PublicKeyCredentialRequestOptionsJSON = Parameters<typeof startAuthentication>[0]['optionsJSON'];
