# Phase 8 — PWA Installability (Updated)

This phase adds PWA installability to the Guest Member PWA (`apps/guest-member-pwa`). This is accomplished by registering a minimal service worker to satisfy installation criteria, capturing the `beforeinstallprompt` browser event to suppress the default prompt, and displaying a white-labeled custom install UI for both Android/Chrome and iOS/Safari.

---

## User Review Required

> [!IMPORTANT]
> **No Static PWA Tools**:
> We will bypass `vite-plugin-pwa` entirely to prevent conflicts with the dynamic per-tenant manifest linking mechanism. The service worker is written as a static file in `public/sw.js` and registered manually on window load.
>
> **Synchronous Native Prompt Suppression**:
> To prevent Chrome's native prompt from slipping through due to asynchronous execution or delay, `e.preventDefault()` will be invoked synchronously inside the `beforeinstallprompt` event handler. We will explicitly confirm that the native Chrome banner does not appear.
>
> **Interim Trigger & Code Documentation**:
> The custom installation banner is rendered inside `MainDashboard` and will appear **3 seconds after landing on the dashboard post-login**. A clear inline documentation comment will be added to note that this trigger is interim and should be moved/re-evaluated when the real guest booking flow lands.

---

## Open Questions

No open design questions. The dismissal caching rule is set to 7 days via `localStorage`.

---

## Proposed Changes

### Component 1: PWA Service Worker & Registration

#### [NEW] [sw.js](file:///d:/apps/Platform/apps/guest-member-pwa/public/sw.js)
- Create a minimal service worker file with standard install, activate, and `fetch` event listeners (fetch pass-through) to satisfy PWA installation criteria without caching overhead.

#### [MODIFY] [main.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/main.tsx)
- Add service worker registration script on window load.
- Render the new `<PwaInstallPrompt />` component inside the `MainDashboard` layout.

---

### Component 2: Custom Install UI Components

#### [NEW] [PwaInstallPrompt.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/PwaInstallPrompt.tsx)
- Build a beautiful, responsive slide-up installation banner aligned to dynamic tenant theme colors.
- **Android/Chrome Logic**: Listen to `beforeinstallprompt`, call `e.preventDefault()` synchronously, store prompt event, and prompt user on clicking "Install App". Add an inline comment about this trigger location.
- **iOS Safari Logic**: Check if device is iOS and not running standalone. If true, display share-sheet instruction helper ("Tap Share, then Add to Home Screen").
- **Dismissal Logic**: If the user clicks "Later" or dismisses, store `pwa-install-dismissed` with current timestamp in `localStorage`. Block banner display if timestamp is less than 7 days old.

---

## Verification Plan

### Manual Device Verification
We will verify the PWA over the Cloudflare tunnel URL on real devices:
1. **Android/Chrome**:
   - Reload PWA dashboard.
   - Confirm our custom "Install App" banner slides up after 3 seconds.
   - Confirm Chrome's native install prompt does NOT show up automatically (verifying `preventDefault` succeeds).
   - Verify clicking "Install App" triggers Chrome's installation verification.
   - Verify clicking "Later" dismisses the banner and prevents it from reappearing on subsequent reloads.
2. **iOS/Safari**:
   - Reload PWA dashboard.
   - Confirm the share-sheet instruction banner ("Tap Share, then Add to Home Screen") slides up after 3 seconds.
   - Verify dismissal works and persists via `localStorage`.
3. **Standalone Mode Verification**:
   - Install the app and launch it in standalone mode.
   - Verify no install banners are presented in standalone mode.
