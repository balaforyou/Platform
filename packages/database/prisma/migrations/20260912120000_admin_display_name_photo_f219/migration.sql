-- F-219: admin-v2's identity pipeline discards the Google ID token's `name`/`picture`
-- claims. Persist them on the User row (not JWT-only) so a real name/photo survives
-- /auth/refresh and shows up on WebAuthn/passkey logins too, both of which never
-- re-contact Google (see handover for F-219, 12 Sep 2026).
--
-- Purely additive: two nullable columns on "User", no backfill, no existing row's
-- meaning changes. Every existing User row gets NULL. Written once, on a successful
-- real Google login (dev-login path explicitly skips this write).
--
-- Distinct from F-229's "name" column (admin-entered walk-in guest name, admin is the
-- trust boundary) — see that column's own comment in schema.prisma.

ALTER TABLE "User" ADD COLUMN     "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN     "photoUrl" TEXT;
