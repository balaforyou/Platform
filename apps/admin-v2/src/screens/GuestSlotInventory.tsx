import { useEffect, useMemo, useState } from 'react';
import { Circle, Lock, Minus, Plus, type LucideIcon } from 'lucide-react';
import { Banner, Card, LoadingState, Modal, Select, useToast } from '../components';
import { useBranches, useGuestInventoryGrid, usePools } from './guestManagement/queries';
import { WalkInBookingFlow, segBtn, segStrip, type WalkInInitialSelection } from './guestManagement/sections/WalkInBookingFlow';
import { BookingDetailModal } from './guestManagement/sections/BookingDetailModal';
import { BANDS, bandOf, branchHour, formatHourLabel, stripCourtPrefix, todayIsoDate, type Band } from './guestManagement/reservationHelpers';
import type { GuestInventoryCell } from './guestManagement/types';

// The real tap target — kept at the existing 44px minimum (touch-accessibility, F-256's own
// mobile history on this screen) even though the badge rendered inside it is smaller than that,
// deliberately not shrinking the interactive element to the mockup's literal 28px badge size.
const cellBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  borderRadius: 'var(--av2-radius-sm)',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
};

const badgeBase: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
};

// F-252: 5 real states, replacing the old binary bookable/not — a cell face is a status word
// only, never a name/phone (Q1).
//
// Cell-state visual grouping (Chief-approved, post-F-264, icon-badge follow-up): the 7 real,
// distinct `type`s are unchanged in data and in handleCellClick's branching below — only their
// look groups into 4 families for a simpler at-a-glance read. `empty` sits in the `open` family
// (both tappable-to-book, F-272) rendered as the OUTLINE variant of the same accent hue —
// carrying forward the exact dashed-vs-solid distinction the pre-badge design already used to
// mean "not yet published" vs "already open" — rather than being lumped with `elapsed` (truly
// inert) just because they once shared a muted color. Checked live in both light and dark theme
// before landing (F-265 precedent).
type Family = 'inert' | 'blocked' | 'booked' | 'open';

const TYPE_FAMILY: Record<GuestInventoryCell['type'], Family> = {
  empty: 'open',
  elapsed: 'inert',
  'member-blocked': 'blocked',
  completed: 'booked',
  cancelled: 'booked',
  'guest-booked': 'booked',
  'guest-vacant': 'open',
};

const FAMILY_ICON: Record<Family, LucideIcon> = {
  inert: Minus,
  blocked: Lock,
  booked: Circle,
  open: Plus,
};

// `empty` (outline) vs `guest-vacant` (filled) both read as `open` — the only family with two
// real fill treatments, keyed by cell type rather than family for that one case.
const CELL_BADGE_STYLE: Record<GuestInventoryCell['type'], React.CSSProperties> = {
  empty: {
    background: 'transparent',
    border: '1.5px dashed var(--av2-accent)',
    color: 'var(--av2-accent)',
  },
  elapsed: {
    background: 'var(--av2-surface-alt)',
    border: '1px solid var(--av2-border)',
    color: 'var(--av2-muted)',
  },
  'member-blocked': {
    background: 'var(--av2-info-soft)',
    border: '1px solid var(--av2-info-border)',
    color: 'var(--av2-info-text)',
  },
  completed: {
    background: 'var(--av2-accent)',
    border: '1px solid var(--av2-accent)',
    color: 'var(--av2-accent-fg, #fff)',
  },
  cancelled: {
    background: 'var(--av2-accent)',
    border: '1px solid var(--av2-accent)',
    color: 'var(--av2-accent-fg, #fff)',
  },
  'guest-booked': {
    background: 'var(--av2-accent)',
    border: '1px solid var(--av2-accent)',
    color: 'var(--av2-accent-fg, #fff)',
  },
  'guest-vacant': {
    background: 'var(--av2-accent-soft)',
    border: '1px solid var(--av2-accent)',
    color: 'var(--av2-accent-hover)',
  },
};

// Kept for accessibility only (rule: icon-only cells still need a real accessible name) — never
// rendered as visible text any more.
const CELL_LABEL: Record<GuestInventoryCell['type'], string> = {
  empty: 'Empty — tap to book',
  elapsed: 'Elapsed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  'member-blocked': 'Member',
  'guest-vacant': 'Open',
  'guest-booked': 'Booked',
};

// Legend strip — the `open` family's FILLED (`guest-vacant`) treatment only. `empty`'s outline
// variant deliberately gets no separate row: the filled/outline split is about *when* a slot was
// published, not a distinct actionable state worth teaching up front — the screen's own subtitle
// ("Tap any open cell to book it") already covers the actionable framing for both.
const LEGEND: { family: Family; label: string; style: React.CSSProperties }[] = [
  { family: 'open', label: 'Open', style: CELL_BADGE_STYLE['guest-vacant'] },
  { family: 'blocked', label: 'Member', style: CELL_BADGE_STYLE['member-blocked'] },
  { family: 'booked', label: 'Booked', style: CELL_BADGE_STYLE['guest-booked'] },
  { family: 'inert', label: 'Elapsed', style: CELL_BADGE_STYLE.elapsed },
];

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

  const [bookingFlowSelection, setBookingFlowSelection] = useState<WalkInInitialSelection | null>(null);
  const [detail, setDetail] = useState<{ bookingId: string; cellType: 'guest-booked' | 'completed' | 'cancelled' } | null>(null);
  // F-264/segments: replaces the old vertical-scroll-with-sticky-header time axis — approved
  // direction, no finding ID (new UI). Defaults to the mockup's own default (Morning, BANDS[0]).
  const [band, setBand] = useState<Band>(BANDS[0].key);

  const cellByKey = useMemo(() => {
    const map = new Map<string, GuestInventoryCell>();
    for (const cell of grid.data?.cells ?? []) {
      map.set(`${cell.resourceId}|${cell.startTime}`, cell);
    }
    return map;
  }, [grid.data]);

  const allRows = grid.data?.rows ?? [];
  const rows = useMemo(
    () => allRows.filter((r) => bandOf(branchHour(r, branch?.timezone)) === band),
    [allRows, branch?.timezone, band],
  );
  const resources = grid.data?.resources ?? [];

  const handleCellClick = (cell: GuestInventoryCell) => {
    // F-273: a member-blocked tap gives real feedback instead of a silent no-op — not tied to
    // the (not-yet-built) Member module, just surfacing the reason this already-computed state
    // gives no explanation today.
    if (cell.type === 'member-blocked') {
      toast.push('This slot is reserved for club members.', 'info');
      return;
    }
    if (cell.type === 'elapsed') return;
    if (cell.type === 'guest-booked' || cell.type === 'completed' || cell.type === 'cancelled') {
      setDetail({ bookingId: cell.bookingId, cellType: cell.type });
      return;
    }
    if (cell.type === 'guest-vacant') {
      setBookingFlowSelection({ poolId, date, resourceId: cell.resourceId, windowId: cell.windowId });
      return;
    }
    // F-272: 'empty' — no window is created here any more. Nothing touches the database until
    // the admin actually confirms a booking; WalkInBookingFlow's submit() creates the one-off
    // window itself, atomically with the booking, from this pending selection.
    if (!pool) return;
    const duration = pool.minBookingDurationMinutes || 60;
    const endTime = new Date(new Date(cell.startTime).getTime() + duration * 60 * 1000).toISOString();
    setBookingFlowSelection({
      poolId,
      date,
      resourceId: cell.resourceId,
      pendingWindow: { resourceId: cell.resourceId, startTime: cell.startTime, endTime },
    });
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

      {/* Segmented Morning/Afternoon/Evening time-of-day picker — reuses WalkInBookingFlow's own
          BANDS/segStrip/segBtn pattern rather than a second segmented-tab visual style. */}
      <div role="tablist" style={segStrip}>
        {BANDS.map((b) => (
          <button key={b.key} type="button" onClick={() => setBand(b.key)} style={segBtn(b.key === band)}>
            {b.label}
          </button>
        ))}
      </div>

      {/* Icon-badge legend — the `open` family's filled treatment only; `empty`'s outline variant
          deliberately has no row of its own (see CELL_BADGE_STYLE's comment above). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--av2-space-4)', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
        {LEGEND.map(({ family, label, style }) => {
          const Icon = FAMILY_ICON[family];
          return (
            <span key={family} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--av2-space-2)' }}>
              <span style={{ ...badgeBase, width: 20, height: 20, ...style }}>
                <Icon size={12} {...(family === 'booked' ? { fill: 'currentColor' } : {})} />
              </span>
              {label}
            </span>
          );
        })}
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
              {/* Diagonal-split "Time / Court" corner label — visual idea reused from the mockup,
                  not its table markup, using this screen's own sticky-corner cell. */}
              <div
                className="inventory-grid-sticky-col inventory-grid-sticky-header"
                style={{ zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', gap: 4 }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--av2-muted)' }}>Time</span>
                <span style={{ fontSize: 11, fontWeight: 300, color: 'var(--av2-border)' }}>/</span>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--av2-text)' }}>Court</span>
              </div>
              {resources.map((resource) => (
                <div
                  key={resource.id}
                  className="inventory-grid-sticky-header"
                  style={{ fontSize: 'var(--av2-text-xs)', fontWeight: 700, textAlign: 'center', padding: '4px 0' }}
                >
                  {stripCourtPrefix(resource.name)}
                </div>
              ))}

              {rows.map((rowStart) => (
                <FragmentRow
                  key={rowStart}
                  rowStart={rowStart}
                  resources={resources}
                  cellByKey={cellByKey}
                  timezone={branch?.timezone}
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
  onCellClick,
}: {
  rowStart: string;
  resources: { id: string; name: string }[];
  cellByKey: Map<string, GuestInventoryCell>;
  timezone: string | undefined;
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
        // F-272: 'empty'/'guest-vacant' taps are now synchronous (no DB write on tap) — no
        // per-cell busy state needed any more. F-273: member-blocked is clickable again (shows a
        // toast), so only 'elapsed' stays disabled.
        const family = TYPE_FAMILY[cell.type];
        const Icon = FAMILY_ICON[family];
        return (
          <button
            key={resource.id}
            type="button"
            disabled={cell.type === 'elapsed'}
            onClick={() => onCellClick(cell)}
            aria-label={CELL_LABEL[cell.type]}
            title={CELL_LABEL[cell.type]}
            style={{ ...cellBase, cursor: cell.type === 'elapsed' ? 'default' : 'pointer' }}
          >
            <span style={{ ...badgeBase, ...CELL_BADGE_STYLE[cell.type] }}>
              <Icon size={16} {...(family === 'booked' ? { fill: 'currentColor' } : {})} />
            </span>
          </button>
        );
      })}
    </>
  );
}
