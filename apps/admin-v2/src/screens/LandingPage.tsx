import { ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useAdminTenant } from '../auth/AdminTenantContext';
import { Card } from '../components';
import { roleLabel } from '../lib/claims';

/**
 * The /dashboard route's content (sub-slice 0.3). This is the identity-confirmation
 * Card from Slice 1's LandingPage, extracted intact — the shell (AppShell) now owns
 * the header (logo / venue / sign-out) that used to live here. Occupancy / KPI data
 * is out of scope for 0.3; this stays the "you're authenticated" confirmation until a
 * real dashboard replaces it.
 */
export function LandingPage() {
  const { user } = useAdminAuth();
  const { tenant } = useAdminTenant();

  if (!user) return null;

  const venue = tenant?.appName || tenant?.name || 'your venue';

  return (
    <Card style={{ width: '100%', maxWidth: 440 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--av2-accent)',
          background: 'var(--av2-accent-soft)',
          padding: '4px 10px',
          borderRadius: 999,
          marginBottom: 16,
        }}
      >
        <ShieldCheck size={14} />
        Signed in
      </div>

      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>You’re authenticated</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--av2-muted)' }}>
        Slice 1 confirms the login foundation for {venue}. Admin features land on top of this.
      </p>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 14 }}>
        <dt style={{ color: 'var(--av2-muted)' }}>Signed in as</dt>
        <dd style={{ margin: 0, fontWeight: 600 }} id="admin-identity-email">
          {user.email ?? user.userId}
        </dd>

        <dt style={{ color: 'var(--av2-muted)' }}>Role</dt>
        <dd style={{ margin: 0 }} id="admin-identity-roles">
          {user.roles.length === 0 ? (
            <span style={{ color: 'var(--av2-muted)' }}>—</span>
          ) : (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              {user.roles.map((r) => (
                <span
                  key={r}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'var(--av2-surface-alt)',
                    border: '1px solid var(--av2-border)',
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}
                >
                  {roleLabel(r)}
                </span>
              ))}
            </span>
          )}
        </dd>

        <dt style={{ color: 'var(--av2-muted)' }}>Venue</dt>
        <dd style={{ margin: 0 }}>{tenant?.name ?? user.tenantId}</dd>
      </dl>
    </Card>
  );
}
