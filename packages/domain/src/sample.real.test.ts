import { expect, it, vi } from 'vitest';

vi.unmock('./default-catalog.json');

// The other tests swap in a generic catalog; this one proves the sample also builds from the real file.
it('builds the sample from the catalog that ships', async () => {
  const { createSampleProject } = await import('./sample');
  const r = createSampleProject('2026-10-16T00:00:00.000Z');
  expect(r.ok ? 'ok' : r.error.message).toBe('ok');
});
