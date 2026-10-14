import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { usePersistentState } from './usePersistentState';

beforeEach(() => localStorage.clear());

it('remembers a per-browser preference', () => {
  const { result, unmount } = renderHook(() => usePersistentState('gh:test', true));
  expect(result.current[0]).toBe(true);
  act(() => result.current[1](false));
  unmount();
  expect(renderHook(() => usePersistentState('gh:test', true)).result.current[0]).toBe(false);
});

it('still works when storage is blocked', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const { result } = renderHook(() => usePersistentState('gh:test', 'a'));
  act(() => result.current[1]('b'));
  expect(result.current[0]).toBe('b');
  spy.mockRestore();
  vi.restoreAllMocks();
});
