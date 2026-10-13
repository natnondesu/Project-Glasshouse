import { afterEach, expect, it, vi } from 'vitest';
import { acquireWriterLock } from './writerLock';

afterEach(() => vi.unstubAllGlobals());

it('is the writer when the lock is free', async () => {
  vi.stubGlobal('navigator', { locks: { request: (_n: string, _o: unknown, cb: (lock: object | null) => Promise<void>) => void cb({}) } });
  expect(await acquireWriterLock()).toBe(true);
});

it('is read-only when another tab holds the lock', async () => {
  vi.stubGlobal('navigator', { locks: { request: (_n: string, _o: unknown, cb: (lock: object | null) => Promise<void>) => void cb(null) } });
  expect(await acquireWriterLock()).toBe(false);
});

it('falls back to writer where the Web Locks API is missing', async () => {
  vi.stubGlobal('navigator', {});
  expect(await acquireWriterLock()).toBe(true);
});

it('asks for the lock once per page, so a re-run effect does not lock itself out', async () => {
  let held = false;
  vi.stubGlobal('navigator', {
    locks: {
      request: (_n: string, _o: unknown, cb: (lock: object | null) => Promise<void>) => {
        const lock = held ? null : {};
        held = true;
        void cb(lock);
      },
    },
  });
  expect(await acquireWriterLock()).toBe(true);
  expect(await acquireWriterLock()).toBe(true);
});
