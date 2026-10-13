import { LIMITS } from './model/defaults';
import { err, ok, type Result } from './result';

export function validateName(raw: string, what = 'Name'): Result<string> {
  const name = raw.trim();
  if (name.length === 0) return err('invalid_value', `${what} can't be empty.`);
  if (name.length > LIMITS.nameMaxLength) {
    return err('invalid_value', `${what} must be ${LIMITS.nameMaxLength} characters or fewer.`);
  }
  return ok(name);
}

export const inRange = (v: number, min: number, max: number): boolean =>
  Number.isFinite(v) && v >= min && v <= max;

export const isWholeInRange = (v: number, min: number, max: number): boolean =>
  Number.isInteger(v) && v >= min && v <= max;

/** Drops keys whose value is undefined, so a partial patch never overwrites a field with undefined. */
export function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
