import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { err, ok, withTarget } from './result';
import { inRange, isWholeInRange, validateName } from './validation';

describe('result', () => {
  it('wraps values and errors', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('not_found', 'Gone.')).toEqual({ ok: false, error: { code: 'not_found', message: 'Gone.', targets: [] } });
  });

  it('attaches a target to a failure', () => {
    expect(withTarget(err('invalid_value', 'Bad.'), 'a').error.targets).toEqual(['a']);
  });
});

describe('ids', () => {
  it('creates unique UUIDs', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(a);
  });
});

describe('validation', () => {
  it('trims names and rejects empty or long ones', () => {
    expect(validateName('  MDF-1 ')).toEqual({ ok: true, value: 'MDF-1' });
    expect(validateName('   ', 'Room name')).toMatchObject({ ok: false, error: { message: "Room name can't be empty." } });
    expect(validateName('x'.repeat(81)).ok).toBe(false);
  });

  it('checks ranges', () => {
    expect(inRange(5, 1, 50)).toBe(true);
    expect(inRange(Number.NaN, 1, 50)).toBe(false);
    expect(isWholeInRange(42, 1, 60)).toBe(true);
    expect(isWholeInRange(4.5, 1, 60)).toBe(false);
  });
});
