import { type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { LoggedCommand } from './store/commandStore';
import { MemoryCommandStore } from './store/memoryStore';
import { WorkspaceService, type Submission } from './workspaceService';

const ploy = { id: 'dev:Ploy', name: 'Ploy' };
const create = (id: string, name = id): WorkspaceCommand => ({ type: 'project/create', id, name });
const submit = (svc: WorkspaceService, commandId: string, command: WorkspaceCommand, clientId = 'a') => svc.submit({ clientId, commandId, command }, ploy);

describe('WorkspaceService', () => {
  it('orders accepted commands with a global seq and tells subscribers', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const seen: LoggedCommand[] = [];
    svc.subscribe((e) => seen.push(e));
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: false });
    expect(await submit(svc, '2', create('q'), 'b')).toEqual({ kind: 'accepted', seq: 2, duplicate: false });
    expect(svc.state.seq).toBe(2);
    expect(svc.state.workspace.projects.map((p) => p.id)).toEqual(['p', 'q']);
    expect(seen.map((e) => [e.seq, e.clientId, e.actor.name])).toEqual([[1, 'a', 'Ploy'], [2, 'b', 'Ploy']]);
  });

  it('applies a retried command once and answers with its original seq', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    await submit(svc, '1', create('p'));
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: true });
    expect(svc.state.seq).toBe(1);
  });

  it('rejects a command the domain refuses, with its reason, and changes nothing', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const outcome = await submit(svc, '1', create('p', ''));
    expect(outcome).toMatchObject({ kind: 'rejected', error: { code: 'invalid_value' } });
    expect(svc.state.seq).toBe(0);
  });

  it('refuses malformed commands without crashing', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const garbage = { type: 'plan', roomId: 'nope' } as unknown as WorkspaceCommand;
    expect((await submit(svc, '1', garbage)).kind).toBe('rejected');
    const unknown = { type: 'launch/rockets' } as unknown as WorkspaceCommand;
    expect((await submit(svc, '2', unknown)).kind).toBe('rejected');
    expect(await submit(svc, '3', create('p'))).toMatchObject({ kind: 'accepted', seq: 1 });
  });

  it('rejects a null command envelope without throwing, and keeps the next command at seq 1', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const nullCommand = { clientId: 'a', commandId: '1', command: null as unknown as WorkspaceCommand };
    expect(await svc.submit(nullCommand, ploy)).toMatchObject({ kind: 'rejected' });
    expect(await submit(svc, '2', create('p'))).toMatchObject({ kind: 'accepted', seq: 1 });
  });

  it('rejects a null submission without throwing', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    expect(await svc.submit(null as unknown as Submission, ploy)).toMatchObject({ kind: 'rejected' });
    expect(svc.state.seq).toBe(0);
  });

  it('keeps batch results when one item is null, and skips the rest', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const out = await svc.submitBatch('a', [
      { commandId: '1', command: create('p') },
      null as unknown as { commandId: string; command: WorkspaceCommand },
      { commandId: '3', command: create('q') },
    ], ploy);
    expect(out.accepted).toEqual([{ commandId: '1', seq: 1 }]);
    expect(out.rejected).toMatchObject({ commandId: '', error: { code: 'invalid_value' } });
    expect(out.skipped).toEqual(['3']);
  });

  it('refuses to replay a logged command type this build does not know', async () => {
    const store = new MemoryCommandStore();
    await store.append({
      seq: 1,
      clientId: 'a',
      commandId: '1',
      actor: ploy,
      command: { type: 'launch/rockets' } as unknown as WorkspaceCommand,
    });
    await expect(WorkspaceService.open(store)).rejects.toThrow(/seq 1.*unknown change type/);
  });

  it('refuses browser-only commands', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    expect(await submit(svc, '1', { type: 'backup/mark', at: '2026-10-17T00:00:00.000Z' })).toMatchObject({ kind: 'rejected' });
  });

  it('refuses sample/load, which would build different ids on every replica', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    expect(await submit(svc, '1', { type: 'sample/load', at: '2026-10-17T00:00:00.000Z' })).toMatchObject({ kind: 'rejected' });
    expect(svc.state.seq).toBe(0);
  });

  it('logs a batch item under the batch clientId even when the item carries its own', async () => {
    const store = new MemoryCommandStore();
    const svc = await WorkspaceService.open(store);
    const item = { commandId: '1', command: create('p'), clientId: 'spoofed' } as { commandId: string; command: WorkspaceCommand };
    await svc.submitBatch('real', [item], ploy);
    expect((await store.commandsAfter(0, 10)).map((e) => e.clientId)).toEqual(['real']);
    expect(await store.findCommand('real', '1')).not.toBeNull();
  });

  it('keeps memory unchanged when the log write fails', async () => {
    class FailingStore extends MemoryCommandStore {
      override async append(): Promise<void> {
        throw new Error('disk full');
      }
    }
    const svc = await WorkspaceService.open(new FailingStore());
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('disk full');
    expect(svc.state.seq).toBe(0);
    expect(svc.state.workspace.projects).toEqual([]);
  });

  it('processes a batch in order and stops at the first rejection', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const out = await svc.submitBatch('a', [
      { commandId: '1', command: create('p') },
      { commandId: '2', command: create('p') },
      { commandId: '3', command: create('q') },
    ], ploy);
    expect(out.accepted).toEqual([{ commandId: '1', seq: 1 }]);
    expect(out.rejected).toMatchObject({ commandId: '2', error: { code: 'invalid_value' } });
    expect(out.skipped).toEqual(['3']);
  });

  it('serialises concurrent submissions', async () => {
    const svc = await WorkspaceService.open(new MemoryCommandStore());
    const outcomes = await Promise.all(['p', 'q', 'r'].map((id, i) => submit(svc, String(i), create(id), `c${i}`)));
    expect(outcomes.map((o) => (o.kind === 'accepted' ? o.seq : 0)).sort()).toEqual([1, 2, 3]);
  });

  it('rebuilds the same workspace after a restart from snapshot plus log tail', async () => {
    const store = new MemoryCommandStore();
    const svc = await WorkspaceService.open(store, { snapshotEvery: 2 });
    for (const [i, id] of ['p', 'q', 'r'].entries()) await submit(svc, String(i), create(id));
    expect((await store.latestSnapshot())?.seq).toBe(2);
    const again = await WorkspaceService.open(store);
    expect(again.state.seq).toBe(3);
    expect(again.state.workspace).toEqual(svc.state.workspace);
  });

  it('keeps the seeded sample IDs stable across restarts', async () => {
    const store = new MemoryCommandStore();
    const first = await WorkspaceService.open(store, { seedSample: true });
    const ids = first.state.workspace.projects.map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    const second = await WorkspaceService.open(store, { seedSample: true });
    expect(second.state.workspace.projects.map((p) => p.id)).toEqual(ids);
  });

  it('logs, and does not fail the edit, when a snapshot write fails', async () => {
    class SnapshotFails extends MemoryCommandStore {
      calls = 0;
      override async saveSnapshot(...args: Parameters<MemoryCommandStore['saveSnapshot']>): Promise<void> {
        this.calls += 1;
        if (this.calls > 1) throw new Error('snapshot disk full');
        return super.saveSnapshot(...args);
      }
    }
    const onError = vi.fn();
    const svc = await WorkspaceService.open(new SnapshotFails(), { snapshotEvery: 1, onError });
    expect(await submit(svc, '1', create('p'))).toMatchObject({ kind: 'accepted', seq: 1 });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('snapshot'), expect.any(Error));
  });
});
