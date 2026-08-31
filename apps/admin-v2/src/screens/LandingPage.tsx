import { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useAdminTenant } from '../auth/AdminTenantContext';
import { Button, Card } from '../components';
import { roleLabel } from '../lib/claims';

/**
 * Slice 1 landing page — confirms authentication and shows who is signed in and
 * their role (acceptance criterion 3). Not a dashboard; the foundation only.
 */
export function LandingPage() {
  const { user, logout } = useAdminAuth();
  const { tenant } = useAdminTenant();
  const [logoLoaded, setLogoLoaded] = useState(false);

  if (!user) return null;

  const venue = tenant?.appName || tenant?.name || 'your venue';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--av2-border)',
          background: 'var(--av2-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {tenant?.logo ? (
            <img
              src={tenant.logo}
              alt=""
              onLoad={() => setLogoLoaded(true)}
              style={{
                // Sizing must be in `style`, not the height/width attributes — Tailwind v4's
                // preflight (`img { height: auto }`, @layer base) overrides HTML attributes,
                // which rendered the real logo at its natural 512px once the asset resolved.
                height: 24,
                width: 'auto',
                borderRadius: 4,
                opacity: logoLoaded ? 1 : 0,
                transition: 'opacity var(--av2-duration-slow) var(--av2-ease-standard)',
              }}
            />
          ) : (
            <img src="/icon-192.png" alt="" style={{ height: 24, width: 24, borderRadius: 6 }} />
          )}
          <strong style={{ fontSize: 14 }}>Slotflow Admin</strong>
        </div>
        <Button variant="ghost" leadingIcon={<LogOut size={15} />} onClick={logout}>
          Sign out
        </Button>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
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
      </main>
    </div>
  );
}
