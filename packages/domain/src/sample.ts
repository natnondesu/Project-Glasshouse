import { seedTemplates } from './catalog';
import { apply, type WorkspaceCommand } from './commands/workspace';
import type { PlanCommand } from './commands/plan';
import type { ReviewCommand } from './commands/review';
import { createWorkspace } from './factories';
import { newId } from './ids';
import { currentRevision, findRoom } from './lookup';
import type { Id, Project, Rack, RackOwner, SimpleObject, Template, Workspace } from './model/types';
import { createObject } from './objects';
import { err, ok, type Result } from './result';

export const SAMPLE_PROJECT_NAME = 'Sample · Northgate DC';

const template = (id: string): Template => {
  const t = seedTemplates().find((x) => x.id === id);
  if (!t) throw new Error(`Seed template ${id} is missing`);
  return t;
};

function rack(name: string, x: number, y: number, owner: RackOwner = 'oxygenai'): Rack {
  return { ...(createObject('rack', { x, y }, []) as Rack), id: newId(), name, owner };
}

/** A wall-mounted MCB panel, turned so its back sits on the wall at x = 0 or y = 0. */
function mcb(name: string, x: number, y: number, onLeftWall: boolean): SimpleObject {
  return { ...(createObject('mcb', { x, y }, []) as SimpleObject), id: newId(), name, angle: onLeftWall ? 90 : 0 };
}

function existingRack(name: string, x: number, y: number): SimpleObject {
  return { ...(createObject('existing_rack', { x, y }, []) as SimpleObject), id: newId(), name };
}

/**
 * Builds the FR13 Sample Project by replaying ordinary commands on a scratch workspace,
 * so the result is valid by construction and gets fresh ids every time.
 */
export function createSampleProject(at: string): Result<Project> {
  let ws: Workspace = createWorkspace();
  const problems: string[] = [];
  const run = (cmd: WorkspaceCommand): void => {
    if (problems.length > 0) return;
    const next = apply(ws, cmd);
    if (next.ok) ws = next.value;
    else problems.push(next.error.message);
  };
  const plan = (roomId: Id, command: PlanCommand): void => run({ type: 'plan', roomId, command });
  const review = (roomId: Id, command: ReviewCommand): void => run({ type: 'review', roomId, command });
  const firstAreaId = (roomId: Id): Id => currentRevision(findRoom(ws, roomId)!.room.plan).content.survey.floorAreas[0]!.id;

  const projectId = newId();
  const siteId = newId();
  const serverId = newId();
  const mdfId = newId();
  run({ type: 'project/create', id: projectId, name: SAMPLE_PROJECT_NAME });
  run({ type: 'site/create', projectId, id: siteId, name: 'Bangna campus' });
  run({ type: 'room/create', siteId, id: serverId, name: 'Server room A' });
  run({ type: 'room/create', siteId, id: mdfId, name: 'MDF-1' });

  // Server room A: rectangular, two populated racks, Approved so the Install sheet works at once.
  plan(serverId, { type: 'survey/update', patch: { width: 6, length: 4.8, networkHandoff: 'Fibre patch panel on the north wall' } });
  plan(serverId, { type: 'floor/update', id: firstAreaId(serverId), patch: { x: 0, y: 0, w: 6, d: 4.8 } });
  const s1 = rack('RK-01', 1.0, 0.7);
  const s2 = rack('RK-02', 1.6, 0.7);
  plan(serverId, { type: 'object/add', object: s1 });
  plan(serverId, { type: 'object/add', object: s2 });
  plan(serverId, { type: 'device/place', id: newId(), rackId: s1.id, bottomU: 42, template: template('tpl-switch-1u') });
  plan(serverId, { type: 'device/place', id: newId(), rackId: s1.id, bottomU: 1, template: template('tpl-server-4u') });
  plan(serverId, { type: 'device/place', id: newId(), rackId: s1.id, bottomU: 5, template: template('tpl-server-2u') });
  plan(serverId, { type: 'device/place', id: newId(), rackId: s1.id, bottomU: 7, template: template('tpl-server-2u') });
  plan(serverId, { type: 'device/place', id: newId(), rackId: s2.id, bottomU: 42, template: template('tpl-switch-1u') });
  for (let u = 1; u <= 4; u += 1) plan(serverId, { type: 'device/place', id: newId(), rackId: s2.id, bottomU: u, template: template('tpl-server-1u') });
  // Two boards so RK-01 has independent A and B feeds.
  const board1 = mcb('MCB-01', 0, 2.2, true);
  const board2 = mcb('MCB-02', 3.6, 0, false);
  plan(serverId, { type: 'object/add', object: board1 });
  plan(serverId, { type: 'object/add', object: board2 });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), rackId: s1.id, sourceId: board1.id, label: 'Feed A' } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), rackId: s1.id, sourceId: board2.id, label: 'Feed B' } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), rackId: s2.id, sourceId: board1.id, label: 'Feed A' } });
  review(serverId, { type: 'review/submit', designedBy: 'Ploy', at });
  review(serverId, { type: 'review/approve', reviewer: 'Somchai', at });

  // MDF-1: L-shaped with a column, mixed ownership, a populated Chassis, one blocker and one open note.
  plan(mdfId, { type: 'survey/update', patch: { width: 6, length: 5, networkHandoff: 'Carrier demarc in the south-west corner' } });
  plan(mdfId, { type: 'floor/update', id: firstAreaId(mdfId), patch: { x: 0, y: 0, w: 6, d: 3 } });
  plan(mdfId, { type: 'floor/add', rect: { id: newId(), x: 0, y: 3, w: 3, d: 2 } });
  plan(mdfId, { type: 'floor/cut', rect: { id: newId(), x: 2.6, y: 1.3, w: 0.4, d: 0.4 } });
  const m1 = rack('RK-01', 0.4, 0.6);
  const m2 = rack('RK-02', 1.0, 0.6);
  const customer = rack('RK-C1', 4.2, 0.6, 'customer');
  plan(mdfId, { type: 'object/add', object: m1 });
  plan(mdfId, { type: 'object/add', object: m2 });
  plan(mdfId, { type: 'object/add', object: customer });
  // Sits inside RK-C1's front clearance: the sample's one blocking issue.
  plan(mdfId, { type: 'object/add', object: existingRack('EX-01', 4.5, 1.9) });
  plan(mdfId, { type: 'device/place', id: newId(), rackId: m1.id, bottomU: 42, template: template('tpl-switch-1u') });
  const chassisId = newId();
  plan(mdfId, { type: 'device/place', id: chassisId, rackId: m1.id, bottomU: 1, template: template('tpl-chassis-6u') });
  for (let slot = 1; slot <= 5; slot += 1) plan(mdfId, { type: 'node/insert', id: newId(), chassisId, slot, template: template('tpl-node') });
  plan(mdfId, { type: 'device/place', id: newId(), rackId: m2.id, bottomU: 1, template: template('tpl-server-2u') });
  plan(mdfId, { type: 'device/place', id: newId(), rackId: m2.id, bottomU: 3, template: template('tpl-server-1u') });
  const mdfBoard = mcb('MCB-01', 0, 3.6, true);
  plan(mdfId, { type: 'object/add', object: mdfBoard });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), rackId: m1.id, sourceId: mdfBoard.id, label: 'Feed A' } });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), rackId: m2.id, sourceId: mdfBoard.id, label: 'Feed A' } });
  plan(mdfId, {
    type: 'reserved/add',
    rackId: customer.id,
    range: { id: newId(), label: 'Customer core switching', bottomU: 20, heightU: 12, demand: { kind: 'unknown' }, notes: 'Customer has not shared their equipment list.' },
  });
  review(mdfId, { type: 'note/add', id: newId(), text: 'Confirm the column position with the site team before install.', at });

  if (problems.length > 0) return err('invalid_value', `Couldn't build the sample project: ${problems[0]}`, []);
  const project = ws.projects[0]!;
  return ok({ ...project, isSample: true });
}

export function withSample(ws: Workspace, at: string): Result<Workspace> {
  const project = createSampleProject(at);
  if (!project.ok) return project;
  return ok({ ...ws, projects: [...ws.projects, project.value] });
}
