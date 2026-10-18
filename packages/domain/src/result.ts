import type { Id } from './model/types';

export type DomainErrorCode =
  | 'not_found'
  | 'not_draft'
  | 'invalid_value'
  | 'out_of_bounds'
  | 'stale'
  | 'forbidden'
  | 'claimed'
  /** A change to something an admin archived. */
  | 'archived'
  /** An archive refused because someone else is editing a room inside it. */
  | 'room_busy';

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  targets: Id[];
  /** The facts behind the message, for interfaces that word it in another language (archive and busy-room errors). */
  params?: Record<string, string>;
}

export interface Failure {
  ok: false;
  error: DomainError;
}

export type Result<T> = { ok: true; value: T } | Failure;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (code: DomainErrorCode, message: string, targets: Id[] = [], params?: Record<string, string>): Failure => ({
  ok: false,
  error: { code, message, targets, ...(params ? { params } : {}) },
});

export const withTarget = (failure: Failure, id: Id): Failure => ({
  ok: false,
  error: { ...failure.error, targets: [id] },
});
