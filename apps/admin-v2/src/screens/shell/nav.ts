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
import {
  moduleVisible,
  type EntitlementState,
  type TenantModuleName,
} from '../../auth/AdminTenantContext';

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
  /**
   * F-206: the sellable module this destination belongs to. When set, the destination is
   * shown only if the tenant's entitlement for that module is ACTIVE or READ_ONLY. Unset =
   * always visible (Dashboard, Communications, Ledger, Inventory map to no F-206 module).
   */
  module?: TenantModuleName;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard, mobileDirect: true },
  { key: 'communications', label: 'Communications', shortLabel: 'Comms', path: '/communications', Icon: MessageSquare, mobileDirect: true },
  { key: 'ledger', label: 'Subscription Ledger', shortLabel: 'Ledger', path: '/ledger', Icon: DollarSign, mobileDirect: true },
  { key: 'inventory', label: 'Inventory', path: '/inventory', Icon: Package, mobileDirect: true },
  { key: 'members', label: 'Manage Members', path: '/members', Icon: Users, mobileDirect: false, module: 'MEMBER_MANAGEMENT' },
  { key: 'court-groups', label: 'Manage Court Groups', path: '/court-groups', Icon: FolderPlus, mobileDirect: false, module: 'GUEST_BOOKING' },
  { key: 'guests', label: 'Guest Management', path: '/guests', Icon: FileSpreadsheet, mobileDirect: false, module: 'GUEST_BOOKING' },
];

/** The 3 destinations behind the mobile "Apps" overflow screen. */
export const OVERFLOW_DESTINATIONS = NAV_DESTINATIONS.filter((d) => !d.mobileDirect);

/**
 * F-206: filter destinations by the tenant's module entitlements. A destination with no
 * `module` is always kept. A destination whose module is not `moduleVisible` (NO_ROW /
 * NOT_STARTED / HIDDEN) is dropped. `entitlements` of `null` (fetch in flight / failed)
 * keeps everything — a transient failure must never strand an admin without navigation.
 */
export function filterByEntitlement(
  destinations: NavDestination[],
  entitlements: Partial<Record<TenantModuleName, EntitlementState>> | null,
): NavDestination[] {
  if (!entitlements) return destinations;
  return destinations.filter((d) => !d.module || moduleVisible(entitlements[d.module]));
}

/** Match a pathname to its destination (prefix match, so nested routes still highlight). */
export function activeDestination(pathname: string): NavDestination | undefined {
  return NAV_DESTINATIONS.find((d) => pathname === d.path || pathname.startsWith(d.path + '/'));
}
