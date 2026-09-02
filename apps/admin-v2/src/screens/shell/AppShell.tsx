import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Grid, Moon, Sun } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { useAdminTenant } from '../../auth/AdminTenantContext';
import { Avatar, IconButton, SidebarNavItem, BottomNavItem } from '../../components';
import { applyTheme, effectiveTheme, setStoredTheme } from '../../lib/theme';
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
  const { user, logout } = useAdminAuth();
  const { tenant } = useAdminTenant();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [theme, setTheme] = useState(effectiveTheme());

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setStoredTheme(next);
    setTheme(next);
  };

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

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--av2-space-2)' }}>
            <IconButton
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              onClick={toggleTheme}
            />

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button aria-label="Account menu" className="av2-avatar-trigger">
                  <Avatar name={user?.email ?? user?.userId ?? '?'} size="sm" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="av2-account-menu">
                  <div className="av2-account-menu-identity">{user?.email ?? user?.userId}</div>
                  {user?.phone && <div className="av2-account-menu-phone">{user.phone}</div>}
                  <DropdownMenu.Separator className="av2-account-menu-sep" />
                  <DropdownMenu.Item onSelect={() => logout()} className="av2-account-menu-item">
                    Log out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
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
