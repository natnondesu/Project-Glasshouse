import { createObject, createWorkspace, type Rack, type Template, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it, vi } from 'vitest';
import type { LoggedCommand } from './store/commandStore';
import { MemoryCommandStore } from './store/memoryStore';
import { WorkspaceService, type Submission } from './workspaceService';

const ploy = { id: 'dev:Ploy', name: 'Ploy', role: 'admin' as const, verified: false };
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

/** Room "r" ready for approval: one rack with one 2U server of known demand. */
function readyRoomCommands(): WorkspaceCommand[] {
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };
  const template = createWorkspace().catalog.find((t) => t.id === 'tpl-server-2u') as Template;
  return [
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template } },
  ];
}

describe('roles and stamped names', () => {
  const NOW = '2026-10-18T09:00:00.000Z';
  const viewer = { id: 'u-v', name: 'Vee', role: 'viewer' as const, verified: true };
  const editor = { id: 'u-e', name: 'Eddie', role: 'editor' as const, verified: true };
  const reviewer = { id: 'u-r', name: 'Rae', role: 'reviewer' as const, verified: true };
  const open = () => WorkspaceService.open(new MemoryCommandStore(), { now: () => NOW });
  const go = (svc: WorkspaceService, actor: typeof editor | typeof viewer | typeof reviewer, id: string, command: WorkspaceCommand) => svc.submit({ clientId: actor.id, commandId: id, command }, actor);

  it('refuses a change above the actor’s role, with a clear reason', async () => {
    const svc = await open();
    expect(await go(svc, viewer, '1', { type: 'project/create', id: 'p', name: 'P' })).toMatchObject({ kind: 'rejected', error: { code: 'forbidden', message: expect.stringMatching(/Viewer/) } });
    expect(await go(svc, editor, '2', { type: 'project/create', id: 'p', name: 'P' })).toMatchObject({ kind: 'accepted' });
    expect(await go(svc, editor, '3', { type: 'project/delete', projectId: 'p' })).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } });
  });

  it('a reviewer can’t approve their own submission, whatever name they send', async () => {
    const svc = await open();
    for (const [i, c] of readyRoomCommands().entries()) await go(svc, reviewer, `s${i}`, c);
    await go(svc, reviewer, 'sub', { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'Not Me', at: 'x' } });
    const own = await go(svc, reviewer, 'app', { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'Someone Else', at: 'x', byId: 'u-other' } });
    expect(own).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } });
    const logged = (await svc.commandsAfter(0, 100)).find((e) => e.commandId === 'sub')!;
    expect(logged.command).toMatchObject({ command: { designedBy: 'Rae', byId: 'u-r', at: NOW } });
  });

  it('stamps nothing for the dev stand-in', async () => {
    const svc = await open();
    const dev = { id: 'dev:Dev', name: 'Dev', role: 'admin' as const, verified: false };
    await go(svc, dev as never, '1', { type: 'project/create', id: 'p', name: 'P' });
    expect((await svc.commandsAfter(0, 1))[0]!.command).toEqual({ type: 'project/create', id: 'p', name: 'P' });
  });

  it('refuses a verified account with no name, so self-approval can’t slip past the guard', async () => {
    const svc = await open();
    const nameless = { id: 'u-n', name: '  ', role: 'admin' as const, verified: true };
    expect(await svc.submit({ clientId: 'c', commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } }, nameless)).toMatchObject({ kind: 'rejected', error: { code: 'forbidden', message: 'Your account has no name. Ask an admin to set one.' } });
    expect(svc.state.seq).toBe(0);
  });

  it('rejects a malformed review command without throwing, and skips the rest of the batch', async () => {
    const svc = await open();
    const items = [
      { commandId: '1', command: { type: 'project/create', id: 'p', name: 'P' } as WorkspaceCommand },
      { commandId: '2', command: { type: 'review' } as unknown as WorkspaceCommand },
      { commandId: '3', command: { type: 'project/create', id: 'q', name: 'Q' } as WorkspaceCommand },
    ];
    const outcome = await svc.submitBatch('c', items, editor);
    expect(outcome.accepted).toHaveLength(1);
    expect(outcome.rejected).toMatchObject({ commandId: '2', error: { code: 'invalid_value' } });
    expect(outcome.skipped).toEqual(['3']);
    const nullCmd = await svc.submit({ clientId: 'c', commandId: '4', command: { type: 'review', roomId: 'r', command: null } as unknown as WorkspaceCommand }, editor);
    expect(nullCmd).toMatchObject({ kind: 'rejected' });
  });
});
