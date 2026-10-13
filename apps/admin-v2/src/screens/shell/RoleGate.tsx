import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { roleKind } from '../../lib/claims';
import { NAV_DESTINATIONS } from './nav';

/**
 * S1: a direct URL to a destination hidden from the signed-in role redirects home (same posture
 * as GuestManagementScreen's entitlement refusal). UI-ONLY and NOT a security boundary: the
 * API routes behind a hidden screen still answer a scoped manager until S0 enforces them
 * server-side (F-341). The home is `/dashboard` until S2 creates Today (ruled 13 Oct).
 */
export function RoleGate({ destination, children }: { destination: string; children: ReactElement }) {
  const { user } = useAdminAuth();
  const dest = NAV_DESTINATIONS.find((d) => d.key === destination);
  const kind = roleKind(user?.roles);
  if (dest?.roles && kind !== 'none' && !dest.roles.includes(kind)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
