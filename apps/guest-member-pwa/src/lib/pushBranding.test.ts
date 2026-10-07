import { describe, expect, it } from 'vitest';
import {
  PUSH_BRANDING_CACHE,
  PUSH_BRANDING_KEY,
  hostTenantSubdomain,
  resolvePushIcon,
  syncPushIcon,
  type PushBrandingEnv,
} from './pushBranding';

// F-334 S1: the page-side writer. Node environment, so `caches` is injected rather than global.

function fakeCaches(options: { throwOn?: 'open' | 'put' | 'delete' } = {}) {
  const store = new Map<string, Map<string, string>>();
  const calls: string[] = [];
  const caches = {
    async open(name: string) {
      calls.push(`open:${name}`);
      if (options.throwOn === 'open') throw new Error('open failed');
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name)!;
      return {
        async put(key: string, response: Response) {
          calls.push('put');
          if (options.throwOn === 'put') throw new Error('put failed');
          entries.set(key, await response.text());
        },
        async delete(key: string) {
          calls.push('delete');
          if (options.throwOn === 'delete') throw new Error('delete failed');
          return entries.delete(key);
        },
      };
    },
  } as unknown as PushBrandingEnv['caches'];
  return { caches, store, calls };
}

function env(overrides: Partial<PushBrandingEnv> & { caches: PushBrandingEnv['caches'] }): PushBrandingEnv {
  return {
    hostname: 'jbc.elitecourts.duckdns.org',
    search: '',
    origin: 'https://jbc.elitecourts.duckdns.org',
    ...overrides,
  };
}

const jbc = { subdomain: 'jbc', logo: '/logo-jbc.png' };

function recorded(store: Map<string, Map<string, string>>) {
  const raw = store.get(PUSH_BRANDING_CACHE)?.get(PUSH_BRANDING_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
}

describe('hostTenantSubdomain', () => {
  it('takes the first label of a real tenant host', () => {
    expect(hostTenantSubdomain('jbc.elitecourts.duckdns.org')).toBe('jbc');
    expect(hostTenantSubdomain('courtowner1.elitecourts.duckdns.org')).toBe('courtowner1');
  });

  it('returns empty for hosts with no tenant label, mirroring TenantContext', () => {
    expect(hostTenantSubdomain('localhost')).toBe('');
    expect(hostTenantSubdomain('elitecourts.duckdns')).toBe('');
  });

  it('reproduces TenantContext\'s quirk for a bare IPv4 host rather than "fixing" it', () => {
    // TenantContext excludes only a trailing 'localhost' / '127' / '0', and the last label of
    // 127.0.0.1 is '1', so it resolves the subdomain '127' there. No tenant has that subdomain, so
    // resolvePushIcon's equality check still refuses to record anything for such a host.
    expect(hostTenantSubdomain('127.0.0.1')).toBe('127');
    expect(
      resolvePushIcon(jbc, env({ caches: undefined, hostname: '127.0.0.1', origin: 'http://127.0.0.1:5173' })),
    ).toBeNull();
  });

  it('keeps the tenant.localhost rule TenantContext has (parts.length === 2)', () => {
    // TenantContext's own check excludes a trailing "localhost" first, so this branch is
    // unreachable there (parked observation); the mirror reproduces it exactly, not "fixes" it.
    expect(hostTenantSubdomain('jbc.localhost')).toBe('');
  });
});

describe('resolvePushIcon (the ?tenant= guard)', () => {
  it('returns an absolute URL for a host-resolved tenant', () => {
    expect(resolvePushIcon(jbc, env({ caches: undefined }))).toBe('https://jbc.elitecourts.duckdns.org/logo-jbc.png');
  });

  it('refuses when a ?tenant= override is present, even if it names the host tenant', () => {
    expect(resolvePushIcon(jbc, env({ caches: undefined, search: '?tenant=jbc' }))).toBeNull();
    expect(resolvePushIcon(jbc, env({ caches: undefined, search: '?x=1&tenant=courtowner1' }))).toBeNull();
  });

  it('refuses when the resolved tenant is not the host tenant (dev default fallback / drift)', () => {
    const courtowner1 = { subdomain: 'courtowner1', logo: '/logo.png' };
    expect(resolvePushIcon(courtowner1, env({ caches: undefined }))).toBeNull();
    expect(resolvePushIcon(courtowner1, env({ caches: undefined, hostname: 'localhost', origin: 'http://localhost:5173' }))).toBeNull();
  });

  it('compares the subdomain case-insensitively', () => {
    expect(resolvePushIcon({ subdomain: 'JBC', logo: '/logo-jbc.png' }, env({ caches: undefined }))).toBe(
      'https://jbc.elitecourts.duckdns.org/logo-jbc.png',
    );
  });

  it('refuses a missing tenant, logo or subdomain', () => {
    expect(resolvePushIcon(null, env({ caches: undefined }))).toBeNull();
    expect(resolvePushIcon({ subdomain: 'jbc', logo: null }, env({ caches: undefined }))).toBeNull();
    expect(resolvePushIcon({ subdomain: 'jbc', logo: '' }, env({ caches: undefined }))).toBeNull();
    expect(resolvePushIcon({ subdomain: null, logo: '/logo-jbc.png' }, env({ caches: undefined }))).toBeNull();
  });

  it('accepts an absolute https logo and keeps it as is', () => {
    expect(resolvePushIcon({ subdomain: 'jbc', logo: 'https://cdn.example.com/jbc.png' }, env({ caches: undefined }))).toBe(
      'https://cdn.example.com/jbc.png',
    );
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['blob:', 'blob:https://jbc.elitecourts.duckdns.org/abc'],
    ['file:', 'file:///etc/passwd'],
  ])('rejects a %s logo', (_label, logo) => {
    expect(resolvePushIcon({ subdomain: 'jbc', logo }, env({ caches: undefined }))).toBeNull();
  });
});

describe('syncPushIcon', () => {
  it('writes the absolute URL for a host-resolved tenant', async () => {
    const { caches, store } = fakeCaches();
    await expect(syncPushIcon(jbc, env({ caches }))).resolves.toBe('written');
    expect(recorded(store)).toEqual({ icon: 'https://jbc.elitecourts.duckdns.org/logo-jbc.png' });
  });

  it('overwrites an older logo on a later load (a changed logo propagates)', async () => {
    const { caches, store } = fakeCaches();
    await syncPushIcon(jbc, env({ caches }));
    await syncPushIcon({ subdomain: 'jbc', logo: '/logo-jbc-v2.png' }, env({ caches }));
    expect(recorded(store)).toEqual({ icon: 'https://jbc.elitecourts.duckdns.org/logo-jbc-v2.png' });
  });

  it('clears a stale entry when a ?tenant= override load follows a normal one', async () => {
    const { caches, store } = fakeCaches();
    await syncPushIcon(jbc, env({ caches }));
    expect(recorded(store)).toBeDefined();
    await expect(
      syncPushIcon({ subdomain: 'courtowner1', logo: '/logo.png' }, env({ caches, search: '?tenant=courtowner1' })),
    ).resolves.toBe('cleared');
    expect(recorded(store)).toBeUndefined();
  });

  it('clears the entry when the host tenant has no usable logo', async () => {
    const { caches, store } = fakeCaches();
    await syncPushIcon(jbc, env({ caches }));
    await expect(syncPushIcon({ subdomain: 'jbc', logo: null }, env({ caches }))).resolves.toBe('cleared');
    expect(recorded(store)).toBeUndefined();
  });

  it('never writes a javascript: or data: logo', async () => {
    for (const logo of ['javascript:alert(1)', 'data:image/png;base64,AAAA']) {
      const { caches, store, calls } = fakeCaches();
      await expect(syncPushIcon({ subdomain: 'jbc', logo }, env({ caches }))).resolves.toBe('cleared');
      expect(recorded(store)).toBeUndefined();
      expect(calls).not.toContain('put');
    }
  });

  it('skips when the Cache API is unavailable', async () => {
    await expect(syncPushIcon(jbc, env({ caches: undefined }))).resolves.toBe('skipped');
  });

  it.each(['open', 'put', 'delete'] as const)('swallows a cache error on %s', async (throwOn) => {
    const { caches } = fakeCaches({ throwOn });
    // `delete` only runs on the clear path; `put` only on the write path.
    const tenant = throwOn === 'delete' ? { subdomain: 'jbc', logo: null } : jbc;
    await expect(syncPushIcon(tenant, env({ caches }))).resolves.toBe('skipped');
  });
});
