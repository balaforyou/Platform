# Observation — real "Authorization token expired" error on admin-v2, Ledger screen

From: Claude Code
Context: Bala reported an "Authorization token expired" error while on admin-v2's Ledger screen,
signed in as `balaforyou@gmail.com`. Investigated via real production `identity-auth` logs
(`docker logs gcp-vm-identity-auth-1`) and a direct read of `AdminAuthContext.tsx`. Described
only, no ID assigned.

---

## Real evidence, found in the logs

`POST /auth/refresh` requests from `admin.elitecourts.duckdns.org`, in sequence:

| Time (IST) | reqId | Result |
|---|---|---|
| 11:01:23 | req-p | `200` — successful refresh |
| **11:01:28** (5.8s later) | **req-q** | **`401`** — failed refresh |
| 11:04:40 (3m11s later) | req-r | `200` — recovered |

A real refresh succeeded, then the very next refresh attempt — less than 6 seconds later — failed
outright, and the session only recovered ~3 minutes later (most likely on a page reload/re-login,
which re-runs the "silent refresh on boot" path). This lines up exactly with an
"Authorization token expired"-style error appearing on screen in that window.

## Root cause, confirmed by code read

`services/identity-auth/src/index.ts:1219-1279` (`POST /auth/refresh`): the refresh token is
**single-use and rotated on every call** — it looks up the session by the current
`refresh_token` cookie value, then immediately replaces it with a new one
(`prisma.authSession.update({ data: { refreshToken: newRefreshToken, ... } })`). There is no
grace window that still accepts the immediately-prior token.

`AdminAuthContext.tsx:30,42-57` dedupes *concurrent* refresh calls with a module-scoped
`inFlightRefresh` promise — but that scope is **per browser tab** (a fresh JS module instance per
tab), not shared across tabs. The `refresh_token` cookie, however, **is** shared across every tab
on the same origin (httpOnly, origin-scoped).

**The real failure mode**: with more than one `admin.elitecourts.duckdns.org` tab open at once
(a realistic scenario for an admin actively working across Ledger/Members/Inventory screens), each
tab runs its own independent 14-minute refresh timer (`AdminAuthContext.tsx:75-81`). If two tabs'
timers land close together, tab A's refresh call rotates the shared cookie first; tab B's refresh
call — already in flight, holding the now-superseded pre-rotation cookie value — gets rejected
with `401 Invalid or expired token` when it lands microseconds to seconds later. That tab's
`refresh()` (line 42-57) catches the failure and returns `null`; `applyToken(null)` then clears
`accessToken`/`user` entirely in that tab, and the next real API call from whatever screen that
tab was showing (Ledger, here) surfaces the resulting 401 as "Authorization token expired."

This is a known, well-documented category of bug for systems using **rotating** refresh tokens
shared across multiple tabs with no replay grace period — not specific to admin-v2's
implementation, but the mitigation (a short grace window accepting the just-superseded token
once, or centralizing refresh coordination across tabs via `BroadcastChannel`/a shared worker)
isn't present here. The exact same rotation shape exists in `guest-member-pwa`'s
`AuthContext.tsx` too (same "lifted from" pattern, per its own header comment) — same risk there,
just not the one Bala hit today.

## Not fixed here

A real fix needs a design decision (grace-period token acceptance vs. cross-tab refresh
coordination) — not something to improvise as a one-line patch on a live system.

---

## Summary for Chief

Real, reproducible-in-theory (confirmed once in logs) refresh-token race condition affecting any
multi-tab admin-v2 (and potentially guest-member-pwa) session. Self-recovers on the next full page
load in the affected tab, but presents as a real, confusing "Authorization token expired" error in
the meantime with no in-app recovery path shown to the admin (no "click to retry" — just the raw
error).
