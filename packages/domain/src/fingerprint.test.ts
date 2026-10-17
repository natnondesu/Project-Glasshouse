import { describe, expect, it } from 'vitest';
import { emptyContent } from './factories';
import { contentFingerprint, shortFingerprint } from './fingerprint';

describe('contentFingerprint', () => {
  it('is 64 hex characters and stable for equal content whatever the key order', () => {
    const a = emptyContent('fa');
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as typeof a;
    expect(contentFingerprint(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentFingerprint(reordered)).toBe(contentFingerprint(a));
  });

  it('changes when the content changes', () => {
    const a = emptyContent('fa');
    const b = { ...a, vlans: [{ vid: 10, name: 'CCTV' }] };
    expect(contentFingerprint(b)).not.toBe(contentFingerprint(a));
  });

  it('shortens to 12 characters', () => {
    expect(shortFingerprint('0123456789abcdef'.repeat(4))).toBe('0123456789ab');
  });
});
