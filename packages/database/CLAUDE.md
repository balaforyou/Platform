# CLAUDE.md — packages/database/

Loaded automatically alongside root `CLAUDE.md` whenever a session touches files in this directory.

## Reuse this precedent before designing a new migration guard

F-067's and F-115's self-defending migration `DO $$` block pattern (`prisma/migrations/20260809120000_booking_rule_unique_per_pool_f067/`, `prisma/migrations/20260815140000_role_assignment_unique_f115/`) is the established way to make a migration safe to re-run. Check here before writing a new one from scratch — see root `CLAUDE.md` item 4 ("Reuse proven patterns").
