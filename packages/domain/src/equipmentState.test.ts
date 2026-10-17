import { describe, expect, it } from 'vitest';
import { bomRows } from './bom';
import { seedTemplates } from './catalog';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { equipmentStateOf, EQUIPMENT_STATE_LABEL } from './equipmentState';
import { createWorkspace } from './factories';
import { findRoom } from './lookup';
import { migrate } from './migrations';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';

const AT = '2026-10-15T00:00:00.000Z';
const t = (id: string) => seedTemplates().find((x) => x.id === id) as Template;
function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, c) => {
    const r = apply(w, c);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}
const base = () =>
  run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: 'P' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
    { type: 'room/create', siteId: 's', id: 'r', floorAreaId: 'fa-r', name: 'R' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01' } } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t('tpl-server-2u') } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: 'rk', bottomU: 5, template: t('tpl-chassis-6u') } },
    { type: 'plan', roomId: 'r', command: { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 1, template: t('tpl-node') } },
  );
const plan = (ws: Workspace) => findRoom(ws, 'r')!.room.plan;

describe('equipment state', () => {
  it('defaults to planned and can be set for devices, chassis and nodes', () => {
    let ws = base();
    expect(equipmentStateOf(plan(ws), 'srv')).toBe('planned');
    ws = run(ws, { type: 'equipment/state', roomId: 'r', ids: ['srv', 'n1'], state: 'deployed' }, { type: 'equipment/state', roomId: 'r', ids: ['ch'], state: 'maintenance' });
    expect(['srv', 'n1', 'ch'].map((id) => equipmentStateOf(plan(ws), id))).toEqual(['deployed', 'deployed', 'maintenance']);
    expect(EQUIPMENT_STATE_LABEL.maintenance).toBe('In maintenance');
  });

  it('can change after approval, because it records the site, not the design', () => {
    let ws = run(base(), { type: 'review', roomId: 'r', command: { type: 'review/submit', designedBy: 'A', at: AT } }, { type: 'review', roomId: 'r', command: { type: 'review/approve', reviewer: 'B', at: AT } });
    ws = run(ws, { type: 'equipment/state', roomId: 'r', ids: ['srv'], state: 'deployed' });
    expect(equipmentStateOf(plan(ws), 'srv')).toBe('deployed');
  });

  it('refuses things that are not equipment in the room', () => {
    expect(apply(base(), { type: 'equipment/state', roomId: 'r', ids: ['rk'], state: 'deployed' })).toMatchObject({ ok: false, error: { message: 'Only devices, chassis and nodes have a state.' } });
  });

  it('shows the state in the BOM', () => {
    const ws = run(base(), { type: 'equipment/state', roomId: 'r', ids: ['srv'], state: 'deployed' });
    const rows = bomRows(findRoom(ws, 'r')!);
    expect(rows.find((r) => r.name === 'SRV-01')!.state).toBe('Deployed');
    expect(rows.find((r) => r.kind === 'Node')!.state).toBe('Planned');
  });

  it('upgrades schema 3 plans with an empty state map', () => {
    const m = migrate({ schemaVersion: 3, catalog: [], lastBackupAt: null, projects: [{ sites: [{ rooms: [{ plan: { revisions: [], notes: [], history: [] } }] }] }] });
    expect(m.ok && (m.value as { projects: { sites: { rooms: { plan: unknown }[] }[] }[] }).projects[0]!.sites[0]!.rooms[0]!.plan).toMatchObject({ equipmentState: {} });
  });
});
