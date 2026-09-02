/**
 * Represents the standard success response envelope for all API endpoints.
 * Consistently wraps output data in a "data" object with optional "meta" field.
 */
export interface SuccessEnvelope<T = any> {
  data: T;
  meta?: Record<string, any>;
}

/**
 * Represents the standard error details inside the error envelope.
 */
export interface ErrorDetails {
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Represents the standard error response envelope for all API endpoints.
 */
export interface ErrorEnvelope {
  error: ErrorDetails;
}

/**
 * Unified type representing any API response returned by the platform.
 */
export type ApiResponse<T = any> = SuccessEnvelope<T> | ErrorEnvelope;

// ---------------------------------------------------------------------------
// F-206: module-entitlement state machine.
//
// One pure function of (row, now), shared by slot-engine's requireModuleEntitlement guard
// and tenant-management's GET /tenants/:id/entitlements so the two can never drift. State is
// NEVER stored — always computed at the access point. Lives here (types-only package both
// services already depend on) rather than being duplicated, and rather than adding a new
// service-to-service dependency edge.
// ---------------------------------------------------------------------------

/** The four sellable modules. Mirrors the Prisma `TenantModule` enum by value. */
export type TenantModuleName =
  | 'GUEST_BOOKING'
  | 'MEMBER_MANAGEMENT'
  | 'STUDENT_MANAGEMENT'
  | 'TOURNAMENT';

export type EntitlementState =
  | 'NO_ROW' // no ModuleEntitlement row for this (tenant, module)
  | 'NOT_STARTED' // now < startDate
  | 'ACTIVE' // startDate <= now <= endDate, not disabled
  | 'READ_ONLY' // disabledAt set (Owner early wind-down), still before endDate
  | 'HIDDEN'; // now > endDate (naturally, or after a wind-down ran its course)

export interface EntitlementRowInput {
  startDate: Date | string;
  endDate: Date | string;
  disabledAt: Date | string | null;
}

/**
 * Resolve the entitlement state for one module.
 * `row` is the ModuleEntitlement row (or null/undefined when none exists).
 */
export function resolveEntitlementState(
  row: EntitlementRowInput | null | undefined,
  now: Date,
): EntitlementState {
  if (!row) return 'NO_ROW';
  const t = now.getTime();
  const start = new Date(row.startDate).getTime();
  const end = new Date(row.endDate).getTime();
  if (t < start) return 'NOT_STARTED';
  if (t > end) return 'HIDDEN';
  if (row.disabledAt != null) return 'READ_ONLY';
  return 'ACTIVE';
}

/** Whether a given state permits a read (`write: false`) or a write (`write: true`). */
export function entitlementAllows(state: EntitlementState, write: boolean): boolean {
  if (write) return state === 'ACTIVE';
  return state === 'ACTIVE' || state === 'READ_ONLY';
}
