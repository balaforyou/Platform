/**
 * F-220: the shapes the slot-engine / tenant-management config endpoints return, copied from
 * admin-web's `main.tsx`. Response fields only — request bodies are typed by the zod schemas.
 */

/** F-220 §3.2 / F-224: a branch-wide guest peak-pricing window, branch-local HH:mm. */
export type GuestPeakWindow = { start: string; end: string };

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

/** `GET /identity/users/lookup` — 200 body (404 = no account, handled as a state, not an error). */
export type GuestLookupResult = {
  id: string;
  phone: string;
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
