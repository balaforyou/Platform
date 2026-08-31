import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminAuthProvider } from './auth/AdminAuthContext';
import { AdminTenantProvider } from './auth/AdminTenantContext';
import { ToastProvider } from './components';
import App from './App';
import './styles.css';

// Capture beforeinstallprompt before React mounts, so a fast-firing event isn't lost
// (same guard as the guest PWA). PwaInstallPrompt picks this up on mount.
(window as any).__av2DeferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__av2DeferredPrompt = e;
  (window as any).__av2OnBeforeInstallPrompt?.(e);
});

// Register the minimal service worker for PWA installability (F-197).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// admin-v2 deliberately does NOT wrap in ui-shared's TenantProvider: its tenant is
// resolved from the signed-in admin's JWT, not the hostname. See Slice 1 plan §1.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <AdminTenantProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AdminTenantProvider>
      </AdminAuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
