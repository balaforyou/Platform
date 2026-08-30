import { randomUUID } from 'node:crypto';
import fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, BranchStatus, UserRole } from '@badminton/database';

const server = fastify({ logger: true });

// WHY: Register response envelope plugin globally to standardize return formats.
server.register(responseEnvelopePlugin);

// Register JWT support for verifying client tokens
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg',
});

const prisma = new PrismaClient();

/**
 * Rejects anything that is not the platform-internal service key.
 *
 * WHY THIS IS A HELPER (F-140). This service had internal-key logic in two spellings already — the
 * internal-or-owner branch inside `verifyTenantOwnerOrInternal` below, and an inlined copy in
 * `POST /tenants` — and F-140 needed it on two more routes. Four copies of one security rule is how
 * they drift apart, so it is extracted once here, mirroring the `requireInternalKey` that F-119
 * extracted in identity-auth and the one slot-engine already had. Same shape, third service.
 *
 * Call this BEFORE reading params or touching the database: F-090/F-045/F-071 all turned on the same
 * lesson, that authenticating after a lookup leaves a pre-auth path an unauthenticated caller reaches.
 */
function requireInternalKey(request: any, reply: any) {
  const authHeader = request.headers['authorization'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

  if (!authHeader || authHeader !== `Bearer ${internalKey}`) {
    reply.status(401);
    const err = new Error('Unauthorized internal service access');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
}

// Helper to verify authorization (internal service key OR owner JWT matching tenantId)
// WHY: Authenticates operations securely, separating platform admin scripts (INTERNAL_SERVICE_KEY)
// from self-service tenant owner operations (JWT OWNER).
const verifyTenantOwnerOrInternal = async (request: any, reply: any, tenantId: string) => {
  const authHeader = request.headers['authorization'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';

  if (!authHeader) {
    reply.status(401);
    const err = new Error('Missing authorization header');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  // 1. Check internal service key (bootstrap / platform administrator path)
  if (authHeader === `Bearer ${internalKey}`) {
    return;
  }

  // 2. Check JWT verification
  try {
    const decoded = await request.jwtVerify() as any;
    
    if (decoded.tenantId !== tenantId) {
      reply.status(403);
      const err = new Error('Forbidden: Tenant mismatch');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    if (!decoded.roles?.includes('owner')) {
      reply.status(403);
      const err = new Error('Forbidden: Owner privilege required');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }
  } catch (e: any) {
    if (e.statusCode) throw e;
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
};

// Route for service health check
server.get('/health', async () => {
  // F-077: BUILD_GIT_SHA is baked in at image build; the deploy verifier compares it
    // against the SHA it intended to ship. 'unknown' locally, where there is no build step.
    return { status: 'ok', service: 'tenant-management', version: process.env.BUILD_GIT_SHA ?? 'unknown' };
});

// Platform endpoint to create a Tenant
// WHY: Gated to INTERNAL_SERVICE_KEY for platform-managed onboarding.
server.post('/tenants', async (request, reply) => {
  // F-140: folded into the shared helper so this service carries one spelling of the rule rather
  // than three. Behaviour-neutral — same 401, same code — and covered by existing regression.
  requireInternalKey(request, reply);

  const { name, subdomain, logo, themeColor, appName, plan, contactInfo, billingInfo } = request.body as any;
  if (!name || !subdomain) {
    reply.status(400);
    const err = new Error('name and subdomain are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      subdomain,
      logo,
      themeColor: themeColor || '#000000',
      appName,
      plan: plan || 'basic',
      status: 'active',
      contactInfo,
      billingInfo,
    },
  });

  return tenant;
});

// Update a Tenant's branding and facilities details
server.patch('/tenants/:id', async (request, reply) => {
  const { id } = request.params as any;
  await verifyTenantOwnerOrInternal(request, reply, id);

  const { name, logo, themeColor, appName, plan, status, contactInfo, billingInfo,
          aboutDescription, facilities, photos } = request.body as any;

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      name,
      logo,
      themeColor,
      appName,
      plan,
      status,
      contactInfo,
      billingInfo,
      ...(aboutDescription !== undefined ? { aboutDescription } : {}),
      ...(facilities !== undefined ? { facilities } : {}),
      ...(photos !== undefined ? { photos } : {}),
    },
  });

  return tenant;
});

// Resolve subdomain details (Public guest config endpoint)
server.get('/tenants/by-subdomain/:subdomain', async (request, reply) => {
  const { subdomain } = request.params as any;
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain },
  });
  if (!tenant) {
    reply.status(404);
    const err = new Error('Tenant not found');
    (err as any).statusCode = 404;
    (err as any).code = 'TENANT_NOT_FOUND';
    throw err;
  }
  return tenant;
});

// Tenant lookup by id — sibling of /tenants/by-subdomain/:subdomain. Same public
// branding data (name / appName / logo / themeColor), same no-auth posture as its
// sibling. F-203: admin-v2 resolves its tenant from the signed-in admin's JWT
// tenantId (not from the hostname), so it needs a by-id lookup the hostname flow
// never required.
server.get('/tenants/:id', async (request, reply) => {
  const { id } = request.params as any;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
  });
  if (!tenant) {
    reply.status(404);
    const err = new Error('Tenant not found');
    (err as any).statusCode = 404;
    (err as any).code = 'TENANT_NOT_FOUND';
    throw err;
  }
  return tenant;
});

// Dynamic PWA manifest.json endpoint
// WHY: Bypasses standard preSerialization hook via raw stream to serve strict JSON root layout.
server.get('/tenants/:id/manifest.json', async (request, reply) => {
  const { id } = request.params as any;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
  });
  
  if (!tenant) {
    reply.status(404);
    const err = new Error('Tenant not found');
    (err as any).statusCode = 404;
    (err as any).code = 'TENANT_NOT_FOUND';
    throw err;
  }

  const manifest = {
    name: tenant.appName || tenant.name,
    short_name: tenant.appName || tenant.name,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: tenant.themeColor,
    icons: tenant.logo ? [
      {
        src: tenant.logo,
        sizes: '512x512',
        type: 'image/png',
      },
    ] : [],
  };

  reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
  reply.raw.end(JSON.stringify(manifest));
  return reply;
});

// F-175/F-177: workingHoursStart/workingHoursEnd/timezone flowed straight into Prisma on both
// branch endpoints with no format/range check at all. Mirrored locally rather than imported from
// slot-engine — no backend service currently depends on another in this codebase, and both checks
// are small and self-contained enough that adding the first cross-service dependency to avoid
// duplicating ~15 lines isn't worth the coupling.
const WORKING_HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)$/; // mirrors slot-engine's validateTimeString

// Mirrors slot-engine's branchTime.ts isValidTimeZone byte-for-byte, deliberately: that function is
// what safeTimeZone uses to decide what to trust downstream, so validating against a different check
// here (e.g. Intl.supportedValuesOf('timeZone')'s stricter canonical-only list) could let a value
// pass this gate and still silently fall back to UTC in slot-engine — the exact failure mode F-177
// is about, one layer later. Keep both in sync if either changes.
function isValidTimeZone(timeZone: unknown): boolean {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function validateBranchFields(fields: { workingHoursStart?: unknown; workingHoursEnd?: unknown; timezone?: unknown }) {
  for (const [field, value] of [
    ['workingHoursStart', fields.workingHoursStart],
    ['workingHoursEnd', fields.workingHoursEnd],
  ] as const) {
    if (value != null && !WORKING_HOURS_RE.test(value as string)) {
      const err = new Error(`${field} must be HH:mm`);
      (err as any).statusCode = 400;
      (err as any).code = 'INVALID_TIME';
      throw err;
    }
  }
  if (fields.timezone != null && !isValidTimeZone(fields.timezone)) {
    const err = new Error(`timezone is not a recognised IANA zone: "${fields.timezone}"`);
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TIMEZONE';
    throw err;
  }
}

// Add new branch (defaults to DRAFT)
// Phase 9: accepts working schedule and about/facilities/photos fields.
server.post('/tenants/:id/branches', async (request, reply) => {
  const { id } = request.params as any;
  await verifyTenantOwnerOrInternal(request, reply, id);

  const {
    name, address, timezone,
    latitude, longitude, googlePlaceId,
    workingDays, workingHoursStart, workingHoursEnd,
    aboutDescription, facilities, photos,
  } = request.body as any;

  if (!name) {
    reply.status(400);
    const err = new Error('name is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  validateBranchFields({ workingHoursStart, workingHoursEnd, timezone });

  const branch = await prisma.branch.create({
    data: {
      tenantId: id,
      name,
      address,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      googlePlaceId: googlePlaceId ?? null,
      timezone: timezone || 'UTC',
      status: BranchStatus.DRAFT,
      workingDays: workingDays ?? [],
      workingHoursStart: workingHoursStart ?? null,
      workingHoursEnd: workingHoursEnd ?? null,
      aboutDescription: aboutDescription ?? null,
      facilities: facilities ?? [],
      photos: photos ?? [],
    },
  });

  return branch;
});

// Modify Branch (Activate / Deactivate / Metadata update)
// Phase 9: accepts working schedule and about/facilities/photos fields.
server.patch('/branches/:id', async (request, reply) => {
  const { id } = request.params as any;
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) {
    reply.status(404);
    const err = new Error('Branch not found');
    (err as any).statusCode = 404;
    (err as any).code = 'BRANCH_NOT_FOUND';
    throw err;
  }

  await verifyTenantOwnerOrInternal(request, reply, branch.tenantId);

  const {
    name, address, timezone, status,
    latitude, longitude, googlePlaceId,
    workingDays, workingHoursStart, workingHoursEnd,
    aboutDescription, facilities, photos,
  } = request.body as any;

  if (status && !Object.values(BranchStatus).includes(status)) {
    reply.status(400);
    const err = new Error('Invalid branch status');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  validateBranchFields({ workingHoursStart, workingHoursEnd, timezone });

  const updated = await prisma.branch.update({
    where: { id },
    data: {
      name,
      address,
      timezone,
      status: status as BranchStatus,
      // WHY the conditional spread, matching the fields below rather than the bare
      // `name`/`address` above: an omitted coordinate must leave the stored value alone, while
      // an explicit null must be able to clear it. Passing `latitude` directly would work for
      // the first case (Prisma ignores undefined) but reads as if omission clears the field.
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(googlePlaceId !== undefined ? { googlePlaceId } : {}),
      ...(workingDays !== undefined ? { workingDays } : {}),
      ...(workingHoursStart !== undefined ? { workingHoursStart } : {}),
      ...(workingHoursEnd !== undefined ? { workingHoursEnd } : {}),
      ...(aboutDescription !== undefined ? { aboutDescription } : {}),
      ...(facilities !== undefined ? { facilities } : {}),
      ...(photos !== undefined ? { photos } : {}),
    },
  });

  return updated;
});

// Branch About / Facilities (public — guest-readable)
// WHY: Branch-level data overrides tenant defaults when non-empty.
// Tenants can set facilities once at tenant level; branches only need overrides when they differ.
server.get('/branches/:id/about', async (request, reply) => {
  const { id } = request.params as any;

  const branch = await prisma.branch.findUnique({
    where: { id },
    include: { tenant: true },
  });
  if (!branch) {
    reply.status(404);
    const err = new Error('Branch not found');
    (err as any).statusCode = 404;
    (err as any).code = 'BRANCH_NOT_FOUND';
    throw err;
  }

  // WHY: Fall back to tenant-level values when the branch has not set its own.
  // "Has not set" = null for string fields, empty array for list fields.
  // WHY address is here (F-099): BranchAbout.tsx has rendered `aboutData.address` since it was
  // built, but this object never carried an `address` key, so that block never displayed
  // anything. Location fields are branch-only with no tenant fallback — a tenant-level address
  // or coordinate would be wrong for every branch except one.
  const about = {
    // F-102: the branch's own name. BookingConfirmation had a hardcoded venue string because
    // nothing exposed this — a booking row carries branchId as a bare scalar with no relation,
    // and no other endpoint returns a single branch by id.
    name: branch.name,
    description: branch.aboutDescription || branch.tenant.aboutDescription || null,
    facilities: branch.facilities.length > 0 ? branch.facilities : branch.tenant.facilities,
    photos: branch.photos.length > 0 ? branch.photos : branch.tenant.photos,
    workingDays: branch.workingDays,
    workingHoursStart: branch.workingHoursStart,
    workingHoursEnd: branch.workingHoursEnd,
    address: branch.address,
    latitude: branch.latitude,
    longitude: branch.longitude,
    googlePlaceId: branch.googlePlaceId,
  };

  return about;
});

// List tenant branches with status filtering
// WHY: Strictly gates the ?includeDraft=true flag to OWNER / Service token holders.
server.get('/tenants/:id/branches', async (request, reply) => {
  const { id } = request.params as any;
  const { includeDraft } = request.query as any;

  let showDrafts = false;
  if (includeDraft === 'true') {
    try {
      await verifyTenantOwnerOrInternal(request, reply, id);
      showDrafts = true;
    } catch (e) {
      // Ignored for guest-facing queries; unauthorized calls silently get active-only branches
      showDrafts = false;
    }
  }

  const branches = await prisma.branch.findMany({
    where: {
      tenantId: id,
      status: showDrafts ? undefined : BranchStatus.ACTIVE,
    },
  });

  return branches;
});

// Assign roles
// WHY: Requires valid owner permissions or internal token.
server.post('/tenants/:id/roles', async (request, reply) => {
  const { id } = request.params as any;
  await verifyTenantOwnerOrInternal(request, reply, id);

  const { userId, role, branchId } = request.body as any;

  if (!userId || !role) {
    reply.status(400);
    const err = new Error('userId and role are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Validate role enum
  if (!Object.values(UserRole).includes(role)) {
    reply.status(400);
    const err = new Error('Invalid user role value');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Validation: OWNER must have branchId = null, scoped roles require valid branchId
  if (role === UserRole.OWNER) {
    if (branchId !== null && branchId !== undefined) {
      reply.status(400);
      const err = new Error('Owner role must not have a branchId');
      (err as any).statusCode = 400;
      (err as any).code = 'BAD_REQUEST';
      throw err;
    }
  } else {
    if (!branchId) {
      reply.status(400);
      const err = new Error('Scoped roles require a branchId');
      (err as any).statusCode = 400;
      (err as any).code = 'BAD_REQUEST';
      throw err;
    }

    // Verify branch belongs to tenant
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, tenantId: id },
    });
    if (!branch) {
      reply.status(400);
      const err = new Error('Branch does not belong to this tenant');
      (err as any).statusCode = 400;
      (err as any).code = 'BAD_REQUEST';
      throw err;
    }
  }

  // F-141: the target user must actually belong to this tenant.
  //
  // This is the WRITE side of the leak F-076 closed on the read side. `RoleAssignment.userId` is a
  // scalar with no foreign key, and this route previously checked only that the field was present —
  // so a tenant-A owner could grant a role against a tenant-B user, or against a userId belonging to
  // nobody at all. F-076 then had to filter those rows out at read time; this stops them existing.
  //
  // WHY THE STRICT RULE IS CORRECT, established from data rather than assumed: across both databases
  // there were **zero** cross-tenant grants, so no workflow depends on them. Dangling grants did
  // exist, but they were regression residue (synthetic ids like `owner-1`), not a real pattern — and
  // the real flow is user-first, since a user is created by OTP before any role is granted. The
  // platform has no mechanism for pre-assigning a role to someone unregistered, so there is no
  // invite path this would break.
  //
  // WHY THE INTERNAL KEY GETS NO EXEMPTION. Bootstrap creates the user first (that is how JBC's
  // owner was provisioned), so the key buys nothing here — and exempting it would leave open exactly
  // the hole F-076 had to defend against, which is the same reasoning F-090 and F-119 applied.
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });
  if (!targetUser) {
    reply.status(404);
    const err = new Error('User not found');
    (err as any).statusCode = 404;
    (err as any).code = 'USER_NOT_FOUND';
    throw err;
  }
  if (targetUser.tenantId !== id) {
    // 403 rather than 404: the user exists, and saying so is not a leak to a caller who already
    // holds this tenant's credentials. Reporting 404 here would be a lie that makes a real
    // misconfiguration look like a typo.
    reply.status(403);
    const err = new Error('Forbidden: user does not belong to this tenant');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  // F-115: this genuinely upserts now. It previously called `create` under a comment
  // claiming to upsert, with no unique constraint behind it, so re-running an assignment
  // inserted a second row instead of replacing the first — which is how correcting a
  // wrong role, or swapping F-116's placeholder number for JBC's real one, would have
  // silently produced duplicates.
  //
  // Keyed on (userId, tenantId, branchId), so re-assigning the same user at the same
  // scope updates the role in place and still returns 200. The matching database index
  // is NULLS NOT DISTINCT: OWNER rows carry branchId = null, and a plain unique index
  // treats those nulls as distinct, so it would not catch a repeat owner assignment.
  //
  // Two different users may both hold OWNER on one tenant (F-117) — the key includes
  // userId precisely so that stays possible.
  //
  // WHY RAW SQL AND NOT prisma.roleAssignment.upsert. The typed upsert was tried first and
  // cannot serve the OWNER path. Prisma 5.14 generates the compound-unique input with
  // `branchId: string`, not `string | null`, so passing the null branchId that every OWNER
  // row carries throws PrismaClientValidationError at runtime — confirmed by running it,
  // not inferred. It typechecks only because the body is read as `any`, which is precisely
  // why this needed a runtime check. ON CONFLICT resolves against the NULLS NOT DISTINCT
  // index, so the null-branch owner case dedupes correctly here.
  //
  // `id` and `updatedAt` are supplied explicitly: Prisma applies @default(uuid()) and
  // @updatedAt in its own client layer, and neither column has a database-level default
  // (see the Phase 3 migration), so a raw INSERT must provide both.
  const rows = await prisma.$queryRaw<any[]>`
    INSERT INTO "RoleAssignment" ("id", "userId", "tenantId", "branchId", "role", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, ${id}, ${branchId || null}, ${role}::"UserRole", now(), now())
    ON CONFLICT ("userId", "tenantId", "branchId")
    DO UPDATE SET "role" = EXCLUDED."role", "updatedAt" = now()
    RETURNING *
  `;

  return rows[0];
});

// Retrieve User Roles (called by Identity service at login/refresh)
//
// F-076: this previously queried by `userId` alone, with no tenant filter. Every issued JWT's
// `roles` claim comes from here, so an unfiltered result meant a token's role list was not
// tenant-scoped at source. That was contained only by `User` being @@unique([phone, tenantId]) —
// an assumption `RoleAssignment.userId` does not enforce, since it is a scalar with no foreign key
// and `POST /tenants/:id/roles` never checks that the target user belongs to the tenant (F-141).
//
// WHY THE TENANT IS RESOLVED FROM THE USER, NOT ACCEPTED FROM THE CALLER. A `?tenantId=` parameter
// was the obvious alternative and is deliberately rejected: this route has no authentication at all
// (F-140), so a caller-supplied tenant would be trivially spoofable and the filter would be
// decorative. Resolving it from the user row cannot be influenced by the caller, needs no change at
// any of the three call sites, and is exactly what the sibling twenty lines below already does —
// `/users/:userId/branches/:branchId/check` resolves the tenant from the branch, then filters.
// F-140: this had no authentication of any kind — anyone able to reach the service could read any
// user's full role set by id. F-076 tenant-filtered it, which scopes WHAT is returned but says
// nothing about WHO may ask; that is this guard's job. Internal-key-only because all three callers
// are service-to-service (identity-auth's otp-verify, google-verify and refresh) and there is no
// user-facing consumer.
server.get('/users/:id/roles', async (request, reply) => {
  requireInternalKey(request, reply);

  const { id } = request.params as any;

  // Resolve the owning tenant from the user itself, before any role data is read.
  const user = await prisma.user.findUnique({
    where: { id },
    select: { tenantId: true },
  });

  // No user row means no roles can be legitimately scoped to anything. Returning an empty set
  // rather than 404 is deliberate: a login must not hard-fail over a missing role record, and all
  // three callers already fall back to `roles = []` on any non-OK response, so this preserves
  // their existing behaviour instead of changing it.
  const assignments = user
    ? await prisma.roleAssignment.findMany({
        where: { userId: id, tenantId: user.tenantId },
      })
    : [];

  // Flat string tokens format, e.g. "owner", "branch_manager:branch-uuid".
  //
  // WHY `OWNER` IS STILL A BARE 'owner' AND NOT 'owner:<tenantId>'. Encoding the tenant into the
  // token was considered and rejected on evidence: F-117 established that every consumer tests
  // membership with `roles.includes('owner')` — slot-engine `:179`/`:2775`, payment `:992`,
  // identity-auth `:76`, admin-web `:220`/`:513`, tenant-management `:50` — so changing the format
  // breaks six call sites across four services and admin-web at once. It would also buy nothing:
  // now that the query is tenant-filtered, every assignment returned is by construction from the
  // resolved tenant, so there is no ambiguity left for the string to resolve. The tenant is instead
  // surfaced explicitly below, which is strictly more informative than encoding it in a token.
  const roles = assignments.map((ra) => {
    if (ra.role === UserRole.OWNER) {
      return 'owner';
    }
    return `${ra.role.toLowerCase()}:${ra.branchId}`;
  });

  return {
    userId: id,
    // F-076: the tenant these roles were resolved against, so callers never have to infer it.
    // Null when the user does not exist, which is also when `roles` is empty.
    tenantId: user?.tenantId ?? null,
    roles,
    roleAssignments: assignments,
  };
});

// Scoped Branch Access Verification Endpoint
// WHY: Performs tenant-level owner scoping (null branchId matches all branch requests).
//
// F-140: also had zero authentication, and unlike its sibling it has **no production caller at all**
// — verified, its only callers are the regression suite, and slot-engine merely cites it in a comment
// as the convention `requireBookingAccess` follows rather than calling it. Guarded anyway: an
// unauthenticated caller could otherwise probe whether an arbitrary user can reach an arbitrary
// branch. Whether a route with no callers should exist is a separate question, deliberately not
// answered here.
server.get('/users/:userId/branches/:branchId/check', async (request, reply) => {
  requireInternalKey(request, reply);

  const { userId, branchId } = request.params as any;

  // Resolve branch tenantId
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });
  if (!branch) {
    reply.status(404);
    const err = new Error('Branch not found');
    (err as any).statusCode = 404;
    (err as any).code = 'BRANCH_NOT_FOUND';
    throw err;
  }

  const assignments = await prisma.roleAssignment.findMany({
    where: { userId, tenantId: branch.tenantId },
  });

  // Owner scoping checks: Owner role automatically grants access to all branches under the tenant.
  const hasAccess = assignments.some((ra) => {
    if (ra.role === UserRole.OWNER) {
      return true;
    }
    return ra.branchId === branchId;
  });

  return { hasAccess };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3003;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Tenant Management service running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
