import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from './auth/AdminAuthContext';
import { LoadingState } from './components';
import { LoginScreen } from './screens/LoginScreen';
import { LandingPage } from './screens/LandingPage';
import { EnrollPasskeyPrompt, wasPasskeyPromptDismissed } from './screens/EnrollPasskeyPrompt';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { TokenKitchenSink } from './dev/TokenKitchenSink';

/**
 * Slice 1 has three states, gated by auth — no URL router needed yet:
 *   1. not signed in           → LoginScreen
 *   2. signed in, first time   → EnrollPasskeyPrompt (skippable)
 *   3. signed in, prompt done  → LandingPage
 *
 * Plus a dev-only token review surface at /__dev/tokens (0.1), gated behind real
 * sign-in so it reuses the real JWT→tenant path. 0.3 introduces real routing; this
 * is a plain pathname check, same spirit as LoginScreen's `import.meta.env.DEV` gate.
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
    <>
      <LandingPage />
      <PwaInstallPrompt />
    </>
  );
}
