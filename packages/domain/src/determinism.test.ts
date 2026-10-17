import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from './canonical';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import { currentRevision, findRoom } from './lookup';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';
import { createCopyIds, exportProjectFile, type ProjectFile } from './projectFile';

const AT = '2026-10-14T09:00:00.000Z';

function must(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(`${cmd.type}: ${r.error.message}`);
    return r.value;
  }, ws);
}

const fileOf = (ws: Workspace, projectId: string): ProjectFile => {
  const r = exportProjectFile(ws, projectId, AT);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

let base: Workspace;
let tpl: Template;
let commands: Record<WorkspaceCommand['type'], WorkspaceCommand[] | 'local-only'>;

// Everything that needs a random id (fixtures, copy ids) is built here, before apply() runs under the spy.
beforeAll(() => {
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'rk', name: 'RK-01' };
  const wall = { ...createObject('mcb', { x: 0, y: 1 }, []), id: 'mcb', name: 'MCB-01' };
  tpl = createWorkspace().catalog.find((t) => t.id === 'tpl-server-2u') as Template;
  base = must(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: 'Northgate' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'MDF-1' },
    { type: 'room/create', siteId: 's', id: 'r2', floorAreaId: 'fa-r2', name: 'MDF-2' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: wall } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: tpl } },
  );
  const other = must(
    createWorkspace(),
    { type: 'project/create', id: 'q', name: 'Elsewhere' },
    { type: 'site/create', projectId: 'q', id: 'qs', name: 'Site Q' },
    { type: 'room/create', siteId: 'qs', id: 'qr', floorAreaId: 'fa-qr', name: 'Q room' },
  );
  const copyFile = fileOf(other, 'q');
  const content = currentRevision(findRoom(base, 'r')!.room.plan).content;
  const { version: _version, ...newTemplate } = { ...tpl, id: 'tpl-new' };

  commands = {
    'project/create': [{ type: 'project/create', id: 'p9', name: 'New' }],
    'project/rename': [{ type: 'project/rename', projectId: 'p', name: 'Renamed' }],
    'project/delete': [{ type: 'project/delete', projectId: 'p' }],
    'site/create': [{ type: 'site/create', projectId: 'p', id: 's9', name: 'Site B' }],
    'site/rename': [{ type: 'site/rename', siteId: 's', name: 'Site Z' }],
    'site/delete': [{ type: 'site/delete', siteId: 's' }],
    'room/create': [{ type: 'room/create', siteId: 's', id: 'r9', floorAreaId: 'fa-r9', name: 'New room' }],
    'room/rename': [{ type: 'room/rename', roomId: 'r', name: 'MDF-X' }],
    'room/delete': [{ type: 'room/delete', roomId: 'r2' }],
    plan: [
      { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 7 } } },
      { type: 'plan', roomId: 'r', command: { type: 'floor/add', rect: { id: 'f2', x: 0, y: 3, w: 2, d: 1 } } },
      { type: 'plan', roomId: 'r', command: { type: 'floor/cut', rect: { id: 'c1', x: 1, y: 1, w: 0.4, d: 0.4, kind: 'solid' } } },
      { type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...createObject('furniture', { x: 3, y: 3 }, []), id: 'fu', name: 'FU-01' } } },
      { type: 'plan', roomId: 'r', command: { type: 'feed/add', feed: { id: 'fd', targetId: 'rk', sourceId: 'mcb', label: 'Feed A' } } },
      { type: 'plan', roomId: 'r', command: { type: 'vlan/add', vlan: { vid: 10, name: 'Users' } } },
      { type: 'plan', roomId: 'r', command: { type: 'dimension/add', dimension: { id: 'dm', a: { kind: 'point', x: 0, y: 1 }, b: { kind: 'object', objectId: 'rk', u: 0, v: 0 }, offset: 0.2 } } },
      { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv2', rackId: 'rk', bottomU: 10, template: tpl } },
      { type: 'plan', roomId: 'r', command: { type: 'device/update', id: 'srv', patch: { name: 'SRV-X' } } },
    ],
    'draft/replace': [
      { type: 'draft/replace', roomId: 'r', content: { ...content, survey: { ...content.survey, notes: 'undone' } }, expected: content },
    ],
    review: [
      { type: 'review', roomId: 'r', command: { type: 'note/add', id: 'n1', text: 'hello', at: AT } },
      { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'A', at: AT } },
    ],
    'backup/mark': [{ type: 'backup/mark', at: AT }],
    // Builds whole projects with fresh ids: browser-local workspaces only (the server refuses it).
    'sample/load': 'local-only',
    'equipment/state': [{ type: 'equipment/state', roomId: 'r', ids: ['srv'], state: 'deployed' }],
    'rack/order': [{ type: 'rack/order', roomId: 'r', ids: ['rk'] }],
    'project/import': [
      { type: 'project/import', file: copyFile, resolution: { mode: 'merge', takeIncoming: [] } },
      { type: 'project/import', file: fileOf(base, 'p'), resolution: { mode: 'copy', ids: createCopyIds(fileOf(base, 'p')) } },
    ],
    'template/create': [{ type: 'template/create', template: newTemplate }],
    'template/update': [{ type: 'template/update', id: 'tpl-server-2u', patch: { label: 'Server 2U (edited)' } }],
    'template/delete': [{ type: 'template/delete', id: 'tpl-server-2u' }],
    'catalog/seed': [{ type: 'catalog/seed' }],
    'catalog/import': [{ type: 'catalog/import', templates: [{ ...tpl, id: 'tpl-imp', version: 1 }] }],
  };
});

afterEach(() => vi.restoreAllMocks());

describe('apply() is deterministic', () => {
  it('generates no id for any command type that can reach the server', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('apply() generated an ID');
    });
    for (const [type, list] of Object.entries(commands)) {
      if (list === 'local-only') continue;
      for (const cmd of list) {
        const result = apply(base, cmd);
        expect(result.ok, `${type}${cmd.type === 'plan' ? `:${cmd.command.type}` : ''} should apply: ${result.ok ? '' : result.error.message}`).toBe(true);
      }
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('exempts only sample/load', () => {
    expect(Object.entries(commands).filter(([, v]) => v === 'local-only').map(([k]) => k)).toEqual(['sample/load']);
  });

  it('builds the same workspace from room/create applied twice', () => {
    const cmd: WorkspaceCommand = { type: 'room/create', siteId: 's', id: 'r9', floorAreaId: 'fa-r9', name: 'New room' };
    const a = must(base, cmd);
    const b = must(base, cmd);
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(currentRevision(findRoom(a, 'r9')!.room.plan).content.survey.floorAreas[0]!.id).toBe('fa-r9');
  });

  it('builds the same workspace from a copy import applied twice', () => {
    const file = fileOf(base, 'p');
    const cmd: WorkspaceCommand = { type: 'project/import', file, resolution: { mode: 'copy', ids: createCopyIds(file) } };
    expect(canonicalJson(must(base, cmd))).toBe(canonicalJson(must(base, cmd)));
  });
});

describe('copy import ids', () => {
  const copy = (ids: (file: ProjectFile) => unknown) => {
    const file = fileOf(base, 'p');
    return apply(base, { type: 'project/import', file, resolution: { mode: 'copy', ids: ids(file) as ReturnType<typeof createCopyIds> } });
  };

  it('uses the ids it is given for the project, site and rooms', () => {
    const file = fileOf(base, 'p');
    const ids = { project: 'np', sites: { s: 'ns' }, rooms: { r: 'nr', r2: 'nr2' } };
    const ws = must(base, { type: 'project/import', file, resolution: { mode: 'copy', ids } });
    expect(ws.projects[1]).toMatchObject({ id: 'np', sites: [{ id: 'ns', rooms: [{ id: 'nr' }, { id: 'nr2' }] }] });
  });

  it('rejects a copy with no ids', () => {
    expect(copy(() => undefined)).toMatchObject({ ok: false });
  });

  it('rejects a copy missing the id of a room', () => {
    expect(copy(() => ({ project: 'np', sites: { s: 'ns' }, rooms: { r: 'nr' } }))).toMatchObject({ ok: false });
  });

  it('rejects a copy that repeats an id', () => {
    expect(copy(() => ({ project: 'np', sites: { s: 'ns' }, rooms: { r: 'nr', r2: 'nr' } }))).toMatchObject({ ok: false });
  });

  it('rejects a copy whose ids are already in the workspace', () => {
    expect(copy(() => ({ project: 'np', sites: { s: 'ns' }, rooms: { r: 'nr', r2: 'r' } }))).toMatchObject({ ok: false });
  });
});
