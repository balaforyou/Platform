/**
 * Member/guest Google sign-in — find-or-create against a verified Google identity.
 *
 * Kept separate from adminGoogleAuth.ts (which is deliberately a separate path with its own
 * role gate) — this only does the DB-side find-or-create for /auth/google/verify (index.ts).
 * Crypto/claims verification stays in adminGoogleAuth.ts's verifyGoogleIdToken, shared by both
 * routes. Pure Prisma logic with no JWKS dependency, so it's unit-testable with an in-memory
 * fake (test/memberGoogleAuth.test.ts), same shape as adminGoogleAuth.ts's resolveAdminUser.
 */
import type { PrismaClient, User } from '@badminton/database';
import { UserType } from '@badminton/database';
import type { VerifiedGoogleIdentity } from './adminGoogleAuth';

export type MemberAuthPrisma = Pick<PrismaClient, 'user'>;

export interface MemberUserResult {
  user: User;
  isNewSignup: boolean;
}

/**
 * Find an existing User by googleId or email (tenant-scoped), or create a new GUEST row for a
 * brand-new Google identity. `isEmailVerified: true` on create is honest here — verifyGoogleIdToken
 * already rejects `email_verified === false` before this runs, so a token that reaches this
 * point carries a Google-confirmed email.
 */
export async function findOrCreateMemberUser(
  prisma: MemberAuthPrisma,
  identity: VerifiedGoogleIdentity,
  tenantId: string,
): Promise<MemberUserResult> {
  const where = {
    tenantId,
    OR: [{ googleId: identity.googleId }, { email: identity.email }],
  };

  const existing = await prisma.user.findFirst({ where });
  if (existing) return { user: existing, isNewSignup: false };

  try {
    const created = await prisma.user.create({
      data: {
        tenantId,
        googleId: identity.googleId,
        email: identity.email,
        userType: UserType.GUEST,
        isPhoneVerified: false,
        isEmailVerified: true,
        phone: null,
      },
    });
    return { user: created, isNewSignup: true };
  } catch (e: any) {
    // P2002: a concurrent Google sign-in for the same brand-new identity (two tabs completing
    // sign-in at once). Same catch-and-re-findFirst shape as /users/walk-in's P2002 catch
    // (index.ts) — re-read with the same OR filter since email/googleId are two independent
    // @@unique constraints, not one compound key.
    if (e?.code === 'P2002') {
      const raced = await prisma.user.findFirst({ where });
      if (raced) return { user: raced, isNewSignup: false };
    }
    throw e;
  }
}
