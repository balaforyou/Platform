import {
  DollarSign,
  FileSpreadsheet,
  FolderPlus,
  LayoutDashboard,
  MessageSquare,
  Package,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for the 7-destination IA (discovery doc §1). The sidebar,
 * the mobile bottom-nav, and the /apps overflow screen all read this one list — not
 * three hand-maintained copies.
 *
 * `mobileDirect`: true  → gets a slot in the mobile bottom-nav bar
 *                 false → lives behind the mobile "Apps" (/apps) overflow screen
 * Desktop shows all 7 in the sidebar regardless.
 */
export interface NavDestination {
  key: string;
  /** Full label — sidebar, topbar title, /apps tiles. */
  label: string;
  /** Compact label for the mobile bottom-nav slot (defaults to `label`). */
  shortLabel?: string;
  path: string;
  Icon: LucideIcon;
  mobileDirect: boolean;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard, mobileDirect: true },
  { key: 'communications', label: 'Communications', shortLabel: 'Comms', path: '/communications', Icon: MessageSquare, mobileDirect: true },
  { key: 'ledger', label: 'Subscription Ledger', shortLabel: 'Ledger', path: '/ledger', Icon: DollarSign, mobileDirect: true },
  { key: 'inventory', label: 'Inventory', path: '/inventory', Icon: Package, mobileDirect: true },
  { key: 'members', label: 'Manage Members', path: '/members', Icon: Users, mobileDirect: false },
  { key: 'court-groups', label: 'Manage Court Groups', path: '/court-groups', Icon: FolderPlus, mobileDirect: false },
  { key: 'guests', label: 'Guest Management', path: '/guests', Icon: FileSpreadsheet, mobileDirect: false },
];

/** The 3 destinations behind the mobile "Apps" overflow screen. */
export const OVERFLOW_DESTINATIONS = NAV_DESTINATIONS.filter((d) => !d.mobileDirect);

/** Match a pathname to its destination (prefix match, so nested routes still highlight). */
export function activeDestination(pathname: string): NavDestination | undefined {
  return NAV_DESTINATIONS.find((d) => pathname === d.path || pathname.startsWith(d.path + '/'));
}
