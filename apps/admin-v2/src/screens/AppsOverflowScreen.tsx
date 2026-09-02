import { useNavigate } from 'react-router-dom';
import { Card } from '../components';
import { useAdminTenant } from '../auth/AdminTenantContext';
import { OVERFLOW_DESTINATIONS, filterByEntitlement } from './shell/nav';

/**
 * The /apps route's content (sub-slice 0.3) — the mobile "Apps" overflow, built as a
 * real route rather than a modal so it gets its own URL, back-button, and refresh
 * behaviour (matches the reference build, where "Apps" is a real screen too).
 *
 * A plain tile grid of the destinations that aren't in the mobile bottom-nav. Reachable
 * at /apps from any viewport; nothing links to it on desktop (all 7 are direct there).
 */
export function AppsOverflowScreen() {
  const navigate = useNavigate();
  const { entitlements } = useAdminTenant();
  const destinations = filterByEntitlement(OVERFLOW_DESTINATIONS, entitlements);

  return (
    <>
      {/* Shown on mobile where the topbar hides the page title; harmless on desktop. */}
      <h2 style={{ margin: '0 0 var(--av2-space-4)', fontSize: 'var(--av2-text-lg)' }}>Apps</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 'var(--av2-space-3)',
          maxWidth: 480,
        }}
      >
      {destinations.map((d) => (
        <Card
          key={d.key}
          as="section"
          style={{ cursor: 'pointer', textAlign: 'center', padding: 'var(--av2-space-5) var(--av2-space-3)' }}
        >
          <button
            onClick={() => navigate(d.path)}
            aria-label={d.label}
            style={{
              appearance: 'none',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--av2-space-2)',
              color: 'var(--av2-text)',
            }}
          >
            <span style={{ color: 'var(--av2-accent)', display: 'inline-flex' }}>
              <d.Icon size={24} />
            </span>
            <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>{d.label}</span>
          </button>
        </Card>
      ))}
      </div>
    </>
  );
}
