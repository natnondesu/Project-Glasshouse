import { applyPlanCommand, createObject, emptyContent, seedTemplates, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { searchRoom } from './search';

const t = (id: string) => seedTemplates().find((x) => x.id === id) as Template;
function room(): PlanContent {
  const cmds: PlanCommand[] = [
    { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), id: 'rk', name: 'RK-01', notes: 'Near the column' } },
    { type: 'object/add', object: { ...createObject('mcb', { x: 0, y: 2 }, []), id: 'mcb', name: 'MCB-01', angle: 270 } },
    { type: 'object/add', object: { ...createObject('door', { x: 3, y: 0 }, []), id: 'door', name: 'D-01' } },
    { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 1, template: t('tpl-server-2u') },
    { type: 'device/update', id: 'srv', patch: { config: '2x Xeon, 512 GB RAM' } },
    { type: 'device/place', id: 'ch', rackId: 'rk', bottomU: 10, template: t('tpl-chassis-6u') },
    { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 1, template: t('tpl-node') },
    { type: 'reserved/add', rackId: 'rk', range: { id: 'rsv', label: 'Customer core', bottomU: 30, heightU: 4, demand: { kind: 'unknown' }, notes: '' } },
    { type: 'feed/add', feed: { id: 'f', rackId: 'rk', sourceId: 'mcb', label: 'Feed A' } },
  ];
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyContent());
}

describe('searchRoom', () => {
  it('finds a device by name and points at its rack for the plan and itself for the elevation', () => {
    const [hit] = searchRoom(room(), 'srv-01');
    expect(hit).toMatchObject({ kind: 'device', name: 'SRV-01', objectId: 'rk', elementId: 'srv', detail: 'Device · Server 2U in RK-01, U1–U2' });
  });

  it('matches every word anywhere: configuration, notes, models and labels', () => {
    expect(searchRoom(room(), 'xeon 512').map((h) => h.name)).toEqual(['SRV-01']);
    expect(searchRoom(room(), 'column').map((h) => h.name)).toEqual(['RK-01']);
    expect(searchRoom(room(), 'customer core')[0]).toMatchObject({ kind: 'reserved', elementId: 'rsv', objectId: 'rk' });
    expect(searchRoom(room(), 'node')[0]).toMatchObject({ kind: 'node', name: 'NODE-01', elementId: 'n1', objectId: 'rk' });
    expect(searchRoom(room(), 'feed a mcb')[0]).toMatchObject({ kind: 'feed', objectId: 'rk' });
    expect(searchRoom(room(), 'door')[0]).toMatchObject({ kind: 'object', name: 'D-01', objectId: 'door', elementId: null });
  });

  it('ranks exact and leading name matches first, ignores case, and returns nothing for blank queries', () => {
    const names = searchRoom(room(), 'rk').map((h) => h.name);
    expect(names[0]).toBe('RK-01');
    expect(searchRoom(room(), '   ')).toEqual([]);
    expect(searchRoom(room(), 'MCB-01')[0]!.name).toBe('MCB-01');
  });
});
