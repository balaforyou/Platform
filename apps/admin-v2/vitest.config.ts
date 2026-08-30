import { defineConfig } from 'vitest/config';

// Targeted unit coverage for admin-v2's logic-bearing helpers (§6 of the signed plan):
// JWT claim decoding, role-token labelling, auth-error copy mapping. Presentational
// components are covered by the Playwright e2e ceremony, not here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
