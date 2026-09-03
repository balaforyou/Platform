/**
 * F-220: the shapes the slot-engine / tenant-management config endpoints return, copied from
 * admin-web's `main.tsx`. Response fields only — request bodies are typed by the zod schemas.
 */

export type Branch = {
  id: string;
  name: string;
  status: string;
  workingDays?: string[];
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
};

export type BookingRule = {
  id: string;
  resourcePoolId: string;
  guestAccessCutoffMinutes: number;
  lowOccupancyThresholdPct: number;
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
