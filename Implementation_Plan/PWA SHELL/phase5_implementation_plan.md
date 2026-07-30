# Implementation Plan — Phase 6: PWA Shell

This plan covers the bootstrapping of the Guest/Member PWA shell (`apps/guest-member-pwa`). It sets up the tech stack, implements the relative-path API client, resolves dynamic white-label branding, handles OTP & Google login flows, and configures the Caddy reverse proxy and Cloudflare Tunnel for testing on actual mobile devices.

---

## User Review Required

> [!IMPORTANT]
> **Subdomain & Tenant Resolution Strategy**:
> Since local and tunnel testing don't support custom subdomain routing easily on basic plans, we will implement a multi-stage tenant resolution fallback:
> 1. **Subdomain Lookup**: Check `window.location.hostname`. If it contains a subdomain (e.g. `courtowner1.tunnel.com`), resolve that subdomain.
> 2. **Query Parameter Fallback**: If no subdomain is found (e.g., loading on `localhost` or base tunnel URL), check for a `?tenant=subdomain` query parameter.
> 3. **Developer Env Fallback**: Fall back to the environment variable `VITE_DEFAULT_TENANT_SUBDOMAIN` (which defaults to `courtowner1`).
>
> Once resolved, we retrieve tenant details from `GET /api/tenant/tenants/by-subdomain/{subdomain}` and inject branding parameters.

> [!IMPORTANT]
> **Dynamic PWA Manifest**:
> - We will **not** use static manifest bundlers or static files in `/public`.
> - Instead, we dynamically inject/update `<link rel="manifest">` in `index.html` at runtime to point directly to `/api/tenant/tenants/{tenantId}/manifest.json` once the tenant is resolved.

> [!IMPORTANT]
> **OTP Dev-Fallback is Preserved**:
> - We confirm that we **will not** leak the OTP back in the API request envelope (which would be a security regression).
> - During verification on a real phone, the developer will manually read the OTP printed in the `identity-auth` service logs on the host laptop, then enter it on the phone.
>
> > [!IMPORTANT]
> > **Google OAuth Dev-Mock Path**:
> > - The Identity service backend `/auth/google/verify` only accepts developer-mock tokens starting with `mock-google-token-`.
> > - To prevent building a non-functional flow, we will build the frontend Google Login button explicitly as a **developer mock authentication bypass** in the UI. When clicked, it will prompt/let the user choose a mock email and generate a `mock-google-token-{email}` token to call the backend, allowing us to fully test the Member Google fast-login path and integration without full production OAuth client config.
>
> > [!IMPORTANT]
> > **Tenant Resolution Error Handling**:
> > - If the subdomain lookup or fallback fails (e.g. returns 404 / connection error), the PWA shell will transition to a clean, user-friendly "Tenant Not Found" error view instead of failing silently or showing a blank page. This is particularly useful as Cloudflare Quick Tunnels generate a new random URL on each launch.

---

## Proposed Changes

### 1. Monorepo Stack Setup (`apps/guest-member-pwa`)

We will install the required PWA dependencies and set up Tailwind CSS:

#### [MODIFY] [apps/guest-member-pwa/package.json](file:///d:/apps/Platform/apps/guest-member-pwa/package.json)
Add the following packages:
- `dependencies`: `react-router-dom`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `clsx`, `tailwind-merge`
- `devDependencies`: `tailwindcss`, `postcss`, `autoprefixer`

#### [NEW] [apps/guest-member-pwa/postcss.config.js](file:///d:/apps/Platform/apps/guest-member-pwa/postcss.config.js)
Standard PostCSS configuration:
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

#### [NEW] [apps/guest-member-pwa/tailwind.config.js](file:///d:/apps/Platform/apps/guest-member-pwa/tailwind.config.js)
Tailwind configurations mapping to `src` files:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tenant: {
          primary: "var(--brand-primary)",
          secondary: "var(--brand-secondary, #f3f4f6)",
        }
      }
    },
  },
  plugins: [],
}
```

#### [NEW] [apps/guest-member-pwa/src/index.css](file:///d:/apps/Platform/apps/guest-member-pwa/src/index.css)
Include Tailwind directives and initial variables:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --brand-primary: #3b82f6; /* default blue fallback */
}
```

---

### 2. Core Framework & Providers

We will build the base runtime infrastructure:

#### [NEW] [apps/guest-member-pwa/src/lib/api.ts](file:///d:/apps/Platform/apps/guest-member-pwa/src/lib/api.ts)
A custom API wrapper that handles relative routes and standardizes `{data}`/`{error}` envelopes:
- Automatically appends `/api/` prefix to calls.
- Adds `{ credentials: 'include' }` on all requests to pass the browser's `httpOnly` refresh token cookie.
- Unwraps response envelopes, throwing a standardized `APIError` if `error` exists.

#### [NEW] [apps/guest-member-pwa/src/context/TenantContext.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/context/TenantContext.tsx)
Handles on-load tenant resolution and branding application:
- Parses hostname subdomain, query params, and env config.
- Fetches tenant configuration via `GET /api/tenant/tenants/by-subdomain/{subdomain}`.
- Writes CSS variables (e.g. `--brand-primary: {themeColor}`) to `document.documentElement.style`.
- Sets `<link rel="manifest">` element href to `/api/tenant/tenants/{tenantId}/manifest.json`.
- Dynamically updates `<title>` and favicon.
- **Error State**: Displays a custom full-page `Tenant Not Found` error component if the tenant cannot be resolved or the endpoint returns a 404.

#### [NEW] [apps/guest-member-pwa/src/context/AuthContext.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/context/AuthContext.tsx)
Manages authentication state and token refresh:
- Holds the short-lived JWT in-memory (`accessToken: string | null`).
- Exposes `requestOtp(phone)` and `verifyOtp(phone, code)`.
- Handles silent credentials-based token refresh (`POST /api/identity/auth/refresh`) on app load and automatically before the 15-minute token expiry.

---

### 3. Layout & Authentication UI

#### [NEW] [apps/guest-member-pwa/src/components/LoginScreen.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/LoginScreen.tsx)
A mobile-friendly, beautiful login card:
- Supports OTP flow: Phone entry stage -> Request -> OTP Code entry stage -> Complete.
- Integrates a clearly labeled **`[Dev Mock] Sign in with Google`** button for members. Clicking it allows entering/mocking a Google email and uses the `mock-google-token-{email}` format to complete authentications against the backend.
- Responsive, premium glassmorphism styled form utilizing the dynamic `--brand-primary` brand variables.

#### [MODIFY] [apps/guest-member-pwa/src/main.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/main.tsx)
Wire up providers and routing hierarchy:
- Integrates `TanStack Query` `<QueryClientProvider>`.
- Wraps inside `<TenantProvider>` and `<AuthProvider>`.
- Mounts standard routing: `/login` (Login screen) and `/` (Main app shell).

---

### 4. Reverse Proxy & Dev Tunnel Setup

We will configure Caddy to route local traffic to backends and hook up Cloudflare Tunnel.

#### [NEW] [Caddyfile](file:///d:/apps/Platform/Caddyfile)
Reverse proxy routing:
```caddy
http://localhost:8080 {
    # Proxy API requests to backend ports
    route /api/slot-engine/* {
        uri strip_prefix /api/slot-engine
        reverse_proxy http://localhost:3001
    }
    route /api/identity/* {
        uri strip_prefix /api/identity
        reverse_proxy http://localhost:3002
    }
    route /api/tenant/* {
        uri strip_prefix /api/tenant
        reverse_proxy http://localhost:3003
    }
    route /api/payment/* {
        uri strip_prefix /api/payment
        reverse_proxy http://localhost:3004
    }
    route /api/notification/* {
        uri strip_prefix /api/notification
        reverse_proxy http://localhost:3005
    }

    # Fallback to local Vite dev server
    reverse_proxy http://localhost:5173
}
```

---

## Verification Plan

### Automated Checks
- Run typescript typecheck across all workspace packages (`pnpm run typecheck`).
- Verify linter check (`pnpm run lint`).

### Manual E2E Checkpoints (The Sandbox Bar)
1. **Dynamic Branding & Manifest Verification**:
   - Seed a test tenant in the Tenant database (e.g. `courtowner1`) with customized theme (e.g., `#e11d48` / rose-600), custom name ("Elite Courts"), and custom logo URL.
   - Run the dev servers + Caddy proxy + Cloudflare Tunnel in background (`IsDaemon: true`).
   - Share the active Cloudflare Tunnel URL directly in the `walkthrough.md` report.
   - Load the PWA through the tunnel URL on a mobile device or responsive browser.
   - Verify that the app dynamically transitions color, retrieves the manifest link (`/api/tenant/tenants/{tenantId}/manifest.json`), and updates the document title.
2. **Real Authentication Verification**:
   - Attempt OTP login with a phone number (e.g., `+919999999999`).
   - Retrieve the verification code from the `identity-auth` service logs.
   - Complete login and verify that a valid JWT token was issued, and that subsequent authenticated calls (like fetching tenant details) are authenticated.
