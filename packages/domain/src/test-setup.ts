import { vi } from 'vitest';

/**
 * Unit tests run against a fixed generic catalog, so changing the shipped default catalog
 * (default-catalog.json) never breaks them. catalogFile.test.ts checks the real file separately.
 */
vi.mock('./default-catalog.json', async () => ({ default: (await import('./test-fixtures/generic-catalog.json')).default }));
