-- F-196: WebAuthn / fingerprint step-up for admin-v2.
--
-- Purely additive: one new table plus a back-relation on User. No existing row's
-- meaning changes, nothing to backfill. A row is only ever written by an
-- already-Google-authenticated admin through
-- identity-auth POST /auth/admin/webauthn/register/verify.
--
-- publicKey is BYTEA (the COSE public key bytes from @simplewebauthn/server's
-- verifyRegistrationResponse). counter is BIGINT: the authenticator signature counter,
-- compared on every assertion to catch cloned-authenticator replay.

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
