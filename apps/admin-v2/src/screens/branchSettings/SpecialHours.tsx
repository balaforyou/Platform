import { useState } from 'react';
import { CalendarOff, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react';
import { Badge, Banner, Button, Card, EmptyState, IconButton, LoadingState, Modal, TextField, TimeField } from '../../components';
import { errorMessage } from '../../lib/errorMessage';
import { to12h } from './format';
import { specialHoursSchema } from './specialHoursSchema';
import {
  useBookingConflictCount,
  useDeleteSpecialHours,
  useSaveSpecialHours,
  useSpecialHours,
  type OverrideType,
  type SpecialHoursEntry,
} from './overrideQueries';

const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtDate(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDay;
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
}

/** Computed, not stored — compares the override's hours to the branch's regular hours. */
function describeModified(startTime: string | null, endTime: string | null, regularStart: string, regularEnd: string): string {
  const lateStart = !!startTime && startTime > regularStart;
  const earlyEnd = !!endTime && endTime < regularEnd;
  if (lateStart && earlyEnd) return 'Reduced hours';
  if (earlyEnd) return 'Early closing';
  if (lateStart) return 'Late opening';
  return 'Modified hours';
}

interface Props {
  branchId?: string;
  /** Regular operating hours (24h HH:MM), for the computed row subtitle. */
  regularStart: string;
  regularEnd: string;
}

/**
 * F-220 §1b — Special Hours: per-date closures / one-off hour changes for the selected branch,
 * backed by `AvailabilityOverride` fanned out across every resource pool under the branch.
 * The 4th card on `/branch-settings`, edited in place via a Modal — no new route, no new nav.
 */
export function SpecialHours({ branchId, regularStart, regularEnd }: Props) {
  const { entries, pools, isLoading, error } = useSpecialHours(branchId);
  const save = useSaveSpecialHours(branchId);
  const del = useDeleteSpecialHours(branchId);

  const [expanded, setExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const [fDate, setFDate] = useState('');
  const [fType, setFType] = useState<OverrideType>('CLOSED');
  const [fStart, setFStart] = useState('08:00');
  const [fEnd, setFEnd] = useState('18:00');
  const [fReason, setFReason] = useState('');
  const [fErrors, setFErrors] = useState<Record<string, string>>({});

  const slotStep = pools[0]?.minBookingDurationMinutes ?? 60;
  const conflictCount = useBookingConflictCount(
    pools,
    formOpen ? fDate : '',
    fType,
    fType === 'MODIFIED' ? fStart : undefined,
    fType === 'MODIFIED' ? fEnd : undefined,
  );

  const shown = expanded ? entries : entries.slice(0, 3);

  const resetForm = () => {
    setFDate('');
    setFType('CLOSED');
    setFStart('08:00');
    setFEnd('18:00');
    setFReason('');
    setFErrors({});
  };

  const openAdd = () => {
    resetForm();
    setEditingDate(null);
    setFormOpen(true);
  };

  const openEdit = (e: SpecialHoursEntry) => {
    setFDate(e.date);
    setFType(e.type);
    setFStart(e.startTime ?? '08:00');
    setFEnd(e.endTime ?? '18:00');
    setFReason(e.reason);
    setFErrors({});
    setEditingDate(e.date);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const submit = () => {
    const parsed = specialHoursSchema.safeParse({
      date: fDate,
      type: fType,
      reason: fReason,
      startTime: fType === 'MODIFIED' ? fStart : undefined,
      endTime: fType === 'MODIFIED' ? fEnd : undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
      setFErrors(errs);
      return;
    }
    const existing = editingDate ? entries.find((e) => e.date === editingDate) : undefined;
    save.mutate({ input: parsed.data, pools, existing }, { onSuccess: closeForm });
  };

  const runDelete = (entry: SpecialHoursEntry) => {
    del.mutate({ entry, pools }, { onSuccess: () => setConfirmingDelete(null) });
  };

  return (
    <Card as="section" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--av2-space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--av2-space-3)' }}>
        <CalendarOff size={18} style={{ color: 'var(--av2-accent-hover)', flex: 'none', marginTop: 2 }} />
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Special Hours</h3>
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            Closures and one-off hour changes for this branch.
          </p>
        </div>
      </div>

      {isLoading && <LoadingState label="Loading special hours…" />}
      {error && <Banner tone="error">{errorMessage(error)}</Banner>}

      {!isLoading && !error && entries.length === 0 && (
        <EmptyState
          icon={<CalendarOff size={20} />}
          title="No special hours yet"
          description="Add a closure or one-off hours change for this branch."
        />
      )}

      {!isLoading && !error && entries.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--av2-space-3)' }}>
          {shown.map((e) => (
            <div
              key={e.date}
              style={{
                minWidth: 0,
                padding: 'var(--av2-space-3)',
                border: '1px solid var(--av2-border)',
                borderLeft: `3px solid ${e.type === 'CLOSED' ? 'var(--av2-danger)' : 'var(--av2-warning)'}`,
                borderRadius: 'var(--av2-radius-sm)',
              }}
            >
              {confirmingDelete === e.date ? (
                <div style={{ display: 'grid', gap: 'var(--av2-space-3)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--av2-text-base)' }}>{fmtDate(e.date)}</div>
                    <div style={{ fontSize: 'var(--av2-text-sm)' }}>{e.reason}</div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--av2-space-3)',
                      flexWrap: 'wrap',
                      padding: 'var(--av2-space-3)',
                      background: 'var(--av2-danger-soft)',
                      border: '1px solid var(--av2-danger-border)',
                      borderRadius: 'var(--av2-radius-sm)',
                      fontSize: 'var(--av2-text-sm)',
                    }}
                  >
                    <span>Delete this entry? This can't be undone.</span>
                    <span style={{ display: 'flex', gap: 'var(--av2-space-2)', flex: 'none' }}>
                      <Button variant="secondary" size="sm" onClick={() => setConfirmingDelete(null)} disabled={del.isPending}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => runDelete(e)}
                        loading={del.isPending}
                        style={{ background: 'var(--av2-danger)', color: '#fff' }}
                      >
                        Delete
                      </Button>
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--av2-text-base)' }}>{fmtDate(e.date)}</span>
                      {e.type === 'CLOSED' ? (
                        <Badge tone="danger">Closed</Badge>
                      ) : (
                        <Badge tone="warning">
                          {e.startTime ? to12h(e.startTime) : '—'}–{e.endTime ? to12h(e.endTime) : '—'}
                        </Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--av2-text-sm)', marginTop: 2 }}>{e.reason}</div>
                    <div style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', marginTop: 2 }}>
                      {e.type === 'CLOSED'
                        ? 'Branch will be closed'
                        : describeModified(e.startTime, e.endTime, regularStart, regularEnd)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                    <IconButton aria-label="Edit" icon={<Pencil size={16} />} onClick={() => openEdit(e)} />
                    <IconButton
                      aria-label="Delete"
                      icon={<Trash2 size={16} />}
                      onClick={() => setConfirmingDelete(e.date)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {entries.length > 3 && (
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--av2-text-sm)',
                  fontWeight: 600,
                  color: 'var(--av2-accent-hover)',
                  padding: 'var(--av2-space-2)',
                }}
              >
                {expanded ? 'Show fewer' : `View all special hours (${entries.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {del.error && <Banner tone="error">{errorMessage(del.error)}</Banner>}

      {!isLoading && !error && (
        <Button variant="secondary" leadingIcon={<Plus size={16} />} onClick={openAdd} fullWidth>
          Add special hours
        </Button>
      )}

      <Modal
        open={formOpen}
        onOpenChange={(o) => (o ? setFormOpen(true) : closeForm())}
        title={editingDate ? 'Edit special hours' : 'Add special hours'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 'var(--av2-space-4)' }}>
          <TextField
            label="Date"
            type="date"
            value={fDate}
            onChange={(ev) => {
              setFDate(ev.target.value);
              setFErrors((p) => ({ ...p, date: '' }));
            }}
            error={fErrors.date || undefined}
          />

          <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
            <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>Type</span>
            <div style={{ display: 'flex', gap: 'var(--av2-space-2)' }}>
              {(['CLOSED', 'MODIFIED'] as const).map((t) => {
                const on = fType === t;
                const tint = t === 'CLOSED' ? 'var(--av2-danger)' : 'var(--av2-warning)';
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFType(t)}
                    style={{
                      flex: 1,
                      padding: 'var(--av2-space-2)',
                      borderRadius: 'var(--av2-radius-sm)',
                      border: `1px solid ${on ? tint : 'var(--av2-border)'}`,
                      background: on ? (t === 'CLOSED' ? 'var(--av2-danger-soft)' : 'var(--av2-warning-soft)') : 'var(--av2-surface)',
                      color: on ? tint : 'var(--av2-text)',
                      fontSize: 'var(--av2-text-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'CLOSED' ? 'Closed all day' : 'Modified hours'}
                  </button>
                );
              })}
            </div>
          </div>

          {fType === 'MODIFIED' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--av2-space-3)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TimeField
                  label="Opens"
                  icon={<Sun size={16} />}
                  value={fStart}
                  minuteStep={slotStep}
                  onChange={(v) => {
                    setFStart(v);
                    setFErrors((p) => ({ ...p, startTime: '', endTime: '' }));
                  }}
                  error={fErrors.startTime || undefined}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TimeField
                  label="Closes"
                  icon={<Moon size={16} />}
                  value={fEnd}
                  minuteStep={slotStep}
                  onChange={(v) => {
                    setFEnd(v);
                    setFErrors((p) => ({ ...p, endTime: '' }));
                  }}
                  error={fErrors.endTime || undefined}
                />
              </div>
            </div>
          )}

          <TextField
            label="Reason"
            placeholder="e.g. Maintenance, Tournament, Festival Holiday"
            value={fReason}
            onChange={(ev) => {
              setFReason(ev.target.value);
              setFErrors((p) => ({ ...p, reason: '' }));
            }}
            error={fErrors.reason || undefined}
          />

          {conflictCount > 0 && (
            <Banner tone="info">
              {conflictCount} existing booking{conflictCount === 1 ? '' : 's'}{' '}
              {conflictCount === 1 ? 'falls' : 'fall'} on this date. This won't cancel or notify{' '}
              {conflictCount === 1 ? 'it' : 'them'} — tracked as a follow-up (F-222).
            </Banner>
          )}

          {save.error && <Banner tone="error">{errorMessage(save.error)}</Banner>}
        </div>
      </Modal>
    </Card>
  );
}
