const LOCK_NAME = 'glasshouse-workspace-writer';

interface LockManagerLike {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: object | null) => Promise<void>): unknown;
}

// One request per page: React StrictMode re-runs effects, and a second request would lose to our own first one.
const requests = new WeakMap<LockManagerLike, Promise<boolean>>();

/**
 * Only one tab may write the browser-local workspace; a second tab would silently overwrite the first.
 * The lock is held for the life of the page by never resolving the callback's promise.
 */
export function acquireWriterLock(): Promise<boolean> {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  if (!locks) return Promise.resolve(true);
  const existing = requests.get(locks);
  if (existing) return existing;
  const request = new Promise<boolean>((resolve) => {
    locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      return lock === null ? Promise.resolve() : new Promise<void>(() => {});
    });
  });
  requests.set(locks, request);
  return request;
}
