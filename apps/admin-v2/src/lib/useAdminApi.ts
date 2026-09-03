import { useMemo } from 'react';
import { apiRequest } from '@badminton/ui-shared';
import { useAdminAuth } from '../auth/AdminAuthContext';

/**
 * F-220: the same thin verb wrapper around `apiRequest` that admin-web keeps local to its
 * `main.tsx` (`useAdminApi`), ported here rather than calling `apiRequest` inline at every
 * one of `CourtGroupsScreen`'s ~10 call sites. The token comes from admin-v2's own
 * `useAdminAuth()` (memory-only `accessToken`), not `ui-shared`'s hostname-bound `AuthContext`.
 *
 * First shared consumer of `/slot-engine` from admin-v2 — the next screen that needs it should
 * reuse this, and promote it to `ui-shared` only once a third app needs the exact same shape.
 */
export function useAdminApi() {
  const { accessToken } = useAdminAuth();
  return useMemo(
    () => ({
      get: <T,>(path: string) => apiRequest<T>(path, { token: accessToken }),
      post: <T,>(path: string, body?: unknown) =>
        apiRequest<T>(path, {
          method: 'POST',
          token: accessToken,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      patch: <T,>(path: string, body: unknown) =>
        apiRequest<T>(path, { method: 'PATCH', token: accessToken, body: JSON.stringify(body) }),
      put: <T,>(path: string, body: unknown) =>
        apiRequest<T>(path, { method: 'PUT', token: accessToken, body: JSON.stringify(body) }),
      delete: <T,>(path: string) => apiRequest<T>(path, { method: 'DELETE', token: accessToken }),
    }),
    [accessToken],
  );
}
