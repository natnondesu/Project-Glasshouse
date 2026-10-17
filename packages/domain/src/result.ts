import type { Id } from './model/types';

export type DomainErrorCode = 'not_found' | 'not_draft' | 'invalid_value' | 'out_of_bounds' | 'stale' | 'forbidden';

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  targets: Id[];
}

export interface Failure {
  ok: false;
  error: DomainError;
}

export type Result<T> = { ok: true; value: T } | Failure;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (code: DomainErrorCode, message: string, targets: Id[] = []): Failure => ({
  ok: false,
  error: { code, message, targets },
});

export const withTarget = (failure: Failure, id: Id): Failure => ({
  ok: false,
  error: { ...failure.error, targets: [id] },
});
