import { test, expect } from '@playwright/test';

// F-235 Slice D: Screen 1 rebuild to Gmail-only sign-in. Mirrors admin-v2's own real, proven
// "criterion 2 — login screen offers Google only, no phone/OTP" assertion
// (apps/admin-v2/e2e/auth-ceremony.spec.ts) verbatim in shape, not a new pattern.
test('login screen offers Google only, no phone/OTP', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText(/otp/i)).toHaveCount(0);
  await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  await expect(page.getByText(/phone/i)).toHaveCount(0);
});
