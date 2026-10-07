import { useEffect } from 'react';
import { useTenant } from '@badminton/ui-shared';
import { syncPushIcon } from '../lib/pushBranding';

/**
 * F-334: records the resolved tenant's logo for the service worker's push handler (see
 * lib/pushBranding.ts). Renders nothing. Runs on every load, so a changed logo is picked up on the
 * next open, and clears the record when this load is not a host-resolved tenant.
 */
export function PushBrandingSync() {
  const { tenant } = useTenant();
  useEffect(() => {
    if (!tenant) return;
    void syncPushIcon(tenant);
  }, [tenant]);
  return null;
}
