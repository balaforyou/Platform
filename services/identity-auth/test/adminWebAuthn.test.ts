import { describe, it, expect } from 'vitest';
import type { VerifiedRegistrationResponse } from '@simplewebauthn/server';
import {
  resolveRpConfig,
  newCredentialRow,
  assertCounterProgress,
  toAuthenticatorCredential,
  CounterRegressionError,
} from '../src/adminWebAuthn';

describe('resolveRpConfig', () => {
  it('defaults to localhost for dev with no env set', () => {
    expect(resolveRpConfig({})).toEqual({
      rpID: 'localhost',
      rpName: 'Slotflow Admin',
      origin: 'http://localhost:5175',
    });
  });

  it('uses explicit production values', () => {
    const env = {
      WEBAUTHN_RP_ID: 'admin.elitecourts.duckdns.org',
      WEBAUTHN_RP_NAME: 'JBC Admin',
      WEBAUTHN_RP_ORIGIN: 'https://admin.elitecourts.duckdns.org',
    };
    expect(resolveRpConfig(env)).toEqual({
      rpID: 'admin.elitecourts.duckdns.org',
      rpName: 'JBC Admin',
      origin: 'https://admin.elitecourts.duckdns.org',
    });
  });

  it('accepts an origin host that is a subdomain of the rpID', () => {
    const env = {
      WEBAUTHN_RP_ID: 'elitecourts.duckdns.org',
      WEBAUTHN_RP_ORIGIN: 'https://admin.elitecourts.duckdns.org',
    };
    expect(resolveRpConfig(env).rpID).toBe('elitecourts.duckdns.org');
  });

  it('throws when the rpID is not a suffix of the origin host', () => {
    const env = {
      WEBAUTHN_RP_ID: 'evil.example.com',
      WEBAUTHN_RP_ORIGIN: 'https://admin.elitecourts.duckdns.org',
    };
    expect(() => resolveRpConfig(env)).toThrow(/not the host of, or a registrable parent/);
  });

  it('throws on a malformed origin', () => {
    expect(() => resolveRpConfig({ WEBAUTHN_RP_ORIGIN: 'not a url' })).toThrow(/not a valid URL/);
  });
});

function fakeRegistration(overrides: {
  verified?: boolean;
  id?: string;
  publicKey?: Uint8Array;
  counter?: number;
  withInfo?: boolean;
} = {}): VerifiedRegistrationResponse {
  const {
    verified = true,
    id = 'Y3JlZC1pZC0x',
    publicKey = new Uint8Array([1, 2, 3, 4]),
    counter = 0,
    withInfo = true,
  } = overrides;
  return {
    verified,
    registrationInfo: withInfo
      ? ({ credential: { id, publicKey, counter } } as any)
      : undefined,
  } as VerifiedRegistrationResponse;
}

describe('newCredentialRow', () => {
  it('maps a verified registration into a persistable row', () => {
    const row = newCredentialRow('user-1', fakeRegistration({ id: 'abc', counter: 7 }), 'Pixel 8');
    expect(row).toEqual({
      userId: 'user-1',
      credentialId: 'abc',
      publicKey: Buffer.from([1, 2, 3, 4]),
      counter: 7n,
      deviceLabel: 'Pixel 8',
    });
    expect(row.counter).toBeTypeOf('bigint');
    expect(Buffer.isBuffer(row.publicKey)).toBe(true);
  });

  it('normalises a blank or whitespace device label to null', () => {
    expect(newCredentialRow('u', fakeRegistration(), '   ').deviceLabel).toBeNull();
    expect(newCredentialRow('u', fakeRegistration(), undefined).deviceLabel).toBeNull();
  });

  it('trims a device label', () => {
    expect(newCredentialRow('u', fakeRegistration(), '  Work laptop  ').deviceLabel).toBe('Work laptop');
  });

  it('throws when the registration was not verified', () => {
    expect(() => newCredentialRow('u', fakeRegistration({ verified: false }))).toThrow(/not verified/);
  });

  it('throws when registrationInfo is absent', () => {
    expect(() => newCredentialRow('u', fakeRegistration({ withInfo: false }))).toThrow(/not verified/);
  });
});

describe('assertCounterProgress', () => {
  it('allows both counters at zero (authenticator with no counter)', () => {
    expect(() => assertCounterProgress(0n, 0)).not.toThrow();
  });

  it('allows a strictly advancing counter', () => {
    expect(() => assertCounterProgress(5n, 6)).not.toThrow();
    expect(() => assertCounterProgress(0n, 1)).not.toThrow();
  });

  it('rejects a stalled counter that is not zero', () => {
    expect(() => assertCounterProgress(5n, 5)).toThrow(CounterRegressionError);
  });

  it('rejects a regressing counter', () => {
    expect(() => assertCounterProgress(9n, 3)).toThrow(CounterRegressionError);
    expect(() => assertCounterProgress(5n, 0)).toThrow(CounterRegressionError);
  });

  it('CounterRegressionError carries a 401 + stable code', () => {
    try {
      assertCounterProgress(5n, 5);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(CounterRegressionError);
      expect(e.statusCode).toBe(401);
      expect(e.code).toBe('WEBAUTHN_COUNTER_REGRESSION');
    }
  });
});

describe('toAuthenticatorCredential', () => {
  it('maps a stored row into the verify-assertion shape', () => {
    const out = toAuthenticatorCredential({
      credentialId: 'cred-1',
      publicKey: Buffer.from([9, 8, 7]),
      counter: 42n,
    });
    expect(out.id).toBe('cred-1');
    expect(out.counter).toBe(42);
    expect(Array.from(out.publicKey)).toEqual([9, 8, 7]);
  });

  it('copies the key bytes into a fresh ArrayBuffer-backed array', () => {
    const src = Buffer.from([1, 2, 3]);
    const out = toAuthenticatorCredential({ credentialId: 'c', publicKey: src, counter: 0n });
    out.publicKey[0] = 99;
    expect(src[0]).toBe(1); // original untouched
    expect(out.publicKey.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
