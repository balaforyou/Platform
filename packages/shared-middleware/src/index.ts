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
