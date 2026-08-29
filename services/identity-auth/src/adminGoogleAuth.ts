/**
 * Admin-v2 Google login — real ID-token verification + cross-tenant admin resolution.
 *
 * Per docs/plans/admin-v2-slice1-plan-mode-SIGNED.md §2/§4. This is a separate path
 * from the member/staff mock at `/auth/google/verify` (index.ts): different rejection
 * semantics, different role gate. Kept as pure, exported functions so the JWKS
 * verification and the multi-tenant-match branching get real unit coverage
 * (test/adminGoogleAuth.test.ts) without a live Google dependency — `verifyGoogleIdToken`
 * takes an injectable key source so tests sign against a locally generated RSA keypair.
 */
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { PrismaClient, UserRole } from '@badminton/database';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
// Google mints tokens under both spellings; jose accepts an issuer allow-list.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/** Roles that may sign into admin-v2. FRONT_DESK is excluded by design (§ruling 3). */
export const ADMIN_ROLES: UserRole[] = ['OWNER', 'BRANCH_MANAGER'];

let cachedRemoteJwks: JWTVerifyGetKey | null = null;

/** Google's production JWKS, lazily created and cached (jose handles key rotation/TTL). */
export function googleRemoteJwks(): JWTVerifyGetKey {
  if (!cachedRemoteJwks) {
    cachedRemoteJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return cachedRemoteJwks;
}

export interface VerifiedGoogleIdentity {
  /** Lower-cased email from the verified token. */
  email: string;
  /** Google's `sub` claim — the stable account id. */
  googleId: string;
}

export class GoogleTokenError extends Error {
  readonly statusCode = 401;
  readonly code = 'INVALID_GOOGLE_TOKEN';
  constructor(message: string) {
    super(message);
    this.name = 'GoogleTokenError';
  }
}

/**
 * Verify a Google ID token's signature, issuer, audience and expiry, and extract the
 * identity claims from the *verified* payload (never from client-supplied fields).
 *
 * @param jwks     key source — `googleRemoteJwks()` in production, a local key set in tests.
 * @param clientId expected `aud`; the configured `GOOGLE_OAUTH_CLIENT_ID`.
 * @param currentDate optional clock override for tests.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { jwks: JWTVerifyGetKey; clientId: string; currentDate?: Date },
): Promise<VerifiedGoogleIdentity> {
  if (!opts.clientId) {
    throw new GoogleTokenError('GOOGLE_OAUTH_CLIENT_ID is not configured');
  }

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, opts.jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: opts.clientId,
      currentDate: opts.currentDate,
    }));
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    throw new GoogleTokenError(`Google ID token verification failed: ${reason}`);
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  const googleId = typeof payload.sub === 'string' ? payload.sub : '';
  if (!email || !googleId) {
    throw new GoogleTokenError('Verified token is missing the email or sub claim');
  }
  if (payload.email_verified === false) {
    throw new GoogleTokenError('Google account email is not verified');
  }

  return { email, googleId };
}

/**
 * Minimal Prisma surface this module needs — keeps the unit tests from having to
 * construct a full PrismaClient.
 */
export type AdminGoogleAuthPrisma = Pick<PrismaClient, 'user' | 'roleAssignment'>;

export type AdminResolution =
  | { kind: 'ok'; userId: string; tenantId: string }
  | { kind: 'not_found' }
  | { kind: 'role_excluded' }
  | { kind: 'multiple_tenant_match'; tenantIds: string[] };

/**
 * Resolve a verified Google identity to exactly one admin `User` row, or an explicit
 * rejection. Two steps, because `RoleAssignment` has no FK to `User` to lean on
 * (schema.prisma:100):
 *
 *  1. Find every `User` row matching `googleId` OR `email`, with **no tenantId filter**.
 *  2. For each candidate, query `RoleAssignment` scoped explicitly to
 *     `(that user's id, that user's OWN tenantId)` — never an unscoped userId lookup —
 *     and keep only OWNER / BRANCH_MANAGER.
 *
 * Zero qualifying → `not_found` (no candidate rows) or `role_excluded` (rows exist but
 * none carry an admin role). More than one distinct tenant among the qualifying
 * assignments → `multiple_tenant_match`, never a silent pick (§ruling 1). Exactly one
 * tenant → `ok`. The resolved role is deliberately not returned: the JWT's `roles`
 * claim is filled from tenant-management's `/users/:id/roles` (the full array, same as
 * every other login path), and the gate only needs "≥1 admin assignment exists".
 */
export async function resolveAdminUser(
  prisma: AdminGoogleAuthPrisma,
  identity: VerifiedGoogleIdentity,
): Promise<AdminResolution> {
  const candidates = await prisma.user.findMany({
    where: { OR: [{ googleId: identity.googleId }, { email: identity.email }] },
    select: { id: true, tenantId: true },
  });

  if (candidates.length === 0) {
    return { kind: 'not_found' };
  }

  const qualifying: { userId: string; tenantId: string }[] = [];
  for (const candidate of candidates) {
    const adminAssignmentCount = await prisma.roleAssignment.count({
      // Explicit (userId, tenantId) scope: a RoleAssignment's tenantId agrees with its
      // User's tenantId by construction, but there is no FK to enforce it, so the query does.
      where: {
        userId: candidate.id,
        tenantId: candidate.tenantId,
        role: { in: ADMIN_ROLES },
      },
    });
    if (adminAssignmentCount > 0) {
      qualifying.push({ userId: candidate.id, tenantId: candidate.tenantId });
    }
  }

  if (qualifying.length === 0) {
    return { kind: 'role_excluded' };
  }

  const distinctTenants = [...new Set(qualifying.map((q) => q.tenantId))];
  if (distinctTenants.length > 1) {
    return { kind: 'multiple_tenant_match', tenantIds: distinctTenants };
  }

  return { kind: 'ok', userId: qualifying[0].userId, tenantId: qualifying[0].tenantId };
}
