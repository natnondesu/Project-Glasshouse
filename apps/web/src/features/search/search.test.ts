import { applyPlanCommand, createObject, emptyContent, seedTemplates, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { th } from '../../i18n/th';
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
    { type: 'feed/add', feed: { id: 'f', targetId: 'rk', sourceId: 'mcb', label: 'Feed A' } },
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

  it('finds the new room objects by name, type and what people call them', () => {
    const c = [
      { ...createObject('partition', { x: 2, y: 3 }, []), id: 'pt', name: 'PT-01' },
      { ...createObject('wall_split_ac', { x: 1, y: 0 }, []), id: 'ac', name: 'AC-01' },
      { ...createObject('precision_ac', { x: 3, y: 0.5 }, []), id: 'pac', name: 'PAC-01' },
      { ...createObject('display_wall', { x: 1, y: 3.8 }, []), id: 'dw', name: 'DW-01', notes: 'Command wall' },
    ].reduce((acc, object) => {
      const r = applyPlanCommand(acc, { type: 'object/add', object });
      if (!r.ok) throw new Error(r.error.message);
      return r.value;
    }, room());
    const ids = (q: string) => searchRoom(c, q).map((h) => h.objectId);
    expect(searchRoom(c, 'pt-01')[0]).toMatchObject({ kind: 'object', name: 'PT-01', objectId: 'pt', detail: 'Partition' });
    expect(ids('partition')).toEqual(['pt']);
    expect(ids('wall split').sort()).toEqual(['ac']);
    expect(ids('aircon').sort()).toEqual(['ac', 'pac']);
    expect(ids('air conditioning').sort()).toEqual(['ac', 'pac']);
    expect(ids('precision')).toEqual(['pac']);
    expect(ids('video wall')).toEqual(['dw']);
    expect(ids('led')).toEqual(['dw']);
    expect(ids('command')).toEqual(['dw']);
  });

  it('finds them by their Thai names too', () => {
    const c = applyPlanCommand(room(), { type: 'object/add', object: { ...createObject('wall_split_ac', { x: 1, y: 0 }, []), id: 'ac', name: 'AC-01' } });
    if (!c.ok) throw new Error(c.error.message);
    expect(searchRoom(c.value, 'แอร์', { m: th }).map((h) => h.objectId)).toEqual(['ac']);
    expect(searchRoom(c.value, 'เครื่องปรับอากาศ', { m: th }).map((h) => h.objectId)).toEqual(['ac']);
  });

  it('ranks exact and leading name matches first, ignores case, and returns nothing for blank queries', () => {
    const names = searchRoom(room(), 'rk').map((h) => h.name);
    expect(names[0]).toBe('RK-01');
    expect(searchRoom(room(), '   ')).toEqual([]);
    expect(searchRoom(room(), 'MCB-01')[0]!.name).toBe('MCB-01');
  });

  it('finds cables by label, device or port, opening the first end', () => {
    const r = (c: PlanContent, cmd: PlanCommand): PlanContent => {
      const x = applyPlanCommand(c, cmd);
      if (!x.ok) throw new Error(x.error.message);
      return x.value;
    };
    let c = r(room(), { type: 'port/add', deviceId: 'srv', port: { name: 'eth0', media: 'rj45', speed: '1G' } });
    c = r(c, { type: 'port/add', deviceId: 'ch', port: { name: 'mgmt', media: 'rj45', speed: '1G' } });
    c = r(c, { type: 'link/add', link: { id: 'l1', a: { deviceId: 'srv', port: 'eth0' }, b: { deviceId: 'ch', port: 'mgmt' }, label: 'C-042', cable: null } });
    expect(searchRoom(c, 'c-042')[0]).toMatchObject({ kind: 'link', objectId: 'rk', elementId: 'srv', detail: 'Cable · SRV-01 eth0 ↔ CH-01 mgmt' });
    expect(searchRoom(c, 'mgmt').some((h) => h.key === 'l1')).toBe(true);
  });
});
