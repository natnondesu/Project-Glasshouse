import { describe, expect, it } from 'vitest';
import { readJsonFile, slugify } from './files';

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
