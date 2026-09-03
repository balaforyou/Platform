import { ZodError } from 'zod';
import { APIError } from '@badminton/ui-shared';

/**
 * F-220: turn whatever a mutation threw into one readable line for a `Banner`.
 *
 * admin-web renders `(error as ApiError).message` directly, which for a client-side `ZodError`
 * is a JSON blob of issues. This surfaces the first issue's message instead — a feedback-display
 * fix, not a validation-rule change (every rule is still ported byte-identical in `schemas.ts`).
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Please check the highlighted fields.';
  }
  if (error instanceof APIError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
