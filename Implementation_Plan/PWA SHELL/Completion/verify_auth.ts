
const caddyUrl = 'http://localhost:8080';
const tenantId = '11111111-1111-1111-1111-111111111111';
const phone = '9999999999';

// Helper to decode JWT
function decodeJwt(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(payload);
}

async function verifyAuthFlows() {
  console.log('=== STARTING AUTH FLOW DIAGNOSTIC VERIFICATION ===\n');

  // =========================================================================
  // 1. Mobile OTP Request
  // =========================================================================
  console.log('--- Step 1: Requesting OTP via Caddy Proxy ---');
  const reqOtpRes = await fetch(`${caddyUrl}/api/identity/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, tenantId }),
  });
  const reqOtpBody = await reqOtpRes.json() as any;
  console.log(`Response Status: ${reqOtpRes.status}`);
  console.log(`Response Body: ${JSON.stringify(reqOtpBody, null, 2)}\n`);

  // =========================================================================
  // 2. Mobile OTP Verification & Cookie Extraction
  // =========================================================================
  console.log('--- Step 2: Verifying OTP with code "123456" ---');
  const verifyOtpRes = await fetch(`${caddyUrl}/api/identity/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456', tenantId }),
  });
  const verifyOtpBody = await verifyOtpRes.json() as any;
  const cookies = verifyOtpRes.headers.getSetCookie ? verifyOtpRes.headers.getSetCookie() : [];
  
  console.log(`Response Status: ${verifyOtpRes.status}`);
  console.log(`Set-Cookie Headers:`, JSON.stringify(cookies, null, 2));
  console.log(`Response Body: ${JSON.stringify(verifyOtpBody, null, 2)}`);

  const otpJwt = verifyOtpBody?.data?.accessToken || verifyOtpBody?.accessToken;
  if (otpJwt) {
    console.log(`Decoded JWT Claims (OTP Login):`, JSON.stringify(decodeJwt(otpJwt), null, 2));
  }
  console.log('\n');

  // =========================================================================
  // 3. Silent Token Refresh via httpOnly cookie
  // =========================================================================
  console.log('--- Step 3: Refreshing session silently forwarding cookies ---');
  const refreshRes = await fetch(`${caddyUrl}/api/identity/auth/refresh`, {
    method: 'POST',
    headers: {
      // Forward the cookie headers extracted from the login response
      'Cookie': cookies.map(c => c.split(';')[0]).join('; ')
    }
  });
  const refreshBody = await refreshRes.json() as any;
  console.log(`Response Status: ${refreshRes.status}`);
  console.log(`Response Body: ${JSON.stringify(refreshBody, null, 2)}\n`);

  // =========================================================================
  // 4. Google Mock Login Verification
  // =========================================================================
  console.log('--- Step 4: Simulating Google login with mock-google-token ---');
  const googleVerifyRes = await fetch(`${caddyUrl}/api/identity/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      googleIdToken: 'mock-google-token-member@example.com',
      tenantId
    })
  });
  const googleVerifyBody = await googleVerifyRes.json() as any;
  console.log(`Response Status: ${googleVerifyRes.status}`);
  console.log(`Response Body: ${JSON.stringify(googleVerifyBody, null, 2)}`);

  const googleJwt = googleVerifyBody?.data?.accessToken || googleVerifyBody?.accessToken;
  if (googleJwt) {
    console.log(`Decoded JWT Claims (Google Login):`, JSON.stringify(decodeJwt(googleJwt), null, 2));
  }
  console.log('\n');
  
  console.log('=== AUTH DIAGNOSTIC COMPLETE ===');
}

verifyAuthFlows().catch(console.error);
