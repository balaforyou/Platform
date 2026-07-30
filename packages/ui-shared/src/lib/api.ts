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
}

/**
 * Thin API Client wrapper that automatically handles relative paths,
 * credentials, headers, and response envelope unwrapping.
 */
export async function apiRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...restOptions } = options;

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
