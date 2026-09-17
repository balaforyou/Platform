import { apiRequest } from '@badminton/ui-shared';

export async function requestOtp(phone: string, tenantId: string): Promise<boolean> {
  await apiRequest('/identity/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone, tenantId }),
  });
  return true;
}

export async function verifyOtp(
  phone: string,
  code: string,
  tenantId: string,
  setSession: (accessToken: string) => void,
): Promise<void> {
  const res = await apiRequest<{ accessToken: string }>('/identity/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code, tenantId }),
  });
  if (res?.accessToken) setSession(res.accessToken);
}

export async function verifyGoogle(
  idToken: string,
  tenantId: string,
  setSession: (accessToken: string) => void,
): Promise<{ isNewSignup: boolean }> {
  const res = await apiRequest<{ accessToken: string; isNewSignup: boolean }>('/identity/auth/google/verify', {
    method: 'POST',
    body: JSON.stringify({ googleIdToken: idToken, tenantId }),
  });
  if (res?.accessToken) setSession(res.accessToken);
  return { isNewSignup: !!res?.isNewSignup };
}

export async function attachPhone(
  phone: string,
  code: string,
  accessToken: string | null,
  mergeUser: (patch: Record<string, any>) => void,
): Promise<void> {
  const res = await apiRequest<{ phone: string; isPhoneVerified: boolean }>('/identity/auth/otp/attach-phone', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
    token: accessToken,
  });
  // F-235 Slice C: attach-phone never re-signs a JWT, so isPhoneVerified must be merged
  // explicitly or the client-side gate sees stale state until the next refresh cycle. Fixed
  // here (the one shared helper) rather than per-caller -- CompleteSignupScreen.tsx had the
  // same latent gap, just never observable before Slice C's gate started reading the claim.
  if (res) mergeUser({ phone: res.phone, isPhoneVerified: res.isPhoneVerified });
}
