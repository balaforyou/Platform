import { useEffect, useState } from 'react';
import { useAdminAuth } from './auth/AdminAuthContext';
import { LoadingState } from './components';
import { LoginScreen } from './screens/LoginScreen';
import { LandingPage } from './screens/LandingPage';
import { EnrollPasskeyPrompt, wasPasskeyPromptDismissed } from './screens/EnrollPasskeyPrompt';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';

/**
 * Slice 1 has three states, gated by auth — no URL router needed yet:
 *   1. not signed in           → LoginScreen
 *   2. signed in, first time   → EnrollPasskeyPrompt (skippable)
 *   3. signed in, prompt done  → LandingPage
 */
export default function App() {
  const { loading, isAuthenticated, user } = useAdminAuth();
  const [promptResolved, setPromptResolved] = useState(false);

  // Reset the one-time prompt gate whenever the signed-in identity changes.
  useEffect(() => {
    setPromptResolved(user ? wasPasskeyPromptDismissed(user.userId) : false);
  }, [user?.userId]);

  if (loading) return <LoadingState label="Checking your session…" />;
  if (!isAuthenticated || !user) return <LoginScreen />;

  if (!promptResolved) {
    return <EnrollPasskeyPrompt onResolved={() => setPromptResolved(true)} />;
  }

  return (
    <>
      <LandingPage />
      <PwaInstallPrompt />
    </>
  );
}
