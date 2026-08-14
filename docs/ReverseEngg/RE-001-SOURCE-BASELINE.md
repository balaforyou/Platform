# RE-001 Source Baseline

## 1. Repository Baseline

Repository/project name: `badminton-platform`

Observed structure: pnpm monorepo with workspaces under `apps/*`, `services/*`, and `packages/*`.

Applications:

- `apps/admin-web` - Vite/React admin web application.
- `apps/guest-member-pwa` - Vite/React guest/member PWA with Playwright tests and PWA assets.

Backend services:

- `services/identity-auth`
- `services/tenant-management`
- `services/slot-engine`
- `services/payment`
- `services/notification`

Shared packages:

- `packages/database`
- `packages/job-scheduler`
- `packages/shared-middleware`
- `packages/shared-types`
- `packages/test-harness`
- `packages/ui-shared`

Database technology: PostgreSQL via Prisma. The current Prisma schema is in `packages/database/prisma/schema.prisma`; migrations are under `packages/database/prisma/migrations`.

Major infrastructure/tooling visible from repository evidence:

- Node.js >= 20, pnpm 11 workspace.
- TypeScript across services, packages, and apps.
- Fastify backend services.
- Prisma client and migrations.
- React, Vite, React Router, TanStack Query for frontends.
- Playwright for PWA E2E tests.
- Docker Compose and Caddy deployment/proxy configuration.
- GCP VM deployment files under `deploy/gcp-vm`.
- Regression runner scripts under `scripts`.

## 2. Source Inventory

| Source ID | Path | Source Type | Evidence Level | Status | Purpose | Later Use | Notes |
|---|---|---|---|---|---|---|---|
| SRC-001 | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, package manifests | Config | A | CURRENT | Defines monorepo identity, workspace layout, scripts, runtime/tool dependencies. | Establish executable project topology and supported verification commands. | Includes root scripts for regression, typecheck, Prisma, and deploy verification. |
| SRC-002 | `apps/admin-web` | Code / Frontend app | A | CURRENT | Current admin web application implementation. | Establish current admin UI surface and client-side integration points. | Vite/React application depending on shared frontend packages. |
| SRC-003 | `apps/guest-member-pwa` | Code / Frontend app / Test | A | CURRENT | Current guest/member PWA implementation, public PWA assets, and Playwright tests. | Establish current guest/member UI surface, PWA behavior, and E2E verification scope. | Includes `public/sw.js`, `logo.png`, and browser tests. |
| SRC-004 | `services/identity-auth` | Code / Backend service / Test | A | CURRENT | Current identity/auth Fastify service and service regression tests. | Establish current executable auth API behavior and regression evidence surface. | Current worktree has no reported local modifications in this service. |
| SRC-005 | `services/tenant-management` | Code / Backend service / Test | A | CURRENT | Current tenant/branch/role management Fastify service and regression tests. | Establish current executable tenant-management API behavior and regression evidence surface. | Current worktree has no reported local modifications in this service. |
| SRC-006 | `services/slot-engine` | Code / Backend service / Test | A | CURRENT | Current slot/resource/booking engine implementation and regression tests. | Establish current executable slot and booking behavior and regression evidence surface. | `git status` showed local modifications in `src/index.ts` and `src/regression/low-occupancy-release.regression.ts`; latest repository contents are still the Phase 1 baseline per instruction. |
| SRC-007 | `services/payment` | Code / Backend service / Test | A | CURRENT | Current payment Fastify service and regression tests. | Establish current executable payment, refund, webhook, and pricing verification surface. | Uses Razorpay dependency per manifest. |
| SRC-008 | `services/notification` | Code / Backend service / Queue / Test | A | CURRENT | Current notification Fastify service, queue implementation, and regression tests. | Establish current executable notification dispatch and retry behavior surface. | Includes service regression and cross-service E2E regression files. |
| SRC-009 | `packages/database` | Schema / Code / Migration | A | CURRENT | Prisma schema, generated-client export package, database build scripts, migrations. | Establish database model, constraints, migration history, and generated-client boundary. | PostgreSQL datasource; generated client output configured under `src/generated/client`. |
| SRC-010 | `packages/job-scheduler` | Code / Job runtime / Test | A | CURRENT | Shared scheduled job runtime, SQL store, types, and phase test. | Establish current scheduler executable surface and job persistence model. | Database schema contains scheduled job tables. |
| SRC-011 | `packages/shared-middleware`, `packages/shared-types`, `packages/ui-shared`, `packages/test-harness` | Code / Shared package / Test support | A | CURRENT | Shared middleware, shared TypeScript types, shared UI/auth/tenant contexts/API helpers, and regression harness utilities. | Establish shared contracts, cross-service helpers, and test infrastructure. | `ui-shared` package has peer dependency versions that differ from `guest-member-pwa` dependency versions; see SOURCE-CONFLICT-001. |
| SRC-012 | `scripts`, root `*.bat`, `*.ps1`, `.env.example`, `tsconfig.json`, `.eslintrc.json`, `.npmrc`, `docker-compose.yml`, `Caddyfile`, `deploy/gcp-vm` | Config / Script / Infrastructure | A | CURRENT | Runtime, local development, deployment, proxy, verification, and build configuration. | Establish executable operational baseline and deployment topology evidence. | `.env` exists locally but should be treated as environment-specific evidence, not committed specification. |
| SRC-013 | `apps/**/tests`, `services/**/src/regression`, `packages/job-scheduler/tests`, `scripts/test-regression.mjs`, `scripts/verify-deployment.mjs` | Test / Verification executable | A | CURRENT | Current automated regression, E2E, scheduler, and deployment verification commands. | Establish executable verification coverage and known test entrypoints. | No tests were run in Phase 1 because activity was read-only inventory. |
| SRC-014 | `docs/findings_register.md`, `docs/regression_suite_migration_map.md`, completion walkthroughs, UX Business Review evidence PNG/JSON files | Finding / Verification | B | SUPPORTING | Verification records, findings, migration map, walkthrough outputs, and captured evidence. | Establish known defect/verification history and completed-checkpoint evidence. | Verification documents may describe past runs; currency must be assessed against current executable tests later. |
| SRC-015 | `docs/*_api_spec.md`, `docs/api_standards_cross_cutting.md`, `docs/tech_stack_architecture.md`, `docs/frontend_stack_architecture.md`, `docs/platform_core_reusable_components.md`, diagrams | Design / API spec / Architecture | C | POTENTIALLY_STALE | API contracts, technical architecture, frontend architecture, reusable component design, and diagrams. | Understand intended technical design and external/API contracts. | Do not assume these match current implementation without later comparison. |
| SRC-016 | `docs/badminton_app_discovery_brief.md`, `docs/business_discovery_session2_consolidated.md`, `docs/pricing_model.md`, flow diagrams | Business / Design | C | POTENTIALLY_STALE | Business discovery, pricing model, booking flow, and product intent. | Understand intended business behavior and product rules in later phases. | Business documents include version/date markers but not a single current-authoritative spec marker. |
| SRC-017 | `docs/driver_rental_app_discovery_brief.md` | Business / Design | C | UNKNOWN | Non-badminton discovery brief present in repository. | Possible comparative/reference material if later phases confirm relevance. | Material relationship to current badminton platform is unclear. |
| SRC-018 | `docs/coding_assistant_handover_plan.md`, `docs/conversation_handoff_31jul2026.md` | Handover / Historical | D | HISTORICAL | Handover and assistant-continuity material. | Understand repository evolution and previous context if needed. | Historical by naming/content; not current implementation evidence. |
| SRC-019 | `docs/mvp_retrofit_plan.md`, `docs/admin_web_phase_plan.md`, `docs/gcp_zero_cost_deployment_kickoff.md`, `docs/deployment_retrospective_and_platform_hardening.md`, `docs/deploy_via_dockerhub_reference.md` | Plan / Deployment doc | C / D | POTENTIALLY_STALE | Retrofit, admin phase, deployment kickoff/retrospective/reference material. | Understand intended rollout/deployment context and historical deployment choices. | `docs/deploy_via_dockerhub_reference.md` is untracked in current worktree. |
| SRC-020 | `Implementation_Plan/**` | Plan / Kickoff / Completion / Walkthrough / Evidence | D, with B for completion evidence | HISTORICAL / SUPPORTING | Phase plans, kickoff prompts, tasks, completion walkthroughs, screenshots, and evidence captures across Phases 0-10, Tier1, Admin UI, PWA, UX review. | Understand implementation chronology, completed checkpoints, and prior verification evidence. | Directory names contain spelling variants such as `Completiion` and `Complettion`; version lineage is not normalized. |
| SRC-021 | `.github`, `deploy-package.tar`, `logs`, `test-results`, `node_modules`, generated/dist folders | Generated / Operational residue / CI | UNKNOWN | UNKNOWN | Local/generated/dependency/CI or operational artifacts. | Use only if later phases need provenance, CI evidence, or generated artifact comparison. | Not inventoried as authoritative implementation evidence except where package manifests explicitly reference generated outputs. |

Major evidence groups identified: 14.

## 3. Executable Evidence Map

Applications:

- `apps/admin-web` provides the current admin web frontend.
- `apps/guest-member-pwa` provides the current guest/member PWA frontend, PWA shell assets, and Playwright E2E tests.

Backend services:

- `services/identity-auth` provides the current identity/auth service.
- `services/tenant-management` provides the current tenant/branch/role management service.
- `services/slot-engine` provides the current resource, availability, booking, member-assignment, and sweep-related service surface.
- `services/payment` provides the current payment/refund/webhook-related service surface.
- `services/notification` provides the current notification request/dispatch/retry service surface.

Database/schema:

- `packages/database/prisma/schema.prisma` defines the current Prisma data model.
- `packages/database/prisma/migrations` records migration history.
- `packages/database/src/index.ts` and generated client outputs define the database package boundary.

Jobs:

- `packages/job-scheduler` contains the current shared scheduler runtime, SQL store, and tests.
- Scheduled job tables are present in the Prisma schema.

Shared packages:

- `packages/shared-middleware` contains shared Fastify/middleware code.
- `packages/shared-types` contains shared TypeScript contracts.
- `packages/ui-shared` contains shared frontend API/context code.
- `packages/test-harness` contains shared test utilities.

Tests:

- Service regression suites exist under `services/*/src/regression`.
- PWA Playwright E2E tests exist under `apps/guest-member-pwa/tests`.
- Scheduler phase test exists under `packages/job-scheduler/tests`.
- Root scripts coordinate regression and deployment verification commands.

## 4. Documentation Evidence Map

Business discovery:

- `docs/badminton_app_discovery_brief.md`
- `docs/business_discovery_session2_consolidated.md`
- `docs/pricing_model.md`
- `docs/badminton_booking_flow.drawio`
- `docs/guest_booking_flow_mvp.svg`
- `docs/driver_rental_app_discovery_brief.md` has unclear relationship to the current platform.

Architecture/design:

- `docs/tech_stack_architecture.md`
- `docs/frontend_stack_architecture.md`
- `docs/platform_core_reusable_components.md`
- `docs/admin_web_phase_plan.md`
- `docs/gcp_deployment_diagram.drawio`

API/technical specification:

- `docs/identity_auth_service_api_spec.md`
- `docs/slot_resource_engine_api_spec.md`
- `docs/payment_service_api_spec.md`
- `docs/notification_service_api_spec.md`
- `docs/tenant_whitelabel_management_api_spec.md`
- `docs/tournament_module_api_spec.md`
- `docs/api_standards_cross_cutting.md`

Findings/verification:

- `docs/findings_register.md`
- `docs/regression_suite_migration_map.md`
- Completion walkthroughs under `Implementation_Plan/**/Completion`, `Completiion`, and `Complettion`.
- UX review and evidence captures under `Implementation_Plan/UX Business Review`.
- Phase evidence screenshots under `Implementation_Plan/Admin Web/F-035 Phase 1 Evidence`.

Implementation planning:

- `Implementation_Plan/Phase0` through `Implementation_Plan/Phase5`
- `Implementation_Plan/API`
- `Implementation_Plan/AdminUI`
- `Implementation_Plan/Admin Web Phase`
- `Implementation_Plan/GuestUI`
- `Implementation_Plan/Guest-Member PWA`
- `Implementation_Plan/PWA SHELL`
- `Implementation_Plan/Tier1`
- `Implementation_Plan/03-Chromeappprompt`
- `Implementation_Plan/GCP VM`

Historical/handover material:

- `docs/coding_assistant_handover_plan.md`
- `docs/conversation_handoff_31jul2026.md`
- Kickoff prompts and task files throughout `Implementation_Plan/**`.

Apparent version relationships:

- Phase-numbered implementation plans appear to precede corresponding `Completion` walkthroughs/tasks.
- Some completion walkthroughs summarize multiple earlier phases, so they are supporting verification/historical consolidation rather than sole current evidence.
- API/backend batch documents appear later than early Phase 1-5 documents and may supersede parts of earlier API intent, but Phase 1 does not resolve those relationships.
- UX Business Review contains dated review evidence and follow-up screenshots; currency relative to current UI code is uncertain.

## 5. Current vs Historical Assessment

Clearly current sources:

- Current TypeScript source under `apps`, `services`, and `packages`.
- Current Prisma schema and migration directory.
- Current root/workspace/package configuration.
- Current Docker/Caddy/deploy configuration.
- Current automated tests and test runner scripts.

Clearly historical sources:

- Kickoff prompts, implementation plans, task files, handovers, and prior phase walkthroughs under `Implementation_Plan/**`.
- `docs/conversation_handoff_31jul2026.md` and `docs/coding_assistant_handover_plan.md`.

Documents whose currency is uncertain:

- API specs in `docs/*_api_spec.md`.
- Architecture documents in `docs`.
- Business/pricing/discovery documents in `docs`.
- UX review findings and evidence captures.
- Deployment reference/retrospective documents.

Documents that appear superseded:

- Earlier phase implementation plans appear superseded by later completion walkthroughs for the same phase.
- `Implementation_Plan/Phase2/implementation_plan.md` and `Implementation_Plan/Phase2/phase2_implementation_plan.md` appear to be duplicate or variant Phase 2 plans.
- Phase completion walkthroughs that restate earlier phases appear to supersede earlier isolated walkthroughs only as historical summary, not as executable evidence.

## 6. Known Source Conflicts

SOURCE-CONFLICT-001

Source A:
`packages/ui-shared/package.json`

Source B:
`apps/guest-member-pwa/package.json`

Observed difference:
`packages/ui-shared` declares peer dependencies for React Router, Zod, TanStack Query, and Lucide versions that differ from versions listed directly by `apps/guest-member-pwa`.

Phase 1 disposition:
UNRESOLVED

SOURCE-CONFLICT-002

Source A:
`docs/badminton_app_discovery_brief.md` and other badminton platform documentation

Source B:
`docs/driver_rental_app_discovery_brief.md`

Observed difference:
Repository contains a non-badminton discovery brief alongside badminton platform source and documentation. Its relationship to the current platform evidence set is unclear.

Phase 1 disposition:
UNRESOLVED

## 7. Evidence Gaps

GAP-001: No single explicit current authoritative product/business specification was identified.

GAP-002: Documentation version lineage is incomplete or informal; multiple phase documents and completion summaries overlap.

GAP-003: API specifications were identified, but their currency relative to current service implementations is unverified.

GAP-004: Test coverage exists, but Phase 1 did not establish pass/fail status because no tests were run.

GAP-005: Environment configuration is only partially represented by repository files; `.env.example` exists, while local `.env` is environment-specific.

GAP-006: Generated, dependency, log, and test-result artifacts are present locally, but their provenance/currentness is not established.

GAP-007: CI evidence exists as a directory, but CI workflow contents were not classified beyond repository-level source inventory in this phase.

## 8. Phase 1 Conclusion

Readiness status:

READY WITH SOURCE UNCERTAINTIES

Evidence-related reason:

The repository contains sufficient executable, schema, migration, test, verification, design, and historical evidence to proceed to Phase 2 - Capability Discovery. Source uncertainties remain around documentation currency, overlapping historical plans, unverified test status, generated/local artifact provenance, and unresolved source conflicts.

