import { createObject, localToWorld, type Chassis, type PlanContent, type Rack, type Template, emptyContent, seedTemplates, apply, createWorkspace, currentRevision, findRoom } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { buildScene, rotateY, U_M, RACK_BASE_M } from './scene';

function contentWith(rackAngle: number): PlanContent {
  const t = (id: string) => seedTemplates().find((x) => x.id === id) as Template;
  let ws = createWorkspace();
  const run = (cmd: Parameters<typeof apply>[1]) => {
    const r = apply(ws, cmd);
    if (!r.ok) throw new Error(r.error.message);
    ws = r.value;
  };
  run({ type: 'project/create', id: 'p', name: 'P' });
  run({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  run({ type: 'room/create', siteId: 's', id: 'r', name: 'R' });
  run({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1.5, y: 1.2 }, []) as Rack), id: 'rk', name: 'RK-01', angle: rackAngle } } });
  run({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: 'rk', bottomU: 3, template: t('tpl-server-2u') } });
  run({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: 'rk', bottomU: 10, template: t('tpl-chassis-6u') } });
  run({ type: 'plan', roomId: 'r', command: { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 2, template: t('tpl-node') } });
  return currentRevision(findRoom(ws, 'r')!.room.plan).content;
}

describe('room 3D scene', () => {
  it.each([0, 90, 135])('turns a rack at %d° so its 3D front faces the same way as its plan Front', (angle) => {
    const content = contentWith(angle);
    const rack = content.objects[0] as Rack;
    const [box] = buildScene(content).racks;
    const centre = localToWorld(rack, [0, 0]);
    const front = localToWorld(rack, [0, 1]);
    const [fx, fz] = rotateY(box!.yaw, [0, 1]);
    expect(fx).toBeCloseTo(front[0] - centre[0], 6);
    expect(fz).toBeCloseTo(front[1] - centre[1], 6);
    expect(box!.position[0]).toBeCloseTo(centre[0], 6);
    expect(box!.position[2]).toBeCloseTo(centre[1], 6);
  });

  it('stands racks on the floor and puts device faces at their U heights', () => {
    const scene = buildScene(contentWith(0));
    const rack = scene.racks[0]!;
    expect(rack.position[1]).toBeCloseTo(rack.size[1] / 2, 6);
    const srv = rack.faces.find((f) => f.id === 'srv')!;
    expect(srv.y).toBeCloseTo(RACK_BASE_M + 2 * U_M + U_M, 6);
    expect(srv.height).toBeLessThan(2 * U_M);
    expect(srv.z).toBeGreaterThan(rack.size[2] / 2);
  });

  it('gives devices their real depth from the front of the rack, and reserved ranges a block', () => {
    const rack = buildScene(contentWith(0)).racks[0]!;
    const srv = rack.faces.find((f) => f.id === 'srv')!;
    expect(srv.depth).toBeCloseTo(0.78, 6);
    expect(srv.heightU).toBe(2);
    expect(rack.capacityU).toBe(42);
    expect(rack.usedU).toBe(8);
  });

  it('draws chassis slots and marks the filled ones', () => {
    const rack = buildScene(contentWith(0)).racks[0]!;
    const chassis = contentWith(0).objects.flatMap((o) => (o.type === 'rack' ? o.devices : [])).find((d): d is Chassis => d.kind === 'chassis')!;
    const slots = rack.slots.filter((s) => s.chassisId === chassis.id);
    expect(slots).toHaveLength(5);
    expect(slots.filter((s) => s.filled).map((s) => s.slot)).toEqual([2]);
  });

  it('builds the floor from the footprint and other objects as boxes', () => {
    const content: PlanContent = { ...emptyContent(), objects: [createObject('existing_rack', { x: 1, y: 1 }, [])] };
    const scene = buildScene(content);
    expect(scene.floor).toHaveLength(1);
    expect(scene.others[0]).toMatchObject({ type: 'existing_rack' });
    expect(scene.others[0]!.position[1]).toBeCloseTo(scene.others[0]!.size[1] / 2, 6);
    const withColumn = buildScene({ ...content, survey: { ...content.survey, cutOuts: [{ id: 'c', x: 2, y: 1, w: 0.4, d: 0.4 }] } });
    expect(withColumn.columns).toEqual([{ id: 'c', position: [2.2, 1.3, 1.2], size: [0.4, 2.6, 0.4] }]);
  });
});

describe('power feeds in 3D', () => {
  it('drops from under the panel and ends at the rack rear', () => {
    const base = contentWith(0);
    const panel = { ...createObject('mcb', { x: 0, y: 2 }, []), id: 'm', angle: 90 };
    const content = { ...base, objects: [...base.objects, panel], feeds: [{ id: 'f', targetId: 'rk', sourceId: 'm', label: 'Feed A' }] };
    const [feed] = buildScene(content).feeds;
    expect(feed!.dropFrom).toBeCloseTo(0.6, 6);
    const rack = content.objects[0] as Rack;
    expect(feed!.route[feed!.route.length - 1]).toEqual(localToWorld(rack, [0, -rack.d / 2]));
  });
});
