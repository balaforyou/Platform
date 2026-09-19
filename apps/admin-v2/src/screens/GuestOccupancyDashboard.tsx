import { useEffect, useState } from 'react';
import { Banner, Badge, Button, Card, LoadingState, Select, Tabs } from '../components';
import { useBranches, useGuestMonthSummary, useGuestOccupancyDashboard } from './guestManagement/queries';
import { formatHourLabel, formatSlotLabel, todayIsoDate, todayIsoMonth } from './guestManagement/reservationHelpers';
import type { BadgeTone } from '../components';
import type { GuestMonthSummaryRow, SlotMonitorStatus } from './guestManagement/types';

const DASHBOARD_TABS = [
  { key: 'today', label: 'Today' },
  { key: 'month', label: 'This Month' },
];

const MONTH_METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', link: 'Razorpay', other: 'Other' };

/** Minimal CSV field escaping — real names/phone numbers are the only free-text fields at risk. */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildMonthCsv(rows: GuestMonthSummaryRow[], timezone: string | undefined): string {
  const header = ['Date', 'Time', 'Court', 'Guest', 'Phone', 'Price', 'Payment method'];
  const lines = [header.map(csvField).join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvField(new Date(r.windowStart).toLocaleDateString('en-GB')),
        csvField(formatSlotLabel({ id: r.bookingId, startTime: r.windowStart, endTime: r.windowEnd, capacity: 1 }, timezone)),
        csvField(r.court),
        csvField(r.guestName),
        csvField(r.guestPhone),
        csvField(r.price),
        csvField(r.method ? MONTH_METHOD_LABEL[r.method] ?? r.method : ''),
      ].join(','),
    );
  }
  lines.push('');
  lines.push([csvField('Total'), '', '', '', '', csvField(rows.reduce((sum, r) => sum + r.price, 0)), ''].join(','));
  return lines.join('\n');
}

function downloadMonthCsv(branchName: string, month: string, rows: GuestMonthSummaryRow[], timezone: string | undefined): void {
  const csv = buildMonthCsv(rows, timezone);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeBranch = branchName.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'branch';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeBranch}-guest-bookings-${month}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// F-254: real 3-state model, replacing the old boolean Active/Closed flag that couldn't tell a
// slot 49 minutes from starting apart from one genuinely in progress (confirmed live at 16:11
// UTC — both showed "Active"). Vacancy/booked counts are unchanged either way (F-255 Q&A).
const SLOT_STATUS_LABEL: Record<SlotMonitorStatus, string> = { closed: 'Closed', live: 'Live now', upcoming: 'Upcoming' };
const SLOT_STATUS_TONE: Record<SlotMonitorStatus, BadgeTone> = { closed: 'neutral', live: 'success', upcoming: 'warning' };

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
  const [tab, setTab] = useState('today');
  const date = todayIsoDate();
  const [month, setMonth] = useState(todayIsoMonth());

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const branch = (branches.data ?? []).find((b) => b.id === branchId);
  const dashboard = useGuestOccupancyDashboard(tab === 'today' ? branchId : undefined, date);
  const monthSummary = useGuestMonthSummary(tab === 'month' ? branchId : undefined, month);

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

      <Tabs items={DASHBOARD_TABS} activeKey={tab} onChange={setTab} />

      {!branchId ? (
        <Banner tone="info">Select a branch to see its guest occupancy.</Banner>
      ) : tab === 'month' ? (
        monthSummary.isLoading ? (
          <LoadingState label="Loading this month’s totals…" />
        ) : monthSummary.error ? (
          <Banner tone="error">{(monthSummary.error as Error)?.message ?? "Couldn’t load this month’s totals."}</Banner>
        ) : monthSummary.data ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--av2-space-3)', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)', fontWeight: 600 }}>Month</span>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                  style={{
                    padding: 'var(--av2-space-2) var(--av2-space-3)',
                    borderRadius: 'var(--av2-radius)',
                    border: '1px solid var(--av2-border)',
                    background: 'var(--av2-surface)',
                    color: 'var(--av2-text)',
                    fontSize: 'var(--av2-text-sm)',
                  }}
                />
              </label>
              <Button
                variant="secondary"
                onClick={() => downloadMonthCsv(branch?.name ?? 'branch', month, monthSummary.data!.rows, branch?.timezone)}
                disabled={monthSummary.data.rows.length === 0}
              >
                Export CSV
              </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--av2-space-4)' }}>
              <Card style={metricStyle}>
                <span style={metricLabel}>Total Fees Collected</span>
                <span style={metricValue}>₹{monthSummary.data.totalFees.toLocaleString('en-IN')}</span>
              </Card>
              <Card style={metricStyle}>
                <span style={metricLabel}>Total Bookings</span>
                <span style={metricValue}>{monthSummary.data.totalBookings}</span>
              </Card>
            </div>
          </>
        ) : null
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
              <span style={metricLabel}>Guest Slots (Today)</span>
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

          {/* F-255: side-by-side on desktop (2fr Slot Monitor / 1fr Live Allocation), restoring
              the original F-250 mockup's intent; stacked on mobile is a deliberate exception. */}
          <div className="dashboard-panels">
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
                          {slot.bookedCount}/{slot.capacity} <span className="slot-monitor-word">{slot.booked ? 'Booked' : 'Vacant'}</span>
                        </Badge>
                        <Badge tone={SLOT_STATUS_TONE[slot.status]}>{SLOT_STATUS_LABEL[slot.status]}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--av2-space-3)' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--av2-text-base)', fontWeight: 700 }}>Live Guest Allocation</h3>
                <span style={{ fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
                  as of {formatHourLabel(dashboard.data.liveAllocationAsOf, branch?.timezone)}
                </span>
              </div>
              {dashboard.data.liveAllocation.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--av2-text-sm)', color: 'var(--av2-muted)' }}>
                  No courts configured for this branch.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--av2-space-3)' }}>
                  {dashboard.data.liveAllocation.map((court) => {
                    const tone: BadgeTone = court.status === 'guest' ? 'success' : court.status === 'member' ? 'info' : 'neutral';
                    const label = court.status === 'guest' ? `Reserved — ${court.guestName ?? 'Guest'}` : court.status === 'member' ? 'Occupied (Member)' : 'Open';
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
          </div>
        </>
      ) : null}
    </div>
  );
}
