import { useTenant } from '@badminton/ui-shared';

/**
 * Scaffold placeholder. Slice 1's real surface — login screen, post-login landing,
 * fingerprint enrollment prompt — lands in build step 4 (frontend flows).
 */
export default function App() {
  const { tenant } = useTenant();

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 20 }}>Slotflow Admin</h1>
      <p style={{ margin: 0, color: 'var(--av2-muted)' }}>
        admin-v2 scaffold — {tenant?.name ?? 'resolving tenant…'}
      </p>
    </main>
  );
}
