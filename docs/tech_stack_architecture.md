# Technical Stack & Repo Architecture (v0)

**Status:** Resolved (26 Jul 2026) for the badminton platform (Basic tier + premium add-ons). Does not apply to the driver app, which is a separate codebase/team decision.
**Related docs:** All five Basic-tier service specs, `platform_core_reusable_components.md`, `frontend_stack_architecture.md` (covers the frontend half — this doc is backend/infra only)

---

## 1. Decided stack

| Layer | Choice | Why |
|---|---|---|
| Backend language | TypeScript (Node.js) | One language across backend + frontend, minimizing context-switching for SME code review of AI-generated output |
| Backend framework | Fastify | Minimal framework magic, easier to review line-by-line than a heavier convention-based framework |
| ORM | Prisma | Type-safe schema + migrations, matches the PostgreSQL decision from the Slot Engine spec |
| Database | PostgreSQL via Google Cloud SQL (Mumbai/`asia-south1`) | Transactional/locking guarantees from the Slot Engine spec, plus single-cloud deployment with the backend |
| Frontend (guest/member PWA + admin web) | React + TypeScript + Vite | Same language as backend; Vite gives fast dev iteration; PWA tooling (manifest/service worker) is mature in this ecosystem |
| Repo structure | Monorepo, pnpm workspaces | All 5 badminton-side services + PWA + admin app in one repo — doesn't conflict with the badminton/driver separate-codebase decision, since that was about two different businesses, not internal service boundaries |

## 2. Proposed monorepo layout

```
badminton-platform/
├── services/
│   ├── slot-engine/
│   ├── identity-auth/
│   ├── tenant-management/
│   ├── payment/
│   └── notification/
├── apps/
│   ├── guest-member-pwa/        (React, installable per-tenant white-label)
│   └── admin-web/               (React, desktop-only, role-gated)
├── packages/
│   └── shared-types/            (TypeScript types shared across services + apps — API contracts as code)
└── prisma/                      (schema + migrations, likely one per service or one shared, TBD at build time)
```

Each service under `services/` is independently deployable (matches the "reusable unit is the service, not shared code" decision), but they can still share a `shared-types` package within the monorepo for type-safe API contracts between them — useful since it's one team building all five right now.

## 3. Open decisions

- One shared Prisma schema/database vs. one database per service (true microservice isolation) — given a small team and the services being tightly related, a single database with logically separated tables (enforced by tenant_id scoping, not physical DB separation) is simpler to operate; full DB-per-service isolation is more correct in theory but adds real operational overhead at this scale.
- Testing strategy — unit tests per service, plus integration tests specifically for the concurrency-safety logic flagged in the Slot Engine spec (Section 5) and the payment webhook idempotency logic (Payment spec Section 4) — these are the two places a bug would be expensive, so they deserve dedicated test coverage even if overall coverage stays modest elsewhere.

## 4. Deployment (decided 26 Jul 2026)

**BYOC (each customer running their own cloud account) was considered twice and rejected both times** (26 Jul 2026) — once as the primary hosting model, and again as a "managed BYOC via GCP Marketplace" variant where the platform deploys into each customer's own project. Both reduce your margin (customers capture the infra cost savings directly rather than benefiting from shared-infra economics) and increase onboarding friction (each customer needs their own cloud billing account) — directly against the self-service, low-friction onboarding this whole architecture was built around. **Parked idea for later:** a managed-BYOC option could resurface as a premium **enterprise tier** for a future large multi-city customer specifically demanding data sovereignty — conceptually separate from the Basic/Premium tiering used for the actual 20-customer pipeline, and not something to build now.

**Chosen: single shared deployment on Google Cloud Platform, Mumbai region.**

| Layer | Choice | Why |
|---|---|---|
| Backend (5 services) | **Cloud Run**, `asia-south1` (Mumbai) | Managed serverless containers, scales to zero when idle, real in-India hosting (vs. Railway/Render's Singapore-only presence) — matters for both latency and likely DPDP data-residency considerations given the app handles Indian users' payment/personal data |
| Database | **Cloud SQL** (PostgreSQL), `asia-south1` | Single-cloud, single bill; low latency to Cloud Run in the same region |
| Frontend (guest/member PWA + admin web) | **Firebase Hosting** | Stays on GCP; paired with Cloud Run/Cloud Functions to serve the dynamic per-tenant `manifest.json` already specced in the Tenant service, for white-label subdomain routing |

**Why India-region hosting mattered enough to reject the cheaper/easier options:** Hetzner is meaningfully cheaper but has no confirmed India region; Railway and Render are both Singapore-closest (~100-150ms added latency), and multiple reports link this to DPDP compliance friction for India-focused apps handling personal/payment data. Mumbai hosting for both compute and database sidesteps both concerns.

## 4a. Local development database (added 26 Jul 2026)

Cloud SQL has no free tier — it's billed per-second while running, regardless of actual usage, so using it directly for day-to-day development is both wasteful and a real risk of quietly burning through the $300 new-customer credit. Standard practice instead:

- **Local development:** PostgreSQL via Docker on the dev machine — free, faster (no network round-trip), works offline, and Prisma migrations apply identically to local or cloud Postgres
- **Cloud SQL:** reserved for staging and production only, where its managed backups/failover actually matter

Add a `docker-compose.yml` with a local Postgres service as part of Phase 0 repo scaffolding (`coding_assistant_handover_plan.md`), so this is the default from day one rather than something to retrofit.

## 4b. Database migration workflow (added 29 Jul 2026, restored to canonical doc 30 Jul 2026)

**Note:** this section was originally added by the coding agent directly to its local copy of this doc during the Phase 3 checkpoint, and only just reconciled back into this canonical version — flagging so the gap and its cause are on record, not just silently patched.

- **Interactive developer workflow (default):** use `prisma migrate dev` for routine local migrations — prompts, tracks, and applies changes interactively.
- **Non-interactive / CI/CD / automated-agent-shell workflow:** when running in a non-interactive environment (like the coding agent's sandbox) where a static schema-change warning (e.g. adding a unique constraint to a table Prisma can't confirm is empty) would otherwise halt `migrate dev` waiting for a prompt that never comes, use instead:
  1. `prisma migrate diff` — generates the migration SQL non-interactively
  2. `prisma migrate deploy` — applies the generated SQL

  This is a **fallback for automation, not a replacement for the interactive default** — real production data should still go through the standard interactive workflow wherever a human is actually present to review the prompt.
- Raw SQL migrations that can't be expressed in Prisma schema syntax (e.g. a Postgres partial unique index) follow the same non-interactive `diff`/`deploy` pipeline once the hand-written SQL file is in place — no separate migration mechanism needed for these.

## 5. Decision log

| Date | Decision |
|---|---|
| 26 Jul 2026 | Language/framework/repo structure: TypeScript, Fastify, pnpm monorepo |
| 26 Jul 2026 | BYOC rejected — conflicts with self-service onboarding goal |
| 26 Jul 2026 | Backend: Cloud Run, Mumbai (`asia-south1`) |
| 26 Jul 2026 | Database: Cloud SQL, Mumbai (`asia-south1`) |
| 26 Jul 2026 | Frontend/PWA: Firebase Hosting |

---
*All 5 Basic-tier backend services are built and approved. Current phase: PWA shell (see `pwa_shell_kickoff_prompt.md` and `frontend_stack_architecture.md`).*
