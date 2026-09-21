/**
 * F-220: the shapes the slot-engine / tenant-management config endpoints return, copied from
 * admin-web's `main.tsx`. Response fields only — request bodies are typed by the zod schemas.
 */

/** F-220 §3.2 / F-224: a branch-wide guest peak-pricing window, branch-local HH:mm. */
export type GuestPeakWindow = { start: string; end: string };

/** F-133 §5: tenant-wide member batch pricing defaults. Decimals serialise as strings. */
export type Tenant = {
  id: string;
  memberPeakDefaultRate?: string | null;
  memberNonPeakDefaultRate?: string | null;
};

/** F-133 §2: a batch (Group). `GET /slot-engine/resource-pools` (unrelated) is not this --
 *  this is the row `POST /slot-engine/groups` creates and returns. */
export type Group = {
  id: string;
  tenantId: string;
  name: string;
  resourcePoolId: string;
  daysOfWeek: string;
  startTime: string;
  isPeak: boolean;
  customRate?: string | null;
  startDate: string;
  endDate: string;
};

export type Branch = {
  id: string;
  name: string;
  status: string;
  // F-229: already returned by `GET /tenants/:id/branches` (no `select` clause) — just wasn't
  // typed. Used for branch-local time-of-day grouping and guest peak-window matching.
  timezone?: string;
  workingDays?: string[];
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  // F-224: guest-only Standard/Peak court pricing. Decimals serialise as strings in the API
  // envelope. Null / absent = no guest rate configured (flat-rate on pool.defaultRate).
  guestStandardRate?: string | null;
  guestPeakRate?: string | null;
  guestPeakWindows?: GuestPeakWindow[] | null;
};

/**
 * F-220 §3.3: the tiered guest cancellation/refund policy. Stored on `BookingRule` as a Json
 * column, consumed at real cancellation time (`slot-engine/src/index.ts` — tiers sorted
 * descending by `min_hours_before_slot`, first match wins, refund = price * refund_percent / 100).
 */
export type CancellationTier = { min_hours_before_slot: number; refund_percent: number };
export type CancellationPolicyJson = { type: 'tiered'; tiers: CancellationTier[] };

export type BookingRule = {
  id: string;
  resourcePoolId: string;
  guestAccessCutoffMinutes: number;
  lowOccupancyThresholdPct: number;
  cancellationPolicyJson?: CancellationPolicyJson | null; // F-220 §3.3
};

/** F-220 §3.1: the courts in a pool. `GET /branches/:id/resource-pools` already returns these
 *  (`include: { resources: true }` on the slot-engine route) — they just weren't typed or
 *  rendered until Authorized Guest Courts needed them. */
export type Resource = {
  id: string;
  name: string;
  // F-225: true = authorised for walk-in guest bookings. Existing courts are backfilled to true;
  // a court created after the F-225 migration defaults false (opt-in).
  guestBookable?: boolean;
};

export type ResourcePool = {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  allocationMode: string;
  capacity: number;
  minOccupancy: number;
  minBookingDurationMinutes: number;
  pricingMode: 'FLAT' | 'PER_PERSON';
  defaultRate: string;
  bookingRules?: BookingRule[];
  resources?: Resource[];
};

/** `POST /resource-pools/:id/availability-windows` response — the raw created row. */
export type AvailabilityWindow = {
  id: string;
  resourcePoolId: string;
  resourceId: string | null;
  startTime: string;
  endTime: string;
  capacity: number;
  pricingMode?: 'FLAT' | 'PER_PERSON' | null;
  price?: string | null;
};

export type AvailabilitySlot = {
  window: {
    id: string;
    startTime: string;
    endTime: string;
    resourceId?: string | null;
    capacity: number;
    updatedAt?: string;
    pricingMode?: 'FLAT' | 'PER_PERSON' | null;
    price?: string | null;
  };
  remainingCapacity: number;
};

// F-229 Step 5 — walk-in reservation flow response shapes.

/**
 * `GET /identity/users/lookup` — 200 body (404 = no account, handled as a state, not an error).
 * F-228 Step 6: `phone` widened to `string | null` — an email-based lookup can match a
 * Google-first guest with no phone attached yet (F-228 Step 1's find-or-create shape).
 */
export type GuestLookupResult = {
  id: string;
  phone: string | null;
  name?: string | null;
  userType: string;
};

/** `POST /identity/users/walk-in` — find-or-create a GUEST by phone. */
export type WalkInResult = {
  id: string;
  phone: string;
  name?: string | null;
  userType: string;
  created: boolean;
};

export type ManualPaymentMethod = 'cash' | 'razorpay_link' | 'upi_qr';

/** `GET /slot-engine/resource-pools/:id/guest-ledger` row (F-229 Step 4). */
export type LedgerMethod = 'cash' | 'upi' | 'link' | 'other';
export type GuestLedgerRow = {
  bookingId: string;
  status: string;
  date: string;
  windowStart: string;
  windowEnd: string;
  guest: { id: string; name?: string | null; phone?: string | null };
  court: string | null;
  courtSlotIndex: number | null;
  resourceId: string | null;
  price: string | null;
  payment: {
    intentId: string;
    amountPaise: number;
    status: string;
    gatewayRef: string;
    method: LedgerMethod | null;
  } | null;
};

/** `POST /payment/bookings/manual` — response varies by method. */
export type ManualBookingResult = {
  booking: { id: string; status: string; resourceId?: string | null; courtSlotIndex?: number | null };
  paymentMethod?: ManualPaymentMethod;
  payment?: { intentId: string; status: string; amount: number; gatewayRef: string; method: string };
  paymentLink?: { paymentLinkId: string; shortUrl: string; amount: number };
};

export type AvailabilityPattern = {
  id: string;
  resourcePoolId: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  capacity: number;
  pricingMode?: 'FLAT' | 'PER_PERSON' | null;
  price?: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
};

// F-250 — Guest Occupancy Dashboard (`GET /branches/:id/guest-occupancy-dashboard`).
// F-254: real 3-state model, replacing the old boolean `active` flag.
export type SlotMonitorStatus = 'closed' | 'live' | 'upcoming';
export type GuestSlotMonitorEntry = {
  windowId: string;
  resourcePoolId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  booked: boolean;
  status: SlotMonitorStatus;
};
export type LiveAllocationEntry = {
  resourceId: string;
  resourceName: string;
  resourcePoolId: string;
  status: 'open' | 'member' | 'guest' | 'unconfigured';
  guestName: string | null;
};
export type GuestOccupancyDashboard = {
  date: string;
  totalGuestsToday: number;
  guestSlots: number;
  utilizationPercentage: number;
  duesCollected: number;
  slotMonitor: GuestSlotMonitorEntry[];
  liveAllocation: LiveAllocationEntry[];
  liveAllocationAsOf: string;
};

// F-250/F-252/F-256 — Guest Slot Inventory (`GET /branches/:id/guest-inventory-grid`), 5-state
// cell model. No cell ever carries guest name/phone/price on its face (F-252 Q1) — that data
// only exists behind the tap-through `GET /bookings/:id/guest-detail` (`BookingGuestDetail`
// below).
export type GuestInventoryCell =
  | { type: 'empty'; resourceId: string; startTime: string }
  | { type: 'elapsed'; resourceId: string; windowId?: string; startTime: string; endTime?: string }
  | { type: 'member-blocked'; resourceId: string; windowId: string; startTime: string; endTime: string }
  | { type: 'guest-booked'; resourceId: string; windowId: string; bookingId: string; startTime: string; endTime: string }
  | { type: 'completed'; resourceId: string; windowId: string; bookingId: string; startTime: string; endTime: string }
  | { type: 'cancelled'; resourceId: string; windowId: string; bookingId: string; startTime: string; endTime: string }
  | { type: 'guest-vacant'; resourceId: string; windowId: string; startTime: string; endTime: string };

export type GuestInventoryGrid = {
  date: string;
  poolId: string;
  resources: Resource[];
  rows: string[];
  cells: GuestInventoryCell[];
};

/** `GET /bookings/:id/guest-detail` — F-252's Inventory tap-through detail, shape varies by status. */
export type BookingGuestDetailBase = {
  bookingId: string;
  courtLabel: string | null;
  windowStart: string;
  windowEnd: string;
  guestName: string | null;
  guestPhone: string | null;
};
export type BookingGuestDetail =
  | (BookingGuestDetailBase & {
      status: 'CONFIRMED' | 'CHECKED_IN';
      price: string | null;
      /** Friendly label ("Razorpay"/"Cash"/"UPI"), not the raw LedgerMethod enum. */
      paymentMethod: string | null;
      bookedBy: string;
    })
  | (BookingGuestDetailBase & {
      status: 'CANCELLED';
      priceAtBooking: string | null;
      cancelledBy: string;
      payment: string;
    });

/** `GET /bookings/:id/cancel-preview` — reused for the admin Cancel confirm-step (F-252 Q12). */
export type CancelPreview = {
  bookingId: string;
  originalPrice: number;
  refundAmount: number;
  refundPercent: number;
};

// F-258 Phase 1 — Dashboard "This Month" tab (`GET /branches/:id/guest-month-summary?month=`).
// Branch-wide totals, reusing computeBranchGuestDay's aggregation pattern — not guest-ledger's
// per-pool route (see the backend comment). Rows carry full guest/court/price fields (unlike
// GuestInventoryCell) since this is an admin-initiated monthly report, not a grid cell face.
export type GuestMonthSummaryRow = {
  bookingId: string;
  windowStart: string;
  windowEnd: string;
  guestName: string | null;
  guestPhone: string | null;
  court: string | null;
  price: number;
  method: LedgerMethod | null;
};
export type GuestMonthSummary = {
  month: string;
  totalFees: number;
  totalBookings: number;
  rows: GuestMonthSummaryRow[];
};

export type AvailabilityOverride = {
  id: string;
  resourcePoolId: string;
  date: string;
  type: 'CLOSED' | 'MODIFIED';
  startTime?: string | null;
  endTime?: string | null;
  slotDurationMinutes?: number | null;
  capacity?: number | null;
  pricingMode?: 'FLAT' | 'PER_PERSON' | null;
  price?: string | null;
  reason?: string | null;
};
