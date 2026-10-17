import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PORT = 5399;
const IDP = 5398;
const WEB_DIR = fileURLToPath(new URL('./dist-server', import.meta.url));

// The real server with sign-in on (memory store, seeded local users) and a local OpenID provider.
export default defineConfig({
  testDir: './e2e-auth',
  reporter: 'list',
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: [
    { command: `pnpm --filter @glasshouse/server exec node scripts/mock-idp.mjs ${IDP}`, url: `http://127.0.0.1:${IDP}/.well-known/openid-configuration`, reuseExistingServer: false, timeout: 60_000 },
    {
      command: 'pnpm vite build --outDir dist-server && pnpm --filter @glasshouse/server exec tsx src/main.ts',
      env: {
        VITE_GLASSHOUSE_SERVER: '1',
        GLASSHOUSE_AUTH: 'on',
        GLASSHOUSE_STORE: 'memory',
        GLASSHOUSE_WEB_DIR: WEB_DIR,
        GLASSHOUSE_PUBLIC_URL: `http://localhost:${PORT}`,
        GLASSHOUSE_OIDC_ISSUER: `http://127.0.0.1:${IDP}`,
        GLASSHOUSE_OIDC_CLIENT_ID: 'glasshouse',
        GLASSHOUSE_OIDC_CLIENT_SECRET: 'e2e-secret',
        GLASSHOUSE_DEFAULT_ROLE: 'viewer',
        GLASSHOUSE_SEED_USERS: 'admin@company.test:admin-password-1:admin:Ada Admin;rev@company.test:review-password-1:reviewer:Rae Reviewer;ed@company.test:editor-password-1:editor:Eddie Editor',
        PORT: String(PORT),
        HOST: '127.0.0.1',
      },
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
