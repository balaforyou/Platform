export { apiRequest, APIError } from './lib/api';
export { formatBookingReference } from './lib/format';
export { generateAccentRamp, RAMP_STEPS } from './lib/colorRamp';
export type { ColorRamp, RampStep } from './lib/colorRamp';
export { TenantProvider, useTenant } from './context/TenantContext';
export type { TenantBranding } from './context/TenantContext';
export { AuthProvider, useAuth } from './context/AuthContext';
