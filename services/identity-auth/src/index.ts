import fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import crypto from 'crypto';
import { responseEnvelopePlugin } from '@badminton/shared-middleware';
import { PrismaClient, UserType } from '@badminton/database';
import {
  verifyGoogleIdToken,
  resolveAdminUser,
  googleRemoteJwks,
  ADMIN_ROLES,
  type VerifiedGoogleIdentity,
} from './adminGoogleAuth';
import {
  resolveRpConfig,
  newCredentialRow,
  assertCounterProgress,
  toAuthenticatorCredential,
} from './adminWebAuthn';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

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
  const cleaned = phone.replace(/[\s\-()]/g, '');
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
    // F-140: this endpoint is now internal-key-only. Read the key here rather than relying on
    // an outer binding, so each call site is self-contained.
    const roleKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
    const res = await fetch(`${tenantServiceUrl}/users/${user.id}/roles`, {
      headers: { Authorization: `Bearer ${roleKey}` },
    });
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
    // F-140: this endpoint is now internal-key-only. Read the key here rather than relying on
    // an outer binding, so each call site is self-contained.
    const roleKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
    const res = await fetch(`${tenantServiceUrl}/users/${user.id}/roles`, {
      headers: { Authorization: `Bearer ${roleKey}` },
    });
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

// Shared admin session issuance — used by /auth/admin/google/verify and
// /auth/admin/webauthn/login/verify so the two cannot drift. Creates the AuthSession
// row, pulls the full role array from tenant-management (self-contained internal-key
// read, F-140), signs the 15m access token, and sets the host-only refresh cookie
// (no `domain` attr — admin.elitecourts.duckdns.org gets a naturally isolated session,
// same as index.ts:494-500).
async function issueAdminSession(
  user: { id: string; phone: string | null; email: string | null; userType: UserType },
  tenantId: string,
  reply: any,
): Promise<{ accessToken: string }> {
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { userId: user.id, refreshToken, expiresAt: sessionExpiry },
  });

  let roles: string[] = [];
  const tenantServiceUrl = process.env.TENANT_SERVICE_URL || 'http://localhost:3003';
  try {
    const roleKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
    const res = await fetch(`${tenantServiceUrl}/users/${user.id}/roles`, {
      headers: { Authorization: `Bearer ${roleKey}` },
    });
    if (res.ok) {
      const body = await res.json() as any;
      roles = body?.data?.roles || [];
    }
  } catch (e) {
    roles = [];
  }

  const accessToken = server.jwt.sign({
    userId: user.id,
    tenantId,
    phone: user.phone,
    // F-203: admin-v2's landing page (and the fingerprint prompt) show the signed-in
    // identity; /auth/refresh returns only { accessToken }, so email has to travel in
    // the token to survive a page reload.
    email: user.email,
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

  return { accessToken };
}

// Admin-v2 Google login — real JWKS verification + cross-tenant admin resolution.
// Separate from /auth/google/verify (members/staff, still a mock): different role gate
// (OWNER / BRANCH_MANAGER only), distinct rejection codes, no tenantId in the request
// (it is resolved from the RoleAssignment match). See src/adminGoogleAuth.ts and
// docs/plans/admin-v2-slice1-plan-mode-SIGNED.md §2/§4.
server.post('/auth/admin/google/verify', async (request, reply) => {
  const { googleIdToken } = request.body as any;
  if (!googleIdToken || typeof googleIdToken !== 'string') {
    reply.status(400);
    const err = new Error('googleIdToken is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  // Dev-only fallback for CI/e2e — mints a session for a seeded test admin with no
  // Google round-trip. Gated on its OWN opt-in flag (ADMIN_DEV_LOGIN=true), NOT on
  // NODE_ENV: the deployed demo runs NODE_ENV=development so guest/member OTP can use the
  // fixed 123456 code, and that guest-side UAT convenience must not also unlock an admin
  // auth bypass. Default-off (absent flag = disabled), fail-closed. Production never
  // sets it; CI/e2e do.
  let identity: VerifiedGoogleIdentity;
  if (googleIdToken.startsWith('dev-admin-token-')) {
    if (process.env.ADMIN_DEV_LOGIN !== 'true') {
      reply.status(403);
      const err = new Error('Dev admin login is not enabled in this environment');
      (err as any).statusCode = 403;
      (err as any).code = 'DEV_LOGIN_DISABLED';
      throw err;
    }
    const email = googleIdToken.replace('dev-admin-token-', '').toLowerCase();
    identity = { email, googleId: `dev-admin-${email}` };
    server.log.warn(`[DEV ADMIN LOGIN] Google verification bypassed for ${email}`);
  } else {
    try {
      identity = await verifyGoogleIdToken(googleIdToken, {
        jwks: googleRemoteJwks(),
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
      });
    } catch (e) {
      reply.status(401);
      const err = new Error(e instanceof Error ? e.message : 'Invalid Google ID token');
      (err as any).statusCode = 401;
      (err as any).code = 'INVALID_GOOGLE_TOKEN';
      throw err;
    }
  }

  const resolution = await resolveAdminUser(prisma, identity);
  if (resolution.kind === 'not_found') {
    reply.status(403);
    const err = new Error('No admin account is registered for this Google account.');
    (err as any).statusCode = 403;
    (err as any).code = 'ADMIN_ACCOUNT_NOT_FOUND';
    throw err;
  }
  if (resolution.kind === 'role_excluded') {
    reply.status(403);
    const err = new Error('This account does not have an owner or branch-manager role.');
    (err as any).statusCode = 403;
    (err as any).code = 'ADMIN_ROLE_REQUIRED';
    throw err;
  }
  if (resolution.kind === 'multiple_tenant_match') {
    reply.status(409);
    const err = new Error('This Google account manages more than one tenant; admin sign-in is ambiguous.');
    (err as any).statusCode = 409;
    (err as any).code = 'MULTIPLE_TENANT_MATCH';
    (err as any).details = { tenantIds: resolution.tenantIds };
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: resolution.userId } });
  if (!user) {
    // Row vanished between resolution and read — treat as not found rather than 500.
    reply.status(403);
    const err = new Error('No admin account is registered for this Google account.');
    (err as any).statusCode = 403;
    (err as any).code = 'ADMIN_ACCOUNT_NOT_FOUND';
    throw err;
  }

  const { accessToken } = await issueAdminSession(user, resolution.tenantId, reply);
  return { accessToken, user };
});

// ── Admin-v2 WebAuthn / fingerprint step-up (F-196) ────────────────────────────
// docs/plans/admin-v2-slice1-plan-mode-SIGNED.md §3. Step-up only: a credential is
// enrolled by an already-authenticated admin, and login/verify re-checks the admin
// role gate before issuing a session. The challenge from each /options call is round-
// tripped in a short-lived signed httpOnly cookie (no server-side challenge table).

const WEBAUTHN_CHALLENGE_COOKIE = 'admin_webauthn_challenge';

function setChallengeCookie(reply: any, kind: 'register' | 'auth', challenge: string, userId?: string) {
  const token = server.jwt.sign(
    { purpose: 'webauthn', kind, challenge, userId },
    { expiresIn: '5m' },
  );
  reply.setCookie(WEBAUTHN_CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 5 * 60,
    sameSite: 'lax',
  });
}

function readChallengeCookie(request: any, reply: any, kind: 'register' | 'auth'): { challenge: string; userId?: string } {
  const raw = request.cookies[WEBAUTHN_CHALLENGE_COOKIE];
  const fail = () => {
    reply.status(400);
    const err = new Error('WebAuthn challenge is missing or expired — restart the ceremony.');
    (err as any).statusCode = 400;
    (err as any).code = 'WEBAUTHN_CHALLENGE_INVALID';
    return err;
  };
  if (!raw) throw fail();
  let decoded: any;
  try {
    decoded = server.jwt.verify(raw);
  } catch {
    throw fail();
  }
  if (decoded?.purpose !== 'webauthn' || decoded?.kind !== kind || typeof decoded?.challenge !== 'string') {
    throw fail();
  }
  return { challenge: decoded.challenge, userId: decoded.userId };
}

async function requireAdminJwt(request: any, reply: any): Promise<any> {
  try {
    return await request.jwtVerify();
  } catch {
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }
}

// Begin enrolling a fingerprint/passkey for the currently signed-in admin.
server.post('/auth/admin/webauthn/register/options', async (request, reply) => {
  const decoded = await requireAdminJwt(request, reply);
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    include: { webAuthnCredentials: true },
  });
  if (!user) {
    reply.status(401);
    const err = new Error('Invalid or expired token');
    (err as any).statusCode = 401;
    (err as any).code = 'UNAUTHORIZED';
    throw err;
  }

  const rp = resolveRpConfig();
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: user.webAuthnCredentials.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  setChallengeCookie(reply, 'register', options.challenge, user.id);
  return options;
});

// Finish enrollment: verify the attestation and persist the credential.
server.post('/auth/admin/webauthn/register/verify', async (request, reply) => {
  const decoded = await requireAdminJwt(request, reply);
  const { response, deviceLabel } = request.body as any;
  if (!response) {
    reply.status(400);
    const err = new Error('response is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const challengeState = readChallengeCookie(request, reply, 'register');
  if (challengeState.userId !== decoded.userId) {
    reply.status(400);
    const err = new Error('WebAuthn challenge does not belong to this session.');
    (err as any).statusCode = 400;
    (err as any).code = 'WEBAUTHN_CHALLENGE_INVALID';
    throw err;
  }

  const rp = resolveRpConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeState.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    reply.status(400);
    const err = new Error(e instanceof Error ? e.message : 'WebAuthn registration verification failed');
    (err as any).statusCode = 400;
    (err as any).code = 'WEBAUTHN_VERIFICATION_FAILED';
    throw err;
  }
  if (!verification.verified) {
    reply.status(400);
    const err = new Error('WebAuthn registration could not be verified.');
    (err as any).statusCode = 400;
    (err as any).code = 'WEBAUTHN_VERIFICATION_FAILED';
    throw err;
  }

  const row = newCredentialRow(decoded.userId, verification, deviceLabel);
  try {
    await prisma.webAuthnCredential.create({ data: row });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      reply.status(409);
      const err = new Error('This authenticator is already enrolled.');
      (err as any).statusCode = 409;
      (err as any).code = 'WEBAUTHN_CREDENTIAL_EXISTS';
      throw err;
    }
    throw e;
  }

  reply.clearCookie(WEBAUTHN_CHALLENGE_COOKIE, { path: '/' });
  return { verified: true, credentialId: row.credentialId, deviceLabel: row.deviceLabel };
});

// Begin a fingerprint fast-path login. Discoverable credentials — the authenticator
// tells us which account, so no email is collected up front.
server.post('/auth/admin/webauthn/login/options', async (_request, reply) => {
  const rp = resolveRpConfig();
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: [],
    userVerification: 'preferred',
  });
  setChallengeCookie(reply, 'auth', options.challenge);
  return options;
});

// Finish the fast-path login: verify the assertion, re-check the admin gate, issue a session.
server.post('/auth/admin/webauthn/login/verify', async (request, reply) => {
  const { response } = request.body as any;
  if (!response?.id) {
    reply.status(400);
    const err = new Error('response is required');
    (err as any).statusCode = 400;
    (err as any).code = 'BAD_REQUEST';
    throw err;
  }

  const challengeState = readChallengeCookie(request, reply, 'auth');

  const credential = await prisma.webAuthnCredential.findUnique({ where: { credentialId: response.id } });
  if (!credential) {
    reply.status(401);
    const err = new Error('This authenticator is not enrolled.');
    (err as any).statusCode = 401;
    (err as any).code = 'WEBAUTHN_CREDENTIAL_NOT_FOUND';
    throw err;
  }

  const rp = resolveRpConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeState.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: toAuthenticatorCredential(credential),
      requireUserVerification: false,
    });
  } catch (e) {
    reply.status(401);
    const err = new Error(e instanceof Error ? e.message : 'WebAuthn authentication verification failed');
    (err as any).statusCode = 401;
    (err as any).code = 'WEBAUTHN_VERIFICATION_FAILED';
    throw err;
  }
  if (!verification.verified) {
    reply.status(401);
    const err = new Error('WebAuthn assertion could not be verified.');
    (err as any).statusCode = 401;
    (err as any).code = 'WEBAUTHN_VERIFICATION_FAILED';
    throw err;
  }

  // Cloned-authenticator replay guard (throws CounterRegressionError → 401).
  assertCounterProgress(credential.counter, verification.authenticationInfo.newCounter);
  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  });

  const user = await prisma.user.findUnique({ where: { id: credential.userId } });
  if (!user) {
    reply.status(401);
    const err = new Error('This authenticator is not enrolled.');
    (err as any).statusCode = 401;
    (err as any).code = 'WEBAUTHN_CREDENTIAL_NOT_FOUND';
    throw err;
  }

  // Re-check the admin gate — the role could have been revoked since enrolment.
  const adminAssignments = await prisma.roleAssignment.count({
    where: { userId: user.id, tenantId: user.tenantId, role: { in: ADMIN_ROLES } },
  });
  if (adminAssignments === 0) {
    reply.status(403);
    const err = new Error('This account no longer has an owner or branch-manager role.');
    (err as any).statusCode = 403;
    (err as any).code = 'ADMIN_ROLE_REQUIRED';
    throw err;
  }

  const { accessToken } = await issueAdminSession(user, user.tenantId, reply);
  reply.clearCookie(WEBAUTHN_CHALLENGE_COOKIE, { path: '/' });
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
    // F-140: internal-key-only, as above.
    const roleKey = process.env.INTERNAL_SERVICE_KEY || 'test-service-key';
    const res = await fetch(`${tenantServiceUrl}/users/${session.userId}/roles`, {
      headers: { Authorization: `Bearer ${roleKey}` },
    });
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
    // F-203: carried so admin-v2's landing page survives a reload (silent refresh
    // returns only { accessToken }). Ignored by every other consumer.
    email: session.user.email,
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
