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
