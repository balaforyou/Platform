# Frontend / UI Stack (v0)

**Status:** Decided 29 Jul 2026, for the guest/member PWA and admin web.
**Related docs:** `tech_stack_architecture.md` (Section 1 — React/TypeScript/Vite already locked there), `tenant_whitelabel_management_api_spec.md`, `api_standards_cross_cutting.md`

---

## 1. Decided stack

| Concern | Choice | Why |
|---|---|---|
| Styling | Tailwind CSS + CSS custom properties for tenant branding | Fast to build with; the CSS-variable layer lets one Tailwind build serve 20+ differently-branded tenants without a per-tenant rebuild |
| Server state / data fetching | TanStack Query, wrapped in a thin client that auto-unwraps the standard `{data}`/`{error}` envelope | Avoids every component re-implementing envelope unwrapping and retry logic; caching matters for things like availability queries |
| Forms | react-hook-form + zod | Zod schemas are a candidate to share between frontend validation and backend request validation via `packages/shared-types` — define the shape once |
| Routing | React Router | Standard, well-understood, nothing about this app needs more |
| Local/UI state | Plain React state (useState/Context) | TanStack Query covers server state; no indication this app needs Redux/Zustand-level complexity |
| Component approach | Radix primitives (unstyled, accessible) + Tailwind | The booking/slot-picker UI is fairly custom anyway; a heavy pre-styled component library (e.g. MUI) fights white-labeling more than it helps |
| Icons | lucide-react | Standard, widely used, pairs well with Tailwind |

## 2. Dynamic per-tenant white-label theming — the one non-standard piece

Standard PWA tooling (`vite-plugin-pwa`) bundles a *static* `manifest.json` at build time. This app's white-label requirement needs the opposite: `GET /tenants/:id/manifest.json` (Tenant service, built in Phase 3) generates the manifest dynamically, per tenant, at request time — different name, icon, and theme color per white-labelled business, from one shared build.

**Flow:**
1. On load, the PWA shell resolves which tenant it's serving via `GET /tenants/by-subdomain/:subdomain`
2. The response's branding fields (logo, `themeColor`, `appName`) are applied at runtime as CSS custom properties (`--brand-primary`, etc.) — not hardcoded into the Tailwind build
3. The `<link rel="manifest">` tag is set to point at the *backend's* dynamic manifest URL (`/api/tenants/:id/manifest.json`) rather than a Vite-bundled static file, so "Add to Home Screen" picks up the real per-tenant branding
4. This resolution happens before the rest of the app renders, so there's no flash of default/wrong branding

This is the one piece with no off-the-shelf answer — worth building and testing deliberately rather than assuming default PWA tooling handles it, since it doesn't.

## 3. Dev/testing deployment — phone access via tunnel (added 29 Jul 2026)

**Decided:** test on real devices via a local tunnel (Path A), not a real GCP staging deployment, for the PWA shell milestone and everything through the guest booking flow. Real GCP staging (Cloud Run + Cloud SQL + Firebase Hosting per `tech_stack_architecture.md` Section 4) is deliberately deferred — it's a real ongoing cost (Cloud SQL has no free tier) and its own scoped setup effort, worth standing up once there's enough built to justify a production-shaped environment, not just to see an install prompt on a phone.

**The wrinkle:** the PWA currently needs to reach 5 separate backend service ports (3001-3005) plus the Vite dev server — tunneling all of them separately is unnecessary complexity for what's actually needed here.

**Setup (part of the PWA shell phase's scope, not a separate task):**
1. **Local reverse proxy (Caddy)** in front of all 5 services, routing by path prefix (e.g. `/api/slot-engine/*` → `:3001`, `/api/identity/*` → `:3002`, etc.) — the PWA calls relative `/api/...` paths throughout, never a hardcoded port, which also matches how it'll behave in real deployment behind a single origin
2. **Cloudflare Tunnel** (`cloudflared`) pointed at Caddy's single port — free, no session time limits (unlike ngrok's historical free-tier constraints), gives a real HTTPS URL
3. Phone hits that HTTPS URL directly — real "Add to Home Screen," real service worker registration, real manifest fetch — genuine device testing, not a simulated mobile viewport in a desktop browser

**Known limitation of this setup:** true multi-tenant subdomain routing (`courtowner1.yourplatform.in`) isn't testable through a single tunnel URL — for the PWA shell phase, a single test tenant is fine (hardcoded or query-param selected); real subdomain-based white-label testing waits for the actual GCP staging deployment.

## 4. Later — real GCP staging (not yet scoped)

Worth standing up once the guest booking flow (not just the shell) is built — a dedicated phase in its own right: provisioning a real Cloud SQL instance (ongoing cost starts here), deploying all 5 services to Cloud Run, Firebase Hosting, and at least one real subdomain for genuine white-label testing. Not scoped yet; revisit once there's enough built to justify it.

## 5. Open items for later
- Exact shape of the thin TanStack Query wrapper (where it lives — likely a new `packages/api-client` — and how errors from the standard envelope map to UI-facing error states)
- Whether zod schemas actually get shared bidirectionally between frontend and backend, or just used independently on each side with the same shape by convention
- Design token specifics (spacing scale, exact color tokens beyond the dynamic brand color) — likely resolved once actual screens are being built, not needed to unblock starting

---
*This stack applies to the badminton platform's PWA and admin web. Not evaluated for the driver app, which is a separate codebase/team decision.*
