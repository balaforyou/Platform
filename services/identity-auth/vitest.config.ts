import { defineConfig } from 'vitest/config';

// Package-local unit test runner. identity-auth's integration coverage stays in
// src/regression/*.regression.ts (the @badminton/test-harness live-fire suite);
// this covers only pure logic modules that benefit from fast isolated tests —
// currently src/adminGoogleAuth.ts (JWKS verification + cross-tenant admin match).
// First consumer of vitest in the repo; kept local per the extract-on-second-use
// discipline (admin-v2 gets its own config in build step 6).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
