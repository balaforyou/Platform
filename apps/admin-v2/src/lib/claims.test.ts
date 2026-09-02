import { describe, it, expect } from 'vitest';
import { parseAdminClaims, roleLabel } from './claims';
import { friendlyAuthError } from './errors';
import { APIError } from '@badminton/ui-shared';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('parseAdminClaims', () => {
  it('extracts the admin identity from a well-formed token', () => {
    const token = jwt({
      userId: 'u-1',
      tenantId: 't-1',
      email: 'owner@jbc.com',
      phone: '+919876500011',
      userType: 'STAFF',
      roles: ['owner'],
    });
    expect(parseAdminClaims(token)).toEqual({
      userId: 'u-1',
      email: 'owner@jbc.com',
      phone: '+919876500011',
      tenantId: 't-1',
      userType: 'STAFF',
      roles: ['owner'],
    });
  });

  it('defaults email and phone to null and roles to [] when absent', () => {
    const parsed = parseAdminClaims(jwt({ userId: 'u', tenantId: 't' }));
    expect(parsed).toMatchObject({ email: null, phone: null, roles: [], userType: 'STAFF' });
  });

  it('returns null when required claims are missing', () => {
    expect(parseAdminClaims(jwt({ tenantId: 't' }))).toBeNull();
    expect(parseAdminClaims(jwt({ userId: 'u' }))).toBeNull();
  });

  it('returns null on a malformed token', () => {
    expect(parseAdminClaims('not-a-jwt')).toBeNull();
    expect(parseAdminClaims('')).toBeNull();
  });
});

describe('roleLabel', () => {
  it('labels the known role tokens', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('branch_manager:branch-abc')).toBe('Branch manager');
    expect(roleLabel('front_desk')).toBe('Front desk');
    expect(roleLabel('front_desk:b1')).toBe('Front desk');
  });

  it('passes an unknown token through unchanged', () => {
    expect(roleLabel('superadmin')).toBe('superadmin');
  });
});

describe('friendlyAuthError', () => {
  it('maps known auth error codes to actionable copy', () => {
    expect(friendlyAuthError(new APIError('x', 'ADMIN_ROLE_REQUIRED', 403))).toMatch(/owner or branch-manager/);
    expect(friendlyAuthError(new APIError('x', 'MULTIPLE_TENANT_MATCH', 409))).toMatch(/more than one venue/);
    expect(friendlyAuthError(new APIError('x', 'WEBAUTHN_CREDENTIAL_NOT_FOUND', 401))).toMatch(/set up for fingerprint/);
  });

  it('falls back to the API message for an unmapped code', () => {
    expect(friendlyAuthError(new APIError('raw detail', 'SOMETHING_ELSE', 500))).toBe('raw detail');
  });

  it('handles plain errors and unknowns', () => {
    expect(friendlyAuthError(new Error('boom'))).toBe('boom');
    expect(friendlyAuthError('nope')).toBe('Something went wrong. Try again.');
  });
});
