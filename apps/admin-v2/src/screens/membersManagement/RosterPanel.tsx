import { useEffect, useMemo, useState } from 'react';
import { Banner, Badge, Button, Card, LoadingState, Select, TextField } from '../../components';
import { errorMessage } from '../../lib/errorMessage';
import { useBranches, usePools, useGroups, useAllGroups, useGroupRoster, useAddGroupMember, useGuestLookup, useSuspendAssignment } from '../guestManagement/queries';
import type { GroupRosterRow } from '../guestManagement/queries';
import type { GuestLookupResult } from '../guestManagement/types';

const STATE_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ATTENDED: { label: 'Attended', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'warning' },
  NO_RESPONSE: { label: 'No response', tone: 'danger' },
  NO_DATA: { label: 'No data', tone: 'neutral' },
};

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * F-133 Slice C — batch roster: every ACTIVE member of a batch, each with their real
 * confirmed/declined/no-response/no-data status for a given date (defaults to today). The
 * natural home for surfacing per-member state to the admin -- this overlaps
 * GuestOccupancyDashboard.tsx's territory (F-276's eventual consumer) but does not build F-276
 * here; F-276 is sequenced after this, hard-blocked on the Group entity only.
 *
 * Also hosts the real missing link Slices A/B never built: nothing previously set
 * MemberGroupAssignment.groupId, so no assignment could ever join a batch. The "Add member"
 * mini-form below is the minimal real path to produce that data -- not a full member-management
 * screen, just enough to make the roster real rather than permanently empty.
 */
export function RosterPanel() {
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const pools = usePools(branchId);
  const [poolId, setPoolId] = useState('');
  const groups = useGroups(poolId);
  const allGroups = useAllGroups();
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(todayDateString());

  const roster = useGroupRoster(groupId, date);

  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<GuestLookupResult | null>(null);
  const lookup = useGuestLookup();
  const addMember = useAddGroupMember();

  // F-133 Slice D — Remove (suspend) and Relocate. Both reuse the existing ACTIVE/SUSPENDED
  // toggle + the existing (groupId-aware) create route -- no new endpoint, this component
  // composes them. relocatingId tracks which row's target-batch picker is open; pendingId
  // disables that one row's buttons during a real in-flight request without freezing the rest
  // of the roster.
  const suspend = useSuspendAssignment();
  const relocateCreate = useAddGroupMember();
  const [relocatingId, setRelocatingId] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  useEffect(() => {
    setPoolId('');
    setGroupId('');
  }, [branchId]);

  useEffect(() => {
    setGroupId('');
  }, [poolId]);

  useEffect(() => {
    if (!groupId && groups.data?.[0]) setGroupId(groups.data[0].id);
  }, [groupId, groups.data]);

  const selectedGroup = useMemo(() => (groups.data || []).find((g: any) => g.id === groupId), [groups.data, groupId]);

  const doLookup = () => {
    setFound(null);
    lookup.mutate({ phone }, {
      onSuccess: (res) => {
        if (res.status === 'found') setFound(res.user);
      },
    });
  };

  const doAdd = () => {
    if (!found || !groupId) return;
    addMember.mutate({ groupId, userId: found.id }, {
      onSuccess: () => {
        setFound(null);
        setPhone('');
      },
    });
  };

  // "Remove": suspend only. The server sets endDate = now() -- this is exactly this slice's
  // required fix, not a client-supplied value.
  const doRemove = async (assignmentId: string) => {
    setActionError(null);
    setPendingId(assignmentId);
    try {
      await suspend.mutateAsync({ assignmentId, groupId });
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  // "Relocate": branches on whether the target batch has already started its own cycle.
  // Already live (startDate <= now) -> suspend the old assignment right now (same endDate fix
  // as Remove) + create the new one, both effective immediately. Not yet started -> the old
  // assignment stays ACTIVE untouched, only the new one is created (queued for the target's own
  // startDate, per Slice A's own create logic) -- no gap where the member has no batch at all.
  const doRelocate = async (row: GroupRosterRow, userId: string) => {
    if (!targetGroupId) return;
    const target = (allGroups.data || []).find((g: any) => g.id === targetGroupId);
    if (!target) return;
    setActionError(null);
    setPendingId(row.assignmentId);
    try {
      const targetIsLive = new Date(target.startDate).getTime() <= Date.now();
      if (targetIsLive) {
        await suspend.mutateAsync({ assignmentId: row.assignmentId, groupId });
        await relocateCreate.mutateAsync({ groupId: targetGroupId, userId });
      } else {
        // Not yet live: old assignment stays ACTIVE untouched, new one queued for the target's
        // own real startDate -- the create route defaults startDate to now(), it does not
        // derive it from groupId, so it must be passed explicitly here.
        await relocateCreate.mutateAsync({ groupId: targetGroupId, userId, startDate: target.startDate });
      }
      setRelocatingId(null);
      setTargetGroupId('');
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card as="section">
      <div>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Batch Roster</h3>
        <p style={{ margin: '3px 0 0', fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
          Every member of a batch and their real attendance status for a given date.
        </p>
      </div>

      <div style={{ marginTop: 'var(--av2-space-4)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
        <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={branches.isLoading}>
          <option value="">{branches.isLoading ? 'Loading…' : 'Select branch'}</option>
          {(branches.data || []).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <Select label="Court / Pool" value={poolId} onChange={(e) => setPoolId(e.target.value)} disabled={!branchId || pools.isLoading}>
          <option value="">{pools.isLoading ? 'Loading…' : 'Select court'}</option>
          {(pools.data || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      <div style={{ marginTop: 'var(--av2-space-3)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--av2-space-3)' }}>
        <Select label="Batch" value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!poolId || groups.isLoading}>
          <option value="">
            {!poolId ? 'Select a court first' : groups.isLoading ? 'Loading…' : (groups.data || []).length === 0 ? 'No batches on this court' : 'Select batch'}
          </option>
          {(groups.data || []).map((g: any) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {groupId && selectedGroup && (
        <div style={{ marginTop: 'var(--av2-space-4)' }}>
          {roster.isLoading ? (
            <LoadingState label="Loading roster…" />
          ) : roster.error ? (
            <Banner tone="error">{errorMessage(roster.error)}</Banner>
          ) : (roster.data || []).length === 0 ? (
            <Banner tone="info">No members in this batch yet.</Banner>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
              {(roster.data || []).map((row) => {
                const meta = STATE_LABEL[row.state] || STATE_LABEL.NO_DATA;
                const isPending = pendingId === row.assignmentId;
                const relocateTargets = (allGroups.data || []).filter((g: any) => g.id !== groupId);
                return (
                  <div
                    key={row.assignmentId}
                    style={{
                      padding: 'var(--av2-space-3)', borderRadius: 'var(--av2-radius, 8px)',
                      border: '1px solid var(--av2-border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--av2-space-2)' }}>
                      <span style={{ fontSize: 'var(--av2-text-sm)' }}>{row.memberPhone}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--av2-space-2)' }}>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => { setRelocatingId(relocatingId === row.assignmentId ? null : row.assignmentId); setTargetGroupId(''); setActionError(null); }}
                        >
                          Relocate
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isPending}
                          onClick={() => doRemove(row.assignmentId)}
                        >
                          {isPending ? 'Removing…' : 'Remove'}
                        </Button>
                      </div>
                    </div>
                    {relocatingId === row.assignmentId && (
                      <div style={{ marginTop: 'var(--av2-space-3)', display: 'flex', gap: 'var(--av2-space-2)', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Select label="Move to batch" value={targetGroupId} onChange={(e) => setTargetGroupId(e.target.value)}>
                            <option value="">{relocateTargets.length === 0 ? 'No other batches' : 'Select target batch'}</option>
                            {relocateTargets.map((g: any) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </Select>
                        </div>
                        <Button onClick={() => doRelocate(row, row.userId)} disabled={!targetGroupId || isPending}>
                          {isPending ? 'Moving…' : 'Confirm move'}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {actionError && <Banner tone="error">{actionError}</Banner>}
        </div>
      )}

      {groupId && (
        <div style={{ marginTop: 'var(--av2-space-5)', paddingTop: 'var(--av2-space-4)', borderTop: '1px solid var(--av2-border)' }}>
          <p style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600, margin: '0 0 var(--av2-space-2)' }}>Add member</p>
          <div style={{ display: 'flex', gap: 'var(--av2-space-2)', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label="Phone number" value={phone} onChange={(e) => { setPhone(e.target.value); setFound(null); }} />
            </div>
            <Button variant="secondary" onClick={doLookup} disabled={!phone.trim() || lookup.isPending}>
              {lookup.isPending ? 'Looking up…' : 'Find'}
            </Button>
          </div>
          {lookup.isSuccess && !found && <Banner tone="info">No member found with that number.</Banner>}
          {lookup.error && <Banner tone="error">{errorMessage(lookup.error)}</Banner>}
          {found && (
            <div style={{ marginTop: 'var(--av2-space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--av2-text-sm)' }}>{found.name || found.phone || found.id}</span>
              <Button onClick={doAdd} disabled={addMember.isPending}>
                {addMember.isPending ? 'Adding…' : 'Add to batch'}
              </Button>
            </div>
          )}
          {addMember.isSuccess && <Banner tone="success">Added to the batch.</Banner>}
          {addMember.error && <Banner tone="error">{errorMessage(addMember.error)}</Banner>}
        </div>
      )}
    </Card>
  );
}
