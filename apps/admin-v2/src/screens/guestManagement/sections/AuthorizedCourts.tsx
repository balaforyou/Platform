import { Fragment, useEffect, useMemo, useState } from 'react';
import { Check, LayoutGrid, Minus } from 'lucide-react';
import { Badge, Banner, Button, Card, EmptyState, Spinner } from '../../../components';
import { useAdminAuth } from '../../../auth/AdminAuthContext';
import { errorMessage } from '../../../lib/errorMessage';
import { usePools, useSaveGuestCourts } from '../queries';

/**
 * F-220 §3.1 / F-225 — a per-court switch for whether walk-in guests may be assigned that court.
 *
 * Real and persisted (F-225): `Resource.guestBookable`, saved via
 * `PATCH /slot-engine/resource-pools/:id/guest-court-eligibility` (owner-only, GUEST_BOOKING-
 * gated). Existing courts are backfilled to authorised; a court added after the F-225 migration
 * defaults off. A single batched Save per section (no per-toggle auto-save). The court list comes
 * from `usePools(branchId)` — `GET /branches/:id/resource-pools` includes `resources`.
 *
 * Tile grid, tri-state master select-all, bounded scroll box — the Bala-approved design,
 * `.agc-*` styling in `styles.css`.
 */
export function AuthorizedCourts({ branchId }: { branchId: string }) {
  const pools = usePools(branchId);
  const save = useSaveGuestCourts(branchId);
  const { user } = useAdminAuth();
  const isOwner = !!user?.roles?.includes('owner');

  const poolsWithCourts = useMemo(
    () => (pools.data ?? []).filter((p) => (p.resources ?? []).length > 0),
    [pools.data],
  );
  const courtIds = useMemo(
    () => poolsWithCourts.flatMap((p) => (p.resources ?? []).map((r) => r.id)),
    [poolsWithCourts],
  );

  /** The authorised-court state as it currently stands on the server. */
  const serverSelected = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const p of poolsWithCourts) for (const r of p.resources ?? []) m[r.id] = r.guestBookable === true;
    return m;
  }, [poolsWithCourts]);

  const [selected, setSelected] = useState<Record<string, boolean>>(serverSelected);

  // Re-seed from the server whenever the pools query lands / relands (including after our own save).
  useEffect(() => {
    setSelected(serverSelected);
  }, [serverSelected]);

  const total = courtIds.length;
  const activeCount = courtIds.filter((id) => selected[id]).length;
  const allSelected = total > 0 && activeCount === total;
  const anySelected = activeCount > 0;
  const multiPool = poolsWithCourts.length > 1;
  const dirty = courtIds.some((id) => !!selected[id] !== !!serverSelected[id]);

  const toggleCourt = (id: string) => {
    if (!isOwner) return;
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };
  const toggleAll = () => {
    if (!isOwner) return;
    const next = !allSelected;
    setSelected(Object.fromEntries(courtIds.map((id) => [id, next])));
  };
  const onSave = () => {
    const byPool: Record<string, string[]> = {};
    for (const p of poolsWithCourts) {
      byPool[p.id] = (p.resources ?? []).filter((r) => selected[r.id]).map((r) => r.id);
    }
    save.mutate(byPool);
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
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </div>
        </div>
        {isOwner && (
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
        )}
      </div>

      {!isOwner && (
        <Banner tone="info">Only an owner can change guest court access. You can review it here.</Banner>
      )}

      {pools.isLoading && <Spinner size={24} label="Loading courts…" />}
      {pools.error && <Banner tone="error">{errorMessage(pools.error)}</Banner>}

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
                        disabled={!isOwner}
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
            Guests are only offered the courts you check here — the rest stay members-only. An
            admin booking on someone&apos;s behalf can still use any court.
          </p>

          {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}
          {save.isSuccess && !dirty && <Banner tone="success">Guest court access saved.</Banner>}

          {isOwner && (
            <div className="agc-savebar">
              <b>{activeCount} of {total} authorized</b>
              <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending} loading={save.isPending}>
                Save
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
