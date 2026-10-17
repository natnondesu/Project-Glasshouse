import { createWorkspace } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { MemoryCommandStore } from './memoryStore';

const actor = { id: 'dev:Ploy', name: 'Ploy', role: 'editor' as const, verified: false };
const entry = (seq: number, commandId = `c${seq}`) => ({ seq, clientId: 'a', commandId, actor, command: { type: 'project/create' as const, id: `p${seq}`, name: `P${seq}` } });

it('keeps commands in order, pages them and finds them by client command id', async () => {
  const store = new MemoryCommandStore();
  await store.append(entry(1));
  await store.append(entry(2));
  await store.append(entry(3));
  expect((await store.commandsAfter(1, 1)).map((c) => c.seq)).toEqual([2]);
  expect(await store.findCommand('a', 'c3')).toMatchObject({ seq: 3, actor });
  expect(await store.findCommand('b', 'c3')).toBeNull();
});

it('refuses a repeated seq or a repeated client command id', async () => {
  const store = new MemoryCommandStore();
  await store.append(entry(1));
  await expect(store.append(entry(1, 'other'))).rejects.toThrow(/seq 1/);
  await expect(store.append(entry(2, 'c1'))).rejects.toThrow(/already logged/);
});

it('returns the latest snapshot as a copy', async () => {
  const store = new MemoryCommandStore();
  expect(await store.latestSnapshot()).toBeNull();
  const ws = createWorkspace();
  await store.saveSnapshot(4, ws);
  const snap = await store.latestSnapshot();
  expect(snap).toMatchObject({ seq: 4 });
  expect(snap!.workspace).not.toBe(ws);
});

const approval = (seq: number) => ({ seq, roomId: 'r', revision: 1, contentHash: 'h'.repeat(64), approverId: 'u-r', approverName: 'Rae', approvedAt: '2026-10-18T09:00:00.000Z' });

it('writes an approval with its command, oldest first, as copies', async () => {
  const store = new MemoryCommandStore();
  await store.append(entry(1), approval(1));
  await store.append(entry(2));
  await store.append(entry(3), approval(3));
  const listed = await store.listApprovals();
  expect(listed.map((a) => a.seq)).toEqual([1, 3]);
  listed[0]!.roomId = 'changed';
  expect((await store.listApprovals())[0]!.roomId).toBe('r');
  expect((await store.commandsAfter(0, 10)).map((c) => c.seq)).toEqual([1, 2, 3]);
});

it('writes neither the command nor the approval when the seq repeats', async () => {
  const store = new MemoryCommandStore();
  await store.append(entry(1));
  await expect(store.append(entry(1, 'other'), approval(1))).rejects.toThrow(/seq 1/);
  expect(await store.listApprovals()).toEqual([]);
  expect(await store.commandsAfter(0, 10)).toHaveLength(1);
});
