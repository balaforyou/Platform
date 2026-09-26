import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home as HomeIcon, CalendarCheck2, User as UserIcon } from 'lucide-react';
import { useAuth } from '@badminton/ui-shared';
import AccountSheet from './ui/AccountSheet';
import Avatar from './ui/Avatar';
import PwaInstallPrompt from './PwaInstallPrompt';
import './Shell.css';

interface NavItem {
  icon: typeof HomeIcon;
  label: string;
  to: string;
  matchPaths: string[];
}

const NAV_ITEMS: NavItem[] = [
  { icon: HomeIcon, label: 'Home', to: '/', matchPaths: ['/'] },
  {
    icon: CalendarCheck2,
    label: 'History',
    to: '/bookings/my',
    matchPaths: ['/bookings/my', '/bookings/:id/pay', '/bookings/:id/confirmation'],
  },
];

function isActive(pathname: string, matchPaths: string[]): boolean {
  return matchPaths.some((pattern) => {
    if (pattern === '/') return pathname === '/';
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
    return regex.test(pathname);
  });
}

// F-235 Phase 0: replaces the old Layout() -- no fixed global header anymore, each screen owns
// its own top area (per claude/guestPWA2/05-*.md §4.2). The account/theme entry point (below)
// follows admin-v2's own precedent (apps/admin-v2/src/screens/shell/AppShell.tsx's always-
// visible avatar trigger in shell-level chrome) rather than waiting on the Home screen's own
// avatar, which isn't rebuilt this slice -- otherwise AccountSheet (and logout) would be
// unreachable until a future slice, breaking the real login/logout flow and the Playwright
// canary (member-self-confirm.spec.ts, f041-verification.spec.ts) that clicks #logout-btn today.
export default function Shell() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  // F-248: real Google name/photo, falling back to the generic icon when neither exists (a
  // phone-only guest who never signed in with Google) -- same fallback-chain precedent
  // admin-v2's AppShell.tsx already established for F-219.
  const avatarName = user?.displayName || user?.name || user?.email || null;

  return (
    <div className="gpwa-shell">
      <button
        type="button"
        className="gpwa-shell__account-trigger"
        aria-label="Account"
        onClick={() => setAccountOpen(true)}
      >
        {avatarName ? <Avatar src={user?.photoUrl} name={avatarName} size={32} /> : <UserIcon className="h-4 w-4" />}
      </button>

      <main className="gpwa-shell__outlet">
        <Outlet />
      </main>

      <nav className="gpwa-shell__nav" aria-label="Primary">
        {NAV_ITEMS.map(({ icon: Icon, label, to, matchPaths }) => {
          const active = isActive(pathname, matchPaths);
          return (
            <Link key={to} to={to} className="gpwa-shell__nav-item" data-active={active}>
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
      <PwaInstallPrompt />
    </div>
  );
}
