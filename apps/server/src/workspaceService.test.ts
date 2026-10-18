import { createCopyIds, createObject, createWorkspace, currentRevision, exportProjectFile, findRoom, type Rack, type Template, type WorkspaceCommand } from '@glasshouse/domain';
import { describe, expect, it, vi } from 'vitest';
import { ClaimRegistry } from './claims';
import type { ApprovalRecord, LoggedCommand } from './store/commandStore';
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

  it('keeps a partition and a wall-hung AC, with their heights, through a batch and a reload', async () => {
    const store = new MemoryCommandStore();
    const svc = await WorkspaceService.open(store, { snapshotEvery: 3 });
    const partition = { ...createObject('partition', { x: 2, y: 2 }, []), id: 'pt', name: 'PT-01' };
    const ac = { ...createObject('wall_split_ac', { x: 1, y: 0 }, []), id: 'ac', name: 'AC-01', wallBottomM: 2.4 };
    const out = await svc.submitBatch('a', [
      ...readyRoomCommands().slice(0, 3),
      { type: 'plan', roomId: 'r', command: { type: 'object/add', object: partition } },
      { type: 'plan', roomId: 'r', command: { type: 'object/add', object: ac } },
    ].map((command, i) => ({ commandId: `b${i}`, command: command as WorkspaceCommand })), ploy);
    expect(out.rejected).toBeNull();
    expect(out.accepted).toHaveLength(5);
    const objectsOf = (s: WorkspaceService) => currentRevision(findRoom(s.state.workspace, 'r')!.room.plan).content.objects;
    expect(objectsOf(svc).map((o) => [o.type, o.wallBottomM])).toEqual([['partition', undefined], ['wall_split_ac', 2.4]]);
    expect((await store.latestSnapshot())?.seq).toBe(3);
    const reloaded = await WorkspaceService.open(store);
    expect(objectsOf(reloaded)).toEqual(objectsOf(svc));
    expect(reloaded.state.workspace).toEqual(svc.state.workspace);
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

describe('approved revisions', () => {
  const NOW = '2026-10-18T09:00:00.000Z';
  const editor = { id: 'u-e', name: 'Eddie', role: 'editor' as const, verified: true };
  const reviewer = { id: 'u-r', name: 'Rae', role: 'reviewer' as const, verified: true };
  type A = typeof editor | typeof reviewer;
  const go = (svc: WorkspaceService, actor: A, id: string, command: WorkspaceCommand) => svc.submit({ clientId: actor.id, commandId: id, command }, actor);

  async function approved(store = new MemoryCommandStore()) {
    const svc = await WorkspaceService.open(store, { now: () => NOW });
    for (const [i, c] of readyRoomCommands().entries()) await go(svc, editor, `s${i}`, c);
    await go(svc, editor, 'sub', { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: 'x' } });
    expect(await go(svc, reviewer, 'app', { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: '', at: 'x' } })).toMatchObject({ kind: 'accepted' });
    return { svc, store };
  }

  it('records the approval with its fingerprint, approver and seq', async () => {
    const { svc, store } = await approved();
    const rev = svc.state.workspace.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!;
    expect(await store.listApprovals()).toEqual([
      { seq: svc.state.seq, roomId: 'r', revision: 1, contentHash: rev.approvedHash, approverId: 'u-r', approverName: 'Rae', approvedAt: NOW },
    ]);
  });

  it('refuses a take-incoming import over an approved revision, naming the room and revision', async () => {
    const { svc } = await approved();
    const file = exportProjectFile(svc.state.workspace, 'p', NOW);
    if (!file.ok) throw new Error(file.error.message);
    // The exported file shares frozen state with the workspace, so edit a copy.
    const edited = structuredClone(file.value);
    edited.project.sites[0]!.rooms[0]!.plan.revisions[0]!.content.vlans.push({ vid: 7, name: 'edited' });
    const outcome = await go(svc, editor, 'imp', { type: 'project/import', file: edited, resolution: { mode: 'merge', takeIncoming: ['r'] } } as WorkspaceCommand);
    expect(outcome).toMatchObject({ kind: 'rejected', error: { code: 'invalid_value', message: expect.stringMatching(/Revision 1 of MDF-1 is approved, so it can't be changed\. Import the file as a copy instead\.$/), targets: ['r'] } });
  });

  it('still lets the same file in as a copy', async () => {
    const { svc, store } = await approved();
    const file = exportProjectFile(svc.state.workspace, 'p', NOW);
    if (!file.ok) throw new Error(file.error.message);
    const outcome = await go(svc, editor, 'imp', { type: 'project/import', file: file.value, resolution: { mode: 'copy', ids: createCopyIds(file.value) } } as WorkspaceCommand);
    expect(outcome).toMatchObject({ kind: 'accepted' });
    // Imported approvals are history, not new approvals: only the original approval has a record.
    expect(await store.listApprovals()).toHaveLength(1);
  });

  describe('an import cannot approve a room of this server', () => {
    async function approvedFileAndOtherServer(submitOther: boolean) {
      const { svc: source } = await approved();
      const file = exportProjectFile(source.state.workspace, 'p', NOW);
      if (!file.ok) throw new Error(file.error.message);
      const other = await WorkspaceService.open(new MemoryCommandStore(), { now: () => NOW });
      for (const [i, c] of readyRoomCommands().entries()) await go(other, editor, `o${i}`, c);
      if (submitOther) await go(other, editor, 'osub', { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: 'x' } });
      return { other, file: structuredClone(file.value) };
    }
    const message = 'This file marks revision 1 of MDF-1 as approved, but it isn\'t approved here. Import it as a copy instead.';

    it.each([false, true])('refuses take-incoming that turns a draft or in_review revision approved (submitted: %s)', async (submitted) => {
      const { other, file } = await approvedFileAndOtherServer(submitted);
      const seq = other.state.seq;
      const outcome = await go(other, editor, 'imp', { type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: ['r'] } } as WorkspaceCommand);
      expect(outcome).toMatchObject({ kind: 'rejected', error: { code: 'invalid_value', message, targets: ['r'] } });
      expect(other.state.seq).toBe(seq);
    });

    it('lets a new project come in with its approvals as history, and records no approval', async () => {
      const { file } = await approvedFileAndOtherServer(false);
      const store = new MemoryCommandStore();
      const fresh = await WorkspaceService.open(store, { now: () => NOW });
      const outcome = await go(fresh, editor, 'imp', { type: 'project/import', file, resolution: { mode: 'merge', takeIncoming: [] } } as WorkspaceCommand);
      expect(outcome).toMatchObject({ kind: 'accepted' });
      expect(await store.listApprovals()).toEqual([]);
    });
  });

  it('keeps the approval record after the room is deleted', async () => {
    const { svc, store } = await approved();
    expect(await go(svc, editor, 'del', { type: 'room/delete', roomId: 'r' })).toMatchObject({ kind: 'accepted' });
    expect(await store.listApprovals()).toHaveLength(1);
  });
});

describe('recovery and readiness', () => {
  /** The insert lands, then the "network" fails: the classic ambiguous write. */
  class AmbiguousOnce extends MemoryCommandStore {
    failNext = false;
    override async append(entry: LoggedCommand, approval?: ApprovalRecord | null): Promise<void> {
      await super.append(entry, approval);
      if (this.failNext) {
        this.failNext = false;
        throw new Error('connection reset after commit');
      }
    }
  }

  it('recovers from an append that committed but failed: the retry is answered once, nothing wedges', async () => {
    const store = new AmbiguousOnce();
    const svc = await WorkspaceService.open(store, { onError: () => {} });
    const seen: number[] = [];
    svc.subscribe((e) => seen.push(e.seq));
    store.failNext = true;
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('connection reset');
    // The client retries the same command id:
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: true });
    // And the next command takes seq 2 instead of colliding with the landed row:
    expect(await submit(svc, '2', create('q'))).toEqual({ kind: 'accepted', seq: 2, duplicate: false });
    expect(svc.state.workspace.projects.map((x) => x.id)).toEqual(['p', 'q']);
    expect(seen).toEqual([1, 2]);
  });

  it('an append that failed without landing is simply retried', async () => {
    class FailsOnce extends MemoryCommandStore {
      failNext = true;
      override async append(entry: LoggedCommand, approval?: ApprovalRecord | null): Promise<void> {
        if (this.failNext) {
          this.failNext = false;
          throw new Error('database down');
        }
        await super.append(entry, approval);
      }
    }
    const svc = await WorkspaceService.open(new FailsOnce(), { onError: () => {} });
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('database down');
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: false });
  });

  it('is ready when the store answers, and says why when it does not', async () => {
    class Down extends MemoryCommandStore {
      down = false;
      override async ping(): Promise<void> {
        if (this.down) throw new Error('connect ECONNREFUSED');
      }
    }
    const store = new Down();
    const onError = vi.fn();
    const svc = await WorkspaceService.open(store, { onError });
    expect(await svc.ready()).toEqual({ ok: true, seq: 0 });
    store.down = true;
    expect(await svc.ready()).toEqual({ ok: false, reason: 'The database is not answering.' });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('not answering'), expect.objectContaining({ message: 'connect ECONNREFUSED' }));
  });

  it('ready() answers while a submit is stuck in the store, because nothing needs recovering', async () => {
    class Stuck extends MemoryCommandStore {
      stuck = false;
      override async append(): Promise<void> {
        if (this.stuck) await new Promise<never>(() => undefined);
      }
    }
    const store = new Stuck();
    const svc = await WorkspaceService.open(store, { onError: () => {} });
    store.stuck = true;
    void submit(svc, '1', create('p'));
    const result = await Promise.race([svc.ready(), new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 500))]);
    expect(result).toEqual({ ok: true, seq: 0 });
  });

  it('applies and announces each recovered command once even when the trailing log read fails', async () => {
    class TrailingReadFails extends AmbiguousOnce {
      armed = false;
      reads = 0;
      override async commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]> {
        if (this.armed && ++this.reads === 2) {
          this.armed = false;
          throw new Error('read timed out');
        }
        return super.commandsAfter(seq, limit);
      }
    }
    const store = new TrailingReadFails();
    const svc = await WorkspaceService.open(store, { onError: () => {} });
    const seen: { seq: number; stateSeq: number }[] = [];
    svc.subscribe((e) => seen.push({ seq: e.seq, stateSeq: svc.state.seq }));
    store.failNext = true;
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('connection reset');
    store.armed = true;
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('read timed out');
    expect(await submit(svc, '1', create('p'))).toEqual({ kind: 'accepted', seq: 1, duplicate: true });
    expect(await submit(svc, '2', create('q'))).toEqual({ kind: 'accepted', seq: 2, duplicate: false });
    expect(seen).toEqual([{ seq: 1, stateSeq: 1 }, { seq: 2, stateSeq: 2 }]);
  });

  it('ready() catches up with the log right away after an ambiguous append', async () => {
    const store = new AmbiguousOnce();
    const svc = await WorkspaceService.open(store, { onError: () => {} });
    const seen: number[] = [];
    svc.subscribe((e) => seen.push(e.seq));
    store.failNext = true;
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('connection reset');
    expect(await svc.ready()).toEqual({ ok: true, seq: 1 });
    expect(seen).toEqual([1]);
    expect(svc.state.workspace.projects.map((x) => x.id)).toEqual(['p']);
  });

  it('ready() says so, without details, when catching up fails', async () => {
    class ReadsFail extends AmbiguousOnce {
      broken = false;
      override async commandsAfter(seq: number, limit: number): Promise<LoggedCommand[]> {
        if (this.broken) throw new Error('secret host:5432 refused');
        return super.commandsAfter(seq, limit);
      }
    }
    const store = new ReadsFail();
    const onError = vi.fn();
    const svc = await WorkspaceService.open(store, { onError });
    store.failNext = true;
    await expect(submit(svc, '1', create('p'))).rejects.toThrow('connection reset');
    store.broken = true;
    expect(await svc.ready()).toEqual({ ok: false, reason: 'Catching up with the database log failed.' });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('Catching up'), expect.objectContaining({ message: 'secret host:5432 refused' }));
  });
});

describe('room claims', () => {
  const NOW = '2026-10-18T09:00:00.000Z';
  const ploy = { id: 'u-p', name: 'Ploy', role: 'editor' as const, verified: true };
  const eddie = { id: 'u-e', name: 'Eddie', role: 'editor' as const, verified: true };
  const dev = { id: 'dev:Dev', name: 'Dev', role: 'admin' as const, verified: false };
  const go = (svc: WorkspaceService, actor: typeof ploy | typeof dev, id: string, command: WorkspaceCommand) => svc.submit({ clientId: actor.id, commandId: id, command }, actor);
  const vlan = (vid: number): WorkspaceCommand => ({ type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid, name: `V${vid}` } } });

  const vlanCount = (svc: WorkspaceService) => currentRevision(findRoom(svc.state.workspace, 'r')!.room.plan).content.vlans.length;

  async function room() {
    const claims = new ClaimRegistry(() => new Date(NOW));
    const svc = await WorkspaceService.open(new MemoryCommandStore(), { now: () => NOW, claims });
    for (const [i, c] of readyRoomCommands().slice(0, 3).entries()) await go(svc, ploy, `s${i}`, c);
    return { svc, claims };
  }

  it('the first draft edit claims the room; someone else’s edit is refused with the holder’s name', async () => {
    const { svc, claims } = await room();
    expect(await go(svc, ploy, 'e1', vlan(10))).toMatchObject({ kind: 'accepted' });
    expect(claims.holder('r')).toMatchObject({ userId: 'u-p' });
    expect(await go(svc, eddie, 'e2', vlan(11))).toMatchObject({ kind: 'rejected', error: { code: 'claimed', message: expect.stringMatching(/Ploy is editing/), targets: ['r'] } });
  });

  it('room-level changes and notes are not blocked by a claim', async () => {
    const { svc } = await room();
    await go(svc, ploy, 'e1', vlan(10));
    expect(await go(svc, eddie, 'n1', { type: 'room/rename', roomId: 'r', name: 'MDF-9' })).toMatchObject({ kind: 'accepted' });
    expect(await go(svc, eddie, 'n2', { type: 'review', roomId: 'r', command: { type: 'note/add', id: 'note-1', text: 'Check the door', at: 'x' } })).toMatchObject({ kind: 'accepted' });
  });

  it('submitting for review releases the claim', async () => {
    const { svc, claims } = await room();
    for (const [i, c] of readyRoomCommands().slice(3).entries()) await go(svc, ploy, `p${i}`, c);
    expect(claims.holder('r')).not.toBeNull();
    await go(svc, ploy, 'sub', { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: 'x' } });
    expect(claims.holder('r')).toBeNull();
  });

  it('a refused edit does not claim, and deleting the room forgets its claim', async () => {
    const { svc, claims } = await room();
    expect(await go(svc, ploy, 'bad', { type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: -1, name: '' } } })).toMatchObject({ kind: 'rejected' });
    expect(claims.holder('r')).toBeNull();
    await go(svc, ploy, 'e1', vlan(10));
    await go(svc, ploy, 'del', { type: 'room/delete', roomId: 'r' });
    expect(claims.list()).toEqual([]);
  });

  it('dev mode (unverified) neither needs nor takes claims', async () => {
    const { svc, claims } = await room();
    await go(svc, ploy, 'e1', vlan(10));
    expect(await go(svc, dev, 'd1', vlan(12))).toMatchObject({ kind: 'accepted' });
    expect(claims.holder('r')).toMatchObject({ userId: 'u-p' });
  });

  it('replaying the log at startup does not create claims', async () => {
    const store = new MemoryCommandStore();
    const svc = await WorkspaceService.open(store, { now: () => NOW, claims: new ClaimRegistry(() => new Date(NOW)) });
    for (const [i, c] of readyRoomCommands().slice(0, 3).entries()) await go(svc, ploy, `s${i}`, c);
    expect(await go(svc, ploy, 'e1', vlan(10))).toMatchObject({ kind: 'accepted' });
    const claims = new ClaimRegistry(() => new Date(NOW));
    const reopened = await WorkspaceService.open(store, { now: () => NOW, claims });
    expect(vlanCount(reopened)).toBe(1);
    expect(claims.list()).toEqual([]);
  });

  it('a draft edit recovered after an ambiguous append does not create a claim', async () => {
    class AmbiguousOnce extends MemoryCommandStore {
      failNext = false;
      override async append(entry: LoggedCommand, approval?: ApprovalRecord | null): Promise<void> {
        await super.append(entry, approval);
        if (this.failNext) {
          this.failNext = false;
          throw new Error('connection reset after commit');
        }
      }
    }
    const store = new AmbiguousOnce();
    const claims = new ClaimRegistry(() => new Date(NOW));
    const svc = await WorkspaceService.open(store, { now: () => NOW, claims, onError: () => {} });
    for (const [i, c] of readyRoomCommands().slice(0, 3).entries()) await go(svc, ploy, `s${i}`, c);
    store.failNext = true;
    await expect(go(svc, ploy, 'e1', vlan(10))).rejects.toThrow('connection reset');
    // A non-draft change makes the service recover the landed edit first.
    expect(await go(svc, eddie, 'n1', { type: 'room/rename', roomId: 'r', name: 'MDF-9' })).toMatchObject({ kind: 'accepted' });
    expect(vlanCount(svc)).toBe(1);
    expect(claims.list()).toEqual([]);
  });

  it('a holder who was taken over is refused with the new holder’s name', async () => {
    const { svc, claims } = await room();
    await go(svc, ploy, 'e1', vlan(10));
    expect(claims.claim('r', eddie, { admin: true })).toMatchObject({ ok: true });
    expect(await go(svc, ploy, 'e2', vlan(11))).toMatchObject({ kind: 'rejected', error: { code: 'claimed', message: expect.stringMatching(/Eddie is editing/), targets: ['r'] } });
    expect(await go(svc, eddie, 'e3', vlan(12))).toMatchObject({ kind: 'accepted' });
  });

  it('an admin who has not claimed the room is refused like anyone else', async () => {
    const { svc } = await room();
    const ada = { id: 'u-a', name: 'Ada', role: 'admin' as const, verified: true };
    await go(svc, ploy, 'e1', vlan(10));
    expect(await go(svc, ada, 'a1', vlan(11))).toMatchObject({ kind: 'rejected', error: { code: 'claimed', targets: ['r'] } });
  });

  it('a failing claims subscriber does not undo or hide an accepted edit', async () => {
    const onError = vi.fn();
    const claims = new ClaimRegistry(() => new Date(NOW), onError);
    const svc = await WorkspaceService.open(new MemoryCommandStore(), { now: () => NOW, claims });
    for (const [i, c] of readyRoomCommands().slice(0, 3).entries()) await go(svc, ploy, `s${i}`, c);
    claims.subscribe(() => {
      throw new Error('stream write failed');
    });
    const seen: number[] = [];
    svc.subscribe((e) => seen.push(e.seq));
    expect(await go(svc, ploy, 'e1', vlan(10))).toEqual({ kind: 'accepted', seq: 4, duplicate: false });
    expect(seen).toEqual([4]);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('claims'), expect.any(Error));
  });
});

describe('archiving', () => {
  const NOW = '2026-10-18T09:00:00.000Z';
  const ada = { id: 'u-a', name: 'Ada', role: 'admin' as const, verified: true };
  const bea = { id: 'u-b', name: 'Bea', role: 'admin' as const, verified: true };
  const ploy = { id: 'u-p', name: 'Ploy', role: 'editor' as const, verified: true };
  const go = (svc: WorkspaceService, actor: typeof ada, id: string, command: WorkspaceCommand) => svc.submit({ clientId: actor.id, commandId: id, command }, actor);
  const archiveRoom: WorkspaceCommand = { type: 'room/archive', roomId: 'r', by: 'Spoof', at: 'client' };
  const vlan: WorkspaceCommand = { type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: 10, name: 'V10' } } };

  async function open() {
    const claims = new ClaimRegistry(() => new Date(NOW));
    const svc = await WorkspaceService.open(new MemoryCommandStore(), { now: () => NOW, claims });
    for (const [i, c] of readyRoomCommands().slice(0, 3).entries()) await go(svc, ada, `s${i}`, c);
    return { svc, claims };
  }
  const roomOf = (svc: WorkspaceService) => findRoom(svc.state.workspace, 'r')!.room;

  it('lets an admin archive, stamped with their name and the server time, and logs it with who did it', async () => {
    const { svc } = await open();
    expect(await go(svc, ada, 'a1', archiveRoom)).toMatchObject({ kind: 'accepted' });
    expect(roomOf(svc)).toMatchObject({ archivedAt: NOW, archivedBy: 'Ada' });
    const logged = (await svc.commandsAfter(0, 100)).find((e) => e.commandId === 'a1')!;
    expect(logged).toMatchObject({ actor: { id: 'u-a', name: 'Ada' }, command: { type: 'room/archive', by: 'Ada', at: NOW } });
    expect(await go(svc, ada, 'a2', { type: 'room/restore', roomId: 'r' })).toMatchObject({ kind: 'accepted' });
    expect(roomOf(svc)).not.toHaveProperty('archivedAt');
  });

  it('refuses an editor, whether archiving or restoring', async () => {
    const { svc } = await open();
    expect(await go(svc, ploy as never, 'a1', archiveRoom)).toMatchObject({ kind: 'rejected', error: { code: 'forbidden', message: expect.stringMatching(/Editors can't make this change/) } });
    await go(svc, ada, 'a2', archiveRoom);
    expect(await go(svc, ploy as never, 'a3', { type: 'room/restore', roomId: 'r' })).toMatchObject({ kind: 'rejected', error: { code: 'forbidden' } });
    expect(roomOf(svc).archivedAt).toBe(NOW);
  });

  it('refuses edits to an archived room from anyone, and replays an archived workspace from the log', async () => {
    const store = new MemoryCommandStore();
    const svc = await WorkspaceService.open(store, { now: () => NOW });
    for (const [i, c] of readyRoomCommands().slice(0, 3).entries()) await go(svc, ada, `s${i}`, c);
    await go(svc, ada, 'a1', archiveRoom);
    expect(await go(svc, ada, 'e1', vlan)).toMatchObject({ kind: 'rejected', error: { code: 'archived' } });
    const reopened = await WorkspaceService.open(store, { now: () => NOW });
    expect(findRoom(reopened.state.workspace, 'r')!.room.archivedAt).toBe(NOW);
  });

  it('refuses while someone else is editing the room, naming them, at every level that contains it', async () => {
    const { svc, claims } = await open();
    await go(svc, ploy as never, 'e1', vlan);
    expect(claims.holder('r')).toMatchObject({ userId: 'u-p' });
    const message = "Ploy is editing MDF-1. Try again when they're done.";
    for (const command of [archiveRoom, { type: 'site/archive', siteId: 's', by: '', at: '' }, { type: 'project/archive', projectId: 'p', by: '', at: '' }] as WorkspaceCommand[]) {
      expect(await go(svc, ada, `a-${command.type}`, command), command.type).toMatchObject({ kind: 'rejected', error: { code: 'room_busy', message, targets: ['r'] } });
    }
    expect(roomOf(svc)).not.toHaveProperty('archivedAt');
    expect(claims.holder('r')).toMatchObject({ userId: 'u-p' });
  });

  it('archives once the other editor is done', async () => {
    const { svc, claims } = await open();
    await go(svc, ploy as never, 'e1', vlan);
    claims.release('r', 'u-p', { admin: false });
    expect(await go(svc, ada, 'a1', archiveRoom)).toMatchObject({ kind: 'accepted' });
  });

  it('releases the admin’s own claim as part of archiving, so the room is free after a restore', async () => {
    const { svc, claims } = await open();
    await go(svc, ada, 'e1', vlan);
    expect(claims.holder('r')).toMatchObject({ userId: 'u-a' });
    expect(await go(svc, ada, 'a1', { type: 'site/archive', siteId: 's', by: '', at: '' })).toMatchObject({ kind: 'accepted' });
    expect(claims.holder('r')).toBeNull();
    await go(svc, bea, 'a2', { type: 'site/restore', siteId: 's' });
    expect(await go(svc, ploy as never, 'e2', { type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: 11, name: 'V11' } } })).toMatchObject({ kind: 'accepted' });
  });

  it('does not ask the dev stand-in about claims, and trusts the name it sends', async () => {
    const { svc } = await open();
    const dev = { id: 'dev:Dev', name: 'Dev', role: 'admin' as const, verified: false };
    await go(svc, ploy as never, 'e1', vlan);
    expect(await go(svc, dev as never, 'a1', { ...archiveRoom, by: 'Few', at: 'x' } as WorkspaceCommand)).toMatchObject({ kind: 'accepted' });
    expect(roomOf(svc)).toMatchObject({ archivedBy: 'Few', archivedAt: 'x' });
  });
});
