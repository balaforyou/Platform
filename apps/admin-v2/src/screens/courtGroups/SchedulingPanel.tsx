import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, Plus } from 'lucide-react';
import { useAdminApi } from '../../lib/useAdminApi';
import { Badge, Banner, Button, Card, Select, Spinner, TextField, Textarea } from '../../components';
import { overrideSchema, patternSchema } from './schemas';
import { formatDate, formatDaysOfWeek, formatTimeRange, todayIsoDate, weekdayOptions } from './helpers';
import { errorMessage } from './feedback';
import { courtGroupsKeys, useAvailability, useOverrides, usePatterns } from './queries';
import type { AvailabilityOverride, AvailabilityPattern } from './types';

const EMPTY_PATTERN: Record<string, string> = {
  daysOfWeek: '2,4',
  startTime: '18:00',
  endTime: '22:00',
  slotDurationMinutes: '60',
  capacity: '4',
  pricingMode: '',
  price: '',
  status: 'ACTIVE',
};

const EMPTY_OVERRIDE: Record<string, string> = {
  fromDate: todayIsoDate(),
  toDate: todayIsoDate(),
  type: 'CLOSED',
  startTime: '18:00',
  endTime: '20:00',
  slotDurationMinutes: '60',
  capacity: '4',
  pricingMode: '',
  price: '',
  reason: '',
};

/**
 * F-220 — "Scheduling" tab: recurring availability patterns, date overrides, live availability
 * preview. The admin-web `SchedulingPage` flow ported onto admin-v2's design system. Interaction
 * model preserved exactly: pick an existing row from a <select> to edit it, "New" clears the
 * form, Create-vs-Update is decided by whether a row id is selected, Delete acts on the selection.
 */
export function SchedulingPanel({ poolId, poolPricingMode }: { poolId: string; poolPricingMode?: string }) {
  const api = useAdminApi();
  const qc = useQueryClient();

  const patterns = usePatterns(poolId);
  const overrides = useOverrides(poolId);

  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [selectedOverrideId, setSelectedOverrideId] = useState('');
  const [previewDate, setPreviewDate] = useState(todayIsoDate());
  const [patternDraft, setPatternDraft] = useState<Record<string, string>>(EMPTY_PATTERN);
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>(EMPTY_OVERRIDE);

  const preview = useAvailability(poolId, previewDate);

  useEffect(() => {
    if (!selectedPatternId) return;
    const p = patterns.data?.find((x) => x.id === selectedPatternId);
    if (!p) return;
    setPatternDraft({
      daysOfWeek: p.daysOfWeek,
      startTime: p.startTime,
      endTime: p.endTime,
      slotDurationMinutes: String(p.slotDurationMinutes),
      capacity: String(p.capacity),
      pricingMode: p.pricingMode || '',
      price: p.price ? String(p.price) : '',
      status: p.status,
    });
  }, [selectedPatternId, patterns.data]);

  useEffect(() => {
    if (!selectedOverrideId) return;
    const o = overrides.data?.find((x) => x.id === selectedOverrideId);
    if (!o) return;
    const date = o.date.slice(0, 10);
    setOverrideDraft({
      fromDate: date,
      toDate: date,
      type: o.type,
      startTime: o.startTime || '18:00',
      endTime: o.endTime || '20:00',
      slotDurationMinutes: o.slotDurationMinutes ? String(o.slotDurationMinutes) : '60',
      capacity: o.capacity ? String(o.capacity) : '4',
      pricingMode: o.pricingMode || '',
      price: o.price ? String(o.price) : '',
      reason: o.reason || '',
    });
  }, [selectedOverrideId, overrides.data]);

  const savePattern = useMutation({
    mutationFn: () => {
      if (!poolId) throw new Error('Select a resource pool');
      const parsed = patternSchema.parse({
        ...patternDraft,
        pricingMode: patternDraft.pricingMode || undefined,
        price: patternDraft.price || undefined,
      });
      if ((parsed.pricingMode && parsed.price === undefined) || (!parsed.pricingMode && parsed.price !== undefined)) {
        throw new Error('Pricing mode and price must be set together');
      }
      const path = `/slot-engine/resource-pools/${poolId}/availability-patterns${
        selectedPatternId ? `/${selectedPatternId}` : ''
      }`;
      return selectedPatternId
        ? api.patch<AvailabilityPattern>(path, parsed)
        : api.post<AvailabilityPattern>(path, parsed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courtGroupsKeys.patterns(poolId) });
      qc.invalidateQueries({ queryKey: courtGroupsKeys.availability(poolId, previewDate) });
    },
  });

  const deletePattern = useMutation({
    mutationFn: () => {
      if (!poolId || !selectedPatternId) throw new Error('Select a pattern');
      return api.delete<AvailabilityPattern>(
        `/slot-engine/resource-pools/${poolId}/availability-patterns/${selectedPatternId}`,
      );
    },
    onSuccess: () => {
      setSelectedPatternId('');
      setPatternDraft(EMPTY_PATTERN);
      qc.invalidateQueries({ queryKey: courtGroupsKeys.patterns(poolId) });
      qc.invalidateQueries({ queryKey: courtGroupsKeys.availability(poolId, previewDate) });
    },
  });

  const saveOverride = useMutation({
    mutationFn: () => {
      if (!poolId) throw new Error('Select a resource pool');
      const modified = overrideDraft.type === 'MODIFIED';
      const parsed = overrideSchema.parse({
        ...overrideDraft,
        startTime: modified ? overrideDraft.startTime : undefined,
        endTime: modified ? overrideDraft.endTime : undefined,
        slotDurationMinutes: modified ? overrideDraft.slotDurationMinutes : undefined,
        capacity: modified ? overrideDraft.capacity : undefined,
        pricingMode: modified && overrideDraft.pricingMode ? overrideDraft.pricingMode : undefined,
        price: modified && overrideDraft.price ? overrideDraft.price : undefined,
        reason: overrideDraft.reason || undefined,
      });
      if (
        parsed.type === 'MODIFIED' &&
        ((parsed.pricingMode && parsed.price === undefined) || (!parsed.pricingMode && parsed.price !== undefined))
      ) {
        throw new Error('Pricing mode and price must be set together');
      }
      if (selectedOverrideId) {
        const { fromDate: _fromDate, toDate: _toDate, ...singleDatePayload } = parsed;
        return api
          .patch<AvailabilityOverride>(
            `/slot-engine/resource-pools/${poolId}/availability-overrides/${selectedOverrideId}`,
            singleDatePayload,
          )
          .then((o) => [o]);
      }
      return api.post<AvailabilityOverride[]>(`/slot-engine/resource-pools/${poolId}/availability-overrides`, parsed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: courtGroupsKeys.overrides(poolId) });
      qc.invalidateQueries({ queryKey: courtGroupsKeys.availability(poolId, previewDate) });
    },
  });

  const deleteOverride = useMutation({
    mutationFn: () => {
      if (!poolId || !selectedOverrideId) throw new Error('Select an override');
      return api.delete<AvailabilityOverride>(
        `/slot-engine/resource-pools/${poolId}/availability-overrides/${selectedOverrideId}`,
      );
    },
    onSuccess: () => {
      setSelectedOverrideId('');
      setOverrideDraft(EMPTY_OVERRIDE);
      qc.invalidateQueries({ queryKey: courtGroupsKeys.overrides(poolId) });
      qc.invalidateQueries({ queryKey: courtGroupsKeys.availability(poolId, previewDate) });
    },
  });

  const toggleDay = (day: string) => {
    const days = patternDraft.daysOfWeek.split(',').map((d) => d.trim()).filter(Boolean);
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setPatternDraft((draft) => ({ ...draft, daysOfWeek: next.sort().join(',') }));
  };

  const patternModified = overrideDraft.type === 'MODIFIED';
  const activeDays = patternDraft.daysOfWeek.split(',').map((d) => d.trim());

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)' }}>
      {/* Recurring pattern */}
      <Card as="section" style={{ display: 'grid', gap: 'var(--av2-space-4)', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Recurring pattern</h3>
          <Button
            variant="ghost"
            leadingIcon={<Plus size={14} />}
            onClick={() => {
              setSelectedPatternId('');
              setPatternDraft(EMPTY_PATTERN);
            }}
          >
            New
          </Button>
        </div>

        <Select
          label="Existing pattern"
          value={selectedPatternId}
          onChange={(e) => setSelectedPatternId(e.target.value)}
        >
          <option value="">New pattern</option>
          {(patterns.data || []).map((p) => (
            <option key={p.id} value={p.id}>
              {formatDaysOfWeek(p.daysOfWeek)} {formatTimeRange(p.startTime, p.endTime)} | {p.status}
            </option>
          ))}
        </Select>

        <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
          <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>Weekdays</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--av2-space-2)' }}>
            {weekdayOptions.map((day) => (
              <button
                key={day.value}
                type="button"
                aria-pressed={activeDays.includes(day.value)}
                onClick={() => toggleDay(day.value)}
                style={{ appearance: 'none', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Badge tone={activeDays.includes(day.value) ? 'success' : 'neutral'}>{day.label}</Badge>
              </button>
            ))}
          </div>
        </div>

        <TextField
          label="Start time"
          value={patternDraft.startTime}
          onChange={(e) => setPatternDraft((d) => ({ ...d, startTime: e.target.value }))}
        />
        <TextField
          label="End time"
          value={patternDraft.endTime}
          onChange={(e) => setPatternDraft((d) => ({ ...d, endTime: e.target.value }))}
        />
        <TextField
          label="Slot duration (minutes)"
          value={patternDraft.slotDurationMinutes}
          onChange={(e) => setPatternDraft((d) => ({ ...d, slotDurationMinutes: e.target.value }))}
        />
        <TextField
          label="Capacity"
          value={patternDraft.capacity}
          onChange={(e) => setPatternDraft((d) => ({ ...d, capacity: e.target.value }))}
        />
        <Select
          label="Status"
          value={patternDraft.status}
          onChange={(e) => setPatternDraft((d) => ({ ...d, status: e.target.value }))}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
        </Select>
        <Select
          label="Pricing mode"
          value={patternDraft.pricingMode}
          onChange={(e) => setPatternDraft((d) => ({ ...d, pricingMode: e.target.value }))}
        >
          <option value="">Use pool default</option>
          <option value="FLAT">Flat</option>
          <option value="PER_PERSON">Per person</option>
        </Select>
        <TextField
          label="Price override"
          value={patternDraft.price}
          onChange={(e) => setPatternDraft((d) => ({ ...d, price: e.target.value }))}
        />

        <div style={{ display: 'flex', gap: 'var(--av2-space-3)', flexWrap: 'wrap' }}>
          <Button
            leadingIcon={<Save size={16} />}
            loading={savePattern.isPending}
            disabled={!poolId || savePattern.isPending}
            onClick={() => savePattern.mutate()}
          >
            {selectedPatternId ? 'Update pattern' : 'Create pattern'}
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Trash2 size={16} />}
            loading={deletePattern.isPending}
            disabled={!selectedPatternId || deletePattern.isPending}
            onClick={() => deletePattern.mutate()}
          >
            Delete pattern
          </Button>
        </div>
        {(patterns.error || savePattern.error || deletePattern.error) && (
          <Banner tone="error">{errorMessage(patterns.error || savePattern.error || deletePattern.error)}</Banner>
        )}
        {savePattern.isSuccess && <Banner tone="success">Pattern saved.</Banner>}
        {deletePattern.isSuccess && <Banner tone="success">Pattern deleted.</Banner>}
      </Card>

      {/* Date override */}
      <Card as="section" style={{ display: 'grid', gap: 'var(--av2-space-4)', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Date override</h3>
          <Button
            variant="ghost"
            leadingIcon={<Plus size={14} />}
            onClick={() => {
              setSelectedOverrideId('');
              setOverrideDraft(EMPTY_OVERRIDE);
            }}
          >
            New
          </Button>
        </div>

        <Select
          label="Existing override"
          value={selectedOverrideId}
          onChange={(e) => setSelectedOverrideId(e.target.value)}
        >
          <option value="">New override</option>
          {(overrides.data || []).map((o) => (
            <option key={o.id} value={o.id}>
              {formatDate(o.date)} | {o.type === 'CLOSED' ? 'Closed' : formatTimeRange(o.startTime, o.endTime)}
            </option>
          ))}
        </Select>

        <TextField
          label="From date"
          type="date"
          value={overrideDraft.fromDate}
          disabled={!!selectedOverrideId}
          onChange={(e) =>
            setOverrideDraft((d) => ({ ...d, fromDate: e.target.value, toDate: d.toDate || e.target.value }))
          }
        />
        <TextField
          label="To date"
          type="date"
          value={overrideDraft.toDate}
          disabled={!!selectedOverrideId}
          onChange={(e) => setOverrideDraft((d) => ({ ...d, toDate: e.target.value }))}
        />
        <Select
          label="Type"
          value={overrideDraft.type}
          onChange={(e) => setOverrideDraft((d) => ({ ...d, type: e.target.value }))}
        >
          <option value="CLOSED">Closed</option>
          <option value="MODIFIED">Modified</option>
        </Select>
        <Textarea
          label="Reason"
          value={overrideDraft.reason}
          onChange={(e) => setOverrideDraft((d) => ({ ...d, reason: e.target.value }))}
        />

        {patternModified && (
          <>
            <TextField
              label="Start time"
              value={overrideDraft.startTime}
              onChange={(e) => setOverrideDraft((d) => ({ ...d, startTime: e.target.value }))}
            />
            <TextField
              label="End time"
              value={overrideDraft.endTime}
              onChange={(e) => setOverrideDraft((d) => ({ ...d, endTime: e.target.value }))}
            />
            <TextField
              label="Slot duration (minutes)"
              value={overrideDraft.slotDurationMinutes}
              onChange={(e) => setOverrideDraft((d) => ({ ...d, slotDurationMinutes: e.target.value }))}
            />
            <TextField
              label="Capacity"
              value={overrideDraft.capacity}
              onChange={(e) => setOverrideDraft((d) => ({ ...d, capacity: e.target.value }))}
            />
            <Select
              label="Pricing mode"
              value={overrideDraft.pricingMode}
              onChange={(e) => setOverrideDraft((d) => ({ ...d, pricingMode: e.target.value }))}
            >
              <option value="">Use pool default</option>
              <option value="FLAT">Flat</option>
              <option value="PER_PERSON">Per person</option>
            </Select>
            <TextField
              label="Price override"
              value={overrideDraft.price}
              onChange={(e) => setOverrideDraft((d) => ({ ...d, price: e.target.value }))}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 'var(--av2-space-3)', flexWrap: 'wrap' }}>
          <Button
            leadingIcon={<Save size={16} />}
            loading={saveOverride.isPending}
            disabled={!poolId || saveOverride.isPending}
            onClick={() => saveOverride.mutate()}
          >
            {selectedOverrideId ? 'Update override' : 'Create override'}
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Trash2 size={16} />}
            loading={deleteOverride.isPending}
            disabled={!selectedOverrideId || deleteOverride.isPending}
            onClick={() => deleteOverride.mutate()}
          >
            Delete override
          </Button>
        </div>
        {(overrides.error || saveOverride.error || deleteOverride.error) && (
          <Banner tone="error">{errorMessage(overrides.error || saveOverride.error || deleteOverride.error)}</Banner>
        )}
        {saveOverride.isSuccess && <Banner tone="success">Override saved.</Banner>}
        {deleteOverride.isSuccess && <Banner tone="success">Override deleted.</Banner>}
      </Card>

      {/* Live availability preview */}
      <Card as="section" style={{ display: 'grid', gap: 'var(--av2-space-4)', maxWidth: 560 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)' }}>Availability preview</h3>
        <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
          Live availability endpoint for the selected pool and date.
        </p>
        <TextField
          label="Preview date"
          type="date"
          value={previewDate}
          onChange={(e) => setPreviewDate(e.target.value)}
        />
        {preview.error && <Banner tone="error">{errorMessage(preview.error)}</Banner>}
        {preview.isFetching && <Spinner label="Loading availability" />}
        {preview.isSuccess && preview.data.length === 0 && (
          <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
            No bookable slots for this date.
          </p>
        )}
        {preview.data && preview.data.length > 0 && (
          <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
            {preview.data.map((slot) => (
              <div
                key={slot.window.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 'var(--av2-space-3)',
                  padding: 'var(--av2-space-2) var(--av2-space-3)',
                  border: '1px solid var(--av2-border)',
                  borderRadius: 'var(--av2-radius-sm)',
                  fontSize: 'var(--av2-text-sm)',
                }}
              >
                <strong>
                  {new Date(slot.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                  {new Date(slot.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </strong>
                <span>
                  {slot.remainingCapacity} of {slot.window.capacity} open
                </span>
                <span>
                  {slot.window.pricingMode || poolPricingMode || 'FLAT'} · ₹{Number(slot.window.price ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
