import fp from 'fastify-plugin';

/**
 * Fastify plugin that configures a global preSerialization hook and setErrorHandler.
 * 
 * WHY:
 * 1. Success responses must be enveloped in `{ data: ... }` to comply with the standard response envelope.
 *    We check if the payload already contains `data` or `error` to avoid double-wrapping responses that
 *    are already formatted (e.g., custom metadata wrappers or error objects).
 * 2. Errors must be captured globally and formatted into `{ error: { code, message, details } }`.
 *    This ensures that database errors, validation errors, or runtime exceptions do not leak raw stack traces
 *    and always return a structured, client-friendly error response.
 * 3. We wrap this plugin with fastify-plugin (fp) to prevent Fastify from encapsulating it.
 *    This ensures that the preSerialization hook and setErrorHandler defined here are registered globally
 *    on the parent server instance and apply to all sibling/parent routes (e.g. /health), rather than only
 *    applying to routes registered within this plugin context.
 */
export const responseEnvelopePlugin = fp<Record<string, never>>(async (fastify) => {
  
  // Intercept the payload before it is serialized and sent to the client.
  fastify.addHook('preSerialization', async (request, reply, payload) => {
    // WHY: If the payload is already enveloped (i.e. contains 'data' or 'error' keys),
    // we bypass wrapping to prevent nested envelopes (like { data: { data: ... } }).
    if (payload && typeof payload === 'object') {
      if ('data' in payload || 'error' in payload) {
        return payload;
      }
    }
    
    // WHY: By default, we wrap all raw returned objects, arrays, and primitives in the standard "data" envelope.
    return { data: payload };
  });

  // Handle all errors thrown inside the Fastify application.
  fastify.setErrorHandler((error, request, reply) => {
    // WHY: Resolve the HTTP status code (default to 500 if not specified on the error object).
    const statusCode = error.statusCode || 500;
    
    // WHY: Standardize error codes. If the error has a custom code (e.g. validation error or custom business logic),
    // we use it. Otherwise, default to generic 'INTERNAL_SERVER_ERROR'.
    const errorCode = error.code || 'INTERNAL_SERVER_ERROR';
    
    // WHY: Provide a user-friendly error message.
    const errorMessage = error.message || 'An unexpected error occurred';
    
    // WHY: Extract additional validation details or structured metadata if present (e.g. AJV validation errors).
    const details = (error as any).details || (error as any).validation || undefined;

    // Send the enveloped error response.
    reply.status(statusCode).send({
      error: {
        code: errorCode,
        message: errorMessage,
        details
      }
    });
  });
});

/**
 * F-290: extracted from three near-identical hand-copies (identity-auth, tenant-management,
 * slot-engine). Rejects anything that is not the platform-internal service key.
 *
 * F-298: deliberately has NO `|| 'test-service-key'` fallback. Every prior copy of this
 * function silently accepted a public, guessable credential whenever INTERNAL_SERVICE_KEY was
 * unset -- a fail-OPEN gap. This function trusts that the key is real by the time any request
 * reaches it; assertInternalServiceKeyConfigured() below is what makes that trust safe, by
 * refusing to let the service boot at all if the key is unset.
 *
 * Call this BEFORE reading the body or normalizing input (F-090/F-045/F-071): authenticating
 * after a parse or an existence check leaves a pre-auth code path an unauthenticated caller
 * can still reach.
 *
 * Deliberately does NOT call `reply.status(401)` before throwing -- several slot-engine routes
 * (e.g. `POST /bookings/:id/check-in`) call this inside a try/catch and fall back to a JWT
 * check on failure. `reply.status()` mutates the reply object immediately, so an eager call
 * here would leave a stuck 401 on the reply even when the JWT fallback later succeeds --
 * confirmed as a real regression via the regression suite while extracting this function
 * (identity-auth/tenant-management's original copies did call it eagerly, but never used this
 * try/catch/fallback shape, so relying solely on the thrown error's statusCode + the shared
 * error handler below is safe for all three, and the one correct choice for slot-engine).
 */
export function requireInternalKey(request: any, reply: any): void {
  const authHeader = request.headers['authorization'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY;

  if (!authHeader || authHeader !== `Bearer ${internalKey}`) {
    const err = new Error('Unauthorized internal service access');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
}

/**
 * F-298: the real fail-closed mechanism. Call once, as early as possible in a service's own
 * start() -- before server.listen() -- so a deploy with INTERNAL_SERVICE_KEY unset refuses to
 * boot instead of silently running with every requireInternalKey call (and every outbound
 * service-to-service request using this same key) trusting a hardcoded, publicly-known value.
 */
export function assertInternalServiceKeyConfigured(): void {
  if (!process.env.INTERNAL_SERVICE_KEY) {
    // eslint-disable-next-line no-console
    console.error(
      'FATAL: INTERNAL_SERVICE_KEY is not set. Refusing to start -- ' +
        'every internal-key-gated route and outbound service call depends on this being a real, ' +
        'non-guessable secret, not the previous hardcoded fallback.',
    );
    process.exit(1);
  }
}
