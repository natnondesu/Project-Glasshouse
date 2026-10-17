import { seedTemplates } from './catalog';
import { apply, type WorkspaceCommand } from './commands/workspace';
import type { PlanCommand } from './commands/plan';
import type { ReviewCommand } from './commands/review';
import { createWorkspace } from './factories';
import { newId } from './ids';
import { currentRevision, findRoom } from './lookup';
import type { CableType, Id, Port, Project, Rack, Template, Workspace } from './model/types';
import { err, ok, type Result } from './result';
import { createShowcaseProject } from './sampleShowcase';
import { existingRack, mcb, portRun, rack, template, thing } from './sampleKit';

export const SAMPLE_PROJECT_NAME = 'Sample · Northgate DC';

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
  const place = (roomId: Id, rackId: Id, bottomU: number, tpl: Template): Id => {
    const id = newId();
    plan(roomId, { type: 'device/place', id, rackId, bottomU, template: tpl });
    return id;
  };
  const ports = (roomId: Id, deviceId: Id, list: Port[]): void => list.forEach((port) => plan(roomId, { type: 'port/add', deviceId, port }));
  const cable = (roomId: Id, a: [Id, string], b: [Id, string], label: string, kind: CableType): void =>
    plan(roomId, { type: 'link/add', link: { id: newId(), a: { deviceId: a[0], port: a[1] }, b: { deviceId: b[0], port: b[1] }, label, cable: kind } });
  const setState = (roomId: Id, ids: Id[], state: 'deployed' | 'maintenance'): void => run({ type: 'equipment/state', roomId, ids, state });
  // Optional extras from the team catalog (their IDs aren't fixed): shown when the catalog has them.
  const misc = seedTemplates().filter((t) => t.category === 'misc');

  const projectId = newId();
  const siteId = newId();
  const serverId = newId();
  const mdfId = newId();
  run({ type: 'project/create', id: projectId, name: SAMPLE_PROJECT_NAME });
  run({ type: 'site/create', projectId, id: siteId, name: 'Bangna campus' });
  run({ type: 'room/create', siteId, id: serverId, name: 'Server room A' });
  run({ type: 'room/create', siteId, id: mdfId, name: 'MDF-1' });

  // Server room A: rectangular, two populated racks, Approved so the Install sheet works at once.
  plan(serverId, { type: 'survey/update', patch: { width: 6, length: 4.8, powerBudget: 8000, networkHandoff: 'Fibre patch panel on the north wall' } });
  plan(serverId, { type: 'floor/update', id: firstAreaId(serverId), patch: { x: 0, y: 0, w: 6, d: 4.8 } });
  const s1 = rack('RK-01', 1.0, 0.7);
  const s2 = rack('RK-02', 1.8, 0.7);
  plan(serverId, { type: 'object/add', object: s1 });
  plan(serverId, { type: 'object/add', object: s2 });
  // A small but complete network: two cores joined by a LAG, two access switches and an edge
  // router each uplinked to both cores (MLAG: one LAG per device, grouped at each core), servers
  // on the access switches, one of them bonded. A wall cabinet holds the edge router.
  const s3: Rack = { ...rack('RK-03', 2.6, 0), capacityU: 12, w: 0.6, d: 0.5, usableDepthMm: 400, wallBottomM: 1.2, clearance: { front: 1, rear: 0 } };
  plan(serverId, { type: 'object/add', object: s3 });
  const named = (roomId: Id, rackId: Id, bottomU: number, tpl: Template, name: string): Id => {
    const id = place(roomId, rackId, bottomU, tpl);
    plan(roomId, { type: 'device/update', id, patch: { name } });
    return id;
  };
  const core1 = named(serverId, s1.id, 42, template('tpl-switch-1u'), 'CORE-01');
  const acc1 = named(serverId, s1.id, 41, template('tpl-switch-1u'), 'ACC-01');
  const core2 = named(serverId, s2.id, 42, template('tpl-switch-1u'), 'CORE-02');
  const acc2 = named(serverId, s2.id, 41, template('tpl-switch-1u'), 'ACC-02');
  const edge = named(serverId, s3.id, 12, template('tpl-switch-1u'), 'EDGE-01');
  // Real servers (the Server category), not the Cloudbridge appliances the catalog files under Network.
  const compute = template('tpl-server-4u');
  const storageTpl = seedTemplates().find((t) => t.category === 'server' && t.mounting === 'rack' && /storage/i.test(t.label)) ?? compute;
  const s1Servers = [place(serverId, s1.id, 1, storageTpl), place(serverId, s1.id, 5, compute), place(serverId, s1.id, 9, compute)];
  const s2Servers = [1, 5].map((u) => place(serverId, s2.id, u, compute));
  for (const core of [core1, core2]) ports(serverId, core, portRun('Te1/1/', 1, 8, 'sfp_plus', '10G'));
  for (const acc of [acc1, acc2]) ports(serverId, acc, [...portRun('Gi1/0/', 1, 24, 'rj45', '1G'), ...portRun('Te1/1/', 1, 4, 'sfp_plus', '10G')]);
  ports(serverId, edge, [...portRun('Gi0/', 1, 4, 'rj45', '1G'), ...portRun('Te0/', 1, 2, 'sfp_plus', '10G')]);
  [...s1Servers, ...s2Servers].forEach((id) => ports(serverId, id, portRun('eth', 0, 1, 'rj45', '1G')));
  const lagOn = (deviceId: Id, names: string[], group: string): void => names.forEach((name) => plan(serverId, { type: 'port/update', deviceId, name, patch: { lag: group } }));
  // Core to core: two 10G links in Po1.
  cable(serverId, [core1, 'Te1/1/7'], [core2, 'Te1/1/7'], 'ISL-01', 'om4');
  cable(serverId, [core1, 'Te1/1/8'], [core2, 'Te1/1/8'], 'ISL-02', 'om4');
  lagOn(core1, ['Te1/1/7', 'Te1/1/8'], 'Po1');
  lagOn(core2, ['Te1/1/7', 'Te1/1/8'], 'Po1');
  // Each access switch and the edge router: one uplink to each core, bundled on both sides.
  const uplinks: [Id, string, string, string][] = [
    [acc1, 'Te1/1/', 'Po10', 'Te1/1/1'],
    [acc2, 'Te1/1/', 'Po20', 'Te1/1/2'],
    [edge, 'Te0/', 'Po30', 'Te1/1/3'],
  ];
  uplinks.forEach(([dev, prefix, group, corePort], i) => {
    cable(serverId, [dev, `${prefix}1`], [core1, corePort], `UPL-${i + 1}1`, 'om4');
    cable(serverId, [dev, `${prefix}2`], [core2, corePort], `UPL-${i + 1}2`, 'om4');
    lagOn(dev, [`${prefix}1`, `${prefix}2`], group);
    lagOn(core1, [corePort], group);
    lagOn(core2, [corePort], group);
  });
  // Servers: SRV-01 (storage) bonded to ACC-01 on Po11; the rest on one NIC each.
  const [stor, ...rk1Rest] = s1Servers as [Id, ...Id[]];
  cable(serverId, [stor, 'eth0'], [acc1, 'Gi1/0/1'], 'C-001', 'cat6');
  cable(serverId, [stor, 'eth1'], [acc1, 'Gi1/0/2'], 'C-002', 'cat6');
  plan(serverId, { type: 'port/update', deviceId: stor, name: 'eth0', patch: { lag: 'bond0' } });
  plan(serverId, { type: 'port/update', deviceId: stor, name: 'eth1', patch: { lag: 'bond0' } });
  lagOn(acc1, ['Gi1/0/1', 'Gi1/0/2'], 'Po11');
  rk1Rest.forEach((id, i) => cable(serverId, [id, 'eth0'], [acc1, `Gi1/0/${i + 3}`], `C-${String(i + 3).padStart(3, '0')}`, 'cat6'));
  s2Servers.forEach((id, i) => cable(serverId, [id, 'eth0'], [acc2, `Gi1/0/${i + 1}`], `C-${String(i + 11).padStart(3, '0')}`, 'cat6'));
  // VLANs: servers on 10, storage on 20, every switch-to-switch LAG trunks all with management native.
  // A LAG member's VLAN setting applies to the whole LAG, so one member each is enough.
  const vlan = (roomId: Id, vid: number, name: string): void => plan(roomId, { type: 'vlan/add', vlan: { vid, name } });
  const access = (roomId: Id, deviceId: Id, port: string, vid: number): void => plan(roomId, { type: 'port/vlan', deviceId, name: port, vlan: { mode: 'access', vid } });
  const trunk = (deviceId: Id, port: string): void => plan(serverId, { type: 'port/vlan', deviceId, name: port, vlan: { mode: 'trunk', allowed: 'all', native: 99 } });
  vlan(serverId, 10, 'Servers');
  vlan(serverId, 20, 'Storage');
  vlan(serverId, 99, 'Management');
  access(serverId, stor, 'eth0', 20);
  access(serverId, acc1, 'Gi1/0/1', 20);
  rk1Rest.forEach((id, i) => {
    access(serverId, id, 'eth0', 10);
    access(serverId, acc1, `Gi1/0/${i + 3}`, 10);
  });
  s2Servers.forEach((id, i) => {
    access(serverId, id, 'eth0', 10);
    access(serverId, acc2, `Gi1/0/${i + 1}`, 10);
  });
  for (const core of [core1, core2]) ['Te1/1/7', 'Te1/1/1', 'Te1/1/2', 'Te1/1/3'].forEach((p) => trunk(core, p));
  trunk(acc1, 'Te1/1/1');
  trunk(acc2, 'Te1/1/1');
  trunk(edge, 'Te0/1');
  // Two boards so RK-01 has independent A and B feeds.
  const board1 = mcb('MCB-01', 0, 2.2, true);
  const board2 = mcb('MCB-02', 3.6, 0, false);
  plan(serverId, { type: 'object/add', object: board1 });
  plan(serverId, { type: 'object/add', object: board2 });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), targetId: s1.id, sourceId: board1.id, label: 'Feed A', way: 1 } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), targetId: s1.id, sourceId: board2.id, label: 'Feed B', way: 1 } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), targetId: s2.id, sourceId: board1.id, label: 'Feed A', way: 2 } });
  // MCB-01 as the site has it: three-phase, labelled ways.
  plan(serverId, { type: 'panel/configure', id: board1.id, patch: { phase: 'three', wayCount: 12 } });
  plan(serverId, { type: 'panel/way', id: board1.id, way: 1, patch: { label: 'RK-01 A' } });
  plan(serverId, { type: 'panel/way', id: board1.id, way: 2, patch: { label: 'RK-02 A' } });
  // Power chain: MCB-02 feeds a UPS, which carries RK-02's B feed.
  const ups = thing('ups', 'UPS-01', 4.9, 0.3);
  plan(serverId, { type: 'object/add', object: ups });
  plan(serverId, { type: 'panel/way', id: board2.id, way: 2, patch: { ratingA: 32, label: 'UPS-01 in' } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), targetId: ups.id, sourceId: board2.id, label: 'Feed A', way: 2 } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), targetId: s2.id, sourceId: ups.id, label: 'Feed B' } });
  plan(serverId, { type: 'feed/add', feed: { id: newId(), targetId: s3.id, sourceId: board2.id, label: 'Feed A', way: 3 } });
  // The way in: a sliding door on the south wall, sliding to the right.
  plan(serverId, { type: 'object/add', object: thing('door', 'D-01', 4.2, 4.7, { angle: 180, hinge: 'right', opening: 'slide' }) });
  plan(serverId, { type: 'dimension/add', dimension: { id: newId(), a: { kind: 'point', x: 0, y: 1.3 }, b: { kind: 'object', objectId: s1.id, u: -0.5, v: 0 }, offset: 0.25 } });
  review(serverId, { type: 'review/submit', designedBy: 'Ploy', at });
  review(serverId, { type: 'review/approve', reviewer: 'Somchai', at });
  // On-site progress after approval: RK-01 is in, one of its servers is being serviced.
  setState(serverId, [core1, acc1, ...s1Servers], 'deployed');
  setState(serverId, [s1Servers[2]!], 'maintenance');

  // MDF-1: L-shaped with a column, mixed ownership, a populated Chassis, one blocker and one open note.
  plan(mdfId, { type: 'survey/update', patch: { width: 6, length: 5, networkHandoff: 'Carrier demarc in the south-west corner' } });
  plan(mdfId, { type: 'floor/update', id: firstAreaId(mdfId), patch: { x: 0, y: 0, w: 6, d: 3 } });
  plan(mdfId, { type: 'floor/add', rect: { id: newId(), x: 0, y: 3, w: 3, d: 2 } });
  plan(mdfId, { type: 'floor/cut', rect: { id: newId(), x: 2.6, y: 1.3, w: 0.4, d: 0.4, kind: 'solid' } });
  // A cable shaft: no floor, but nothing to walk around either.
  plan(mdfId, { type: 'floor/cut', rect: { id: newId(), x: 5.3, y: 2.4, w: 0.5, d: 0.4, kind: 'void' } });
  const m1 = rack('RK-01', 0.4, 0.6);
  const m2 = rack('RK-02', 1.2, 0.6);
  const customer = rack('RK-C1', 4.2, 0.6, 'customer');
  plan(mdfId, { type: 'object/add', object: m1 });
  plan(mdfId, { type: 'object/add', object: m2 });
  plan(mdfId, { type: 'object/add', object: customer });
  // Sits inside RK-C1's front clearance: the sample's one blocking issue.
  plan(mdfId, { type: 'object/add', object: existingRack('EX-01', 4.5, 1.9) });
  const mdfSwitch = place(mdfId, m1.id, 42, template('tpl-switch-1u'));
  const chassisId = place(mdfId, m1.id, 1, template('tpl-chassis-6u'));
  const nodes = [1, 2, 3, 4, 5].map((slot) => {
    const id = newId();
    plan(mdfId, { type: 'node/insert', id, chassisId, slot, template: template('tpl-node') });
    return id;
  });
  place(mdfId, m2.id, 1, template('tpl-server-2u'));
  place(mdfId, m2.id, 3, template('tpl-server-1u'));
  // Passive gear from the catalog's Misc category, when there is some.
  misc.slice(0, 2).forEach((t, i) => place(mdfId, m2.id, 42 - i, t));
  ports(mdfId, mdfSwitch, portRun('Gi1/0/', 1, 12, 'rj45', '1G'));
  nodes.forEach((id, i) => {
    ports(mdfId, id, [{ name: 'eth0', media: 'rj45', speed: '1G' }]);
    if (i < 3) cable(mdfId, [id, 'eth0'], [mdfSwitch, `Gi1/0/${i + 1}`], `N-${String(i + 1).padStart(2, '0')}`, 'cat6a');
  });
  vlan(mdfId, 10, 'Compute');
  vlan(mdfId, 99, 'Management');
  nodes.slice(0, 3).forEach((id, i) => {
    access(mdfId, id, 'eth0', 10);
    access(mdfId, mdfSwitch, `Gi1/0/${i + 1}`, 10);
  });
  const mdfBoard = mcb('MCB-01', 0, 3.6, true);
  plan(mdfId, { type: 'object/add', object: mdfBoard });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), targetId: m1.id, sourceId: mdfBoard.id, label: 'Feed A', way: 1 } });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), targetId: m2.id, sourceId: mdfBoard.id, label: 'Feed A', way: 2 } });
  // Every other kind of power source, each doing a job.
  const socket = thing('industrial_socket', 'IS-01', 0, 2.3, { angle: 270 });
  const floorBox = thing('floor_box', 'FB-01', 2.1, 0.8);
  const pdu = thing('pdu', 'PDU-01', 5.1, 0.1);
  for (const object of [socket, floorBox, pdu, thing('wall_plug', 'WP-01', 2.2, 4.9, { angle: 180 }), thing('furniture', 'DESK-01', 0.2, 4.2)]) plan(mdfId, { type: 'object/add', object });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), targetId: m1.id, sourceId: socket.id, label: 'Feed B' } });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), targetId: m2.id, sourceId: floorBox.id, label: 'Feed B' } });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), targetId: pdu.id, sourceId: mdfBoard.id, label: 'Feed A', way: 3 } });
  plan(mdfId, { type: 'feed/add', feed: { id: newId(), targetId: customer.id, sourceId: pdu.id, label: 'Feed A' } });
  plan(mdfId, { type: 'object/add', object: thing('door', 'D-01', 3.0, 0, { hinge: 'left' }) });
  plan(mdfId, { type: 'dimension/add', dimension: { id: newId(), a: { kind: 'object', objectId: customer.id, u: 0.5, v: 0 }, b: { kind: 'point', x: 6, y: 1.2 }, offset: -0.3 } });
  plan(mdfId, {
    type: 'reserved/add',
    rackId: customer.id,
    range: { id: newId(), label: 'Customer core switching', bottomU: 20, heightU: 12, demand: { kind: 'unknown' }, notes: 'Customer has not shared their equipment list.' },
  });
  review(mdfId, { type: 'note/add', id: newId(), text: 'Confirm the column position with the site team before install.', at });
  setState(mdfId, nodes.slice(0, 3), 'deployed');

  if (problems.length > 0) return err('invalid_value', `Couldn't build the sample project: ${problems[0]}`, []);
  const project = ws.projects[0]!;
  return ok({ ...project, isSample: true });
}

/** Both sample projects: the small Northgate one to start with, and the Riverside showcase of everything. */
export function withSample(ws: Workspace, at: string): Result<Workspace> {
  const project = createSampleProject(at);
  if (!project.ok) return project;
  const showcase = createShowcaseProject(at);
  if (!showcase.ok) return showcase;
  return ok({ ...ws, projects: [...ws.projects, project.value, showcase.value] });
}
