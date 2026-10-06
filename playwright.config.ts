import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Set E2E_CHROME to reuse a Chrome that is already on the machine instead of
    // downloading Playwright's own build.
    ...(process.env.E2E_CHROME
      ? { launchOptions: { executablePath: process.env.E2E_CHROME } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
