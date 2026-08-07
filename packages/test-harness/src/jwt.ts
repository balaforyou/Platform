import crypto from 'crypto';

/**
 * The JWT secret every service falls back to when JWT_SECRET is unset.
 * Kept identical to each service's `@fastify/jwt` registration default so a
 * harness-signed token verifies against a real running service.
 */
export const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg';

/**
 * Signs an HS256 JWT with the same algorithm, secret source, and claim shape the
 * real login route produces (see identity-auth's `server.jwt.sign({ userId,
 * tenantId, phone, userType, roles })`). This is a genuine token as far as any
 * service's `request.jwtVerify()` is concerned — not a stub that bypasses auth.
 */
export function signJwt(payload: Record<string, unknown>, expiresInSeconds = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }),
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TEST_JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** Decodes a JWT payload without verifying — for asserting on claims (e.g. roles). */
export function decodeJwt(token: string): Record<string, any> {
  const [, body] = token.split('.');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

/** Convenience: an owner-role token for a tenant (branch-unscoped, access-all). */
export function ownerToken(userId: string, tenantId?: string): string {
  return signJwt({ userId, tenantId, roles: ['owner'], userType: 'MEMBER' });
}

/** Convenience: a branch-manager token scoped to exactly one branch. */
export function branchManagerToken(userId: string, branchId: string, tenantId?: string): string {
  return signJwt({ userId, tenantId, roles: [`branch_manager:${branchId}`], userType: 'MEMBER' });
}
