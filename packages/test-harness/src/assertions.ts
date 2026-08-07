/**
 * CROSS-CUTTING TRUST-BOUNDARY CHECKS
 *
 * These three patterns have mattered repeatedly across this project's findings
 * (F-000's adminId-from-JWT, F-022's spoofed-userId-ignored, the Identity
 * phone-lookup cross-tenant no-leak test). They are helpers, not a framework:
 * the point is that every tenant/branch-scoped admin endpoint gets the SAME
 * three checks applied, spelled the same way, instead of each being re-invented.
 *
 * CHECKLIST for any new tenant/branch-scoped admin endpoint:
 *   1. JWT-derived identity — a spoofed id in the request body must be ignored
 *      (assert the persisted record carries the token's id, not the body's).
 *   2. Branch scoping — a branch-manager token must not reach another branch
 *      (`expectForbidden`), and list endpoints must return only in-scope rows
 *      (`expectScopedToBranch`).
 *   3. Cross-tenant non-leak — a lookup for another tenant's record must 404,
 *      not 403 and not a populated 200 (`expectCrossTenantNoLeak`).
 */

/**
 * A response whose body has already been read into memory.
 *
 * WHY THIS EXISTS: a `fetch` Response body can only be consumed once, and even
 * `.clone()` fails once it has been. Sections routinely log a response before
 * asserting on it, so passing a raw Response to an assertion helper is a
 * latent "body already used" crash. Reading once into this shape removes the
 * hazard entirely.
 */
export interface InspectedResponse {
  status: number;
  raw: string;
  json: any;
}

/** Reads a Response exactly once into an InspectedResponse. */
export async function inspect(res: Response): Promise<InspectedResponse> {
  const raw = await res.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  return { status: res.status, raw, json };
}

async function toInspected(input: Response | InspectedResponse): Promise<InspectedResponse> {
  if ('status' in input && 'raw' in input) return input as InspectedResponse;
  const res = input as Response;
  if (res.bodyUsed) {
    // Caller already consumed it — assert on the status alone rather than crash.
    return { status: res.status, raw: '', json: undefined };
  }
  return inspect(res);
}

/** Asserts an endpoint rejected an out-of-scope or wrong-role caller with 403. */
export async function expectForbidden(
  res: Response | InspectedResponse,
  what: string,
): Promise<void> {
  const inspected = await toInspected(res);
  if (inspected.status !== 403) {
    throw new Error(
      `Trust boundary: expected 403 for ${what}, got ${inspected.status}. Body: ${inspected.raw}`,
    );
  }
}

/**
 * Asserts a cross-tenant lookup reveals nothing — 404, never 403.
 *
 * WHY 404 AND NOT 403: a 403 confirms the record exists in another tenant,
 * which is itself the leak. The Identity phone-lookup test established this
 * shape; every tenant-scoped lookup should match it.
 *
 * `forbiddenStrings` are values that must not appear anywhere in the response
 * (ids, phone numbers belonging to the other tenant).
 */
export async function expectCrossTenantNoLeak(
  res: Response | InspectedResponse,
  what: string,
  forbiddenStrings: string[] = [],
): Promise<void> {
  const inspected = await toInspected(res);
  if (inspected.status !== 404) {
    throw new Error(
      `Cross-tenant leak: expected 404 (not ${inspected.status}) for ${what}. ` +
        `A 403 would itself confirm the record exists. Body: ${inspected.raw}`,
    );
  }
  for (const needle of forbiddenStrings) {
    if (inspected.raw.includes(needle)) {
      throw new Error(`Cross-tenant leak: response for ${what} contained "${needle}"`);
    }
  }
}

/**
 * Asserts every row in a list response belongs to the expected branch.
 * Accepts the standard `{ data: [...] }` envelope or a bare array.
 */
export async function expectScopedToBranch(
  res: Response | InspectedResponse,
  branchId: string,
  what: string,
): Promise<any[]> {
  const inspected = await toInspected(res);
  const body = inspected.json;
  const rows: any[] = Array.isArray(body) ? body : (body?.data ?? []);
  if (!Array.isArray(rows)) {
    throw new Error(`Scoping check: ${what} did not return a list. Body: ${inspected.raw}`);
  }
  const foreign = rows.filter((row) => row?.branchId && row.branchId !== branchId);
  if (foreign.length > 0) {
    throw new Error(
      `Branch scoping: ${what} leaked ${foreign.length} row(s) outside branch ${branchId} ` +
        `(saw branchIds: ${[...new Set(foreign.map((r) => r.branchId))].join(', ')})`,
    );
  }
  return rows;
}

/**
 * Asserts a persisted record's identity field came from the JWT, not the request
 * body — the F-022 / F-000 pattern. `spoofedValue` is what the caller put in the
 * body; `actual` is what the service actually stored.
 */
export function expectIdentityFromJwt(
  actual: string | null | undefined,
  expectedFromToken: string,
  spoofedValue: string,
  what: string,
): void {
  if (actual === spoofedValue) {
    throw new Error(
      `Identity spoofing: ${what} stored the client-supplied value "${spoofedValue}" ` +
        `instead of the JWT-derived "${expectedFromToken}"`,
    );
  }
  if (actual !== expectedFromToken) {
    throw new Error(
      `Identity: ${what} stored "${actual}", expected JWT-derived "${expectedFromToken}"`,
    );
  }
}
