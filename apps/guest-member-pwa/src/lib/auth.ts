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
  if (res) mergeUser({ phone: res.phone });
}
