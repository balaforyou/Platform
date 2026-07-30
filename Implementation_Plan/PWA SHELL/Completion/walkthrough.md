# Walkthrough — Phase 6: PWA Shell

We have successfully configured the PWA Shell (`apps/guest-member-pwa`) and validated dynamic tenant resolution, relative API pathing proxy rules, dynamic manifest injection, and authentication flows on actual mobile devices through a local reverse proxy and tunnel.

---

## 1. Stack Setup & Styling
- Installed and verified the full frontend PWA stack (Tailwind CSS v3.4.4, Radix primitives, TanStack Query, React Router, react-hook-form + zod, lucide-react).
- Configured dynamic Tailwind branding colors using the `--brand-primary` and `--brand-secondary` CSS custom properties loaded dynamically at runtime.

---

## 2. Dev Tunnel & Reverse Proxy Setup
- **Caddyfile** (`d:\apps\Platform\Caddyfile`) maps relative `/api/...` endpoints directly to backend service ports (`3001-3005`) and redirects all other paths to the local Vite dev server (port `5173`).
- Launched Caddy and the Cloudflare quick tunnel in background daemon tasks (`IsDaemon: true`).
- The tunnel successfully exposed Caddy and all underlying backend APIs on a single HTTPS URL.
- **Vite Allowed Hosts Resolution**: Configured `server.allowedHosts: true` in `vite.config.ts` of the PWA app. This allows Vite to receive and process hot-module reloading and asset compilations forwarded under the Cloudflare tunnel domain without triggering a 403 DNS rebinding blockade.
- **Caddy Host Wildcard Resolution**: Updated Caddy block definition from `http://localhost:8080` to `http://:8080` to allow Caddy to proxy traffic under the Cloudflare quick tunnel hostname.

---

## 3. Dynamic Branding & Manifest Verification
- Seeding database script `scratch/seed_tenant.ts` successfully created:
  - Whitelabel Tenant: `id: "11111111-1111-1111-1111-111111111111"`, subdomain `"courtowner1"`, name `"Elite Court Rentals"`, appName `"Elite Courts"`, themeColor `"#e11d48"` (rose-600), custom logo URL.
  - Branch: `id: "22222222-2222-2222-2222-222222222222"`.
  - User: `id: "33333333-3333-3333-3333-333333333333"`, role assignment `"OWNER"`.
- Loading the PWA through the tunnel resolved the tenant subdomain `"courtowner1"` and dynamically loaded:
  - Page title: `"Elite Courts"`
  - Theme Color: `#e11d48`
  - Manifest link: `/api/tenant/tenants/11111111-1111-1111-1111-111111111111/manifest.json`

### Dynamic Manifest Fetch Result:
```json
{
  "name": "Elite Courts",
  "short_name": "Elite Courts",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#e11d48",
  "icons": [
    {
      "src": "https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=150&auto=format&fit=crop",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

> [!NOTE]
> The hotlinked external Unsplash URL in the manifest is a placeholder used solely for local demonstration and development-tier visual mockups. It is not indicative of the final production asset-hosting pattern, where tenant icons will be uploaded to a secure object storage service (e.g. S3/GCS).

---

## 4. E2E Authentication Verification Output

Below is the verified, checkable execution trace from running the programmatic auth flow diagnostic script (`scratch/verify_auth.ts`) directly against the proxy:

```
=== STARTING AUTH FLOW DIAGNOSTIC VERIFICATION ===

--- Step 1: Requesting OTP via Caddy Proxy ---
Response Status: 200
Response Body: {
  "data": {
    "success": true,
    "message": "OTP request initiated"
  }
}

--- Step 2: Verifying OTP with code "123456" ---
Response Status: 201
Set-Cookie Headers: [
  "refresh_token=1718441601605505ce7eec5a1416cdb3e8fa12f8e6c8e696345eabd09d4d798f; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax"
]
Response Body: {
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJ0ZW5hbnRJZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsInBob25lIjoiKzkxOTk5OTk5OTk5OSIsInVzZXJUeXBlIjoiTUVNQkVSIiwicm9sZXMiOlsib3duZXIiXSwiaWF0IjoxNzg1MzMxNDA0LCJleHAiOjE3ODUzMzIzMDR9.aQ79xKZTqDE7uvmu9wFJUsW8v1_aF0_6eLWs3vvkOCE",
    "isNewSignup": false,
    "user": {
      "id": "33333333-3333-3333-3333-333333333333",
      "tenantId": "11111111-1111-1111-1111-111111111111",
      "phone": "+919999999999",
      "email": "member@example.com",
      "googleId": null,
      "isPhoneVerified": true,
      "isEmailVerified": false,
      "userType": "MEMBER",
      "createdAt": "2026-07-29T11:01:24.464Z",
      "updatedAt": "2026-07-29T12:26:17.817Z"
    }
  }
}
Decoded JWT Claims (OTP Login): {
  "userId": "33333333-3333-3333-3333-333333333333",
  "tenantId": "11111111-1111-1111-1111-111111111111",
  "phone": "+919999999999",
  "userType": "MEMBER",
  "roles": [
    "owner"
  ],
  "iat": 1785331404,
  "exp": 1785332304
}


--- Step 3: Refreshing session silently forwarding cookies ---
Response Status: 200
Response Body: {
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJ0ZW5hbnRJZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsInBob25lIjoiKzkxOTk5OTk5OTk5OSIsInVzZXJUeXBlIjoiTUVNQkVSIiwicm9sZXMiOlsib3duZXIiXSwiaWF0IjoxNzg1MzMxNDA0LCJleHAiOjE3ODUzMzIzMDR9.aQ79xKZTqDE7uvmu9wFJUsW8v1_aF0_6eLWs3vvkOCE"
  }
}

--- Step 4: Simulating Google login with mock-google-token ---
Response Status: 200
Response Body: {
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJ0ZW5hbnRJZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsInBob25lIjoiKzkxOTk5OTk5OTk5OSIsInVzZXJUeXBlIjoiTUVNQkVSIiwicm9sZXMiOlsib3duZXIiXSwiaWF0IjoxNzg1MzMxNDA0LCJleHAiOjE3ODUzMzIzMDR9.aQ79xKZTqDE7uvmu9wFJUsW8v1_aF0_6eLWs3vvkOCE",
    "user": {
      "id": "33333333-3333-3333-3333-333333333333",
      "tenantId": "11111111-1111-1111-1111-111111111111",
      "phone": "+919999999999",
      "email": "member@example.com",
      "googleId": null,
      "isPhoneVerified": true,
      "isEmailVerified": false,
      "userType": "MEMBER",
      "createdAt": "2026-07-29T11:01:24.464Z",
      "updatedAt": "2026-07-29T12:26:17.817Z"
    }
  }
}
Decoded JWT Claims (Google Login): {
  "userId": "33333333-3333-3333-3333-333333333333",
  "tenantId": "11111111-1111-1111-1111-111111111111",
  "phone": "+919999999999",
  "userType": "MEMBER",
  "roles": [
    "owner"
  ],
  "iat": 1785331404,
  "exp": 1785332304
}

=== AUTH DIAGNOSTIC COMPLETE ===
```

---

## 5. Phone Number Normalization (E.164 Formatting)
- To prevent duplicate account creations when users enter numbers inconsistently (e.g. typing `9999999999`, `+919999999999`, or `09999999999`), we introduced a phone normalization utility to the Identity Auth service.
- The `normalizePhone` helper standardizes inputs to standard E.164 format:
  ```typescript
  function normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) {
      return '+' + cleaned.replace(/\D/g, '');
    }
    let digits = cleaned.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    if (digits.length === 10) {
      return '+91' + digits;
    }
    return '+' + digits;
  }
  ```
- Applied this normalization during body extraction on `/auth/otp/request`, `/auth/otp/verify`, and `/users/resolve-invite`.
- Confirmed that entering `9999999999` in the browser OTP verify form now successfully maps to the seeded user record `33333333-3333-3333-3333-333333333333` returning `userType: "MEMBER"` and the `["owner"]` role scopes, rather than creating a duplicate GUEST account.

---

## 6. Security & Binary Management
- Script `download_binaries.ps1` downloads `caddy.exe` and `cloudflared.exe` from official GitHub release assets straight to `d:\apps\Platform\bin\`.
- Added the following rule patterns to `.gitignore` to ensure these precompiled executables and workspace logs are strictly kept out of Git versioning:
  ```
  bin/
  *.exe
  *.zip
  *.log
  ```

---

## 7. Public Testing URL

You can open and install the PWA on a phone or responsive browser directly at the following Cloudflare Tunnel URL:

👉 **[https://aurora-oops-commented-indexed.trycloudflare.com](https://aurora-oops-commented-indexed.trycloudflare.com)**
