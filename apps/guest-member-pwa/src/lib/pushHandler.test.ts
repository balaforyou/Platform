import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { PUSH_BRANDING_CACHE, PUSH_BRANDING_KEY } from './pushBranding';

// F-334 S2: the shared push handler (scripts/shared-sw-push-handler.js), exercised the way it
// ships: the REAL injector (scripts/inject-push-sw-handler.mjs) writes it into a copy of this app's
// public/sw.js, and the result is executed in a vm sandbox with a fake service-worker global.

const repoRoot = resolve(__dirname, '../../../..');
const ORIGIN = 'https://jbc.elitecourts.duckdns.org';
const DEFAULT_ICON = '/logo.png';

let swSource = '';
let tmpDir = '';

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'f334-sw-'));
  const distSw = join(tmpDir, 'sw.js');
  writeFileSync(distSw, readFileSync(join(repoRoot, 'apps/guest-member-pwa/public/sw.js'), 'utf8'));
  execFileSync(
    process.execPath,
    [join(repoRoot, 'scripts/inject-push-sw-handler.mjs'), '--dist', distSw, '--title', 'Slotflow', '--icon', DEFAULT_ICON],
    { cwd: tmpDir },
  );
  swSource = readFileSync(distSw, 'utf8');
});

type CacheMode =
  | { kind: 'absent' } // no `caches` global at all
  | { kind: 'empty' }
  | { kind: 'record'; body: unknown } // a recorded entry; body is JSON-stringified unless a string marker
  | { kind: 'raw'; text: string } // a recorded entry whose body is not valid JSON
  | { kind: 'throws' };

function load(mode: CacheMode) {
  const listeners: Record<string, (event: any) => void> = {};
  const shown: Array<{ title: string; options: any }> = [];
  const matchCalls: Array<{ key: unknown; options: unknown }> = [];
  const opened: string[] = [];
  const closed: string[] = [];
  const windowsOpened: string[] = [];

  const sandbox: Record<string, any> = {
    URL,
    JSON,
    Promise,
    location: { origin: ORIGIN },
    registration: {
      showNotification: async (title: string, options: any) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => {
        windowsOpened.push(url);
      },
    },
    addEventListener: (type: string, fn: (event: any) => void) => {
      listeners[type] = fn;
    },
  };
  sandbox.self = sandbox;

  if (mode.kind !== 'absent') {
    sandbox.caches = {
      open: async (name: string) => {
        opened.push(name);
        throw new Error('the handler must not open (and so create) the branding cache');
      },
      match: async (key: unknown, options: unknown) => {
        matchCalls.push({ key, options });
        if (mode.kind === 'throws') throw new Error('cache storage failed');
        if (mode.kind === 'empty') return undefined;
        if (mode.kind === 'raw') {
          return { json: async () => JSON.parse(mode.text) };
        }
        return { json: async () => mode.body };
      },
    };
  }

  vm.runInNewContext(swSource, sandbox);

  async function push(raw?: unknown, options: { text?: string } = {}) {
    const waits: Promise<unknown>[] = [];
    const event: any = {
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      data:
        raw === undefined && options.text === undefined
          ? undefined
          : {
              json: () => {
                if (options.text !== undefined) throw new Error('not json');
                return raw;
              },
              text: () => options.text ?? '',
            },
    };
    listeners.push(event);
    await Promise.all(waits);
    return shown[shown.length - 1];
  }

  async function click(notificationData: unknown) {
    const waits: Promise<unknown>[] = [];
    listeners.notificationclick({
      notification: { close: () => closed.push('closed'), data: notificationData },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
  }

  return { push, click, shown, matchCalls, opened, closed, windowsOpened, listeners };
}

const FCM_SHAPE = {
  notification: { title: 'Booking Confirmed', body: 'Tap to view details.' },
  data: { eventType: 'booking_confirmed', variables: '{}' },
};

describe('injected service worker', () => {
  it('has no placeholder token left after injection', () => {
    expect(swSource).not.toMatch(/__PUSH_/);
    expect(swSource).toContain("resolveTenantPushIcon('/logo.png')");
  });

  it('registers both push listeners', () => {
    const { listeners } = load({ kind: 'empty' });
    expect(typeof listeners.push).toBe('function');
    expect(typeof listeners.notificationclick).toBe('function');
  });
});

describe('push icon: the recorded tenant logo', () => {
  it('uses the recorded same-origin icon and keeps the default badge', async () => {
    const sw = load({ kind: 'record', body: { icon: `${ORIGIN}/logo-jbc.png` } });
    const shown = await sw.push(FCM_SHAPE);
    expect(shown.options.icon).toBe(`${ORIGIN}/logo-jbc.png`);
    expect(shown.options.badge).toBe(DEFAULT_ICON);
  });

  it('looks the record up by the exact cache name and key, without opening the cache', async () => {
    const sw = load({ kind: 'record', body: { icon: `${ORIGIN}/logo-jbc.png` } });
    await sw.push(FCM_SHAPE);
    expect(sw.matchCalls).toEqual([{ key: PUSH_BRANDING_KEY, options: { cacheName: PUSH_BRANDING_CACHE } }]);
    expect(sw.opened).toEqual([]);
  });

  it('resolves a relative recorded icon against the worker origin', async () => {
    const sw = load({ kind: 'record', body: { icon: '/logo-jbc.png' } });
    expect((await sw.push(FCM_SHAPE)).options.icon).toBe(`${ORIGIN}/logo-jbc.png`);
  });
});

describe('push icon: every fallback case uses the default icon', () => {
  const cases: Array<[string, CacheMode]> = [
    ['no Cache API at all', { kind: 'absent' }],
    ['no recorded entry', { kind: 'empty' }],
    ['an entry that is not valid JSON', { kind: 'raw', text: 'not json {' }],
    ['a JSON null', { kind: 'record', body: null }],
    ['a record with no icon', { kind: 'record', body: {} }],
    ['a non-string icon (number)', { kind: 'record', body: { icon: 42 } }],
    ['a non-string icon (object)', { kind: 'record', body: { icon: { href: '/x.png' } } }],
    ['a cross-origin icon', { kind: 'record', body: { icon: 'https://evil.example.com/logo.png' } }],
    ['a different tenant host', { kind: 'record', body: { icon: 'https://courtowner1.elitecourts.duckdns.org/logo.png' } }],
    ['a javascript: icon', { kind: 'record', body: { icon: 'javascript:alert(1)' } }],
    ['a data: icon', { kind: 'record', body: { icon: 'data:image/png;base64,AAAA' } }],
    ['a blob: icon', { kind: 'record', body: { icon: `blob:${ORIGIN}/abc` } }],
    ['an unparseable URL', { kind: 'record', body: { icon: 'http://' } }],
    ['cache storage that throws', { kind: 'throws' }],
  ];

  it.each(cases)('%s', async (_label, mode) => {
    const sw = load(mode);
    const shown = await sw.push(FCM_SHAPE);
    expect(shown.options.icon).toBe(DEFAULT_ICON);
    expect(shown.options.badge).toBe(DEFAULT_ICON);
    // the notification itself is still shown, unchanged
    expect(shown.title).toBe('Booking Confirmed');
  });
});

describe('payload handling is unchanged (F-236 regression)', () => {
  it('reads title and body from the nested FCM `notification` key', async () => {
    const sw = load({ kind: 'empty' });
    const shown = await sw.push(FCM_SHAPE);
    expect(shown.title).toBe('Booking Confirmed');
    expect(shown.options.body).toBe('Tap to view details.');
    expect(shown.options.data).toEqual(FCM_SHAPE.data);
  });

  it('still accepts a flat title/body', async () => {
    const sw = load({ kind: 'empty' });
    const shown = await sw.push({ title: 'Flat title', body: 'Flat body' });
    expect(shown.title).toBe('Flat title');
    expect(shown.options.body).toBe('Flat body');
  });

  it('falls back to the hardcoded title and body when there is no payload', async () => {
    const sw = load({ kind: 'empty' });
    const shown = await sw.push(undefined);
    expect(shown.title).toBe('Slotflow');
    expect(shown.options.body).toBe('You have a new notification.');
  });

  it('shows a non-JSON payload as the body under the fallback title', async () => {
    const sw = load({ kind: 'empty' });
    const shown = await sw.push(undefined, { text: 'plain text push' });
    expect(shown.title).toBe('Slotflow');
    expect(shown.options.body).toBe('plain text push');
  });

  it('is unaffected by the branding record when the payload is the real FCM shape', async () => {
    const sw = load({ kind: 'record', body: { icon: `${ORIGIN}/logo-jbc.png` } });
    const shown = await sw.push(FCM_SHAPE);
    expect(shown.title).toBe('Booking Confirmed');
    expect(shown.options.body).toBe('Tap to view details.');
  });
});

describe('notificationclick is unchanged (F-327 is separate)', () => {
  it('closes the notification and opens "/" when no url is carried', async () => {
    const sw = load({ kind: 'empty' });
    await sw.click({});
    expect(sw.closed).toEqual(['closed']);
    expect(sw.windowsOpened).toEqual(['/']);
  });

  it('opens the carried url', async () => {
    const sw = load({ kind: 'empty' });
    await sw.click({ url: '/bookings' });
    expect(sw.windowsOpened).toEqual(['/bookings']);
  });
});

describe('writer / handler drift guard', () => {
  it('uses the same cache name and key as lib/pushBranding.ts', () => {
    const fragment = readFileSync(join(repoRoot, 'scripts/shared-sw-push-handler.js'), 'utf8');
    expect(fragment).toContain(`const TENANT_BRANDING_CACHE = '${PUSH_BRANDING_CACHE}';`);
    expect(fragment).toContain(`const TENANT_BRANDING_KEY = '${PUSH_BRANDING_KEY}';`);
  });
});
