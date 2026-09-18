import { describe, it, expect } from 'vitest';
import { findOrCreateMemberUser, type MemberAuthPrisma } from '../src/memberGoogleAuth';

interface FakeUser {
  id: string;
  tenantId: string;
  email: string | null;
  googleId: string | null;
  phone: string | null;
  userType: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  displayName?: string | null;
  photoUrl?: string | null;
}

function matches(u: FakeUser, tenantId: string, googleId: string, email: string): boolean {
  return u.tenantId === tenantId && (u.googleId === googleId || u.email === email);
}

/**
 * Fake Prisma, same style as adminGoogleAuth.test.ts's fakePrisma: in-memory rows, a
 * `create` that can be told to throw a P2002 once to simulate a concurrent-create race.
 */
function fakePrisma(
  initial: FakeUser[],
  opts: { throwP2002OnCreate?: boolean } = {},
): { prisma: MemberAuthPrisma; rows: FakeUser[] } {
  const rows = [...initial];
  let createCalls = 0;
  let nextId = rows.length + 1;

  const prisma = {
    user: {
      findFirst: async ({ where }: any) => {
        const [{ googleId }, { email }] = where.OR;
        return rows.find((u) => matches(u, where.tenantId, googleId, email)) ?? null;
      },
      create: async ({ data }: any) => {
        createCalls += 1;
        if (opts.throwP2002OnCreate && createCalls === 1) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        const row: FakeUser = {
          id: `u${nextId++}`,
          tenantId: data.tenantId,
          email: data.email,
          googleId: data.googleId,
          phone: data.phone,
          userType: data.userType,
          isPhoneVerified: data.isPhoneVerified,
          isEmailVerified: data.isEmailVerified,
          displayName: data.displayName ?? null,
          photoUrl: data.photoUrl ?? null,
        };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((u) => u.id === where.id);
        if (!row) throw new Error('row not found');
        row.displayName = data.displayName;
        row.photoUrl = data.photoUrl;
        return row;
      },
    },
  } as unknown as MemberAuthPrisma;

  return { prisma, rows };
}

const IDENTITY = { email: 'balaforyou@gmail.com', googleId: 'google-sub-1' };
const TENANT_ID = 't-jbc';

describe('findOrCreateMemberUser', () => {
  it('creates a new GUEST row when no existing user matches', async () => {
    const { prisma, rows } = fakePrisma([]);
    const result = await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(result.isNewSignup).toBe(true);
    expect(result.user).toMatchObject({
      tenantId: TENANT_ID,
      email: IDENTITY.email,
      googleId: IDENTITY.googleId,
      userType: 'GUEST',
      phone: null,
      isPhoneVerified: false,
      isEmailVerified: true,
    });
    expect(rows).toHaveLength(1);
  });

  it('returns an existing row matched by googleId only, unchanged', async () => {
    const existing: FakeUser = {
      id: 'u1', tenantId: TENANT_ID, email: null, googleId: IDENTITY.googleId,
      phone: null, userType: 'MEMBER', isPhoneVerified: true, isEmailVerified: false,
    };
    const { prisma, rows } = fakePrisma([existing]);
    const result = await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(result.isNewSignup).toBe(false);
    expect(result.user).toEqual(existing);
    expect(rows).toHaveLength(1);
  });

  it('returns an existing row matched by email only, unchanged', async () => {
    const existing: FakeUser = {
      id: 'u1', tenantId: TENANT_ID, email: IDENTITY.email, googleId: null,
      phone: '9999999999', userType: 'GUEST', isPhoneVerified: true, isEmailVerified: false,
    };
    const { prisma, rows } = fakePrisma([existing]);
    const result = await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(result.isNewSignup).toBe(false);
    expect(result.user).toEqual(existing);
    expect(rows).toHaveLength(1);
  });

  it('does not match a row in a different tenant', async () => {
    const otherTenant: FakeUser = {
      id: 'u1', tenantId: 't-other', email: IDENTITY.email, googleId: IDENTITY.googleId,
      phone: null, userType: 'MEMBER', isPhoneVerified: true, isEmailVerified: true,
    };
    const { prisma, rows } = fakePrisma([otherTenant]);
    const result = await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(result.isNewSignup).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('recovers via re-findFirst on a concurrent P2002 create race, without duplicating the row', async () => {
    const { prisma, rows } = fakePrisma([], { throwP2002OnCreate: true });

    // Seed the row that "won" the race directly into the fake store, simulating a second
    // concurrent request that completed its create between our create() throwing and our
    // re-findFirst() running.
    rows.push({
      id: 'winner', tenantId: TENANT_ID, email: IDENTITY.email, googleId: IDENTITY.googleId,
      phone: null, userType: 'GUEST', isPhoneVerified: false, isEmailVerified: true,
    });

    const result = await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(result.isNewSignup).toBe(false);
    expect(result.user.id).toBe('winner');
    expect(rows).toHaveLength(1);
  });

  it('rethrows a non-P2002 error from create', async () => {
    const prisma: MemberAuthPrisma = {
      user: {
        findFirst: async () => null,
        create: async () => {
          throw new Error('connection lost');
        },
      },
    } as unknown as MemberAuthPrisma;

    await expect(findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID)).rejects.toThrow('connection lost');
  });

  // F-248: real coverage for the new displayName/photoUrl capture -- neither path persisted
  // Google's real name/photo before this fix.
  const IDENTITY_WITH_PROFILE = { ...IDENTITY, name: 'Bala K', picture: 'https://example.com/p.jpg' };

  it('persists displayName/photoUrl on a brand-new signup when the identity carries them', async () => {
    const { prisma, rows } = fakePrisma([]);
    const result = await findOrCreateMemberUser(prisma, IDENTITY_WITH_PROFILE, TENANT_ID);

    expect(result.user).toMatchObject({ displayName: 'Bala K', photoUrl: 'https://example.com/p.jpg' });
    expect(rows[0]).toMatchObject({ displayName: 'Bala K', photoUrl: 'https://example.com/p.jpg' });
  });

  it('creates displayName/photoUrl as null when the identity carries neither (OTP-style, no Google profile)', async () => {
    const { rows, prisma } = fakePrisma([]);
    await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(rows[0]).toMatchObject({ displayName: null, photoUrl: null });
  });

  it('merges real name/photo onto an existing row that never had them, via a real update', async () => {
    const existing: FakeUser = {
      id: 'u1', tenantId: TENANT_ID, email: IDENTITY.email, googleId: IDENTITY.googleId,
      phone: null, userType: 'GUEST', isPhoneVerified: true, isEmailVerified: false,
      displayName: null, photoUrl: null,
    };
    const { prisma, rows } = fakePrisma([existing]);
    const result = await findOrCreateMemberUser(prisma, IDENTITY_WITH_PROFILE, TENANT_ID);

    expect(result.isNewSignup).toBe(false);
    expect(result.user).toMatchObject({ displayName: 'Bala K', photoUrl: 'https://example.com/p.jpg' });
    expect(rows[0]).toMatchObject({ displayName: 'Bala K', photoUrl: 'https://example.com/p.jpg' });
  });

  it('never overwrites an existing displayName/photoUrl when a later login carries neither (`??`-merge, not a blind overwrite)', async () => {
    const existing: FakeUser = {
      id: 'u1', tenantId: TENANT_ID, email: IDENTITY.email, googleId: IDENTITY.googleId,
      phone: null, userType: 'GUEST', isPhoneVerified: true, isEmailVerified: false,
      displayName: 'Already Real Name', photoUrl: 'https://example.com/already.jpg',
    };
    const { prisma, rows } = fakePrisma([existing]);
    // IDENTITY (no name/picture) simulates a token response missing the claim.
    const result = await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);

    expect(result.isNewSignup).toBe(false);
    expect(result.user).toEqual(existing);
    expect(rows[0]).toEqual(existing);
  });

  it('does not call update at all when the existing row already has both and the identity carries neither', async () => {
    const existing: FakeUser = {
      id: 'u1', tenantId: TENANT_ID, email: IDENTITY.email, googleId: IDENTITY.googleId,
      phone: null, userType: 'GUEST', isPhoneVerified: true, isEmailVerified: false,
      displayName: 'Already Real Name', photoUrl: null,
    };
    let updateCalled = false;
    const prisma: MemberAuthPrisma = {
      user: {
        findFirst: async () => existing,
        update: async (args: any) => { updateCalled = true; return args; },
      },
    } as unknown as MemberAuthPrisma;

    await findOrCreateMemberUser(prisma, IDENTITY, TENANT_ID);
    expect(updateCalled).toBe(false);
  });
});
