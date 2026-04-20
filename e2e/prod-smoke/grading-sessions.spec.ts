import { expect, test } from '@playwright/test';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

test('prod smoke: /api/v1/grading/sessions returns 200', async ({ page }) => {
  const email = requireEnv('E2E_PROD_EMAIL');
  const password = requireEnv('E2E_PROD_PASSWORD');
  const pollTimeoutMs = Number(process.env['E2E_POLL_TIMEOUT_MS'] ?? '180000');

  test.setTimeout(pollTimeoutMs + 60_000);

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/admin\/exams$/);

  const startedAt = Date.now();
  let delayMs = 1000;
  let lastStatus: number | undefined;
  let lastBody = '';

  while (Date.now() - startedAt < pollTimeoutMs) {
    const response = await page.request.get('/api/v1/grading/sessions');
    lastStatus = response.status();

    if (response.ok()) {
      const payload = await response.json();
      expect(Array.isArray(payload)).toBeTruthy();
      return;
    }

    lastBody = await response.text();

    await page.waitForTimeout(delayMs);
    delayMs = Math.min(delayMs * 2, 4000);
  }

  throw new Error(
    `Timed out after ${pollTimeoutMs}ms polling /api/v1/grading/sessions. Last status=${lastStatus}; body=${lastBody.slice(
      0,
      500,
    )}`,
  );
});

