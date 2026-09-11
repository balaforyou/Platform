-- F-229: admin-assisted manual / walk-in booking — an admin books a court for a guest who is
-- physically present or on the phone (see docs/findings_register.md F-229, Step 1).
--
-- Purely additive: one nullable column on "User", no backfill, no existing row's meaning
-- changes. Every existing User row gets NULL. The walk-in identity route (POST /users/walk-in,
-- Step 2) sets it on create; nothing reads it as required.
--
-- Distinct from F-219 (admin-v2-identity-pipeline-discards-google-name-photo), whose plan adds a
-- separate Google-profile-sourced displayName/photoUrl pair — not yet built. This "name" is the
-- admin-entered guest name, the admin being the trust boundary rather than an OTP exchange.

ALTER TABLE "User" ADD COLUMN     "name" TEXT;
