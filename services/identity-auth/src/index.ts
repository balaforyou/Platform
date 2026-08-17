import fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import crypto from 'crypto';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, UserType } from '@badminton/database';

const server = fastify({ logger: true });

// WHY: Register the response envelope plugin globally so all success and error responses
// are automatically wrapped to follow the API standards.
server.register(responseEnvelopePlugin);

// WHY: Register cookie support for reading/writing the httpOnly refresh token.
server.register(fastifyCookie);

// WHY: Register JWT support for generating and verifying access tokens.
server.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'test-jwt-secret-key-123-abcdefg',
});

const prisma = new PrismaClient();

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) {
    return '+' + cleaned.replace(/\D/g, '');
  }
  let digits = cleaned.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return '+91' + digits;
  }
  return '+' + digits;
}

/**
 * Rejects anything that is not the platform-internal service key.
 *
 * WHY THIS IS A HELPER (F-119): this check was inlined in `PATCH /users/:id/type` and had to be
 * applied to a second route, so it is extracted rather than copied — mirroring slot-engine's
 * existing named `requireInternalKey` (`slot-engine/src/index.ts:105`) rather than introducing a
 * third shape. Behaviour is deliberately identical to the inline version it replaces, including
 * setting the reply status before throwing, so the 401 envelope callers already assert is unchanged.
 *
 * Call this BEFORE reading the body or normalizing input. F-090/F-045/F-071: authenticating after a
 * parse or an existence check leaves a pre-auth code path an unauthenticated caller can still reach.
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

// Helper endpoint for health checks
server.get('/health', async () => {
  // F-077: BUILD_GIT_SHA is baked in at image build; the deploy verifier compares it
    // against the SHA it intended to ship. 'unknown' locally, where there is no build step.
    return { status: 'ok', service: 'identity-auth', version: process.env.BUILD_GIT_SHA ?? 'unknown' };
});

server.get('/users/lookup', async (request, reply) => {
  const { tenantId, phone: rawPhone } = request.query as any;
  if (!tenantId || !rawPhone) {
    reply.status(400);
    const err = new Error('tenantId and phone are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  let decoded: any;
  try {
    decoded = await request.jwtVerify();
  } catch {
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  if (decoded.tenantId !== tenantId) {
    reply.status(403);
    const err = new Error('Forbidden: Tenant mismatch');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  const roles = decoded.roles || [];
  const isAdmin = roles.includes('owner') || roles.some((role: string) => role.startsWith('branch_manager:'));
  if (!isAdmin) {
    reply.status(403);
    const err = new Error('Forbidden: Admin role required');
    (err as any).statusCode = 403;
    (err as any).code = 'FORBIDDEN';
    throw err;
  }

  const phone = normalizePhone(rawPhone);
  if (!/^\+91[6-9]\d{9}$/.test(phone)) {
    reply.status(400);
    const err = new Error('Phone must normalize to a valid 10-digit Indian mobile number');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_PHONE';
    throw err;
  }

  const user = await prisma.user.findUnique({
    where: { phone_tenantId: { phone, tenantId } },
    select: { id: true, phone: true, userType: true },
  });
  if (!user) {
    reply.status(404);
    const err = new Error('User not found for this tenant');
    (err as any).statusCode = 404;
    (err as any).code = 'USER_NOT_FOUND';
    throw err;
  }

  return user;
});

// Endpoint to request an OTP (Creates an OtpRequest record and rate-limits requests)
server.post('/auth/otp/request', async (request, reply) => {
  const { phone: rawPhone, tenantId } = request.body as any;
  if (!rawPhone || !tenantId) {
    reply.status(400);
    const err = new Error('phone and tenantId are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const phone = normalizePhone(rawPhone);

  const ip = request.ip;
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

  // 1. Cooldown verification: Limit consecutive requests to the same number to 1 per minute.
  // WHY: Protect against immediate sequential spamming.
  const recentRequest = await prisma.otpRequest.findFirst({
    where: {
      phone,
      tenantId,
      createdAt: { gte: oneMinuteAgo },
    },
  });
  if (recentRequest) {
    reply.status(429);
    const err = new Error('Cooldown active. Please wait 60 seconds.');
    (err as any).statusCode = 429;
    (err as any).code = 'COOLDOWN_ACTIVE';
    throw err;
  }

  // 2. Phone Rate Limiting: Max 3 requests per 10 minutes per number.
  // WHY: Prevents API abuse and controls SMS gateway charges.
  const phoneRequestsCount = await prisma.otpRequest.count({
    where: {
      phone,
      tenantId,
      createdAt: { gte: tenMinutesAgo },
    },
  });
  if (phoneRequestsCount >= 3) {
    reply.status(429);
    const err = new Error('Rate limit exceeded for this mobile number.');
    (err as any).statusCode = 429;
    (err as any).code = 'RATE_LIMIT_EXCEEDED';
    throw err;
  }

  // 3. IP Rate Limiting: Max 10 requests per 10 minutes per IP address.
  // WHY: Mitigates distributed spam attempts.
  const ipRequestsCount = await prisma.otpRequest.count({
    where: {
      ip,
      createdAt: { gte: tenMinutesAgo },
    },
  });
  if (ipRequestsCount >= 10) {
    reply.status(429);
    const err = new Error('Rate limit exceeded for this IP address.');
    (err as any).statusCode = 429;
    (err as any).code = 'IP_RATE_LIMIT_EXCEEDED';
    throw err;
  }

  // Generate 6-digit OTP code
  const code = '123456'; // Default code for testing and local environment
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes TTL

  // 4. Secure Production Fallback:
  // WHY: If NODE_ENV is production and credentials are missing, we MUST fail closed and refuse login rather than exposing log bypasses.
  if (process.env.NODE_ENV === 'production') {
    const msg91Key = process.env.MSG91_AUTH_KEY;
    if (!msg91Key) {
      server.log.error('MSG91_AUTH_KEY is not configured in production. Failing closed.');
      reply.status(500);
      const err = new Error('SMS Gateway Configuration Error');
      (err as any).statusCode = 500;
      (err as any).code = 'GATEWAY_ERROR';
      throw err;
    }
    // Perform MSG91 API dispatch here in production
  } else {
    // Development fallback: Log the OTP code to console if credentials are absent.
    console.log(`[DEV OTP] Generated code ${code} for phone ${phone}`);
  }

  // Save the verification request
  await prisma.otpRequest.create({
    data: {
      phone,
      tenantId,
      code,
      ip,
      expiresAt,
    },
  });

  return { success: true, message: 'OTP request initiated' };
});

// Endpoint to verify OTP and issue session tokens (Public signup defaults userType to GUEST)
server.post('/auth/otp/verify', async (request, reply) => {
  const { phone: rawPhone, tenantId, code, googleId, email } = request.body as any;
  if (!rawPhone || !tenantId || !code) {
    reply.status(400);
    const err = new Error('phone, tenantId, and code are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const phone = normalizePhone(rawPhone);

  const now = new Date();

  // Find latest active OTP request
  const otpReq = await prisma.otpRequest.findFirst({
    where: {
      phone,
      tenantId,
      expiresAt: { gte: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otpReq) {
    reply.status(400);
    const err = new Error('OTP request expired or invalid');
    (err as any).statusCode = 400;
    (err as any).code = 'OTP_EXPIRED_OR_INVALID';
    throw err;
  }

  // Verify code
  if (otpReq.code !== code) {
    const updated = await prisma.otpRequest.update({
      where: { id: otpReq.id },
      data: { attempts: otpReq.attempts + 1 },
    });

    // Invalidate the request after 3 failed attempts
    if (updated.attempts >= 3) {
      await prisma.otpRequest.delete({ where: { id: otpReq.id } });
      reply.status(400);
      const err = new Error('OTP verification attempts exceeded. Please request a new code.');
      (err as any).statusCode = 400;
      (err as any).code = 'OTP_ATTEMPTS_EXCEEDED';
      throw err;
    }

    reply.status(400);
    const err = new Error('Invalid OTP code');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_OTP_CODE';
    throw err;
  }

  // OTP verified successfully. Delete the code to prevent replay attacks.
  await prisma.otpRequest.delete({ where: { id: otpReq.id } });

  // Check or register the User
  let user = await prisma.user.findUnique({
    where: { phone_tenantId: { phone, tenantId } },
  });

  let isNewSignup = false;

  if (!user) {
    isNewSignup = true;
    
    // WHY: Public OTP signup always creates GUEST accounts by default to secure the trust boundary.
    // Client cannot override this. Promotion only happens through authenticated internal APIs.
    user = await prisma.user.create({
      data: {
        phone,
        tenantId,
        userType: UserType.GUEST,
        isPhoneVerified: true,
        googleId,
        email,
      },
    });

    // Invite Resolution & History Linking
    // WHY: Check if this phone has a PendingInvite. If yes, resolve it and tell Slot Engine.
    const invite = await prisma.pendingInvite.findUnique({
      where: { phone_tenantId: { phone, tenantId } },
    });
    if (invite) {
      await prisma.pendingInvite.delete({ where: { id: invite.id } });

      // Dispatch cross-service resolution to Slot Engine
      const internalKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
      const slotEngineUrl = process.env.SLOT_ENGINE_URL || 'http://localhost:3001';
      try {
        await fetch(`${slotEngineUrl}/bookings/resolve-invites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalKey}`,
          },
          body: JSON.stringify({ phone, userId: user.id, tenantId }),
        });
      } catch (e) {
        // Log warning but don't block registration if Slot Engine is down in dev
        server.log.warn('Could not call resolve-invites on Slot Engine: ' + String(e));
      }
    }
  }

  // Create session
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: sessionExpiry,
    },
  });

  // Call Tenant Management to fetch roles/entitlements
  let roles: string[] = [];
  const tenantServiceUrl = process.env.TENANT_SERVICE_URL || 'http://localhost:3003';
  try {
    const res = await fetch(`${tenantServiceUrl}/users/${user.id}/roles`);
    if (res.ok) {
      const body = await res.json() as any;
      roles = body?.data?.roles || [];
    }
  } catch (e) {
    // WHY: Fail closed. Default to empty array on network failure.
    roles = [];
  }

  // Sign JWT Access Token (15 mins TTL)
  const accessToken = server.jwt.sign({
    userId: user.id,
    tenantId,
    phone: user.phone,
    userType: user.userType,
    roles,
  }, { expiresIn: '15m' });

  // Set httpOnly refresh cookie
  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    sameSite: 'lax',
  });

  reply.status(201);
  return { accessToken, isNewSignup, user };
});

// Endpoint to verify Google OAuth ID Tokens (Only available for MEMBERS/STAFF)
server.post('/auth/google/verify', async (request, reply) => {
  const { googleIdToken, tenantId } = request.body as any;
  if (!googleIdToken || !tenantId) {
    reply.status(400);
    const err = new Error('googleIdToken and tenantId are required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Mock Google ID token verification for development/testing
  let email = '';
  let googleId = '';
  if (googleIdToken.startsWith('mock-google-token-')) {
    email = googleIdToken.replace('mock-google-token-', '');
    googleId = `google-id-${email}`;
  } else {
    reply.status(400);
    const err = new Error('Invalid Google ID token');
    (err as any).statusCode = 400;
    (err as any).code = 'INVALID_TOKEN';
    throw err;
  }

  // Retrieve user by Google ID or email
  const user = await prisma.user.findFirst({
    where: {
      tenantId,
      OR: [
        { googleId },
        { email },
      ],
    },
  });

  if (!user) {
    // Transient signup path. Require phone verification first.
    reply.status(400);
    const err = new Error('Phone verification required to complete Google signup');
    (err as any).statusCode = 400;
    (err as any).code = 'PHONE_VERIFICATION_REQUIRED';
    (err as any).details = { email, googleId };
    throw err;
  }

  // WHY: Google sign-in is restricted to MEMBERS and STAFF to control SMS costs.
  // GUEST accounts are rejected with 403 Forbidden.
  if (user.userType === UserType.GUEST) {
    reply.status(403);
    const err = new Error('Google authentication is restricted to members only.');
    (err as any).statusCode = 403;
    (err as any).code = 'GOOGLE_LOGIN_ONLY_FOR_MEMBERS';
    throw err;
  }

  // Create session
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt: sessionExpiry,
    },
  });

  // Call Tenant service for roles
  let roles: string[] = [];
  const tenantServiceUrl = process.env.TENANT_SERVICE_URL || 'http://localhost:3003';
  try {
    const res = await fetch(`${tenantServiceUrl}/users/${user.id}/roles`);
    if (res.ok) {
      const body = await res.json() as any;
      roles = body?.data?.roles || [];
    }
  } catch (e) {
    roles = [];
  }

  // Sign JWT
  const accessToken = server.jwt.sign({
    userId: user.id,
    tenantId,
    phone: user.phone,
    userType: user.userType,
    roles,
  }, { expiresIn: '15m' });

  reply.setCookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    sameSite: 'lax',
  });

  return { accessToken, user };
});

// Endpoint to rotate session and issue new access tokens
server.post('/auth/refresh', async (request, reply) => {
  const refreshToken = request.cookies['refresh_token'];
  if (!refreshToken) {
    reply.status(401);
    const err = new Error('Missing refresh token cookie');
    (err as any).statusCode = 401;
    (err as any).code = 'MISSING_REFRESH_TOKEN';
    throw err;
  }

  const session = await prisma.authSession.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session || session.revoked || session.expiresAt < new Date()) {
    reply.status(401);
    const err = new Error('Invalid or expired refresh token');
    (err as any).statusCode = 401;
    (err as any).code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }

  // Rotate Refresh Token
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      refreshToken: newRefreshToken,
      expiresAt: newExpiry,
    },
  });

  // Call Tenant service for roles
  let roles: string[] = [];
  const tenantServiceUrl = process.env.TENANT_SERVICE_URL || 'http://localhost:3003';
  try {
    const res = await fetch(`${tenantServiceUrl}/users/${session.userId}/roles`);
    if (res.ok) {
      const body = await res.json() as any;
      roles = body?.data?.roles || [];
    }
  } catch (e) {
    roles = [];
  }

  // Sign new JWT
  const accessToken = server.jwt.sign({
    userId: session.userId,
    tenantId: session.user.tenantId,
    phone: session.user.phone,
    userType: session.user.userType,
    roles,
  }, { expiresIn: '15m' });

  reply.setCookie('refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    sameSite: 'lax',
  });

  return { accessToken };
});

// Endpoint to logout (Invalidates session)
server.post('/auth/logout', async (request, reply) => {
  const refreshToken = request.cookies['refresh_token'];
  if (refreshToken) {
    await prisma.authSession.updateMany({
      where: { refreshToken },
      data: { revoked: true },
    });
  }

  reply.clearCookie('refresh_token', {
    httpOnly: true,
    path: '/',
  });

  return { success: true };
});

// Internal endpoint to retrieve User details
server.get('/users/:id', async (request, reply) => {
  const { id } = request.params as any;
  const user = await prisma.user.findUnique({
    where: { id },
  });
  if (!user) {
    reply.status(404);
    throw new Error('User not found');
  }
  return user;
});

// Endpoint to create a PendingInvite placeholder — internal service-to-service only.
//
// F-119: this route previously had NO authentication of any kind, so any unauthenticated caller
// could write PendingInvite rows for arbitrary phone/tenant pairs. That was an original omission
// rather than a regression: the Phase 2 spec named only `POST /bookings/resolve-invites` and
// `PATCH /users/:id/type` as internal routes and specified this one with no auth requirement at all.
//
// WHY INTERNAL-KEY AND NOT A USER JWT. The rows this writes are consumed at signup (see the invite
// branch in /auth/otp/verify) to dispatch `POST /bookings/resolve-invites`, which is itself
// internal-key-only (`slot-engine/src/index.ts:3120-3121`). Leaving the producer open while the
// consumer is locked was the real inconsistency. There is also no production caller to preserve —
// the only caller in the codebase is the identity-auth regression fixture — and the realistic
// production wiring (slot-engine registering the invite from co-player data it already holds when a
// booking is created) is service-to-service, so this is the guard that wiring will need too.
server.post('/users/resolve-invite', async (request, reply) => {
  requireInternalKey(request, reply);

  const { tenantId, phone: rawPhone } = request.body as any;
  const phone = normalizePhone(rawPhone);

  // Upsert to prevent duplicate conflicts
  const invite = await prisma.pendingInvite.upsert({
    where: { phone_tenantId: { phone, tenantId } },
    update: {},
    create: { phone, tenantId },
  });

  return invite;
});

// Internal endpoint to update userType (Promotion to MEMBER or STAFF)
// WHY: Requires secure internal service token authentication. Prevents clients from spoofing user types.
server.patch('/users/:id/type', async (request, reply) => {
  // F-119: extracted to the shared helper rather than left inlined, so this route and
  // /users/resolve-invite cannot drift apart. Behaviour is unchanged — jwt-session.regression.ts
  // (`:107`/`:116`) asserts both the 401 and the keyed success path.
  requireInternalKey(request, reply);

  const { id } = request.params as any;
  const { userType } = request.body as any;

  if (!userType || !Object.values(UserType).includes(userType)) {
    reply.status(400);
    const err = new Error('Invalid userType value');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const user = await prisma.user.update({
    where: { id },
    data: { userType: userType as UserType },
  });

  return user;
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3002;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Identity Auth service running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
