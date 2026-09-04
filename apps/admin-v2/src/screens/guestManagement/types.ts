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
  workingDays?: string[];
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  // F-224: guest-only Standard/Peak court pricing. Decimals serialise as strings in the API
  // envelope. Null / absent = no guest rate configured (flat-rate on pool.defaultRate).
  guestStandardRate?: string | null;
  guestPeakRate?: string | null;
  guestPeakWindows?: GuestPeakWindow[] | null;
};

export type BookingRule = {
  id: string;
  resourcePoolId: string;
  guestAccessCutoffMinutes: number;
  lowOccupancyThresholdPct: number;
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
