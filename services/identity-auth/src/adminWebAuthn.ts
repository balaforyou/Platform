/**
 * Admin-v2 WebAuthn / fingerprint step-up (F-196) — pure helpers.
 *
 * Per docs/plans/admin-v2-slice1-plan-mode-SIGNED.md §3. Step-up, not a replacement:
 * a credential is only ever enrolled by an already-Google-authenticated admin, and a
 * successful assertion re-checks the admin role gate before a session is issued.
 *
 * The @simplewebauthn/server ceremony calls live in the route handlers (index.ts);
 * everything here is deterministic and unit-tested (test/adminWebAuthn.test.ts).
 */
import type { VerifiedRegistrationResponse } from '@simplewebauthn/server';

export interface RpConfig {
  rpID: string;
  rpName: string;
  origin: string;
}

/**
 * WebAuthn relying-party config, from env with a localhost dev default so the ceremony
 * works against the admin-v2 Vite dev server with no extra setup. Production sets all
 * three explicitly:
 *   WEBAUTHN_RP_ID=admin.elitecourts.duckdns.org
 *   WEBAUTHN_RP_ORIGIN=https://admin.elitecourts.duckdns.org
 *
 * RP ID must equal the origin host or be a registrable parent of it, or the browser
 * rejects the ceremony with an opaque SecurityError — caught here with a clear message.
 */
export function resolveRpConfig(env: NodeJS.ProcessEnv = process.env): RpConfig {
  const rpID = env.WEBAUTHN_RP_ID || 'localhost';
  const rpName = env.WEBAUTHN_RP_NAME || 'Slotflow Admin';
  const origin = env.WEBAUTHN_RP_ORIGIN || 'http://localhost:5175';

  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    throw new Error(`WEBAUTHN_RP_ORIGIN is not a valid URL: "${origin}"`);
  }
  if (host !== rpID && !host.endsWith(`.${rpID}`)) {
    throw new Error(
      `WEBAUTHN_RP_ID "${rpID}" is not the host of, or a registrable parent of, ` +
        `WEBAUTHN_RP_ORIGIN host "${host}"`,
    );
  }
  return { rpID, rpName, origin };
}

export interface NewCredentialRow {
  userId: string;
  credentialId: string;
  publicKey: Buffer;
  counter: bigint;
  deviceLabel: string | null;
}

/** Map a verified registration into the WebAuthnCredential row to persist. */
export function newCredentialRow(
  userId: string,
  verification: VerifiedRegistrationResponse,
  deviceLabel?: string | null,
): NewCredentialRow {
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration response was not verified');
  }
  const { credential } = verification.registrationInfo;
  return {
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey),
    counter: BigInt(credential.counter),
    deviceLabel: deviceLabel?.trim() ? deviceLabel.trim() : null,
  };
}

export class CounterRegressionError extends Error {
  readonly statusCode = 401;
  readonly code = 'WEBAUTHN_COUNTER_REGRESSION';
  constructor() {
    super('Authenticator signature counter did not advance — possible cloned credential.');
    this.name = 'CounterRegressionError';
  }
}

/**
 * Cloned-authenticator replay guard. The new counter must be strictly greater than the
 * stored one — EXCEPT when both are zero, which is normal for authenticators that do not
 * implement a counter (most platform authenticators / passkeys report 0 forever).
 */
export function assertCounterProgress(stored: bigint, next: number): void {
  if (stored === 0n && next === 0) return;
  if (BigInt(next) <= stored) {
    throw new CounterRegressionError();
  }
}

/** Shape verifyAuthenticationResponse() wants for a stored credential. */
export function toAuthenticatorCredential(row: {
  credentialId: string;
  publicKey: Buffer | Uint8Array;
  counter: bigint;
}): { id: string; publicKey: Uint8Array<ArrayBuffer>; counter: number } {
  // `.slice()` on a fresh copy yields an ArrayBuffer-backed (not SharedArrayBuffer /
  // ArrayBufferLike) Uint8Array, which is what @simplewebauthn/server's types require.
  const bytes = new Uint8Array(row.publicKey.byteLength);
  bytes.set(row.publicKey);
  return {
    id: row.credentialId,
    publicKey: bytes,
    counter: Number(row.counter),
  };
}
