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
