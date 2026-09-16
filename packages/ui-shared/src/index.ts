export { apiRequest, APIError } from './lib/api';
export { formatBookingReference } from './lib/format';
export { safeTimeZone, branchHour, formatBranchTime } from './lib/branchTime';
export { generateAccentRamp, hexToOklch, RAMP_STEPS, contrastRatio, pickEmphasisStep } from './lib/colorRamp';
export type { ColorRamp, RampStep } from './lib/colorRamp';
export { TenantProvider, useTenant } from './context/TenantContext';
export type { TenantBranding } from './context/TenantContext';
export { AuthProvider, useAuth } from './context/AuthContext';
export { renderGoogleButton, googleClientId } from './lib/googleIdentity';
