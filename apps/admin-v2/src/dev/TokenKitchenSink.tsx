import { useEffect, useState } from 'react';
import { useAdminTenant } from '../auth/AdminTenantContext';
import { Button, Card } from '../components';

/**
 * Sub-slice 0.1 — dev-only design-token review surface, reached at /__dev/tokens
 * AFTER real sign-in (see App.tsx). Not wired into any real nav; excluded from
 * production behaviour by the `import.meta.env.DEV` gate at the call site.
 *
 * Renders every token the slice defines so a reviewer can eyeball the full scale in
 * both themes, plus the real tenant logo resolved through `useAdminTenant()`.
 */

const SEMANTIC_COLORS = [
  '--av2-bg',
  '--av2-surface',
  '--av2-surface-alt',
  '--av2-border',
  '--av2-text',
  '--av2-muted',
  '--av2-accent',
  '--av2-accent-hover',
  '--av2-accent-fg',
  '--av2-accent-soft',
  '--av2-ring',
  '--av2-danger',
  '--av2-danger-soft',
  '--av2-danger-border',
  '--av2-info-soft',
  '--av2-info-border',
  '--av2-info-text',
];

const RAMP_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const TEXT_STEPS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl'];
const RADII = ['--av2-radius-sm', '--av2-radius'];
const SHADOWS = ['--av2-shadow', '--av2-shadow-lg'];
const DURATIONS = ['--av2-duration-fast', '--av2-duration-base', '--av2-duration-slow'];

type ThemeChoice = 'light' | 'dark';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--av2-space-10)' }}>
      <h2 style={{ fontSize: 'var(--av2-text-lg)', margin: '0 0 var(--av2-space-4)' }}>{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-3)' }}>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--av2-radius-sm)',
          background: `var(${name})`,
          border: '1px solid var(--av2-border)',
          flex: 'none',
        }}
      />
      <code style={{ fontSize: 'var(--av2-text-xs)' }}>{name}</code>
    </div>
  );
}

export function TokenKitchenSink() {
  const { tenant } = useAdminTenant();
  const [theme, setTheme] = useState<ThemeChoice>('light');

  // The page owns the theme while it's mounted; restore the prior state on leave.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', theme);
    return () => {
      if (prev === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', prev);
    };
  }, [theme]);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--av2-space-6)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--av2-space-4)',
          marginBottom: 'var(--av2-space-8)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--av2-text-2xl)', margin: '0 0 var(--av2-space-1)' }}>
            Design tokens — /__dev/tokens
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            Dev-only. Sub-slice 0.1. Accent ramp is derived from{' '}
            <code>{tenant?.themeColor ?? 'no themeColor'}</code>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--av2-space-2)' }}>
          <Button variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>
            Light
          </Button>
          <Button variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>
            Dark
          </Button>
        </div>
      </header>

      <Section title="Tenant branding">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-4)' }}>
          {tenant?.logo ? (
            <img
              src={tenant.logo}
              alt=""
              style={{ height: 40, width: 'auto', borderRadius: 'var(--av2-radius-sm)' }}
            />
          ) : (
            <span style={{ fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>no logo</span>
          )}
          <div style={{ fontSize: 'var(--av2-text-sm)' }}>
            <div style={{ fontWeight: 600 }}>{tenant?.name ?? '—'}</div>
            <div style={{ color: 'var(--av2-muted)' }}>{tenant?.appName ?? '—'}</div>
          </div>
        </div>
      </Section>

      <Section title="Semantic colours">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 'var(--av2-space-3)',
          }}
        >
          {SEMANTIC_COLORS.map((c) => (
            <Swatch key={c} name={c} />
          ))}
        </div>
      </Section>

      <Section title="Accent ramp (Layer 1 — tenant-derived)">
        <div style={{ display: 'flex', borderRadius: 'var(--av2-radius-sm)', overflow: 'hidden' }}>
          {RAMP_STEPS.map((s) => (
            <div
              key={s}
              title={`--av2-accent-${s}`}
              style={{
                flex: 1,
                height: 56,
                background: `var(--av2-accent-${s}, var(--av2-surface-alt))`,
              }}
            />
          ))}
        </div>
        <p style={{ margin: 'var(--av2-space-2) 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
          Falls back to <code>--av2-surface-alt</code> per step when the ramp is unset (neutral / missing
          <code> themeColor</code>).
        </p>
      </Section>

      <Section title="Typography scale">
        {TEXT_STEPS.map((t) => (
          <div
            key={t}
            style={{
              fontSize: `var(--av2-text-${t})`,
              lineHeight: 'var(--av2-leading-normal)',
              marginBottom: 'var(--av2-space-2)',
            }}
          >
            <code style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', marginRight: 'var(--av2-space-3)' }}>
              --av2-text-{t}
            </code>
            The quick brown fox jumps over the lazy dog
          </div>
        ))}
      </Section>

      <Section title="Spacing scale">
        {SPACE_STEPS.map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-3)', marginBottom: 'var(--av2-space-2)' }}>
            <span style={{ height: 16, width: `var(--av2-space-${s})`, background: 'var(--av2-accent)', flex: 'none' }} />
            <code style={{ fontSize: 'var(--av2-text-xs)' }}>--av2-space-{s}</code>
          </div>
        ))}
      </Section>

      <Section title="Radii">
        <div style={{ display: 'flex', gap: 'var(--av2-space-4)' }}>
          {RADII.map((r) => (
            <div key={r} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  background: 'var(--av2-accent-soft)',
                  border: '1px solid var(--av2-accent)',
                  borderRadius: `var(${r})`,
                }}
              />
              <code style={{ fontSize: 'var(--av2-text-xs)' }}>{r}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Shadows">
        <div style={{ display: 'flex', gap: 'var(--av2-space-8)', padding: 'var(--av2-space-4) 0' }}>
          {SHADOWS.map((s) => (
            <div key={s} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 96,
                  height: 72,
                  background: 'var(--av2-surface)',
                  borderRadius: 'var(--av2-radius)',
                  boxShadow: `var(${s})`,
                }}
              />
              <code style={{ fontSize: 'var(--av2-text-xs)' }}>{s}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Motion">
        {DURATIONS.map((d) => (
          <label
            key={d}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-3)', marginBottom: 'var(--av2-space-2)', cursor: 'pointer' }}
          >
            <span className="av2-motion-dot" style={{ '--dur': `var(${d})` } as React.CSSProperties} />
            <code style={{ fontSize: 'var(--av2-text-xs)' }}>{d}</code>
            <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>(hover the row)</span>
          </label>
        ))}
        <style>{`
          .av2-motion-dot {
            width: 16px; height: 16px; flex: none;
            border-radius: 999px;
            background: var(--av2-accent);
            transition: transform var(--dur) var(--av2-ease-standard);
          }
          label:hover .av2-motion-dot { transform: translateX(160px); }
        `}</style>
      </Section>

      <Section title="Components on the new tokens">
        <Card style={{ display: 'flex', gap: 'var(--av2-space-3)', flexWrap: 'wrap' }}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </Card>
      </Section>
    </div>
  );
}
