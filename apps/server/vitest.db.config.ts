import { defineConfig } from 'vitest/config';

// Needs Docker: starts a throwaway Postgres per file.
export default defineConfig({ test: { include: ['src/**/*.db.test.ts'], testTimeout: 60_000, hookTimeout: 180_000 } });
