/**
 * Standard API error class to parse and wrap the standard error envelope.
 */
export class APIError extends Error {
  public code: string;
  public details?: any;
  public statusCode: number;

  constructor(message: string, code: string, statusCode: number, details?: any) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface FetchOptions extends RequestInit {
  token?: string | null;
  /** Internal -- set on the retry attempt so a second 401 fails cleanly instead of looping. */
  __isRetry?: boolean;
}

// 26 Sep 2026 feedback round, real bug: a real device idled for ~5 minutes and every API call
// on the page started failing with "Unauthorized: Invalid or missing token" -- traced to two
// real gaps working together, not a "5-minute session timeout" (the access token is a 15-minute
// JWT with an existing 14-minute setInterval refresh in AuthContext.tsx, which SHOULD keep it
// alive indefinitely): (1) that refresh is a bare setInterval, and mobile browsers throttle or
// fully suspend JS timers in a backgrounded tab (screen off, app-switched-away) -- exactly what
// "idle for 5 minutes" on a phone triggers, so the scheduled refresh can be skipped entirely;
// (2) apiRequest itself had no recovery path at all -- any 401, for any reason, surfaced straight
// to the user with no retry. AuthContext registers a refresh callback here via
// registerRefreshHandler so apiRequest can silently refresh-and-retry once on a real 401,
// independent of why the token went stale -- this is the real fix, the visibility-triggered
// refresh below is the other half (catching it proactively before a request even fails).
let refreshHandler: (() => Promise<string | null>) | null = null;
export function registerRefreshHandler(fn: () => Promise<string | null>) {
  refreshHandler = fn;
}

/**
 * Thin API Client wrapper that automatically handles relative paths,
 * credentials, headers, and response envelope unwrapping.
 */
export async function apiRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, __isRetry, ...restOptions } = options;

  // Standardize relative paths: prefix with /api if not already set
  const relativePath = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(customHeaders);
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject short-lived JWT access token in authorization header if present in memory
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Credentials must be 'include' to pass standard httpOnly refresh token cookies
  const config: RequestInit = {
    ...restOptions,
    headers,
    credentials: 'include',
  };

  const response = await fetch(relativePath, config);

  // Read response as text first, to handle potential empty response body
  const responseText = await response.text();
  let json: any = null;
  if (responseText) {
    try {
      json = JSON.parse(responseText);
    } catch {
      // Return raw string error if it's not JSON
      throw new APIError('Response was not valid JSON', 'INVALID_JSON', response.status, responseText);
    }
  }

  if (!response.ok) {
    // Real fix (see registerRefreshHandler's own comment above): a 401 on a real request (not
    // the refresh call itself, and not already a retry) gets exactly one silent refresh-and-retry
    // attempt before surfacing to the caller. relativePath.includes('/auth/refresh') guards
    // against the refresh endpoint's own 401 (a genuinely dead session) looping back into itself.
    if (response.status === 401 && !__isRetry && refreshHandler && !relativePath.includes('/auth/refresh')) {
      const newToken = await refreshHandler();
      if (newToken) {
        return apiRequest<T>(path, { ...options, token: newToken, __isRetry: true });
      }
    }

    // Standard envelope has `{ error: { code, message, details } }`
    const errorObj = json?.error ?? {};
    throw new APIError(
      errorObj.message || 'An unexpected error occurred',
      errorObj.code || 'INTERNAL_SERVER_ERROR',
      response.status,
      errorObj.details
    );
  }

  // Unwraps the `{ data: ... }` standard success envelope
  return (json?.data ?? json) as T;
}
