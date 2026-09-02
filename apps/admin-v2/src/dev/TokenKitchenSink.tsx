import { useEffect, useState } from 'react';
import { Bell, Home, Pencil, Plus, Search, Settings, Trash2, Users } from 'lucide-react';
import { useAdminTenant } from '../auth/AdminTenantContext';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Modal,
  Select,
  SidebarNavItem,
  BottomNavItem,
  Table,
  Tabs,
  useToast,
  type Column,
} from '../components';

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

      <Section title="0.1 primitives — Button">
        <Card style={{ display: 'flex', gap: 'var(--av2-space-3)', flexWrap: 'wrap' }}>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </Card>
      </Section>

      <Kitchen02 />
    </div>
  );
}

/** Sub-slice 0.2 — generic reusable components, each with its variants + states. */
function Kitchen02() {
  const { push } = useToast();
  const [tab, setTab] = useState('all');
  const [sel, setSel] = useState('confirmed');
  const [modal, setModal] = useState(false);
  const [nav, setNav] = useState('dashboard');

  type Member = { id: string; name: string; plan: string; status: string };
  const members: Member[] = [
    { id: '1', name: 'Aiko Tanaka', plan: 'Monthly', status: 'active' },
    { id: '2', name: 'Ravi Kumar', plan: 'Day pass', status: 'expired' },
    { id: '3', name: 'Mei Lin', plan: 'Quarterly', status: 'pending' },
  ];
  const memberCols: Column<Member>[] = [
    { key: 'name', header: 'Member', render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--av2-space-2)' }}>
        <Avatar name={r.name} size="sm" /> {r.name}
      </span>
    ) },
    { key: 'plan', header: 'Plan' },
    { key: 'status', header: 'Status', render: (r) => (
      <Badge tone={r.status === 'active' ? 'success' : r.status === 'expired' ? 'danger' : 'warning'}>
        {r.status}
      </Badge>
    ) },
    { key: 'actions', header: '', align: 'right', render: () => (
      <span style={{ display: 'inline-flex', gap: 'var(--av2-space-1)' }}>
        <IconButton aria-label="Edit" icon={<Pencil size={14} />} />
        <IconButton aria-label="Delete" icon={<Trash2 size={14} />} />
      </span>
    ) },
  ];

  return (
    <>
      <Section title="0.2 — Badge (5 tones)">
        <Card style={{ display: 'flex', gap: 'var(--av2-space-2)', flexWrap: 'wrap' }}>
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Pending</Badge>
          <Badge tone="danger">Cancelled</Badge>
          <Badge tone="info">Draft</Badge>
        </Card>
      </Section>

      <Section title="0.2 — IconButton">
        <Card style={{ display: 'flex', gap: 'var(--av2-space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <IconButton aria-label="Search" icon={<Search size={16} />} />
          <IconButton aria-label="Add" variant="primary" icon={<Plus size={16} />} />
          <IconButton aria-label="Settings" variant="secondary" icon={<Settings size={16} />} />
          <IconButton aria-label="Loading" loading icon={<Settings size={16} />} />
          <IconButton aria-label="Disabled" disabled icon={<Settings size={16} />} />
        </Card>
      </Section>

      <Section title="0.2 — Avatar (image, initials fallback, broken-src fallback)">
        <Card style={{ display: 'flex', gap: 'var(--av2-space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Avatar name="Bala Murali" src="/logo-jbc.png" size="lg" />
          <Avatar name="Aiko Tanaka" size="lg" />
          <Avatar name="Mei Lin" size="md" />
          <Avatar name="Ravi Kumar" size="sm" />
          <Avatar name="Broken Image" src="/does-not-exist.png" size="md" />
        </Card>
      </Section>

      <Section title="0.2 — Select">
        <Card style={{ maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-4)' }}>
          <Select label="Status" value={sel} onChange={(e) => setSel(e.target.value)} hint="Native select, styled wrapper">
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No show</option>
          </Select>
          <Select label="With error" error="Pick a value" defaultValue="">
            <option value="" disabled>Choose…</option>
            <option value="a">A</option>
          </Select>
        </Card>
      </Section>

      <Section title="0.2 — Tabs (pill strip)">
        <Card>
          <Tabs
            items={[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Active' },
              { key: 'expired', label: 'Expired' },
            ]}
            activeKey={tab}
            onChange={setTab}
          />
          <p style={{ marginTop: 'var(--av2-space-3)', fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            active: {tab}
          </p>
        </Card>
      </Section>

      <Section title="0.2 — Table (with Badge / Avatar / IconButton in cells)">
        <Card>
          <Table columns={memberCols} rows={members} rowKey={(r) => r.id} onRowClick={(r) => push(`Clicked ${r.name}`)} />
        </Card>
      </Section>

      <Section title="0.2 — Table (empty → EmptyState fallback)">
        <Card>
          <Table<Member> columns={memberCols} rows={[]} rowKey={(r) => r.id} />
        </Card>
      </Section>

      <Section title="0.2 — EmptyState">
        <Card>
          <EmptyState
            icon={<Users size={24} />}
            title="No members yet"
            description="Members you add will show up here."
            action={<Button leadingIcon={<Plus size={14} />}>Add your first member</Button>}
          />
        </Card>
      </Section>

      <Section title="0.2 — Toast (transient, auto-dismiss, max 3)">
        <Card style={{ display: 'flex', gap: 'var(--av2-space-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => push('Saved successfully.', 'success')}>Success</Button>
          <Button variant="secondary" onClick={() => push('Heads up — unsaved changes.', 'info')}>Info</Button>
          <Button variant="secondary" onClick={() => push('Something went wrong.', 'error')}>Error</Button>
          <Button variant="ghost" onClick={() => push('Gone in 1.5s', 'info', 1500)}>Short (1.5s)</Button>
        </Card>
      </Section>

      <Section title="0.2 — SidebarNavItem">
        <Card style={{ maxWidth: 240, display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-1)' }}>
          {[
            { key: 'dashboard', label: 'Dashboard', icon: <Home size={16} /> },
            { key: 'members', label: 'Members', icon: <Users size={16} />, badge: 3 },
            { key: 'comms', label: 'Communications', icon: <Bell size={16} />, badge: 128 },
            { key: 'settings', label: 'Settings', icon: <Settings size={16} /> },
          ].map((i) => (
            <SidebarNavItem
              key={i.key}
              icon={i.icon}
              label={i.label}
              badge={i.badge}
              active={nav === i.key}
              onClick={() => setNav(i.key)}
            />
          ))}
        </Card>
      </Section>

      <Section title="0.2 — BottomNavItem">
        <Card
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            maxWidth: 360,
            borderRadius: 'var(--av2-radius)',
          }}
        >
          {[
            { key: 'dashboard', label: 'Home', icon: <Home size={20} /> },
            { key: 'members', label: 'Members', icon: <Users size={20} />, badge: 3 },
            { key: 'comms', label: 'Inbox', icon: <Bell size={20} />, badge: 12 },
            { key: 'settings', label: 'Settings', icon: <Settings size={20} /> },
          ].map((i) => (
            <BottomNavItem
              key={i.key}
              icon={i.icon}
              label={i.label}
              badge={i.badge}
              active={nav === i.key}
              onClick={() => setNav(i.key)}
            />
          ))}
        </Card>
      </Section>

      <Section title="0.2 — Modal (Radix: focus trap, Escape, focus return, ARIA)">
        <Card>
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Modal
            open={modal}
            onOpenChange={setModal}
            title="Cancel this booking?"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModal(false)}>Keep it</Button>
                <Button onClick={() => { setModal(false); push('Booking cancelled.', 'success'); }}>
                  Cancel booking
                </Button>
              </>
            }
          >
            <p style={{ margin: 0 }}>
              This frees the slot immediately. The member is notified. This can't be undone.
            </p>
          </Modal>
        </Card>
      </Section>
    </>
  );
}
