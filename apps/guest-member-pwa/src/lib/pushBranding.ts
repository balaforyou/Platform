// F-334: the push notification's large icon should be the tenant's own logo, not the build-time
// Slotflow default baked into dist/sw.js. The service worker is one build shared by every tenant host
// and cannot see the page's tenant, so the page records the logo for it: this module writes it to the
// Cache API (available in both the page and the service worker), and the shared push handler
// (scripts/shared-sw-push-handler.js) reads it back. Precedent for Cache API use in a service worker:
// apps/admin-v2/public/sw.js. Each tenant host is its own origin, so its cache is isolated and needs
// no tenant key.
//
// The constants below are mirrored as literals in scripts/shared-sw-push-handler.js; a unit test
// checks the two stay in step.
export const PUSH_BRANDING_CACHE = 'tenant-branding-v1';
export const PUSH_BRANDING_KEY = '/__tenant-branding.json';

// The same host-label rule as packages/ui-shared/src/context/TenantContext.tsx (step 1 of
// resolveTenant), duplicated so ui-shared and admin-web stay untouched. If the two ever drift, the
// equality check in resolvePushIcon fails closed: nothing is written and the handler falls back to
// the default icon, so a drift can never show the wrong tenant's logo.
export function hostTenantSubdomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length > 1 && !['localhost', '127', '0'].includes(parts[parts.length - 1])) {
    if (parts.length >= 3 || (parts.length === 2 && parts[1] === 'localhost')) {
      return parts[0];
    }
  }
  return '';
}

export interface PushBrandingTenant {
  subdomain?: string | null;
  logo?: string | null;
}

export interface PushBrandingEnv {
  hostname: string;
  search: string;
  origin: string;
  caches: Pick<CacheStorage, 'open'> | undefined;
}

/**
 * The absolute logo URL to record, or null when nothing should be recorded.
 *
 * Only a tenant that came from host resolution is recorded. TenantContext lets a `?tenant=` query
 * parameter override the host, and falls back to a dev default when the host has no tenant label;
 * in either case the resolved tenant is not the one this origin belongs to, so recording its logo
 * would make this origin's pushes show another tenant's icon. Only http(s) URLs are accepted
 * (no javascript:, data:, blob: ...).
 */
export function resolvePushIcon(tenant: PushBrandingTenant | null, env: PushBrandingEnv): string | null {
  if (!tenant?.logo || !tenant.subdomain) return null;
  if (new URLSearchParams(env.search).get('tenant')) return null;

  const hostSubdomain = hostTenantSubdomain(env.hostname);
  if (!hostSubdomain || hostSubdomain.toLowerCase() !== tenant.subdomain.toLowerCase()) return null;

  try {
    const url = new URL(tenant.logo, env.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function browserEnv(): PushBrandingEnv {
  return {
    hostname: window.location.hostname,
    search: window.location.search,
    origin: window.location.origin,
    caches: typeof window.caches === 'undefined' ? undefined : window.caches,
  };
}

/**
 * Record the tenant's logo for the service worker, or clear a previously recorded one when this
 * load must not record (a `?tenant=` override, a dev-default tenant, a missing or unusable logo).
 * Clearing matters: without it, an earlier override or an old logo would keep being used by pushes.
 * Never throws -- a failure here must not break the app, and the handler falls back to the default.
 */
export async function syncPushIcon(
  tenant: PushBrandingTenant | null,
  env: PushBrandingEnv = browserEnv(),
): Promise<'written' | 'cleared' | 'skipped'> {
  try {
    if (!env.caches) return 'skipped';
    const cache = await env.caches.open(PUSH_BRANDING_CACHE);
    const icon = resolvePushIcon(tenant, env);
    if (icon) {
      await cache.put(
        PUSH_BRANDING_KEY,
        new Response(JSON.stringify({ icon }), { headers: { 'Content-Type': 'application/json' } }),
      );
      return 'written';
    }
    await cache.delete(PUSH_BRANDING_KEY);
    return 'cleared';
  } catch {
    return 'skipped';
  }
}
