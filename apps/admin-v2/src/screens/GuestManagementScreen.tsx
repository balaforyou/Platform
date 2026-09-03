import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, FileSpreadsheet, SlidersHorizontal } from 'lucide-react';
import { moduleVisible, useAdminTenant } from '../auth/AdminTenantContext';
import { Banner, EmptyState, LoadingState, Select, Tabs } from '../components';
import { useBranches } from './guestManagement/queries';

const TABS = [
  { key: 'reservations', label: 'Reservations' },
  { key: 'setup-rules', label: 'Setup Rules' },
];

/**
 * F-220 §2 — `/guests`: the Guest Management shell. A branch selector over two tabs —
 * "Reservations" (walk-in bookings + manual payment, tracked as F-204) and "Setup Rules"
 * (guest court eligibility / pricing / cancellation / scheduling). Both tabs are honest
 * `EmptyState`s in this hand-off; the four real Setup Rules sections land one at a time in §3.
 *
 * Same F-206 posture as `CourtGroupsScreen`: the `guests` nav entry carries
 * `module: 'GUEST_BOOKING'`, and this screen also refuses to render if reached directly on an
 * unentitled tenant (the API would 403 anyway — "never UI-only").
 */
export function GuestManagementScreen() {
  const navigate = useNavigate();
  const { entitlements } = useAdminTenant();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [tab, setTab] = useState('reservations');

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  // `null` = entitlements fetch still in flight; don't flash the denied state.
  if (entitlements === null) return <LoadingState label="Loading…" />;
  if (!moduleVisible(entitlements.GUEST_BOOKING)) {
    return (
      <EmptyState
        icon={<FileSpreadsheet size={20} />}
        title="Guest Booking isn’t active for this account"
        description="Guest Management is part of the Guest Booking module. Contact the platform team to enable it."
      />
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-6)', maxWidth: 640, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-2)' }}>
        <button
          type="button"
          aria-label="Back to Apps"
          onClick={() => navigate('/apps')}
          style={{
            flex: 'none',
            marginTop: 2,
            display: 'inline-flex',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: 'var(--av2-muted)',
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Guest Management</h2>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            Walk-in reservations and guest booking setup rules for this branch.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-4)', maxWidth: 320, minWidth: 0 }}>
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
        {branches.error && <Banner tone="error">{(branches.error as Error)?.message}</Banner>}
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-4)', minWidth: 0 }}>
        <Tabs items={TABS} activeKey={tab} onChange={setTab} />

        {tab === 'reservations' ? (
          <EmptyState
            icon={<CalendarClock size={20} />}
            title="Reservations aren’t built yet"
            description="Walk-in bookings and manual payment recording for this branch — tracked as a future slice."
          />
        ) : (
          <EmptyState
            icon={<SlidersHorizontal size={20} />}
            title="Setup Rules"
            description="Guest court eligibility, pricing, cancellation policy and scheduling — sections land one at a time, starting next."
          />
        )}
      </div>
    </div>
  );
}
