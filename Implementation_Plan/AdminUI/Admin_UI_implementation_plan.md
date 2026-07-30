# Phase 7 — UI Shared Package Extraction (Revised)

This phase executes the extraction of shared frontend infrastructure into a shared workspace package (`packages/ui-shared`) and refactors the Guest Member PWA to consume it.

The Admin Web Console screen implementation is deferred to a later phase to align with backend schema completions.

---

## User Review Required

> [!IMPORTANT]
> **Refactoring Scope**:
> This refactor moves exactly three core logic components out of `apps/guest-member-pwa` into `packages/ui-shared`:
> 1. The API Client proxy wrapper (`apiRequest`, `APIError`).
> 2. The `TenantContext` provider (resolves whitelabel properties and dynamically injects manifest links).
> 3. The `AuthContext` provider (silent refreshes, mock OAuth verify, and OTP verification state).
>
> UI screens (like `LoginScreen`) remain local to the PWA app.

---

## Open Questions

No open questions. The scoping boundary is locked to logic extraction and PWA regression validation.

---

## Proposed Changes

### Component 1: Shared Frontend Package (`packages/ui-shared`)

#### [NEW] [package.json](file:///d:/apps/Platform/packages/ui-shared/package.json)
- Define `@badminton/ui-shared` private workspace package. Include dependencies for shared UI logic (`react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `zod`, and `lucide-react`).

#### [NEW] [tsconfig.json](file:///d:/apps/Platform/packages/ui-shared/tsconfig.json)
- Create TS compiler configuration targeting React v18 (`react-jsx`) and Vite typings.

#### [NEW] [index.ts](file:///d:/apps/Platform/packages/ui-shared/src/index.ts)
- Create package exports entry routing context providers, custom hooks, and the api request client.

#### [NEW] [api.ts](file:///d:/apps/Platform/packages/ui-shared/src/lib/api.ts)
- Migrate relative-pathing client wrapper (`apiRequest`, `APIError`) from PWA codebase.

#### [NEW] [TenantContext.tsx](file:///d:/apps/Platform/packages/ui-shared/src/context/TenantContext.tsx)
- Migrate dynamic tenant resolving context.

#### [NEW] [AuthContext.tsx](file:///d:/apps/Platform/packages/ui-shared/src/context/AuthContext.tsx)
- Migrate session cookie and OTP state manager.

---

### Component 2: Guest Member PWA Refactoring (`apps/guest-member-pwa`)

#### [MODIFY] [package.json](file:///d:/apps/Platform/apps/guest-member-pwa/package.json)
- Inject `@badminton/ui-shared` into dependencies list.

#### [DELETE] [api.ts](file:///d:/apps/Platform/apps/guest-member-pwa/src/lib/api.ts)
#### [DELETE] [TenantContext.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/context/TenantContext.tsx)
#### [DELETE] [AuthContext.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/context/AuthContext.tsx)

#### [MODIFY] [main.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/main.tsx)
- Refactor import statements to pull contexts and hooks from `@badminton/ui-shared`.

#### [MODIFY] [LoginScreen.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/LoginScreen.tsx)
- Refactor import statements to pull authorization hooks from `@badminton/ui-shared`.

---

## Verification Plan

### Regression Verification
We will perform E2E verification of the PWA shell running over the Cloudflare tunnel:
1. Re-spin Caddy and Cloudflare Tunnel along with all backend services and Vite dev server.
2. Load the PWA through the generated public tunnel URL.
3. Confirm whitelabel branding resolves successfully on start (loads title `"Elite Courts"` and theme colors dynamically).
4. Perform a real-time OTP signin (`9999999999` with code `123456`) and verify it authenticates successfully into the user dashboard, proving contexts function identically through the extracted packages.
5. Re-run `pnpm run typecheck` and `pnpm run build` on the workspace to ensure zero typescript/compilation regression.
