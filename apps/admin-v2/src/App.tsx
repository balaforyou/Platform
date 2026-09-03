import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAdminAuth } from './auth/AdminAuthContext';
import { LoadingState } from './components';
import { LoginScreen } from './screens/LoginScreen';
import { LandingPage } from './screens/LandingPage';
import { EnrollPasskeyPrompt, wasPasskeyPromptDismissed } from './screens/EnrollPasskeyPrompt';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { TokenKitchenSink } from './dev/TokenKitchenSink';
import { AppShell } from './screens/shell/AppShell';
import { AppsOverflowScreen } from './screens/AppsOverflowScreen';
import { StubScreen } from './screens/StubScreen';
import { CourtGroupsScreen } from './screens/CourtGroupsScreen';

/**
 * Auth gate → navigated app.
 *   1. not signed in           → LoginScreen
 *   2. signed in, first time   → EnrollPasskeyPrompt (skippable)
 *   3. signed in, prompt done  → the routed AppShell (sub-slice 0.3)
 *
 * A dev-only token review surface at /__dev/tokens (0.1) is a plain pathname check
 * evaluated BEFORE the router mounts — it stays outside routing entirely.
 * No `basename`: admin-v2 deploys at the root of its own subdomain (vite `base: '/'`).
 */
export default function App() {
  const { loading, isAuthenticated, user } = useAdminAuth();
  const [promptResolved, setPromptResolved] = useState(false);
  const resolvePrompt = useCallback(() => setPromptResolved(true), []);

  // Reset the one-time prompt gate whenever the signed-in identity changes.
  useEffect(() => {
    setPromptResolved(user ? wasPasskeyPromptDismissed(user.userId) : false);
  }, [user?.userId]);

  if (loading) return <LoadingState label="Checking your session…" />;
  if (!isAuthenticated || !user) return <LoginScreen />;

  if (import.meta.env.DEV && window.location.pathname === '/__dev/tokens') {
    return <TokenKitchenSink />;
  }

  if (!promptResolved) {
    return <EnrollPasskeyPrompt onResolved={resolvePrompt} />;
  }

  return (
    <BrowserRouter>
      <PwaInstallPrompt />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<LandingPage />} />
          <Route
            path="/communications"
            element={
              <StubScreen
                title="Communications"
                description="Announcements and messages to members and guests."
              />
            }
          />
          <Route
            path="/ledger"
            element={
              <StubScreen
                title="Subscription Ledger"
                description="Payments collected and outstanding, by member and period."
              />
            }
          />
          <Route
            path="/inventory"
            element={
              <StubScreen title="Inventory" description="Stock and equipment tracked per branch." />
            }
          />
          <Route
            path="/members"
            element={
              <StubScreen
                title="Manage Members"
                description="Member records, plans, and status."
              />
            }
          />
          <Route path="/court-groups" element={<CourtGroupsScreen />} />
          <Route
            path="/guests"
            element={
              <StubScreen
                title="Guest Management"
                description="Walk-in and one-off guest bookings."
              />
            }
          />
          <Route path="/apps" element={<AppsOverflowScreen />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
