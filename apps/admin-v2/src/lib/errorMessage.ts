import { ZodError } from 'zod';
import { APIError } from '@badminton/ui-shared';

/**
 * F-220: turn whatever a form mutation threw into one readable line for a `Banner`.
 *
 * A client-side `ZodError` stringifies to a JSON blob of issues; this surfaces the first
 * issue's message instead. `APIError` / `Error` pass their `.message` through. Distinct from
 * `lib/errors.ts`'s `friendlyAuthError`, which is auth-endpoint-specific.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Please check the highlighted fields.';
  }
  if (error instanceof APIError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

/**
 * Stricter variant for user-triggered actions (F-229): a real server error (`APIError`) or a
 * client validation error (`ZodError`) is shown verbatim, a network failure gets a plain line,
 * and **anything else — a code bug like `TypeError: x is not a function` — is logged and shown
 * as `fallback`**, never leaked raw to the screen. `errorMessage` passes a bare `Error.message`
 * straight through, which is how "crypto.randomUUID is not a function" once reached a Banner.
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Please check the highlighted fields.';
  }
  if (error instanceof APIError) return error.message;
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return 'Couldn’t reach the server. Check your connection and try again.';
  }
  // eslint-disable-next-line no-console
  console.error('[admin-v2] unexpected error:', error);
  return fallback;
}
