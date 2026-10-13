import {
  Clock,
  DollarSign,
  FileSpreadsheet,
  FolderPlus,
  LayoutDashboard,
  MessageSquare,
  Package,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RoleKind } from '../../lib/claims';
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
  /**
   * S1: role kinds that may see this destination. Unset = every admin role. UI-ONLY hiding: a
   * hidden destination's API routes still answer a scoped manager until S0 enforces them
   * server-side (F-341). Never describe this as a restriction.
   */
  roles?: RoleKind[];
  /**
   * S1: the screen reads the global branch/date context, so the shell shows the branch
   * switcher on it. Flipped to true per screen as each one is moved onto the context.
   */
  branchScoped?: boolean;
  /**
   * S1: the screen can show every branch at once. Only then does the switcher offer "All"
   * (reads only; every write is branch-specific). No screen does yet (a real roll-up is S2's
   * Today), so "All" is never offered in S1 rather than faked.
   */
  supportsAllBranches?: boolean;
  /** S1: the screen reads the global date, so the context bar shows the date picker. */
  dateScoped?: boolean;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard, mobileDirect: true, branchScoped: true, dateScoped: true },
  // Owner-only (Bala: Communications and settings are owner alone). Owner tools sit behind
  // the mobile "Apps" overflow (S1-9), so the daily tasks keep the bottom-nav slots.
  { key: 'communications', label: 'Communications', shortLabel: 'Comms', path: '/communications', Icon: MessageSquare, mobileDirect: false, roles: ['owner'] },
  { key: 'ledger', label: 'Ledger', shortLabel: 'Ledger', path: '/ledger', Icon: DollarSign, mobileDirect: true, branchScoped: true },
  { key: 'inventory', label: 'Inventory', path: '/inventory', Icon: Package, mobileDirect: true, branchScoped: true, dateScoped: true },
  // S1: Walk-in is a mobile nav entry until S2 creates Today (ruled 13 Oct). Same screen as
  // Guest Management, opened on its walk-in (Reservations) tab.
  { key: 'walk-in', label: 'Walk-in', path: '/walk-in', Icon: UserPlus, mobileDirect: true, module: 'GUEST_BOOKING', branchScoped: true },
  { key: 'members', label: 'Manage Members', path: '/members', Icon: Users, mobileDirect: false, module: 'MEMBER_MANAGEMENT' },
  // F-220 §2: /court-groups is a plain stub now (its real functionality moved to /guests) —
  // no module gate, the stub is always visible to the owner; hidden from managers (no screen to use).
  { key: 'court-groups', label: 'Manage Court Groups', path: '/court-groups', Icon: FolderPlus, mobileDirect: false, roles: ['owner'] },
  { key: 'guests', label: 'Guest Management', path: '/guests', Icon: FileSpreadsheet, mobileDirect: false, module: 'GUEST_BOOKING', branchScoped: true },
  // F-210: branch operating hours. No module gate - branch hours aren't a sellable module.
  // Owner-only (settings are owner alone); a manager keeps no entry here in S1.
  { key: 'branch-settings', label: 'Branch Settings', path: '/branch-settings', Icon: Clock, mobileDirect: false, roles: ['owner'] },
];

/** The destinations behind the mobile "Apps" overflow screen. */
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

/**
 * S1: filter destinations by the signed-in admin's role kind. A destination with no `roles` is
 * kept for everyone. A kind of `none` (an admin token with neither role) is NOT filtered, so
 * today's behaviour is preserved for any token this slice has not been told about.
 */
export function filterByRole(destinations: NavDestination[], kind: RoleKind): NavDestination[] {
  if (kind === 'none') return destinations;
  return destinations.filter((d) => !d.roles || d.roles.includes(kind));
}

/** Match a pathname to its destination (prefix match, so nested routes still highlight). */
export function activeDestination(pathname: string): NavDestination | undefined {
  return NAV_DESTINATIONS.find((d) => pathname === d.path || pathname.startsWith(d.path + '/'));
}
