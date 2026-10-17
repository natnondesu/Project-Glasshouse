import { describe, expect, it } from 'vitest';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { createWorkspace } from './factories';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';
import { siteLinkIssues, siteRooms } from './siteLinks';

const SW: Template = {
  id: 'tpl-sw', version: 1, label: 'Switch', model: '', category: 'network', mounting: 'rack', heightU: 1, depthMm: 400, demand: { kind: 'known', watts: 100 },
  color: '', defaultConfig: '', slotCount: null, slotsPerRow: null, illustrative: false, ports: [{ count: 4, prefix: 'Gi', start: 1, media: 'rj45', speed: '1G' }],
};
function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((acc, cmd) => {
    const r = apply(acc, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}
const room = (id: string): WorkspaceCommand[] => [
  { type: 'room/create', siteId: 's', id, floorAreaId: `fa-${id}`, name: id.toUpperCase() },
  { type: 'plan', roomId: id, command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: `${id}-rk`, name: 'RK-01' } } },
  { type: 'plan', roomId: id, command: { type: 'device/place', id: `${id}-sw`, rackId: `${id}-rk`, bottomU: 40, template: SW } },
];
const site = (): Workspace => run(createWorkspace(), { type: 'project/create', id: 'p', name: 'P' }, { type: 'site/create', projectId: 'p', id: 's', name: 'S' }, ...room('mdf'), ...room('idf'));
const uplink = (from: string, port: string, to: string, toPort: string): WorkspaceCommand => ({ type: 'plan', roomId: from, command: { type: 'port/remote', deviceId: `${from}-sw`, name: port, remote: { roomId: to, deviceId: `${to}-sw`, port: toPort } } });
const codes = (ws: Workspace, roomId: string) => siteLinkIssues(ws, roomId).map((i) => i.code);

describe('uplinks between rooms of a site', () => {
  it('offers the other rooms of the site', () => {
    expect(siteRooms(site(), 'mdf').map((r) => r.name)).toEqual(['IDF']);
  });

  it('warns until the far port points back, then is quiet in both rooms', () => {
    let ws = run(site(), uplink('mdf', 'Gi4', 'idf', 'Gi1'));
    expect(codes(ws, 'mdf')).toEqual(['remote_unpaired']);
    ws = run(ws, uplink('idf', 'Gi1', 'mdf', 'Gi4'));
    expect(codes(ws, 'mdf')).toEqual([]);
    expect(codes(ws, 'idf')).toEqual([]);
  });

  it('flags a far port that is gone or cabled inside its own room', () => {
    let ws = run(site(), uplink('mdf', 'Gi4', 'idf', 'Gi9'));
    expect(codes(ws, 'mdf')).toEqual(['remote_missing']);
    ws = run(ws, uplink('mdf', 'Gi4', 'idf', 'Gi1'), { type: 'plan', roomId: 'idf', command: { type: 'link/add', link: { id: 'l', a: { deviceId: 'idf-sw', port: 'Gi1' }, b: { deviceId: 'idf-sw', port: 'Gi2' }, label: '', cable: null } } });
    expect(codes(ws, 'mdf')).toEqual(['remote_conflict']);
  });

  it('keeps a port to either a cable in its room or an uplink, not both', () => {
    const ws = run(site(), uplink('mdf', 'Gi4', 'idf', 'Gi1'));
    const r = apply(ws, { type: 'plan', roomId: 'mdf', command: { type: 'link/add', link: { id: 'l', a: { deviceId: 'mdf-sw', port: 'Gi4' }, b: { deviceId: 'mdf-sw', port: 'Gi1' }, label: '', cable: null } } });
    expect(r.ok ? 'ok' : r.error.message).toBe('SW-01 Gi4 is an uplink to another room. Unlink that first.');
  });
});

it('lists uplinks in the cable schedule, the far end named by the caller', async () => {
  const { cableSchedule } = await import('./ports');
  const { currentRevision, findRoom } = await import('./lookup');
  const ws = run(site(), uplink('mdf', 'Gi4', 'idf', 'Gi1'));
  const content = currentRevision(findRoom(ws, 'mdf')!.room.plan).content;
  expect(cableSchedule(content)).toEqual([]);
  expect(cableSchedule(content, (r) => ({ rack: 'IDF', device: r.deviceId, port: r.port }))).toMatchObject([{ from: { device: 'SW-01', port: 'Gi4' }, to: { rack: 'IDF', device: 'idf-sw', port: 'Gi1' } }]);
});
