import { expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ client: null as null | { on: (event: string, fn: (e: unknown) => void) => unknown; emit: (event: string, e?: unknown) => boolean } }));

vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');
  class Pool extends EventEmitter {
    async connect() {
      const client = Object.assign(new EventEmitter(), {
        query: async () => ({ rows: [{ ok: true }] }),
        release: () => undefined,
      });
      fake.client = client;
      return client;
    }
    async end() {}
  }
  return { default: { Pool } };
});

// The migration is where a dropped connection would first show; let it hit the lock client's error event.
vi.mock('./migrations', () => ({
  migrate: async () => {
    fake.client!.emit('error', new Error('connection terminated'));
  },
}));

it('watches the lock connection from the moment it is taken, including while migrations run', async () => {
  const { PgCommandStore } = await import('./pgStore');
  const onLockLost = vi.fn();
  await PgCommandStore.connect('postgres://x', { onLockLost });
  expect(onLockLost).toHaveBeenCalledWith(expect.objectContaining({ message: 'connection terminated' }));
});
