import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Badge, Banner, LoadingState, Select, Table, Tabs, type BadgeTone, type Column } from '../components';
import { friendlyError } from '../lib/errorMessage';
import { useBranches, useGuestLedger, usePools } from './guestManagement/queries';
import { safeTimeZone } from './guestManagement/reservationHelpers';
import type { GuestLedgerRow, LedgerMethod } from './guestManagement/types';

const TABS = [
  { key: 'guest', label: 'Guest' },
  { key: 'members', label: 'Members' },
  { key: 'students', label: 'Students' },
];

const TEASERS: Record<string, { title: string; description: string }> = {
  members: {
    title: 'Member Ledger — launching with the Membership module',
    description: 'Dues by member and period, once term-based membership billing ships.',
  },
  students: {
    title: 'Student Ledger — coming with the Students module',
    description: 'Course fees and attendance-linked billing, once that module is scoped.',
  },
};

const METHOD_LABEL: Record<LedgerMethod, string> = { cash: 'Cash', upi: 'UPI', link: 'Link', other: 'Other' };
// Cash green / Link blue matches the mockup; UPI gets the third, distinct-but-neutral slot
// (Bala's call, 10 Sep 2026 — "a reasonable third style is your call").
const METHOD_TONE: Record<LedgerMethod, BadgeTone> = { cash: 'success', upi: 'neutral', link: 'info', other: 'neutral' };

function statusBadge(status: string): { tone: BadgeTone; label: string } {
  switch (status) {
    case 'CONFIRMED':
      return { tone: 'success', label: 'Confirmed' };
    case 'CHECKED_IN':
      return { tone: 'success', label: 'Checked in' };
    case 'HELD':
      return { tone: 'warning', label: 'Pending' };
    case 'CANCELLED':
      return { tone: 'danger', label: 'Cancelled' };
    case 'RELEASED_NO_SHOW':
      return { tone: 'neutral', label: 'Released' };
    default:
      return { tone: 'neutral', label: status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ') };
  }
}

function formatDateTime(iso: string, timezone: string | undefined): string {
  // "27 Sep, 6:00 PM" — day-first, matching the approved mockup's own copy.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTimeZone(timezone),
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const month = get('month').replace(/\.$/, '').slice(0, 3);
  return `${get('day')} ${month}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

/**
 * F-229 Step 6 — `/ledger`, rebuilt from the "Subscription Ledger" stub to the approved
 * `Ledger_v2.dc.html`: a `Tabs` screen whose **Guest** tab is real (backed by
 * `GET /resource-pools/:id/guest-ledger`, Step 4) and whose **Members** / **Students** tabs are
 * honest greyed placeholders — never fake data (Bala's demo-value call, 10 Sep 2026).
 */
export function LedgerScreen() {
  const navigate = useNavigate();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [tab, setTab] = useState('guest');

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const branch = useMemo(() => (branches.data ?? []).find((b) => b.id === branchId), [branches.data, branchId]);
  const tz = branch?.timezone;

  const pools = usePools(branchId);
  const branchPools = pools.data ?? [];
  const [poolId, setPoolId] = useState('');
  useEffect(() => {
    if (branchPools.length && !branchPools.some((p) => p.id === poolId)) setPoolId(branchPools[0].id);
  }, [branchPools, poolId]);

  const ledger = useGuestLedger(tab === 'guest' ? poolId : undefined);

  const columns: Column<GuestLedgerRow>[] = [
    { key: 'date', header: 'Date', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.date, tz)}</span> },
    { key: 'guest', header: 'Guest', render: (r) => r.guest?.name || r.guest?.phone || '—' },
    { key: 'court', header: 'Court', render: (r) => r.court || '—' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => {
        const rupees = r.payment ? r.payment.amountPaise / 100 : r.price != null ? Number(r.price) : null;
        return rupees != null ? `₹${rupees.toLocaleString('en-IN')}` : '—';
      },
    },
    {
      key: 'method',
      header: 'Method',
      render: (r) => {
        const m = r.payment?.method;
        if (!m) return <Badge tone="neutral">Unpaid</Badge>;
        return <Badge tone={METHOD_TONE[m] ?? 'neutral'}>{METHOD_LABEL[m] ?? String(m)}</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const s = statusBadge(r.status);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)', maxWidth: 720, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <button
          type="button"
          aria-label="Back to Apps"
          onClick={() => navigate('/apps')}
          style={{ flex: 'none', marginTop: 2, display: 'inline-flex', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--av2-muted)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Ledger</h2>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            Payments collected, by who they’re for.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-3)', maxWidth: 320, minWidth: 0 }}>
        <Select
          label="Branch"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={branches.isLoading || (branches.data || []).length === 0}
        >
          <option value="">{branches.isLoading ? 'Loading branches…' : 'Select branch'}</option>
          {(branches.data || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        {branchPools.length > 1 && (
          <Select label="Court pool" value={poolId} onChange={(e) => setPoolId(e.target.value)}>
            {branchPools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        {branches.error && <Banner tone="error">{friendlyError(branches.error, "Couldn’t load branches.")}</Banner>}
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-4)', minWidth: 0 }}>
        <Tabs items={TABS} activeKey={tab} onChange={setTab} />

        {tab === 'guest' ? (
          branchId && !pools.isLoading && branchPools.length === 0 ? (
            <Banner tone="info">This branch has no court pool configured yet.</Banner>
          ) : !poolId || pools.isLoading || ledger.isLoading || ledger.isPending ? (
            <LoadingState label="Loading ledger…" />
          ) : ledger.error ? (
            <Banner tone="error">{friendlyError(ledger.error, "Couldn’t load the ledger.")}</Banner>
          ) : (
            <div
              style={{
                background: 'var(--av2-surface)',
                border: '1px solid var(--av2-border)',
                borderRadius: 'var(--av2-radius)',
                boxShadow: 'var(--av2-shadow)',
                overflow: 'hidden',
              }}
            >
              <Table
                columns={columns}
                rows={ledger.data ?? []}
                rowKey={(r) => r.bookingId}
                emptyState={
                  <div style={{ padding: 'var(--av2-space-8)', textAlign: 'center', color: 'var(--av2-muted)', fontSize: 'var(--av2-text-sm)' }}>
                    No guest payments recorded for this pool yet.
                  </div>
                }
              />
            </div>
          )
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 'var(--av2-space-2)',
              padding: 'var(--av2-space-10) var(--av2-space-6)',
              border: '1px dashed var(--av2-border)',
              borderRadius: 'var(--av2-radius)',
              background: 'var(--av2-surface-alt)',
              color: 'var(--av2-muted)',
            }}
          >
            <Lock size={20} />
            <span style={{ fontSize: 'var(--av2-text-base)', fontWeight: 600, color: 'var(--av2-text)' }}>
              {TEASERS[tab]?.title}
            </span>
            <span style={{ fontSize: 'var(--av2-text-sm)', maxWidth: 320, lineHeight: 'var(--av2-leading-normal)' }}>
              {TEASERS[tab]?.description}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
