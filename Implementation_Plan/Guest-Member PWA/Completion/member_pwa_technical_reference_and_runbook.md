# Guest-Member PWA Technical Reference and Runbook

**Date written:** 1 Aug 2026  
**Source basis:** current code plus git history through `1f8071b489d16db4fb0b24616dac861e0990cbc9`, cross-checked against the Admin Web through F-023 reference at `Implementation_Plan/Admin Web Phase/Completion/admin_web_to_f023_technical_reference.md`.  
**Purpose:** preserve the full Guest-Member PWA member journey, architecture map, test coverage, runbook, and the previously missing member-flow white-label verification.

## Commit References

| Commit | Scope relevant to this document |
| --- | --- |
| `1451d08` | Guest booking journey screens, secure webhook payment simulation, and automated Playwright E2E suite |
| `df7aaee` | Finalized Razorpay integration and E2E navigation fixes |
| `aa55e67` | F-009/F-010 guest booking validation and slot-boundary follow-up |
| `f49c3fefab71144f1f18c0ba2477700e9b7118f1` | F-022 member self-confirm attendance: dashboard card, Slot Engine endpoints, schema field, sweep protection |
| `1f8071b489d16db4fb0b24616dac861e0990cbc9` | F-023 full cross-system integration test proving member release-to-guest booking/refund handoff |

## Feature Overview

The Guest-Member PWA is one React app serving both guest booking and member recurring-assignment workflows. The app is tenant-aware from first render and uses shared auth/tenant infrastructure from `packages/ui-shared`.

### Shared Entry and OTP Login

The login path is shared by guests and members:

- `apps/guest-member-pwa/src/main.tsx:349` routes `/login` to `LoginScreen`.
- `apps/guest-member-pwa/src/components/LoginScreen.tsx:6` defines the login component.
- `apps/guest-member-pwa/src/components/LoginScreen.tsx:38` calls `requestOtp(phone)`.
- `apps/guest-member-pwa/src/components/LoginScreen.tsx:58` calls `verifyOtp(phone, code)`.
- `packages/ui-shared/src/context/AuthContext.tsx:96` implements `requestOtp`.
- `packages/ui-shared/src/context/AuthContext.tsx:107` implements `verifyOtp`.
- `packages/ui-shared/src/lib/api.ts:26` centralizes `apiRequest`, including envelope handling.
- `packages/ui-shared/src/lib/api.ts:39` attaches `Authorization: Bearer ...` when a token is present.

Tenant resolution wraps the entire app:

- `apps/guest-member-pwa/src/main.tsx:375` wraps app routes in `TenantProvider`.
- `apps/guest-member-pwa/src/main.tsx:376` wraps app routes in `AuthProvider`.
- `packages/ui-shared/src/context/TenantContext.tsx:70` defines `TenantProvider`.
- `packages/ui-shared/src/context/TenantContext.tsx:96` reads `?tenant=...`.
- `packages/ui-shared/src/context/TenantContext.tsx:109` resolves `/tenant/tenants/by-subdomain/:subdomain`.
- `packages/ui-shared/src/context/TenantContext.tsx:115` writes `--brand-primary` from tenant `themeColor`.
- `packages/ui-shared/src/context/TenantContext.tsx:122` sets the browser title from tenant `appName` or `name`.

### Dashboard and Member Session Card

The dashboard is the authenticated app root:

- `apps/guest-member-pwa/src/main.tsx:329` defines `ProtectedRoute`.
- `apps/guest-member-pwa/src/main.tsx:357` routes `/` to `MainDashboard`.
- `apps/guest-member-pwa/src/main.tsx:52` reads tenant branding with `useTenant()`.
- `apps/guest-member-pwa/src/main.tsx:53` reads the authenticated user with `useAuth()`.
- `apps/guest-member-pwa/src/main.tsx:124` fetches `/slot-engine/member/today-assignment`.
- `apps/guest-member-pwa/src/main.tsx:152` posts `/slot-engine/member/today-assignment/confirm`.
- `apps/guest-member-pwa/src/main.tsx:165` starts `renderMemberSessionCard()`.
- `apps/guest-member-pwa/src/main.tsx:194` renders the `HAS_SESSION` state.
- `apps/guest-member-pwa/src/main.tsx:214` marks the confirm button as `#confirm-member-attendance-btn`.
- `apps/guest-member-pwa/src/main.tsx:222` renders `NO_SESSION_TODAY`.
- `apps/guest-member-pwa/src/main.tsx:225` renders `NO_ACTIVE_ASSIGNMENT`.
- `apps/guest-member-pwa/src/main.tsx:228` renders `SUBSCRIPTION_INACTIVE`.
- `apps/guest-member-pwa/src/main.tsx:231` renders `WINDOW_NOT_FOUND`.
- `apps/guest-member-pwa/src/main.tsx:277` mounts the card on the dashboard.

The member card is distinct from guest booking even though it shares the app shell. It does not reserve an arbitrary guest court slot. Instead, it resolves the logged-in member's active recurring assignment for today's weekday and creates today's member booking lazily only when the member confirms attendance.

### Member Session States

Slot Engine returns the dashboard state from `GET /member/today-assignment`:

- `HAS_SESSION`: active assignment matches today, a matching availability window exists, and the member can inspect or confirm the session.
- `NO_SESSION_TODAY`: an active assignment exists, but today is not one of its assigned weekdays.
- `NO_ACTIVE_ASSIGNMENT`: the logged-in member has no active assignment.
- `SUBSCRIPTION_INACTIVE`: assignment exists, but active subscription is missing or not active.
- `WINDOW_NOT_FOUND`: assignment exists for today, but the matching availability window is not present.

Backend references:

- `services/slot-engine/src/index.ts:249` resolves today's member assignment.
- `services/slot-engine/src/index.ts:1511` defines `GET /member/today-assignment`.
- `services/slot-engine/src/index.ts:1517` derives `userId` and `tenantId` from member JWT before resolving state.
- `services/slot-engine/src/index.ts:1533` defines `POST /member/today-assignment/confirm`.
- `services/slot-engine/src/index.ts:1565` returns `SUBSCRIPTION_INACTIVE`.
- `services/slot-engine/src/index.ts:1573` returns `CONFIRMATION_CUTOFF_PASSED`.

### Guest Booking Journey in the Same App

The guest booking journey remains separate route-level functionality:

- `apps/guest-member-pwa/src/main.tsx:358` routes `/branches` to branch selection.
- `apps/guest-member-pwa/src/main.tsx:359` routes `/branches/:branchId` to a branch dashboard.
- `apps/guest-member-pwa/src/main.tsx:361` routes `/branches/:branchId/book/:poolId` to guest court booking.
- `apps/guest-member-pwa/src/main.tsx:362` routes `/bookings/:bookingId/pay` to checkout.
- `apps/guest-member-pwa/src/main.tsx:363` routes confirmation.
- `apps/guest-member-pwa/src/main.tsx:364` routes booking history.
- `apps/guest-member-pwa/src/components/CourtBooking.tsx:69` fetches guest availability.
- `apps/guest-member-pwa/src/components/CourtBooking.tsx:139` starts guest reserve handling.
- `apps/guest-member-pwa/src/components/CourtBooking.tsx:159` posts guest booking holds.
- `apps/guest-member-pwa/src/components/BookingPay.tsx:31` creates/fetches payment intent.
- `apps/guest-member-pwa/src/components/BookingPay.tsx:53` calls mock capture in local/dev tests.
- `apps/guest-member-pwa/src/components/BookingHistory.tsx:23` fetches current user's bookings.
- `apps/guest-member-pwa/src/components/CancelBookingModal.tsx:25` fetches cancellation preview.
- `apps/guest-member-pwa/src/components/CancelBookingModal.tsx:45` posts booking cancellation.

F-023 proves the relationship between the two journeys: an unconfirmed member seat can be swept/released by admin and then booked, paid, cancelled, and refunded by a distinct guest actor.

## Architecture and Code Map

### Shared Atomic Booking Creation

Member booking creation is intentionally shared between the member confirm endpoint and the grace-period sweep:

- `services/slot-engine/src/index.ts:235` defines deterministic `memberBookingIdempotencyKey(userId, windowId, now)`.
- `services/slot-engine/src/index.ts:301` defines `ensureTodayMemberBooking`.
- `services/slot-engine/src/index.ts:314` computes the shared deterministic key.
- `services/slot-engine/src/index.ts:320` locks `AvailabilityWindow` with `SELECT ... FOR UPDATE`.
- `services/slot-engine/src/index.ts:325` re-checks for an existing non-cancelled booking inside the transaction.
- `services/slot-engine/src/index.ts:345` creates the booking only if none exists.
- `services/slot-engine/src/index.ts:349` persists `memberAttendanceConfirmedAt`.
- `services/slot-engine/src/index.ts:1838` shows the sweep using the same helper for lazy generation.

The deterministic key identifies the logical daily member booking, not which trigger created it. That design was chosen over per-trigger keys because confirm and sweep are competing paths for the same business object.

### `memberAttendanceConfirmedAt`

The field exists because design review found a self-defeating sweep bug before it shipped. Without a separate attendance marker, the sweep could later see the member's own confirmed booking as still "unconfirmed" and change it to `RELEASED_NO_SHOW`.

Schema/code references:

- `packages/database/prisma/schema.prisma:229` defines `Booking.memberAttendanceConfirmedAt DateTime?`.
- `packages/database/prisma/migrations/20260801090000_member_attendance_confirmed_at/migration.sql` adds the column.
- `services/slot-engine/src/index.ts:1755` finds auto-release candidates.
- `services/slot-engine/src/index.ts:1759` filters candidates to `memberAttendanceConfirmedAt: null`.
- `services/slot-engine/src/index.ts:1769` through `:1779` releases only those still-null bookings.

The cutoff check and attendance marker are separate mechanisms:

1. The cutoff-time rule determines whether a member may confirm now.
2. `memberAttendanceConfirmedAt` protects a valid confirmation from later sweep release.

## Test Coverage Summary

| Test file | Layer | What it proves |
| --- | --- | --- |
| `apps/guest-member-pwa/tests/member-self-confirm.spec.ts` | Rendered browser through Caddy, plus DB assertions | Member dashboard renders `HAS_SESSION` and `NO_SESSION_TODAY`; UI confirm creates a real booking; DB row has `memberAttendanceConfirmedAt`; double-confirm resolves to one booking. Evidence logs use `PLAYWRIGHT_MEMBER_CONFIRM_EVIDENCE`. |
| `services/slot-engine/src/concurrency.test.ts` | API/concurrency suite against Slot Engine | Trust boundary and concurrency behavior: non-member rejection, spoofed body ignored, inactive subscription rejection, cutoff rejection, concurrent double-confirm one-booking result, sweep behavior. Evidence logs use `MEMBER_CONFIRM_EVIDENCE`. |
| `apps/guest-member-pwa/tests/f023-full-system.spec.ts` | Cross-system rendered browser + API + DB | Full actor handoff: no-session member, confirming member protected from sweep, unconfirmed member released, admin low-occupancy release, distinct Guest C books and pays, guest cancels through UI, admin refund override. Evidence logs use `F023_REQUEST_RESPONSE` and `F023_DB`. |
| Temporary white-label verification run on 1 Aug 2026 | Rendered browser through Caddy, seeded second tenant | Member dashboard and `Today's Member Session` card pick up tenant-specific `themeColor`, app shell name/logo, and tenant-scoped pool name for `courtowner1` and `skyblueclub`. Evidence logs used `MEMBER_WHITELABEL_EVIDENCE`; screenshots are listed below. |

Known limitation: before the 1 Aug 2026 white-label verification, all real member browser runs used only `courtowner1`. That gap is now closed for the member dashboard/card path with a second tenant.

## Practical Runbook

### Prerequisites

Run these from `D:\apps\Platform` on Windows PowerShell unless stated otherwise.

Postgres is expected from `docker-compose.yml`:

```powershell
docker compose up -d postgres
```

Confirm DB port:

```powershell
netstat -ano | Select-String ":65432\s"
```

If Docker is not running, launch Docker Desktop first:

```powershell
Start-Process -FilePath 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
```

Apply migrations/generate Prisma client when needed:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
pnpm.cmd --filter @badminton/database run prisma:deploy
pnpm.cmd --filter @badminton/database run build
```

### Bringing Up the Full Stack

Preferred project script:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\start-pwa-dev-tunnel.ps1
```

The script is intended to start all five backend services, Guest PWA Vite, Admin Web Vite, Caddy, and Cloudflare Tunnel. In non-interactive Codex shells it may not keep child jobs observable. If ports do not bind, start services manually as below.

Manual backend startup:

```powershell
Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\services\slot-engine'; `$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'; `$env:JWT_SECRET='test-jwt-secret'; `$env:INTERNAL_SERVICE_KEY='test-service-key'; `$env:PORT='3001'; npx.cmd tsx src/index.ts") -WindowStyle Hidden

Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\services\identity-auth'; `$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'; `$env:JWT_SECRET='test-jwt-secret'; `$env:INTERNAL_SERVICE_KEY='test-service-key'; `$env:PORT='3002'; npx.cmd tsx src/index.ts") -WindowStyle Hidden

Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\services\tenant-management'; `$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'; `$env:JWT_SECRET='test-jwt-secret'; `$env:INTERNAL_SERVICE_KEY='test-service-key'; `$env:PORT='3003'; npx.cmd tsx src/index.ts") -WindowStyle Hidden

Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\services\payment'; `$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'; `$env:JWT_SECRET='test-jwt-secret'; `$env:INTERNAL_SERVICE_KEY='test-service-key'; `$env:RAZORPAY_WEBHOOK_SECRET='test-webhook-secret'; `$env:SLOT_ENGINE_URL='http://localhost:3001'; `$env:NOTIFICATION_SERVICE_URL='http://localhost:3005'; `$env:PORT='3004'; npx.cmd tsx src/index.ts") -WindowStyle Hidden

Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\services\notification'; `$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'; `$env:INTERNAL_SERVICE_KEY='test-service-key'; `$env:IDENTITY_SERVICE_URL='http://localhost:3002'; `$env:PORT='3005'; npx.cmd tsx src/index.ts") -WindowStyle Hidden
```

Manual frontend/proxy startup:

```powershell
Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\apps\guest-member-pwa'; `$env:CI='true'; pnpm.cmd run dev") -WindowStyle Hidden

Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform\apps\admin-web'; `$env:CI='true'; pnpm.cmd run dev") -WindowStyle Hidden

Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-Command',"Set-Location 'D:\apps\Platform'; .\bin\caddy.exe run --config Caddyfile") -WindowStyle Hidden
```

Confirm expected ports:

```powershell
netstat -ano | Select-String ":(8080|5173|5174|3001|3002|3003|3004|3005|65432)\s"
```

Expected:

- Postgres: `65432`
- Slot Engine: `3001`
- Identity Auth: `3002`
- Tenant Management: `3003`
- Payment: `3004`
- Notification: `3005`
- Guest PWA Vite: `5173`
- Admin Web Vite: `5174`
- Caddy: `8080`

Use Caddy URLs for browser verification:

- Guest/member PWA: `http://localhost:8080/?tenant=courtowner1`
- Admin Web: `http://localhost:8080/admin/?tenant=courtowner1`

### Seeding Data: Automated Paths

Member self-confirm browser spec seeds its own data:

```powershell
$env:CI=''
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
cd D:\apps\Platform\apps\guest-member-pwa
.\node_modules\.bin\playwright.CMD test member-self-confirm.spec.ts --config playwright.config.ts --retries=0
```

F-023 full-system spec seeds its own data:

```powershell
$env:CI=''
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
cd D:\apps\Platform\apps\guest-member-pwa
.\node_modules\.bin\playwright.CMD test f023-full-system.spec.ts --config playwright.config.ts --retries=0
```

Admin Web broader seed script, useful for assignment/refund/low-occupancy screens:

```powershell
cd D:\apps\Platform
pnpm.cmd --filter @badminton/admin-web run seed:admin
```

Known seeded Admin Web values from that script:

- Owner login: `9999999999`, OTP `123456`
- Member lookup phones: `9888888888`, `9777777777`
- Branches: `Coimbatore Main Arena`, `Peelamedu Shuttle Hub`, `RS Puram Indoor Courts`
- Negotiated test pool: `Main Arena Premium Courts`

### Seeding Data: Manual Walkthrough

Use this when debugging one specific member state without running a full Playwright seed. Replace IDs/phones as needed.

1. Open Prisma Studio:

```powershell
cd D:\apps\Platform\packages\database
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
npx.cmd prisma studio
```

2. Create or update a `Tenant`:

Required fields:

- `id`: stable UUID-like string
- `name`: e.g. `Manual Member Club`
- `subdomain`: e.g. `manualmember`
- `appName`: e.g. `Manual Club`
- `themeColor`: e.g. `#059669`
- `plan`: `basic`
- `status`: `active`

3. Create a `Branch` for that tenant:

- `tenantId`: the tenant ID
- `name`: e.g. `Manual Club Main Arena`
- `status`: `ACTIVE`
- `workingDays`: include today's weekday name
- `workingHoursStart`: `06:00`
- `workingHoursEnd`: `22:00`

4. Create a `User`:

- `tenantId`: same tenant
- `phone`: normalizable Indian number, e.g. `+919888881111`
- `userType`: `MEMBER`
- `isPhoneVerified`: `true`

5. Create an active `Subscription`:

- `userId`: member user ID
- `tenantId`: same tenant
- `mandateId`: any unique string, e.g. `manual-member-mandate`
- `amount`: e.g. `100000`
- `frequency`: `monthly`
- `status`: `active`

6. Create a `ResourcePool`:

- `tenantId`: same tenant
- `branchId`: branch ID
- `name`: e.g. `Manual Member Court`
- `allocationMode`: `POOLED`
- `capacity`: `8`
- `minOccupancy`: `2`
- `minBookingDurationMinutes`: `60`
- `pricingMode`: `FLAT`
- `defaultRate`: `0`

7. Create a `BookingRule`:

- `resourcePoolId`: pool ID
- `gracePeriodMinutes`: `30`
- `guestAccessCutoffMinutes`: `120`
- `lowOccupancyThresholdPct`: `50`
- `cancellationPolicyJson`: `{"type":"tiered","tiers":[]}`

8. Create an `AvailabilityWindow`:

- `resourcePoolId`: pool ID
- `startTime`: today, future, aligned to the assignment start time
- `endTime`: one hour after start
- `capacity`: `8`

9. Create a `MemberGroupAssignment`:

- `userId`: member user ID
- `resourcePoolId`: pool ID
- `daysOfWeek`: ISO weekday string for today, where Monday is `1` and Sunday is `7`
- `startTime`: `HH:mm` matching the window start time in UTC
- `status`: `ACTIVE`

10. Test manually:

```text
http://localhost:8080/login?tenant=manualmember
```

Use the member phone and OTP `123456`.

To create alternate states:

- `NO_SESSION_TODAY`: set `daysOfWeek` to a different weekday.
- `NO_ACTIVE_ASSIGNMENT`: delete or deactivate the assignment.
- `SUBSCRIPTION_INACTIVE`: set subscription `status` to `suspended`.
- `WINDOW_NOT_FOUND`: delete the matching availability window or change its start time away from assignment `startTime`.
- Cutoff passed: set `BookingRule.gracePeriodMinutes` high enough that `startTime - gracePeriodMinutes` is before now.

### Running Playwright Suites

Member rendered-browser suite:

```powershell
cd D:\apps\Platform\apps\guest-member-pwa
$env:CI=''
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
.\node_modules\.bin\playwright.CMD test member-self-confirm.spec.ts --config playwright.config.ts --retries=0
```

F-023 cross-system suite:

```powershell
cd D:\apps\Platform\apps\guest-member-pwa
$env:CI=''
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
.\node_modules\.bin\playwright.CMD test f023-full-system.spec.ts --config playwright.config.ts --retries=0
```

Slot Engine API/concurrency suite:

```powershell
cd D:\apps\Platform
$env:CI='true'
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
pnpm.cmd --filter @badminton/slot-engine run build
pnpm.cmd --filter @badminton/slot-engine run test:concurrency
```

Production build checks:

```powershell
cd D:\apps\Platform
$env:CI='true'
pnpm.cmd --filter @badminton/guest-member-pwa run typecheck
pnpm.cmd --filter @badminton/guest-member-pwa run build
pnpm.cmd --filter @badminton/slot-engine run build
```

Windows Prisma lock-check habit:

```powershell
Get-Process node,caddy,cloudflared,cloudflared_new -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
$env:CI='true'
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
pnpm.cmd --filter @badminton/database run build
```

Expected successful database build output:

```text
Prisma Client copied to dist successfully.
$ tsc && node scripts/copy-client.js
```

## White-Label Verification: Member Dashboard and Session Card

### Gap Being Checked

Before 1 Aug 2026, all real browser/device verification for guest, admin, and member paths used only:

- Tenant: `courtowner1`
- App name: `Elite Courts`
- Theme color: `#e11d48`

Because the member card was added late, the project had not proven that `Today's Member Session` respected a second tenant's branding and tenant-scoped data.

### Verification Setup

The temporary Playwright verification seeded two tenants:

Tenant A:

```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "subdomain": "courtowner1",
  "name": "Elite Court Rentals",
  "appName": "Elite Courts",
  "themeColor": "#e11d48",
  "memberId": "wl-member-elite",
  "phone": "+919877771111",
  "poolName": "Elite Rose Member Court"
}
```

Tenant B:

```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "subdomain": "skyblueclub",
  "name": "Sky Blue Shuttle Club",
  "appName": "Sky Blue Club",
  "themeColor": "#2563eb",
  "logo": "data:image/svg+xml;utf8,...SKY BLUE...",
  "memberId": "wl-member-sky",
  "phone": "+919877772222",
  "poolName": "Sky Blue Member Court"
}
```

Each tenant received its own branch, resource pool, booking rule, availability window, active subscription, and today's active member assignment.

### Verification Command

The temporary spec was run through Caddy with the real services:

```powershell
cd D:\apps\Platform\apps\guest-member-pwa
$env:CI=''
$env:DATABASE_URL='postgresql://postgres:postgrespassword@localhost:65432/badminton_db?schema=public'
.\node_modules\.bin\playwright.CMD test member-whitelabel-verification.temp.spec.ts --config playwright.config.ts --retries=0
```

Result:

```text
1 passed (13.6s)
```

The temporary spec was removed after the run; screenshots and log evidence were preserved.

### Request/Response and DOM Evidence

Tenant A evidence:

```json
{
  "tenantResponse": {
    "status": 200,
    "body": {
      "data": {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "Elite Court Rentals",
        "subdomain": "courtowner1",
        "themeColor": "#e11d48",
        "appName": "Elite Courts"
      }
    }
  },
  "todayAssignment": {
    "status": 200,
    "body": {
      "data": {
        "state": "HAS_SESSION",
        "assignment": {
          "userId": "wl-member-elite",
          "resourcePoolId": "wl-elite-pool",
          "resourcePool": {
            "tenantId": "11111111-1111-1111-1111-111111111111",
            "name": "Elite Rose Member Court"
          }
        }
      }
    }
  },
  "cardStyle": {
    "brandPrimary": "#e11d48",
    "badgeColor": "rgb(225, 29, 72)",
    "text": "Member AttendanceToday's Member SessionSlotElite Rose Member CourtTime09:00 PMConfirm before08:30 PMI am coming"
  }
}
```

Tenant B evidence:

```json
{
  "tenantResponse": {
    "status": 200,
    "body": {
      "data": {
        "id": "33333333-3333-3333-3333-333333333333",
        "name": "Sky Blue Shuttle Club",
        "subdomain": "skyblueclub",
        "themeColor": "#2563eb",
        "appName": "Sky Blue Club",
        "logo": "data:image/svg+xml;utf8,...SKY BLUE..."
      }
    }
  },
  "todayAssignment": {
    "status": 200,
    "body": {
      "data": {
        "state": "HAS_SESSION",
        "assignment": {
          "userId": "wl-member-sky",
          "resourcePoolId": "wl-sky-pool",
          "resourcePool": {
            "tenantId": "33333333-3333-3333-3333-333333333333",
            "name": "Sky Blue Member Court"
          }
        }
      }
    }
  },
  "cardStyle": {
    "brandPrimary": "#2563eb",
    "badgeColor": "rgb(37, 99, 235)",
    "text": "Member AttendanceToday's Member SessionSlotSky Blue Member CourtTime09:00 PMConfirm before08:30 PMI am coming"
  }
}
```

### Screenshot Evidence

- `apps/guest-member-pwa/test-results/member-whitelabel-courtowner1.png`
- `apps/guest-member-pwa/test-results/member-whitelabel-skyblueclub.png`
- `apps/guest-member-pwa/test-results/member-whitelabel-side-by-side.png`

The side-by-side screenshot shows `courtowner1` using rose branding and `Elite Rose Member Court`, while `skyblueclub` uses blue branding, the `Sky Blue Club` logo/name, and `Sky Blue Member Court` inside the member session card.

### Outcome

Result: **Pass.**

No hardcoded `courtowner1` styling or tenant-agnostic assumption was found in the member dashboard card. The card does not render tenant `appName` inside the card body by design; it reflects tenant branding through the shared `--brand-primary` CSS variable and tenant-scoped assignment/resource-pool data. The surrounding dashboard/header/footer render tenant name/logo as expected.

No new finding is required from this verification.
