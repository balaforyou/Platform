Read docs/coding_assistant_handover_plan.md and docs/frontend_stack_architecture.md in full before planning anything. Also read docs/tenant_whitelabel_management_api_spec.md (subdomain resolution + dynamic manifest, Sections 4-5) and docs/identity_auth_service_api_spec.md (login flows) — both backend services are already built and running.

All 5 Basic-tier backend services are complete and approved. We are now starting the PWA shell — apps/guest-member-pwa, which currently only contains the placeholder Vite/React scaffold from Phase 0. This is the foundation every later screen depends on, so get this right before any booking-flow UI gets built on top of it.

Same working agreement as every backend phase (handover plan Section 1) — comments on non-trivial logic, flag performance/UX trade-offs explicitly, stop and ask on anything the docs don't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

## Scope for this phase

**1. Stack setup** — install and configure per frontend_stack_architecture.md Section 1: Tailwind, Radix primitives, TanStack Query, React Router, react-hook-form + zod, lucide-react.

**2. API client** — a thin TanStack Query wrapper that automatically unwraps the standard `{data}`/`{error}` envelope from api_standards_cross_cutting.md, so individual screens never handle envelope logic directly. All calls use relative `/api/...` paths (see point 5) — never hardcoded ports or absolute URLs, since this needs to work identically through the local tunnel and eventually real deployment.

**3. Tenant resolution & dynamic branding** — on app load: resolve the tenant, then apply branding (logo, `themeColor`, `appName`) as CSS custom properties at runtime, and set the `<link rel="manifest">` tag to point at the Tenant service's dynamic `GET /tenants/:id/manifest.json` endpoint — NOT a Vite-bundled static manifest. Do not use vite-plugin-pwa's manifest-generation feature; if you use vite-plugin-pwa at all, scope it to service-worker generation only.

Since there's no real subdomain routing in local/tunnel testing yet, implement a fallback: attempt subdomain resolution first, fall back to a `?tenant=` query param or a dev-only env var for single-tenant local testing. State your chosen fallback mechanism in the plan.

**4. Auth screens** — mobile OTP (guests and members) and Google sign-in (members only, gated by `userType` server-side as already built). Access token handling should follow the spec: short-lived token held in memory/app state, refresh handled via the httpOnly cookie the backend already sets — the frontend doesn't need to store or manage the refresh token itself, just include credentials on requests.

**5. Local dev tunnel setup** — per frontend_stack_architecture.md Section 3: a local Caddy reverse proxy routing `/api/slot-engine/*`, `/api/identity/*`, `/api/tenant/*`, `/api/payment/*`, `/api/notification/*` to the respective backend ports, with a single Cloudflare Tunnel pointed at Caddy. This is what makes the relative-path convention in point 2 actually testable on a real phone. Confirm you're aware of the Windows sandbox issue documented in start-services.bat from the backend phases (detached `start` processes die in this environment) — the same daemon-launching approach applies to Caddy and cloudflared here.

## One practical thing to flag in your plan, not solve in code

Identity's OTP dev-fallback logs the code to the console rather than sending a real SMS (correct, already-approved behavior). That means testing login from an actual phone via the tunnel requires manually reading the OTP from the identity-auth service's terminal/log output on the laptop, then typing it into the phone. This is fine and expected for now — just confirm your plan doesn't try to "solve" this with something like echoing the OTP back in the API response (which would be a real security regression), and note it as a manual step in your verification plan instead.

## Checkpoints for this phase — different in kind from the backend ones

There's no concurrency/financial correctness at stake here, so the bar is: does this actually work as a real, installable app, not just "the code compiles."

1. **Real branding proof, not a screenshot claim** — load the PWA through the actual Cloudflare Tunnel URL on a real phone, and show that the correct tenant name/logo/theme color render (not generic defaults), and that the manifest was genuinely fetched from the backend (check network tab / dev tools, not just visual appearance).
2. **Real auth proof** — a full OTP login completing against the actual running Identity service (a real `OtpRequest` row created, a real JWT issued and used on a subsequent authenticated call) — not a mocked auth state.
3. **Tunnel reachability** — provide the actual Cloudflare Tunnel URL so I can open it myself and verify independently, the same way "does it actually pass" has mattered for every backend checkpoint.

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
