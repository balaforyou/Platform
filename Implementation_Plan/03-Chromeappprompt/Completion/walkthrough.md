# Walkthrough — Phase 8: PWA Installability

We have successfully implemented PWA installability inside `apps/guest-member-pwa` by introducing a custom installation prompt workflow for both Android/Chrome and iOS/Safari, backed by a minimal service worker.

---

## 1. Logo Resolution & 512x512 Verification Fix
- Generated a high-resolution, perfectly-squared logo.
- Resized it using `.NET` graphics classes to exactly **512x512 pixels** and saved to [logo.png](file:///d:/apps/Platform/apps/guest-member-pwa/public/logo.png) to satisfy Google Chrome's installation criteria.
- Updated the database seed in [seed_tenant.ts](file:///C:/Users/HP/.gemini/antigravity/brain/e78d347c-ed07-461f-b124-fafc2d48b362/scratch/seed_tenant.ts) to map `logo: "/logo.png"` and executed the script. This resolves Chrome's console warning about incorrect resource dimensions.

---

## 2. Dynamic Manifest Fetch 404 Prevention
- Removed the hardcoded `<link rel="manifest">` element referencing the subdomain placeholder from [index.html](file:///d:/apps/Platform/apps/guest-member-pwa/index.html).
- `TenantContext` now dynamically inserts the link tag into the document head **only** after resolving the tenant UUID, eliminating the initial `404 Not Found` requests on boot.

---

## 3. Service Worker & Registration
- [sw.js](file:///d:/apps/Platform/apps/guest-member-pwa/public/sw.js): Built a minimal, pass-through service worker served directly at `/sw.js` to satisfy browser install requirements without interference.
- [main.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/main.tsx): Integrated service worker registration on page load and mounted the `<PwaInstallPrompt />` trigger inside the Main Dashboard layout.

---

## 4. Branded Install Prompt UI
- [PwaInstallPrompt.tsx](file:///d:/apps/Platform/apps/guest-member-pwa/src/components/PwaInstallPrompt.tsx): Built the custom prompt component using Tailwind and theme CSS properties:
  - **beforeinstallprompt Interception**: Synchronously executes `e.preventDefault()` inside the event listener to suppress Chrome's automatic native banner.
  - **Android/Chrome Workflow**: Slides up a branded notification banner 3 seconds after dashboard load, providing direct "Install App" actions that execute `.prompt()` on the saved event.
  - **iOS/Safari Workflow**: Detects iOS Safari context via user-agent checking and displays step-by-step instructions directing users to the Safari Share action sheet.
  - **Standalone Protection**: Auto-detects standalone displays (`display-mode: standalone`) and skips prompt displays if the app is already installed.
  - **Dismissal Caching**: Stores a 7-day dismissal window inside `localStorage` to preserve user experience.

---

## 5. Workspace Build Verification
Running `pnpm run build` compiled the entire project successfully with **0 compiler errors or lint warnings**:
```
$ tsc && vite build
vite v5.4.21 building for production...
transforming...
✓ 1859 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.24 kB │ gzip:  0.62 kB
dist/assets/index-BqBT5nxC.css   20.54 kB │ gzip:  4.39 kB
dist/assets/index-CiJEBPgh.js   243.49 kB │ gzip: 76.24 kB
✓ built in 4.98s
```

---

## 6. E2E Verification Instructions

You can perform device verification directly over the active Cloudflare Tunnel:

👉 **[https://judicial-architectural-brown-cleaner.trycloudflare.com](https://judicial-architectural-brown-cleaner.trycloudflare.com)**

### Validation Checklist:
1. **On Android / Chrome**:
   - Navigate to the URL and log in (`9999999999` / code `123456`).
   - Confirm that exactly 3 seconds after dashboard load, the custom "Install Elite Courts" banner slides up.
   - Confirm that Chrome's default white install prompt **never** appears.
   - Click "Install App" and confirm the system installer triggers.
   - Reload the page, click "Later", and confirm the banner is hidden and does not reappear on subsequent reloads.

2. **On iOS / Safari**:
   - Navigate to the URL and log in.
   - Confirm that after 3 seconds, the "Install Elite Courts" banner presents step-by-step instructions on selecting the "Add to Home Screen" option from Safari's Share sheet.
   - Dismiss the banner and confirm it remains cached out.
