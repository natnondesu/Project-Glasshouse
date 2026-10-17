import { seedTemplates } from './catalog';
import { apply, type WorkspaceCommand } from './commands/workspace';
import type { PlanCommand } from './commands/plan';
import type { ReviewCommand } from './commands/review';
import { createWorkspace } from './factories';
import { newId } from './ids';
import { currentRevision, findRoom } from './lookup';
import type { CableType, Id, PortGroup, Project, Rack, Template, Workspace } from './model/types';
import { err, ok, type Result } from './result';
import { existingRack, mcb, rack, template, thing } from './sampleKit';

export const SHOWCASE_PROJECT_NAME = 'Sample · Riverside Campus';

/** Gear with real front panels, kept to the sample: the team's own catalog isn't touched. */
function gear(key: string, label: string, category: Template['category'], heightU: number, watts: number, ports: PortGroup[], depthMm = 600): Template {
  return { id: `sample-${key}`, version: 1, label, model: label, category, mounting: 'rack', heightU, depthMm, demand: { kind: 'known', watts }, color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false, ports };
}
const CORE = gear('core', 'Core switch 24× SFP+ · 4× QSFP', 'network', 1, 350, [
  { count: 24, prefix: 'Te1/0/', start: 1, media: 'sfp_plus', speed: '10G', rows: 2 },
  { count: 4, prefix: 'Fo1/0/', start: 1, media: 'qsfp', speed: '40G' },
]);
const DIST = gear('dist', 'Distribution switch 48× SFP+ · 6× QSFP', 'network', 1, 420, [
  { count: 48, prefix: 'Te1/0/', start: 1, media: 'sfp_plus', speed: '10G', rows: 2 },
  { count: 6, prefix: 'Fo1/0/', start: 1, media: 'qsfp', speed: '40G' },
]);
const TOR = gear('tor', 'Top-of-rack switch 48× 10GBASE-T', 'network', 1, 300, [
  { count: 48, prefix: 'Eth1/', start: 1, media: 'rj45', speed: '10G', rows: 2 },
  { count: 4, prefix: 'Eth1/', start: 49, media: 'sfp_plus', speed: '10G' },
]);
const ACCESS = gear('access', 'Access switch 48× PoE · 4× SFP+', 'network', 1, 740, [
  { count: 48, prefix: 'Gi1/0/', start: 1, media: 'rj45', speed: '1G', rows: 2 },
  { count: 4, prefix: 'Te1/1/', start: 1, media: 'sfp_plus', speed: '10G' },
], 350);
const FIREWALL = gear('firewall', 'Firewall 1U', 'network', 1, 240, [
  { count: 8, prefix: 'port', start: 1, media: 'rj45', speed: '1G', rows: 2, order: 'linear' },
  { count: 2, prefix: 'x', start: 1, media: 'sfp_plus', speed: '10G' },
]);
const SERVER = gear('server', 'Compute server 2U', 'server', 2, 450, [{ count: 2, prefix: 'eno', start: 1, media: 'rj45', speed: '10G' }], 750);
const STORAGE = gear('storage', 'Storage server 4U', 'server', 4, 800, [{ count: 2, prefix: 'eno', start: 1, media: 'rj45', speed: '10G' }], 750);

const VLANS: [number, string][] = [
  [10, 'Servers'],
  [20, 'Storage'],
  [30, 'Cameras'],
  [40, 'Wi-Fi'],
  [50, 'Office'],
  [99, 'Management'],
];

/**
 * The showcase: a server room as big as a real one, with stacks, LAGs, VLANs, power and a draft with
 * issues, and three riser shafts whose access switches uplink across rooms to the distribution stack.
 * Built by replaying ordinary commands, like the Northgate sample, so it is valid by construction.
 */
export function createShowcaseProject(at: string): Result<Project> {
  let ws: Workspace = createWorkspace();
  const problems: string[] = [];
  const run = (cmd: WorkspaceCommand): void => {
    if (problems.length > 0) return;
    const next = apply(ws, cmd);
    if (next.ok) ws = next.value;
    else problems.push(`${cmd.type === 'plan' ? cmd.command.type : cmd.type}: ${next.error.message}`);
  };
  const plan = (roomId: Id, command: PlanCommand): void => run({ type: 'plan', roomId, command });
  const review = (roomId: Id, command: ReviewCommand): void => run({ type: 'review', roomId, command });
  // After a failed command nothing more runs, so a room may not exist yet: report, don't crash.
  const firstAreaId = (roomId: Id): Id => {
    const loc = findRoom(ws, roomId);
    return loc ? currentRevision(loc.room.plan).content.survey.floorAreas[0]!.id : '';
  };
  const room = (siteId: Id, name: string, width: number, length: number, patch: Record<string, unknown> = {}): Id => {
    const id = newId();
    run({ type: 'room/create', siteId, id, floorAreaId: newId(), name });
    plan(id, { type: 'survey/update', patch: { width, length, ...patch } });
    plan(id, { type: 'floor/update', id: firstAreaId(id), patch: { x: 0, y: 0, w: width, d: length } });
    VLANS.forEach(([vid, vname]) => plan(id, { type: 'vlan/add', vlan: { vid, name: vname } }));
    return id;
  };
  const place = (roomId: Id, rackId: Id, bottomU: number, tpl: Template, name?: string): Id => {
    const id = newId();
    plan(roomId, { type: 'device/place', id, rackId, bottomU, template: tpl });
    if (name) plan(roomId, { type: 'device/update', id, patch: { name } });
    return id;
  };
  const cable = (roomId: Id, a: [Id, string], b: [Id, string], label: string, kind: CableType): void =>
    plan(roomId, { type: 'link/add', link: { id: newId(), a: { deviceId: a[0], port: a[1] }, b: { deviceId: b[0], port: b[1] }, label, cable: kind } });
  const lag = (roomId: Id, deviceId: Id, names: string[], group: string): void => plan(roomId, { type: 'port/bulk', deviceId, names, patch: { lag: group } });
  const accessVlan = (roomId: Id, deviceId: Id, names: string[], vid: number): void => plan(roomId, { type: 'port/bulk', deviceId, names, patch: { vlan: { mode: 'access', vid } } });
  const trunk = (roomId: Id, deviceId: Id, names: string[]): void => plan(roomId, { type: 'port/bulk', deviceId, names, patch: { vlan: { mode: 'trunk', allowed: 'all', native: 99 } } });
  const setState = (roomId: Id, ids: Id[], state: 'deployed' | 'maintenance'): void => run({ type: 'equipment/state', roomId, ids, state });
  const misc = (pattern: RegExp): Template | undefined => seedTemplates().find((t) => t.category === 'misc' && pattern.test(t.label));
  const utpPanel = misc(/UTP/i);
  const fibrePanel = misc(/F\.?O\.?|fibre|fiber/i);
  const cableMgmt = misc(/cable management/i);
  const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

  const projectId = newId();
  const campus = newId();
  const annex = newId();
  run({ type: 'project/create', id: projectId, name: SHOWCASE_PROJECT_NAME });
  run({ type: 'site/create', projectId, id: campus, name: 'Riverside Campus' });
  run({ type: 'site/create', projectId, id: annex, name: 'Riverside Annex' });

  // ---- Server room: two network racks and five server racks facing each other across a cold aisle.
  const srv = room(campus, 'Server Room', 8, 6.5, { powerBudget: 60000, designLimitPct: 80, networkHandoff: 'Carrier fibre arrives on the north wall; patched to NET-01.' });
  plan(srv, { type: 'floor/cut', rect: { id: newId(), x: 5.6, y: 3.0, w: 0.5, d: 0.5, kind: 'solid' } });
  const front = ['NET-01', 'NET-02', 'SRV-01', 'SRV-02', 'SRV-03'].map((name, i) => rack(name, 0.6 + i * 0.8, 0.7));
  const back = ['SRV-04', 'SRV-05'].map((name, i) => ({ ...rack(name, 0.6 + i * 0.8, 3.2), angle: 180 }));
  for (const r of [...front, ...back]) plan(srv, { type: 'object/add', object: r });
  plan(srv, { type: 'object/add', object: { ...existingRack('EX-01', 2.4, 3.2), angle: 180, notes: 'Legacy PABX, to be retired.' } });
  const [net1, net2, ...rowA] = front as [Rack, Rack, ...Rack[]];
  const serverRacks = [...rowA, ...back];

  // Core and distribution: two-member stacks, one member in each network rack.
  const core1 = place(srv, net1.id, 42, CORE, 'CORE-01');
  const core2 = place(srv, net2.id, 42, CORE, 'CORE-02');
  const dist1 = place(srv, net1.id, 40, DIST, 'DIST-01');
  const dist2 = place(srv, net2.id, 40, DIST, 'DIST-02');
  const fw1 = place(srv, net1.id, 38, FIREWALL, 'FW-01');
  const fw2 = place(srv, net2.id, 38, FIREWALL, 'FW-02');
  for (const [r, u] of [[net1, 41], [net2, 41]] as const) if (fibrePanel) place(srv, r.id, u, fibrePanel);
  for (const [r, u] of [[net1, 39], [net2, 39]] as const) if (cableMgmt) place(srv, r.id, u, cableMgmt);
  plan(srv, { type: 'stack/create', stack: { id: newId(), name: 'CORE', members: [{ deviceId: core1, member: 1 }, { deviceId: core2, member: 2 }] } });
  plan(srv, { type: 'stack/create', stack: { id: newId(), name: 'DIST', members: [{ deviceId: dist1, member: 1 }, { deviceId: dist2, member: 2 }] } });
  // Stack rings: two cables between the members of each stack.
  cable(srv, [core1, 'Fo1/0/3'], [core2, 'Fo1/0/3'], 'STK-C1', 'dac');
  cable(srv, [core1, 'Fo1/0/4'], [core2, 'Fo1/0/4'], 'STK-C2', 'dac');
  cable(srv, [dist1, 'Fo1/0/5'], [dist2, 'Fo1/0/5'], 'STK-D1', 'dac');
  cable(srv, [dist1, 'Fo1/0/6'], [dist2, 'Fo1/0/6'], 'STK-D2', 'dac');
  // Core to distribution: four 40G links crossed between the members, one LAG.
  cable(srv, [core1, 'Fo1/0/1'], [dist1, 'Fo1/0/1'], 'CD-01', 'om4');
  cable(srv, [core2, 'Fo1/0/1'], [dist2, 'Fo1/0/1'], 'CD-02', 'om4');
  cable(srv, [core1, 'Fo1/0/2'], [dist2, 'Fo1/0/2'], 'CD-03', 'om4');
  cable(srv, [core2, 'Fo1/0/2'], [dist1, 'Fo1/0/2'], 'CD-04', 'om4');
  for (const sw of [core1, core2, dist1, dist2]) {
    lag(srv, sw, ['Fo1/0/1', 'Fo1/0/2'], 'Po1');
    trunk(srv, sw, ['Fo1/0/1']);
  }
  // Firewalls: an HA pair, each on both core members.
  [fw1, fw2].forEach((fw, i) => {
    cable(srv, [fw, 'x1'], [core1, `Te1/0/${i + 1}`], `FW-${i + 1}A`, 'om4');
    cable(srv, [fw, 'x2'], [core2, `Te1/0/${i + 1}`], `FW-${i + 1}B`, 'om4');
    lag(srv, fw, ['x1', 'x2'], 'ae0');
    lag(srv, core1, [`Te1/0/${i + 1}`], `Po2${i}`);
    lag(srv, core2, [`Te1/0/${i + 1}`], `Po2${i}`);
    trunk(srv, fw, ['x1']);
    trunk(srv, core1, [`Te1/0/${i + 1}`]);
    trunk(srv, core2, [`Te1/0/${i + 1}`]);
  });
  cable(srv, [fw1, 'port8'], [fw2, 'port8'], 'FW-HA', 'cat6a');

  // Server racks: a top-of-rack switch on a LAG to DIST, six servers, a chassis of five nodes, storage in two.
  const servers: Id[] = [];
  serverRacks.forEach((r, i) => {
    const n = i + 1;
    const tor = place(srv, r.id, 42, TOR, `TOR-0${n}`);
    if (utpPanel) place(srv, r.id, 41, utpPanel);
    const hosts = [1, 3, 5, 7, 9, 11].map((u, j) => place(srv, r.id, u, SERVER, `SRV-0${n}-${String(j + 1).padStart(2, '0')}`));
    const chassis = place(srv, r.id, 14, template('tpl-chassis-6u'), `CH-0${n}`);
    const nodes = [1, 2, 3, 4, 5].map((slot) => {
      const id = newId();
      plan(srv, { type: 'node/insert', id, chassisId: chassis, slot, template: template('tpl-node') });
      plan(srv, { type: 'node/update', id, patch: { name: `NODE-0${n}-${slot}`, demand: { kind: 'known', watts: 300 } } });
      plan(srv, { type: 'port/add', deviceId: id, port: { name: 'eth0', media: 'rj45', speed: '10G' } });
      return id;
    });
    hosts.forEach((h, j) => cable(srv, [h, 'eno1'], [tor, `Eth1/${j + 1}`], `S${n}-${String(j + 1).padStart(2, '0')}`, 'cat6a'));
    nodes.forEach((nd, j) => cable(srv, [nd, 'eth0'], [tor, `Eth1/${j + 7}`], `S${n}-N${j + 1}`, 'cat6a'));
    accessVlan(srv, tor, range('Eth1/', 1, 11), 10);
    hosts.forEach((h) => accessVlan(srv, h, ['eno1'], 10));
    if (n === 1 || n === 4) {
      // A bonded storage server: both NICs to the ToR in one LAG.
      const st = place(srv, r.id, 22, STORAGE, `STOR-0${n}`);
      cable(srv, [st, 'eno1'], [tor, 'Eth1/12'], `S${n}-ST1`, 'cat6a');
      cable(srv, [st, 'eno2'], [tor, 'Eth1/13'], `S${n}-ST2`, 'cat6a');
      lag(srv, st, ['eno1', 'eno2'], 'bond0');
      lag(srv, tor, ['Eth1/12', 'Eth1/13'], 'Po12');
      accessVlan(srv, tor, ['Eth1/12'], 20);
    }
    // Uplink: one 10G to each DIST member, a LAG on both sides.
    cable(srv, [tor, 'Eth1/49'], [dist1, `Te1/0/${n}`], `UP-${n}A`, 'om3');
    cable(srv, [tor, 'Eth1/50'], [dist2, `Te1/0/${n}`], `UP-${n}B`, 'om3');
    lag(srv, tor, ['Eth1/49', 'Eth1/50'], 'Po100');
    lag(srv, dist1, [`Te1/0/${n}`], `Po10${n}`);
    lag(srv, dist2, [`Te1/0/${n}`], `Po10${n}`);
    trunk(srv, tor, ['Eth1/49']);
    trunk(srv, dist1, [`Te1/0/${n}`]);
    trunk(srv, dist2, [`Te1/0/${n}`]);
    servers.push(...hosts);
  });

  // Power, A and B: every rack's A feed from MCB-A; B from MCB-B for the server racks, and from the UPS
  // (itself on MCB-B) for the network racks, which must ride through a mains dip.
  const mcbA = mcb('MCB-A', 0, 4.6, true);
  const mcbB = mcb('MCB-B', 5.0, 0, false);
  const ups = thing('ups', 'UPS-01', 6.9, 0.3);
  for (const o of [mcbA, mcbB, ups]) plan(srv, { type: 'object/add', object: o });
  for (const board of [mcbA, mcbB]) plan(srv, { type: 'panel/configure', id: board.id, patch: { phase: 'three', wayCount: 24 } });
  plan(srv, { type: 'panel/way', id: mcbB.id, way: 1, patch: { ratingA: 63, label: 'UPS-01 in' } });
  plan(srv, { type: 'feed/add', feed: { id: newId(), targetId: ups.id, sourceId: mcbB.id, label: 'Feed A', way: 1 } });
  [net1, net2, ...serverRacks].forEach((r, i) => {
    const way = i + 1;
    plan(srv, { type: 'panel/way', id: mcbA.id, way, patch: { ratingA: 32, label: `${r.name} A` } });
    plan(srv, { type: 'feed/add', feed: { id: newId(), targetId: r.id, sourceId: mcbA.id, label: 'Feed A', way } });
    if (r === net1 || r === net2) {
      plan(srv, { type: 'feed/add', feed: { id: newId(), targetId: r.id, sourceId: ups.id, label: 'Feed B' } });
    } else {
      plan(srv, { type: 'panel/way', id: mcbB.id, way: way + 1, patch: { ratingA: 32, label: `${r.name} B` } });
      plan(srv, { type: 'feed/add', feed: { id: newId(), targetId: r.id, sourceId: mcbB.id, label: 'Feed B', way: way + 1 } });
    }
  });
  plan(srv, { type: 'object/add', object: thing('door', 'D-01', 6.3, 6.4, { angle: 180, hinge: 'left' }) });
  plan(srv, { type: 'dimension/add', dimension: { id: newId(), a: { kind: 'point', x: 0, y: 2.3 }, b: { kind: 'object', objectId: back[0]!.id, u: -0.5, v: 0 }, offset: 0.3 } });
  review(srv, { type: 'review/submit', designedBy: 'Ploy', at });
  review(srv, { type: 'review/approve', reviewer: 'Somchai', at });
  setState(srv, [core1, core2, dist1, dist2, fw1, fw2, ...servers.slice(0, 18)], 'deployed');

  // ---- Shafts: a wall cabinet each, an access switch uplinked across rooms to the DIST stack.
  const shafts = [1, 2, 3].map((n) => {
    const id = room(campus, `Shaft L${n}`, 2.4, 2.2, { powerBudget: 3000, networkHandoff: `Riser fibre from the Server Room, DIST Te1/0/${20 + n}.` });
    const cab: Rack = { ...rack(`WR-L${n}`, 0.9, 0), capacityU: 12, w: 0.6, d: 0.5, usableDepthMm: 400, wallBottomM: 1.2, clearance: { front: 1, rear: 0 } };
    plan(id, { type: 'object/add', object: cab });
    // The catalog's patch panels are 750 mm deep: too deep for a 400 mm wall cabinet, so shafts carry the switch alone.
    const acc = place(id, cab.id, 12, ACCESS, `ACC-L${n}`);
    // Ports set in groups: desks, cameras, then access points.
    accessVlan(id, acc, range('Gi1/0/', 1, 24), 50);
    accessVlan(id, acc, range('Gi1/0/', 25, 40), 30);
    accessVlan(id, acc, range('Gi1/0/', 41, 48), 40);
    lag(id, acc, ['Te1/1/1', 'Te1/1/2'], 'Po1');
    trunk(id, acc, ['Te1/1/1']);
    // Uplinks to both DIST members in the Server Room.
    plan(id, { type: 'port/remote', deviceId: acc, name: 'Te1/1/1', remote: { roomId: srv, deviceId: dist1, port: `Te1/0/${20 + n}` } });
    plan(id, { type: 'port/remote', deviceId: acc, name: 'Te1/1/2', remote: { roomId: srv, deviceId: dist2, port: `Te1/0/${20 + n}` } });
    const board = mcb(`MCB-L${n}`, 0, 1.2, true);
    const small = { ...thing('ups', `UPS-L${n}`, 1.7, 0.1), w: 0.4, d: 0.5 };
    for (const o of [board, small, thing('door', 'D-01', 1.2, 2.1, { angle: 180, hinge: 'right' })]) plan(id, { type: 'object/add', object: o });
    plan(id, { type: 'feed/add', feed: { id: newId(), targetId: small.id, sourceId: board.id, label: 'Feed A', way: 1 } });
    plan(id, { type: 'feed/add', feed: { id: newId(), targetId: cab.id, sourceId: small.id, label: 'Feed A' } });
    return { id, acc, n };
  });
  // Shaft L1 is built and signed off; L2 and L3 are still drafts.
  review(shafts[0]!.id, { type: 'review/submit', designedBy: 'Ploy', at });
  review(shafts[0]!.id, { type: 'review/approve', reviewer: 'Somchai', at });
  setState(shafts[0]!.id, [shafts[0]!.acc], 'deployed');

  // ---- Server room R02: expansion work in progress, with what still holds it.
  review(srv, { type: 'review/new-draft', at });
  // The far ends of the shaft uplinks: L1 and L2 point back; L3's are still to do (its check says so).
  for (const { acc, n } of shafts.slice(0, 2)) {
    plan(srv, { type: 'port/remote', deviceId: dist1, name: `Te1/0/${20 + n}`, remote: { roomId: shafts[n - 1]!.id, deviceId: acc, port: 'Te1/1/1' } });
    plan(srv, { type: 'port/remote', deviceId: dist2, name: `Te1/0/${20 + n}`, remote: { roomId: shafts[n - 1]!.id, deviceId: acc, port: 'Te1/1/2' } });
  }
  for (const { n } of shafts) {
    lag(srv, dist1, [`Te1/0/${20 + n}`], `Po2${n}`);
    lag(srv, dist2, [`Te1/0/${20 + n}`], `Po2${n}`);
    trunk(srv, dist1, [`Te1/0/${20 + n}`]);
    trunk(srv, dist2, [`Te1/0/${20 + n}`]);
  }
  // A new rack dropped in the aisle: it blocks SRV-02's front clearance, and its customer space is unknown.
  const srv6: Rack = { ...rack('SRV-06', 3.0, 2.2, 'customer') };
  plan(srv, { type: 'object/add', object: srv6 });
  plan(srv, {
    type: 'reserved/add',
    rackId: srv6.id,
    range: { id: newId(), label: 'Tenant GPU servers', bottomU: 1, heightU: 20, demand: { kind: 'unknown' }, notes: 'Tenant to confirm their power draw.' },
  });
  review(srv, { type: 'note/add', id: newId(), text: 'SRV-06 has to move out of the aisle before this goes for review.', at });
  setState(srv, [servers[7]!], 'maintenance');

  // ---- The annex: another site, so uplinks there can't reach the campus rooms.
  const comms = room(annex, 'Comms Room', 3, 2.5, { powerBudget: 4000 });
  const annexRack: Rack = { ...rack('WR-01', 1.2, 0), capacityU: 12, w: 0.6, d: 0.5, usableDepthMm: 400, wallBottomM: 1.2, clearance: { front: 1, rear: 0 } };
  plan(comms, { type: 'object/add', object: annexRack });
  place(comms, annexRack.id, 12, ACCESS, 'ACC-AX1');
  plan(comms, { type: 'object/add', object: thing('door', 'D-01', 1.0, 2.4, { angle: 180, hinge: 'left' }) });

  if (problems.length > 0) return err('invalid_value', `Couldn't build the showcase sample: ${problems[0]}`, []);
  const project = ws.projects[0]!;
  return ok({ ...project, isSample: true });
}
