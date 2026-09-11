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
        };
        rows.push(row);
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
});
