import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env['E2E_PROD_BASE_URL'] ?? 'https://ielts-lms-production.up.railway.app';

export default defineConfig({
  testDir: './e2e/prod-smoke',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? 'list' : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  workers: 1,
});

