import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';
import {
  verifyGoogleIdToken,
  resolveAdminUser,
  GoogleTokenError,
  type AdminGoogleAuthPrisma,
} from '../src/adminGoogleAuth';

// ---------------------------------------------------------------------------
// verifyGoogleIdToken — local RSA keypair stands in for Google's JWKS, so these
// tests exercise the real jose verification path with zero network / live Google.
// ---------------------------------------------------------------------------

const CLIENT_ID = '861109681806-test.apps.googleusercontent.com';
const ISSUER = 'https://accounts.google.com';

let privateKey: KeyLike;
let goodJwks: JWTVerifyGetKey;
let otherJwks: JWTVerifyGetKey;

async function makeToken(overrides: {
  claims?: Record<string, unknown>;
  aud?: string;
  iss?: string;
  expiresIn?: string;
  signWith?: KeyLike;
} = {}): Promise<string> {
  const payload = {
    email: 'balaforyou@gmail.com',
    email_verified: true,
    ...overrides.claims,
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject((overrides.claims?.sub as string) ?? '1234567890')
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '1h')
    .sign(overrides.signWith ?? privateKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const pubJwk = { ...(await exportJWK(kp.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  goodJwks = createLocalJWKSet({ keys: [pubJwk] });

  const other = await generateKeyPair('RS256');
  const otherJwk = { ...(await exportJWK(other.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  otherJwks = createLocalJWKSet({ keys: [otherJwk] });
});

describe('verifyGoogleIdToken', () => {
  it('accepts a well-formed token and returns lower-cased email + sub', async () => {
    const token = await makeToken({ claims: { email: 'BalaForYou@Gmail.com', sub: 'sub-abc' } });
    const identity = await verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID });
    expect(identity).toEqual({ email: 'balaforyou@gmail.com', googleId: 'sub-abc' });
  });

  it('accepts the bare "accounts.google.com" issuer spelling', async () => {
    const token = await makeToken({ iss: 'accounts.google.com' });
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID })).resolves.toBeDefined();
  });

  it('rejects a token signed by a different key', async () => {
    const token = await makeToken();
    await expect(verifyGoogleIdToken(token, { jwks: otherJwks, clientId: CLIENT_ID }))
      .rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('rejects a wrong audience', async () => {
    const token = await makeToken({ aud: 'someone-elses-client-id' });
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID }))
      .rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('rejects a wrong issuer', async () => {
    const token = await makeToken({ iss: 'https://evil.example.com' });
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID }))
      .rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('rejects an expired token', async () => {
    const token = await makeToken({ expiresIn: '-5m' });
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID }))
      .rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('honours a currentDate override (token valid only in the past)', async () => {
    const token = await makeToken({ expiresIn: '-1m' });
    const identity = await verifyGoogleIdToken(token, {
      jwks: goodJwks,
      clientId: CLIENT_ID,
      currentDate: new Date(Date.now() - 5 * 60 * 1000),
    });
    expect(identity.email).toBe('balaforyou@gmail.com');
  });

  it('rejects when email_verified is explicitly false', async () => {
    const token = await makeToken({ claims: { email_verified: false } });
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID }))
      .rejects.toThrow(/not verified/i);
  });

  it('rejects a token with no sub claim', async () => {
    // Sign without a subject.
    const token = await new SignJWT({ email: 'x@y.com', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: CLIENT_ID }))
      .rejects.toThrow(/missing the email or sub/i);
  });

  it('rejects when no clientId is configured', async () => {
    const token = await makeToken();
    await expect(verifyGoogleIdToken(token, { jwks: goodJwks, clientId: '' }))
      .rejects.toThrow(/GOOGLE_OAUTH_CLIENT_ID is not configured/);
  });
});

// ---------------------------------------------------------------------------
// resolveAdminUser — in-memory fake for the two Prisma calls it makes.
// ---------------------------------------------------------------------------

interface FakeUser { id: string; tenantId: string; email: string | null; googleId: string | null }
interface FakeRA { userId: string; tenantId: string; role: 'OWNER' | 'BRANCH_MANAGER' | 'FRONT_DESK' }

function fakePrisma(users: FakeUser[], roleAssignments: FakeRA[]): AdminGoogleAuthPrisma {
  return {
    user: {
      findMany: async ({ where }: any) => {
        const [{ googleId }, { email }] = where.OR;
        return users
          .filter((u) => u.googleId === googleId || u.email === email)
          .map((u) => ({ id: u.id, tenantId: u.tenantId }));
      },
    },
    roleAssignment: {
      count: async ({ where }: any) => {
        const roles: string[] = where.role.in;
        return roleAssignments.filter(
          (ra) =>
            ra.userId === where.userId &&
            ra.tenantId === where.tenantId &&
            roles.includes(ra.role),
        ).length;
      },
    },
  } as unknown as AdminGoogleAuthPrisma;
}

const IDENTITY = { email: 'balaforyou@gmail.com', googleId: 'google-sub-1' };

describe('resolveAdminUser', () => {
  it('not_found when no User row matches', async () => {
    const prisma = fakePrisma([], []);
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({ kind: 'not_found' });
  });

  it('role_excluded when the matched user has no RoleAssignment', async () => {
    const prisma = fakePrisma(
      [{ id: 'u1', tenantId: 't-jbc', email: IDENTITY.email, googleId: null }],
      [],
    );
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({ kind: 'role_excluded' });
  });

  it('role_excluded when the only role is FRONT_DESK', async () => {
    const prisma = fakePrisma(
      [{ id: 'u1', tenantId: 't-jbc', email: IDENTITY.email, googleId: null }],
      [{ userId: 'u1', tenantId: 't-jbc', role: 'FRONT_DESK' }],
    );
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({ kind: 'role_excluded' });
  });

  it('ok for a single-tenant OWNER match (matched by email)', async () => {
    const prisma = fakePrisma(
      [{ id: 'u1', tenantId: 't-jbc', email: IDENTITY.email, googleId: null }],
      [{ userId: 'u1', tenantId: 't-jbc', role: 'OWNER' }],
    );
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({
      kind: 'ok',
      userId: 'u1',
      tenantId: 't-jbc',
    });
  });

  it('ok for a single-tenant BRANCH_MANAGER match (matched by googleId)', async () => {
    const prisma = fakePrisma(
      [{ id: 'u1', tenantId: 't-jbc', email: null, googleId: IDENTITY.googleId }],
      [{ userId: 'u1', tenantId: 't-jbc', role: 'BRANCH_MANAGER' }],
    );
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({ kind: 'ok', userId: 'u1', tenantId: 't-jbc' });
  });

  it('ok (no role collapse) when the user holds both OWNER and BRANCH_MANAGER in one tenant', async () => {
    const prisma = fakePrisma(
      [{ id: 'u1', tenantId: 't-jbc', email: IDENTITY.email, googleId: IDENTITY.googleId }],
      [
        { userId: 'u1', tenantId: 't-jbc', role: 'BRANCH_MANAGER' },
        { userId: 'u1', tenantId: 't-jbc', role: 'OWNER' },
      ],
    );
    // Resolution carries no role — the JWT's roles array (from tenant-management) does.
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({ kind: 'ok', userId: 'u1', tenantId: 't-jbc' });
  });

  it('multiple_tenant_match when admin roles exist in two tenants', async () => {
    const prisma = fakePrisma(
      [
        { id: 'u-jbc', tenantId: 't-jbc', email: IDENTITY.email, googleId: null },
        { id: 'u-co1', tenantId: 't-co1', email: null, googleId: IDENTITY.googleId },
      ],
      [
        { userId: 'u-jbc', tenantId: 't-jbc', role: 'OWNER' },
        { userId: 'u-co1', tenantId: 't-co1', role: 'OWNER' },
      ],
    );
    const res = await resolveAdminUser(prisma, IDENTITY);
    expect(res.kind).toBe('multiple_tenant_match');
    expect((res as any).tenantIds.sort()).toEqual(['t-co1', 't-jbc']);
  });

  it('ok (single) when two user rows match but only one carries an admin role', async () => {
    const prisma = fakePrisma(
      [
        { id: 'u-jbc', tenantId: 't-jbc', email: IDENTITY.email, googleId: null },
        { id: 'u-co1', tenantId: 't-co1', email: null, googleId: IDENTITY.googleId },
      ],
      [
        { userId: 'u-jbc', tenantId: 't-jbc', role: 'OWNER' },
        { userId: 'u-co1', tenantId: 't-co1', role: 'FRONT_DESK' },
      ],
    );
    expect(await resolveAdminUser(prisma, IDENTITY)).toMatchObject({ kind: 'ok', tenantId: 't-jbc' });
  });

  it('ignores a RoleAssignment whose tenantId is not the user\'s own tenant', async () => {
    // Stray row: same userId, OWNER, but tenantId points elsewhere. The (userId, tenantId)
    // scoping must exclude it — otherwise this would read as an admin match.
    const prisma = fakePrisma(
      [{ id: 'u1', tenantId: 't-jbc', email: IDENTITY.email, googleId: null }],
      [{ userId: 'u1', tenantId: 't-other', role: 'OWNER' }],
    );
    expect(await resolveAdminUser(prisma, IDENTITY)).toEqual({ kind: 'role_excluded' });
  });
});
