import { createObject, createWorkspace, type Rack, type Template, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCommandStore } from './store/memoryStore';
import { WorkspaceService } from './workspaceService';

// The domain refuses these cases itself, so the service's own guards are reached only by making apply() misbehave.
const tamper = vi.hoisted(() => ({ after: null as null | ((ws: Workspace) => Workspace) }));
vi.mock('@glasshouse/domain', async (importOriginal) => {
  const original = await importOriginal<typeof import('@glasshouse/domain')>();
  return {
    ...original,
    apply: (ws: Workspace, command: WorkspaceCommand) => {
      const result = original.apply(ws, command);
      return result?.ok && tamper.after ? { ...result, value: tamper.after(result.value) } : result;
    },
  };
});

const NOW = '2026-10-18T09:00:00.000Z';
const editor = { id: 'u-e', name: 'Eddie', role: 'editor' as const, verified: true };
const reviewer = { id: 'u-r', name: 'Rae', role: 'reviewer' as const, verified: true };
const go = (svc: WorkspaceService, actor: typeof editor | typeof reviewer, id: string, command: WorkspaceCommand) => svc.submit({ clientId: actor.id, commandId: id, command }, actor);

const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };
const template = createWorkspace().catalog.find((t) => t.id === 'tpl-server-2u') as Template;
const ready: WorkspaceCommand[] = [
  { type: 'project/create', id: 'p', name: 'P' },
  { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
  { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
  { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
  { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template } },
  { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: '', at: 'x' } },
];
const approve: WorkspaceCommand = { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: '', at: 'x' } };

async function submitted() {
  const store = new MemoryCommandStore();
  const onError = vi.fn();
  const svc = await WorkspaceService.open(store, { now: () => NOW, onError });
  for (const [i, c] of ready.entries()) expect(await go(svc, editor, `s${i}`, c)).toMatchObject({ kind: 'accepted' });
  return { svc, store, onError };
}

const withRoom = (ws: Workspace, change: (room: Workspace['projects'][number]['sites'][number]['rooms'][number]) => void): Workspace => {
  const copy = structuredClone(ws);
  change(copy.projects[0]!.sites[0]!.rooms[0]!);
  return copy;
};

describe('service guards', () => {
  afterEach(() => {
    tamper.after = null;
  });

  it('rejects an approval that has no fingerprint to record, and writes nothing', async () => {
    const { svc, store, onError } = await submitted();
    const seq = svc.state.seq;
    tamper.after = (ws) => withRoom(ws, (room) => { delete room.plan.revisions[0]!.approvedHash; });
    const outcome = await go(svc, reviewer, 'app', approve);
    expect(outcome).toMatchObject({ kind: 'rejected', error: { code: 'invalid_value', message: expect.stringMatching(/couldn't be recorded, so it wasn't saved/), targets: ['r'] } });
    expect(svc.state.seq).toBe(seq);
    expect(await store.listApprovals()).toEqual([]);
    expect(await store.commandsAfter(seq, 10)).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('tells the editor to start a new draft when a non-import change would alter an approved revision', async () => {
    const { svc } = await submitted();
    expect(await go(svc, reviewer, 'app', approve)).toMatchObject({ kind: 'accepted' });
    tamper.after = (ws) => withRoom(ws, (room) => { room.plan.revisions[0]!.content.vlans.push({ vid: 9, name: 'sneaky' }); });
    const outcome = await go(svc, editor, 'edit', { type: 'room/rename', roomId: 'r', name: 'MDF-2' } as WorkspaceCommand);
    expect(outcome).toMatchObject({ kind: 'rejected', error: { message: "Revision 1 of MDF-2 is approved, so it can't be changed. Start a new draft." } });
  });
});
