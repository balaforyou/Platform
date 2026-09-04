import { Fragment, useMemo, useState } from 'react';
import { Check, LayoutGrid, Minus } from 'lucide-react';
import { Badge, Banner, Card, EmptyState, LoadingState } from '../../../components';
import { usePools } from '../queries';

/**
 * F-220 §3.1 — the first real Setup Rules section. A per-court switch for whether guests can
 * book that court directly.
 *
 * UI-only: `Resource` has no guest-eligibility field yet, so nothing here persists — a
 * "Not yet saved" badge + footnote + an inert save bar say so plainly, and the state resets on
 * a branch switch (the parent remounts this via `key={branchId}`) or a page reload. The court
 * list itself IS real — `usePools(branchId)` already fetches `resources` per pool
 * (`GET /branches/:id/resource-pools` includes them); this is the first screen to render them.
 *
 * Tile grid, tri-state master select-all, and a bounded scroll box (courts past ~2 rows scroll
 * inside the box, not the page) — the Bala-approved design, `.agc-*` styling in `styles.css`.
 */
export function AuthorizedCourts({ branchId }: { branchId: string }) {
  const pools = usePools(branchId);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const poolsWithCourts = useMemo(
    () => (pools.data ?? []).filter((p) => (p.resources ?? []).length > 0),
    [pools.data],
  );
  const courtIds = useMemo(
    () => poolsWithCourts.flatMap((p) => (p.resources ?? []).map((r) => r.id)),
    [poolsWithCourts],
  );

  const total = courtIds.length;
  const activeCount = courtIds.filter((id) => selected[id]).length;
  const allSelected = total > 0 && activeCount === total;
  const anySelected = activeCount > 0;
  const multiPool = poolsWithCourts.length > 1;

  const toggleCourt = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleAll = () => {
    const next = !allSelected;
    setSelected(Object.fromEntries(courtIds.map((id) => [id, next])));
  };

  return (
    <Card as="section">
      <div className="agc-header-row">
        <LayoutGrid size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
        <div className="agc-header-text">
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Authorized Guest Courts</h3>
          <div className="agc-sub-row">
            <p className="agc-summary">
              {total === 0
                ? 'Select which courts accept walk-in guest bookings.'
                : `${activeCount} of ${total} court${total === 1 ? '' : 's'} bookable by walk-in guests.`}
            </p>
            <Badge tone="warning">Not yet saved</Badge>
          </div>
        </div>
        <button
          type="button"
          className={`agc-master ${allSelected ? 'checked' : anySelected ? 'indeterminate' : ''}`}
          aria-label={allSelected ? 'Deselect all courts' : 'Select all courts'}
          aria-checked={allSelected ? 'true' : anySelected ? 'mixed' : 'false'}
          disabled={total === 0}
          onClick={toggleAll}
        >
          <span className="agc-master-box">
            {allSelected ? <Check size={13} strokeWidth={3.5} /> : anySelected ? <Minus size={13} strokeWidth={3.5} /> : null}
          </span>
        </button>
      </div>

      {pools.isLoading && <LoadingState label="Loading courts…" />}
      {pools.error && <Banner tone="error">{(pools.error as Error)?.message ?? 'Could not load courts.'}</Banner>}

      {!pools.isLoading && !pools.error && total === 0 && (
        <EmptyState
          icon={<LayoutGrid size={20} />}
          title="No courts configured for this branch yet"
          description="Add courts from Manage Court Groups first, then come back here to authorize guest access."
        />
      )}

      {!pools.isLoading && !pools.error && total > 0 && (
        <>
          <div className="agc-scroll">
            <div className="agc-grid">
              {poolsWithCourts.map((pool) => (
                <Fragment key={pool.id}>
                  {multiPool && <div className="agc-pool-label">{pool.name}</div>}
                  {(pool.resources ?? []).map((r) => {
                    const on = !!selected[r.id];
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`agc-tile ${on ? 'active' : ''}`}
                        aria-pressed={on}
                        onClick={() => toggleCourt(r.id)}
                      >
                        <span className="agc-tile-top">
                          <span className="agc-tile-name">{r.name}</span>
                          <span className="agc-tile-circle">{on ? <Check size={11} strokeWidth={3.5} /> : null}</span>
                        </span>
                        <span className="agc-tile-status">{on ? 'Guests can book' : 'Not offered to guests'}</span>
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>

          <p className="agc-footnote">
            Courts left unselected stay members-only — guests can’t book them directly. Nothing here is saved
            yet; it resets if you switch branches or leave this page.
          </p>
          <div
            className="agc-savebar"
            title="Not wired to a real save yet — §3.1 is UI-only, no backend field exists for this."
          >
            <b>{activeCount} of {total} active</b> — not saved yet
          </div>
        </>
      )}
    </Card>
  );
}
