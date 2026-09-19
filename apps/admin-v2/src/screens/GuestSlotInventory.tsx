import { useEffect, useMemo, useState } from 'react';
import { Banner, Card, LoadingState, Modal, Select, useToast } from '../components';
import { friendlyError } from '../lib/errorMessage';
import {
  useBranches,
  useCreateAvailabilityWindow,
  useGuestInventoryGrid,
  usePools,
} from './guestManagement/queries';
import { WalkInBookingFlow, type WalkInInitialSelection } from './guestManagement/sections/WalkInBookingFlow';
import { BookingDetailModal } from './guestManagement/sections/BookingDetailModal';
import { formatHourLabel, todayIsoDate } from './guestManagement/reservationHelpers';
import type { GuestInventoryCell } from './guestManagement/types';

const cellBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  borderRadius: 'var(--av2-radius-sm)',
  fontSize: 'var(--av2-text-xs)',
  fontWeight: 600,
  textAlign: 'center',
  padding: '4px 6px',
};

// F-252: 5 real states, replacing the old binary bookable/not — a cell face is a status word
// only, never a name/phone (Q1). Colors match the approved mockup exactly.
const CELL_STYLE: Record<GuestInventoryCell['type'], React.CSSProperties> = {
  empty: {
    background: 'transparent',
    border: '1px dashed var(--av2-border)',
    color: 'var(--av2-muted)',
    cursor: 'pointer',
  },
  elapsed: {
    background: 'var(--av2-surface-alt)',
    border: '1px solid var(--av2-border)',
    color: 'var(--av2-muted)',
    cursor: 'default',
  },
  completed: {
    background: 'var(--av2-info-soft)',
    border: '1px solid var(--av2-info-border)',
    color: 'var(--av2-info-text)',
    cursor: 'pointer',
  },
  cancelled: {
    background: 'var(--av2-warning-soft)',
    border: '1px solid var(--av2-warning-border)',
    color: 'var(--av2-warning)',
    cursor: 'pointer',
  },
  'member-blocked': {
    background: 'var(--av2-info-soft)',
    border: '1px solid var(--av2-info-border)',
    color: 'var(--av2-info-text)',
    cursor: 'default',
  },
  'guest-vacant': {
    background: 'var(--av2-accent-soft)',
    border: '1px solid var(--av2-accent)',
    color: 'var(--av2-accent-hover)',
    cursor: 'pointer',
  },
  'guest-booked': {
    background: 'var(--av2-accent)',
    border: '1px solid var(--av2-accent)',
    color: 'var(--av2-accent-fg, #fff)',
    cursor: 'pointer',
  },
};

const CELL_LABEL: Record<GuestInventoryCell['type'], string> = {
  empty: '+',
  elapsed: 'Elapsed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'member-blocked': 'Member',
  'guest-vacant': 'Open',
  'guest-booked': 'Booked',
};

/**
 * F-250/F-252/F-256 — the `/inventory` route's real content. A Court×Hour grid (visual reference:
 * `AdminInventoryManager.jsx`'s layout/coloring, not its publish/unpublish modal). Tapping a
 * bookable cell (vacant-published or genuinely empty) drops straight into `WalkInBookingFlow`;
 * tapping Booked/Completed/Cancelled opens the real tap-through detail (`BookingDetailModal`).
 * Elapsed and Member-blocked cells are read-only.
 */
export function GuestSlotInventory() {
  const toast = useToast();
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(todayIsoDate());
  const [poolId, setPoolId] = useState('');

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const pools = usePools(branchId);
  const branchPools = pools.data ?? [];
  useEffect(() => {
    if (branchPools.length && !branchPools.some((p) => p.id === poolId)) setPoolId(branchPools[0].id);
  }, [branchPools, poolId]);
  const pool = branchPools.find((p) => p.id === poolId);
  const branch = (branches.data ?? []).find((b) => b.id === branchId);

  const grid = useGuestInventoryGrid(branchId, poolId, date);
  const createWindow = useCreateAvailabilityWindow(poolId);

  const [bookingFlowSelection, setBookingFlowSelection] = useState<WalkInInitialSelection | null>(null);
  const [detail, setDetail] = useState<{ bookingId: string; cellType: 'guest-booked' | 'completed' | 'cancelled' } | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const cellByKey = useMemo(() => {
    const map = new Map<string, GuestInventoryCell>();
    for (const cell of grid.data?.cells ?? []) {
      map.set(`${cell.resourceId}|${cell.startTime}`, cell);
    }
    return map;
  }, [grid.data]);

  const rows = grid.data?.rows ?? [];
  const resources = grid.data?.resources ?? [];

  const handleCellClick = async (cell: GuestInventoryCell) => {
    if (cell.type === 'member-blocked' || cell.type === 'elapsed') return;
    if (cell.type === 'guest-booked' || cell.type === 'completed' || cell.type === 'cancelled') {
      setDetail({ bookingId: cell.bookingId, cellType: cell.type });
      return;
    }
    if (cell.type === 'guest-vacant') {
      setBookingFlowSelection({ poolId, date, resourceId: cell.resourceId, windowId: cell.windowId });
      return;
    }
    // 'empty' — create the one-off window first, then continue straight into the booking flow.
    if (!pool) return;
    const key = `${cell.resourceId}|${cell.startTime}`;
    setCreatingKey(key);
    try {
      const duration = pool.minBookingDurationMinutes || 60;
      const endTime = new Date(new Date(cell.startTime).getTime() + duration * 60 * 1000).toISOString();
      const window = await createWindow.mutateAsync({
        resourceId: cell.resourceId,
        startTime: cell.startTime,
        endTime,
      });
      await grid.refetch();
      setBookingFlowSelection({ poolId, date, resourceId: cell.resourceId, windowId: window.id });
    } catch (err) {
      toast.push(friendlyError(err, 'Couldn’t open that slot. Try again.'), 'error');
    } finally {
      setCreatingKey(null);
    }
  };

  const closeBookingFlow = () => setBookingFlowSelection(null);
  const onBooked = () => {
    closeBookingFlow();
    grid.refetch();
  };

  const closeDetail = () => setDetail(null);
  const onCancelledBooking = () => {
    closeDetail();
    grid.refetch();
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)', maxWidth: 960, minWidth: 0 }}>
      <div>
        <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Guest Slot Inventory</h2>
        <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
          Tap any open cell to book it for a guest on the spot.
        </p>
      </div>

      {/* F-256: stacked (non-overlapping) on mobile via .inventory-filters; side by side on
          desktop — fixes the real overlap ("Coimbatore" colliding with the date field). */}
      <div className="inventory-filters" style={{ gap: 'var(--av2-space-3)', maxWidth: 640 }}>
        <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={branches.isLoading}>
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
          <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>Date</span>
          <input
            type="date"
            value={date}
            min={todayIsoDate()}
            onChange={(e) => setDate(e.target.value)}
            style={{
              padding: 'var(--av2-space-2) var(--av2-space-3)',
              fontSize: 'var(--av2-text-base)',
              borderRadius: 'var(--av2-radius-sm)',
              border: '1px solid var(--av2-border)',
              background: 'var(--av2-surface)',
              color: 'var(--av2-text)',
            }}
          />
        </label>
      </div>

      {!branchId || !poolId ? (
        <Banner tone="info">Select a branch and court pool to see the inventory grid.</Banner>
      ) : grid.isLoading ? (
        <LoadingState label="Loading inventory…" />
      ) : grid.error ? (
        <Banner tone="error">{(grid.error as Error)?.message ?? "Couldn’t load the inventory grid."}</Banner>
      ) : resources.length === 0 ? (
        <Banner tone="info">This pool has no individually-tracked courts.</Banner>
      ) : (
        <Card style={{ minWidth: 0 }}>
          {/* F-256: explicit scroll cue, shown only at mobile widths (CSS-driven, matching this
              codebase's existing shell-breakpoint convention — not a JS viewport check). Real bug
              caught live: without `minWidth: 0` here, this Card is a grid ITEM whose default
              min-width is `auto`, so it took on its content's full intrinsic width regardless of
              the viewport — the grid never actually overflowed *inside* .inventory-grid-scroll,
              the whole Card pushed the page wider instead, silently clipped by .av2-shell's own
              `overflow-x: hidden` safety net rather than producing the intended internal scroll. */}
          <p className="inventory-scroll-cue">Scroll for all {resources.length} courts →</p>
          <div className="inventory-grid-scroll">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `100px repeat(${resources.length}, minmax(90px, 1fr))`,
                gap: 6,
                minWidth: 100 + resources.length * 90,
              }}
            >
              <div className="inventory-grid-sticky-col" />
              {resources.map((resource) => (
                <div key={resource.id} style={{ fontSize: 'var(--av2-text-xs)', fontWeight: 700, textAlign: 'center', padding: '4px 0' }}>
                  {resource.name}
                </div>
              ))}

              {rows.map((rowStart) => (
                <FragmentRow
                  key={rowStart}
                  rowStart={rowStart}
                  resources={resources}
                  cellByKey={cellByKey}
                  timezone={branch?.timezone}
                  creatingKey={creatingKey}
                  onCellClick={handleCellClick}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={!!bookingFlowSelection}
        onOpenChange={(open) => { if (!open) closeBookingFlow(); }}
        title="New walk-in booking"
        size="lg"
      >
        {bookingFlowSelection && branchId && (
          <WalkInBookingFlow branchId={branchId} initialSelection={bookingFlowSelection} onBooked={onBooked} showHeader={false} />
        )}
      </Modal>

      <BookingDetailModal
        bookingId={detail?.bookingId ?? null}
        cellType={detail?.cellType ?? null}
        timezone={branch?.timezone}
        onClose={closeDetail}
        onCancelled={onCancelledBooking}
      />
    </div>
  );
}

function FragmentRow({
  rowStart,
  resources,
  cellByKey,
  timezone,
  creatingKey,
  onCellClick,
}: {
  rowStart: string;
  resources: { id: string; name: string }[];
  cellByKey: Map<string, GuestInventoryCell>;
  timezone: string | undefined;
  creatingKey: string | null;
  onCellClick: (cell: GuestInventoryCell) => void;
}) {
  return (
    <>
      <div className="inventory-grid-sticky-col" style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', display: 'flex', alignItems: 'center' }}>
        {formatHourLabel(rowStart, timezone)}
      </div>
      {resources.map((resource) => {
        const key = `${resource.id}|${rowStart}`;
        const cell = cellByKey.get(key);
        if (!cell) return <div key={resource.id} />;
        const busy = creatingKey === key;
        const disabled = cell.type === 'member-blocked' || cell.type === 'elapsed' || busy;
        return (
          <button
            key={resource.id}
            type="button"
            disabled={disabled}
            onClick={() => onCellClick(cell)}
            style={{ ...cellBase, ...CELL_STYLE[cell.type], opacity: busy ? 0.6 : 1 }}
          >
            {busy ? '…' : CELL_LABEL[cell.type]}
          </button>
        );
      })}
    </>
  );
}
