import { defineConfig } from 'vitest/config';

// Targeted unit coverage for guest-member-pwa's logic-bearing helpers (F-308/F-309 evidence pass),
// same node-environment pattern as apps/admin-v2's vitest.config.ts. Presentational components are
// covered by the Playwright e2e ceremony, not here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
