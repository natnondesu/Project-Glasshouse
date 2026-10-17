import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLangStore } from '../i18n';
import { readJsonFile, slugify } from './files';

const big = (mb: number): File => {
  const file = new File(['{}'], 'big.json');
  Object.defineProperty(file, 'size', { value: mb * 1_000_000 });
  return file;
};

describe('file size limits', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    useLangStore.setState({ lang: 'en' });
  });

  it("refuses, before reading, a file over the server's 25 MB in server mode", async () => {
    vi.stubEnv('VITE_GLASSHOUSE_SERVER', '1');
    expect(await readJsonFile(big(30))).toEqual({ ok: false, message: 'This file is 30 MB, but the server accepts at most 25 MB. Split it into smaller files or import fewer projects at once.' });
  });

  it('says so in Thai when the language is Thai', async () => {
    vi.stubEnv('VITE_GLASSHOUSE_SERVER', '1');
    useLangStore.setState({ lang: 'th' });
    const out = await readJsonFile(big(30));
    expect(out).toMatchObject({ ok: false });
    expect((out as { message: string }).message).toMatch(/30 MB.*25 MB/);
  });

  it('accepts a 30 MB file in local mode, which keeps its 50 MB limit', async () => {
    expect(await readJsonFile(big(30))).toEqual({ ok: true, value: {} });
    expect(await readJsonFile(big(60))).toMatchObject({ ok: false, message: expect.stringMatching(/60 MB/) });
  });
});

describe('file helpers', () => {
  it('reads JSON and explains files that are not JSON', async () => {
    expect(await readJsonFile(new File(['{"a":1}'], 'x.json'))).toEqual({ ok: true, value: { a: 1 } });
    expect(await readJsonFile(new File(['nope'], 'x.json'))).toEqual({ ok: false, message: "This file isn't valid JSON." });
  });

  it('turns names into safe file names', () => {
    expect(slugify('MDF 1 / Site A')).toBe('mdf-1-site-a');
    expect(slugify('***')).toBe('glasshouse');
  });
});
