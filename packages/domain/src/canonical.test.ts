import { expect, it } from 'vitest';
import { canonicalJson } from './canonical';

it('ignores key order and keeps array order', () => {
  expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, 1] }, b: 1 }));
  expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
});

it('drops undefined fields like JSON does', () => {
  expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
});
