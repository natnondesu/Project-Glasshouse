import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PORT = 5299;
const WEB_DIR = fileURLToPath(new URL('./dist-server', import.meta.url));

// The real server (in-memory store) serving a server-mode build: one origin, like production.
export default defineConfig({
  testDir: './e2e-server',
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm vite build --outDir dist-server && pnpm --filter @glasshouse/server exec tsx src/main.ts',
    env: { VITE_GLASSHOUSE_SERVER: '1', GLASSHOUSE_AUTH: 'dev-insecure', GLASSHOUSE_STORE: 'memory', GLASSHOUSE_WEB_DIR: WEB_DIR, PORT: String(PORT), HOST: '127.0.0.1' },
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
