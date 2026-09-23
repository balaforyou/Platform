-- F-287: refresh-token rotation grace window. Two tabs on the same origin share one
-- refresh_token cookie but each run their own independent refresh timer -- when both land
-- within milliseconds of each other, the loser's own single-use token gets rotated away
-- before its request completes, and it hard-fails with no grace period. See
-- services/identity-auth/src/index.ts's POST /auth/refresh for the real fix.
--
-- Purely additive: two nullable columns on "AuthSession", no backfill, no existing row's
-- meaning changes. Every existing session gets NULL until its next real rotation --
-- fail-closed default, exactly today's behavior until then.

ALTER TABLE "AuthSession" ADD COLUMN     "previousRefreshToken" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN     "previousTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AuthSession_previousRefreshToken_key" ON "AuthSession"("previousRefreshToken");
