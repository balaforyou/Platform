import { useEffect, useState } from 'react';
import { Banner, Badge, Card, LoadingState, Select } from '../components';
import { useBranches, useGuestOccupancyDashboard } from './guestManagement/queries';
import { formatSlotLabel, todayIsoDate } from './guestManagement/reservationHelpers';
import type { BadgeTone } from '../components';

const metricStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};
const metricLabel: React.CSSProperties = { fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', fontWeight: 600 };
const metricValue: React.CSSProperties = { fontSize: 'var(--av2-text-2xl, 28px)', fontWeight: 700, color: 'var(--av2-text)' };

/**
 * F-250 — the `/dashboard` route's real content, replacing the Slice 1 "you're authenticated"
 * card. Real branch-scoped guest metrics from `GET /branches/:id/guest-occupancy-dashboard`
 * (`useGuestOccupancyDashboard`) — visual/layout reference only from
 * `AdminDashboard.jsx`'s Guest Occupancy sub-view (lines 1099-1230), no mock math or hardcoded
 * court list. Member occupancy is out of scope for this pass.
 */
export function GuestOccupancyDashboard() {
  const branches = useBranches();
  const [branchId, setBranchId] = useState('');
  const date = todayIsoDate();

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const branch = (branches.data ?? []).find((b) => b.id === branchId);
  const dashboard = useGuestOccupancyDashboard(branchId, date);

  return (
    <div style={{ display: 'grid', gap: 'var(--av2-space-6)', maxWidth: 880, minWidth: 0 }}>
      <div>
        <h2 style={{ margin: '0 0 var(--av2-space-1)', fontSize: 'var(--av2-text-lg)' }}>Guest Occupancy</h2>
        <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
          Real-time guest booking activity for {date}.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 'var(--av2-space-2)', maxWidth: 280 }}>
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

      {!branchId ? (
        <Banner tone="info">Select a branch to see its guest occupancy.</Banner>
      ) : dashboard.isLoading ? (
        <LoadingState label="Loading guest occupancy…" />
      ) : dashboard.error ? (
        <Banner tone="error">{(dashboard.error as Error)?.message ?? "Couldn’t load guest occupancy."}</Banner>
      ) : dashboard.data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--av2-space-4)' }}>
            <Card style={metricStyle}>
              <span style={metricLabel}>Total Guests Today</span>
              <span style={metricValue}>{dashboard.data.totalGuestsToday}</span>
            </Card>
            <Card style={metricStyle}>
              <span style={metricLabel}>Guest Slots (Active)</span>
              <span style={metricValue}>{dashboard.data.guestSlots}</span>
            </Card>
            <Card style={metricStyle}>
              <span style={metricLabel}>Guest Utilization</span>
              <span style={metricValue}>{dashboard.data.utilizationPercentage}%</span>
            </Card>
            <Card style={metricStyle}>
              <span style={metricLabel}>Dues Collected</span>
              <span style={metricValue}>₹{dashboard.data.duesCollected.toLocaleString('en-IN')}</span>
            </Card>
          </div>

          <Card>
            <h3 style={{ margin: '0 0 var(--av2-space-3)', fontSize: 'var(--av2-text-base)', fontWeight: 700 }}>
              Upcoming Guest Slot Monitor
            </h3>
            {dashboard.data.slotMonitor.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
                No guest slots configured for today.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 'var(--av2-space-2)' }}>
                {dashboard.data.slotMonitor.map((slot) => (
                  <div
                    key={slot.windowId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--av2-space-3)',
                      padding: 'var(--av2-space-2) 0',
                      borderBottom: '1px solid var(--av2-border)',
                    }}
                  >
                    <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 600 }}>
                      {formatSlotLabel({ id: slot.windowId, startTime: slot.startTime, endTime: slot.endTime, capacity: slot.capacity }, branch?.timezone)}
                    </span>
                    <span style={{ display: 'flex', gap: 'var(--av2-space-2)' }}>
                      <Badge tone={slot.booked ? 'success' : 'neutral'}>
                        {slot.bookedCount}/{slot.capacity} {slot.booked ? 'Booked' : 'Vacant'}
                      </Badge>
                      <Badge tone={slot.active ? 'info' : 'neutral'}>{slot.active ? 'Active' : 'Closed'}</Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h3 style={{ margin: '0 0 var(--av2-space-3)', fontSize: 'var(--av2-text-base)', fontWeight: 700 }}>
              Live Guest Allocation
            </h3>
            {dashboard.data.liveAllocation.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
                No courts configured for this branch.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--av2-space-3)' }}>
                {dashboard.data.liveAllocation.map((court) => {
                  const tone: BadgeTone = court.status === 'guest' ? 'success' : court.status === 'member' ? 'info' : 'neutral';
                  const label = court.status === 'guest' ? `Reserved: ${court.guestName ?? 'Guest'}` : court.status === 'member' ? 'Occupied (Member)' : 'Open';
                  return (
                    <div key={court.resourceId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 'var(--av2-text-sm)', fontWeight: 700 }}>{court.resourceName}</span>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
