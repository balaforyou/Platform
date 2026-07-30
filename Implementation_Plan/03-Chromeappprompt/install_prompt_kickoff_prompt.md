Read docs/frontend_stack_architecture.md Section 2 (dynamic manifest handling) before planning — this phase adds a service worker alongside it, and must not conflict with how the manifest is already dynamically linked per tenant.

Phase 7 (shared package extraction) is complete and approved. This phase adds PWA installability: a minimal service worker plus a custom install-prompt experience for apps/guest-member-pwa.

Same working agreement as every previous phase — comments on non-trivial logic, flag trade-offs explicitly, stop and ask on anything the docs don't answer, confirm before deviating from spec, and produce a plan artifact for my review before writing any code.

## Scope

1. **Minimal service worker** — enough to satisfy Chrome's install criteria (valid manifest + HTTPS + registered service worker with a fetch handler), not full offline caching. If you use vite-plugin-pwa, scope it strictly to service-worker generation — do NOT let it generate or manage the manifest, which stays dynamically linked per-tenant from the Tenant service exactly as already built. This constraint is critical; re-read frontend_stack_architecture.md Section 2 if unsure why.

2. **Custom install-prompt UX** — capture the `beforeinstallprompt` event, suppress Chrome's default automatic prompt, and show our own "Install App" UI at a moment we choose rather than whenever Chrome decides.

   **Trigger timing — pick a reasonable interim point now, this will need revisiting later.** The ideal trigger ("after a guest's first successful booking") isn't available yet since the guest booking flow itself hasn't been built. For now, choose a sensible interim moment (e.g. a few seconds after landing on the dashboard post-login, or a persistent small "Install" affordance rather than a timed popup) and note in your plan that this should be reconsidered once real booking flow exists.

3. **Dismissal handling** — if a user dismisses the prompt, don't show it again every session; store dismissal state (real browser storage is fine here, this isn't the Artifacts sandbox) and use reasonable judgment on when it's acceptable to ask again (e.g. not for X days, or not at all until a stronger trigger like a completed booking exists later).

4. **iOS handling** — `beforeinstallprompt` never fires on iOS Safari; it has no automatic install mechanism at all. Detect iOS and show a small manual instruction instead ("Tap Share, then Add to Home Screen") rather than silently doing nothing. This is a real, permanent platform limitation, not a bug to work around — the UI should acknowledge it gracefully, not hide it.

## The real checkpoint for this phase

Given this codebase's specific track record — script-based checks have repeatedly failed to catch real rendering/UX regressions here (the blank-screen incident, the stale-JWT incident) — this phase's verification must be human-observed on a real device, the same way the last several checkpoints were:

1. **Real Android/Chrome device**: confirm the custom install prompt actually appears at the chosen trigger (not Chrome's default one — ours), and that installing via it works
2. **Real iOS device or Safari**: confirm the manual instruction message appears instead, with no console errors from the unfired `beforeinstallprompt` listener
3. **Dismissal test**: dismiss the prompt, reload, confirm it doesn't immediately reappear

Provide the tunnel URL in your walkthrough as usual — I'll do the actual device verification myself before treating this as done, the same way it's worked for every prior frontend checkpoint.

Stop here and show me the plan artifact. I'll review and approve before you implement anything.
