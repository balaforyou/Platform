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
    // Deliberate guard. TenantProvider (ui-shared/TenantContext.tsx) renders its loading and error
    // fallbacks and never mounts children without a resolved tenant, so `tenant` is not null here
    // today. If this component were ever mounted outside that gate, a transient null (a slow or
    // failed lookup) must not wipe a valid record for this origin. The cases that must clear (a
    // `?tenant=` override, a host mismatch, no usable logo) all have a non-null tenant and are
    // handled inside syncPushIcon.
    if (!tenant) return;
    void syncPushIcon(tenant);
  }, [tenant]);
  return null;
}
