import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: { command: `pnpm vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
