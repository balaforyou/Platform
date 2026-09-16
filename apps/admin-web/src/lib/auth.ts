import { apiRequest } from '@badminton/ui-shared';

export async function requestOtp(phone: string, tenantId: string): Promise<boolean> {
  await apiRequest('/identity/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone, tenantId }) });
  return true;
}

export async function verifyOtp(
  phone: string, code: string, tenantId: string,
  setSession: (accessToken: string) => void,
): Promise<void> {
  const res = await apiRequest<{ accessToken: string }>('/identity/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code, tenantId }),
  });
  if (res?.accessToken) setSession(res.accessToken);
}

export async function verifyGoogleMock(
  email: string, tenantId: string,
  setSession: (accessToken: string) => void,
): Promise<void> {
  const res = await apiRequest<{ accessToken: string }>('/identity/auth/google/verify', {
    method: 'POST',
    body: JSON.stringify({ googleIdToken: `mock-google-token-${email}`, tenantId }),
  });
  if (res?.accessToken) setSession(res.accessToken);
}
