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
  const authHeader = request.headers['authorization'];
  const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
  
  if (!authHeader || authHeader !== `Bearer ${internalKey}`) {
    reply.status(401);
    const err = new Error('Unauthorized platform access');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

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
server.get('/users/:id/roles', async (request) => {
  const { id } = request.params as any;
  const assignments = await prisma.roleAssignment.findMany({
    where: { userId: id },
  });

  // Flat string tokens format, e.g. "owner", "branch_manager:branch-uuid"
  const roles = assignments.map((ra) => {
    if (ra.role === UserRole.OWNER) {
      return 'owner';
    }
    return `${ra.role.toLowerCase()}:${ra.branchId}`;
  });

  return {
    userId: id,
    roles,
    roleAssignments: assignments,
  };
});

// Scoped Branch Access Verification Endpoint
// WHY: Performs tenant-level owner scoping (null branchId matches all branch requests).
server.get('/users/:userId/branches/:branchId/check', async (request, reply) => {
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
