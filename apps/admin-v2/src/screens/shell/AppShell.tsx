import { useState } from 'react';
import { Grid, LogOut } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { useAdminTenant } from '../../auth/AdminTenantContext';
import { Button, SidebarNavItem, BottomNavItem } from '../../components';
import { NAV_DESTINATIONS, activeDestination } from './nav';

/**
 * The navigated-app shell (sub-slice 0.3). Both the desktop sidebar and the mobile
 * bottom-nav are always mounted; a CSS breakpoint (767px, `styles.css`) shows one or
 * the other — the admin-web pattern, not a JS `window.innerWidth` check.
 *
 * Layout route: mounts once, `<Outlet />` swaps the destination content. Owns
 * `useLocation`/`useNavigate` for active-state + click routing only — no overlay state
 * (the mobile "Apps" overflow is a real route, /apps, not a modal).
 */
export function AppShell() {
  const { logout } = useAdminAuth();
  const { tenant } = useAdminTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoLoaded, setLogoLoaded] = useState(false);

  const active = activeDestination(location.pathname);
  const pageTitle = location.pathname === '/apps' ? 'Apps' : active?.label ?? 'Slotflow Admin';
  const venue = tenant?.appName || tenant?.name || 'Slotflow Admin';

  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-2)', minWidth: 0 }}>
      {tenant?.logo ? (
        <img
          src={tenant.logo}
          alt=""
          onLoad={() => setLogoLoaded(true)}
          style={{
            // Sizing in `style`, never HTML attrs — Tailwind v4 preflight overrides those.
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
      <strong
        style={{
          fontSize: 'var(--av2-text-sm)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {venue}
      </strong>
    </div>
  );

  return (
    <div className="av2-shell">
      <nav className="av2-sidebar" aria-label="Primary">
        <div style={{ marginBottom: 'var(--av2-space-4)' }}>{brand}</div>
        {NAV_DESTINATIONS.map((d) => (
          <SidebarNavItem
            key={d.key}
            icon={<d.Icon size={16} />}
            label={d.label}
            active={active?.key === d.key}
            onClick={() => navigate(d.path)}
          />
        ))}
      </nav>

      <div className="av2-shell-body">
        <header className="av2-topbar">
          <span className="av2-topbar-brand">{brand}</span>
          <h1 style={{ margin: 0, fontSize: 'var(--av2-text-lg)', fontWeight: 700 }}>{pageTitle}</h1>
          <Button variant="ghost" leadingIcon={<LogOut size={15} />} onClick={logout} style={{ marginLeft: 'auto' }}>
            Sign out
          </Button>
        </header>

        <main className="av2-shell-main">
          <Outlet />
        </main>
      </div>

      <nav className="av2-bottom-nav" aria-label="Primary">
        {NAV_DESTINATIONS.filter((d) => d.mobileDirect).map((d) => (
          <BottomNavItem
            key={d.key}
            icon={<d.Icon size={20} />}
            label={d.shortLabel ?? d.label}
            active={active?.key === d.key}
            onClick={() => navigate(d.path)}
          />
        ))}
        {/* `Grid` — the reference build's own icon for the "Apps" overflow concept. */}
        <BottomNavItem
          icon={<Grid size={20} />}
          label="Apps"
          active={location.pathname === '/apps'}
          onClick={() => navigate('/apps')}
        />
      </nav>
    </div>
  );
}
