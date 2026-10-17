import { expect, it } from 'vitest';
import { loadConfig } from './config';

it('refuses to start without an auth mode, so nothing ships open by accident', () => {
  expect(() => loadConfig({ GLASSHOUSE_STORE: 'memory' })).toThrow(/GLASSHOUSE_AUTH/);
});

it('needs a database URL for the Postgres store', () => {
  expect(() => loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure' })).toThrow(/DATABASE_URL/);
});

it('reads a complete configuration with defaults', () => {
  expect(loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure', GLASSHOUSE_STORE: 'memory' })).toEqual({
    port: 8787, host: '127.0.0.1', store: 'memory', databaseUrl: null, auth: 'dev-insecure', webDir: null, seedSample: false,
  });
  expect(loadConfig({ GLASSHOUSE_AUTH: 'dev-insecure', DATABASE_URL: 'postgres://x', PORT: '9000', GLASSHOUSE_SEED_SAMPLE: '1' })).toMatchObject({ port: 9000, store: 'postgres', databaseUrl: 'postgres://x', seedSample: true });
});
