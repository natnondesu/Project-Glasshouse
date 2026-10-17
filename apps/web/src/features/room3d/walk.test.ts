import { createObject, emptyContent, applyPlanCommand, type PlanCommand, type PlanContent, type Rack } from '@glasshouse/domain';
import { describe, expect, it } from 'vitest';
import { buildScene, rotateY } from './scene';
import { entrance, look, moveTo, standAt, standHere, step, walkable, type WalkCamera } from './walk';

function room(...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyContent());
}
// The default room, with one rack near the middle facing down the plan.
const content = room({ type: 'object/add', object: { ...(createObject('rack', { x: 2, y: 2 }, []) as Rack), id: 'rk', name: 'RK-01' } });
const scene = buildScene(content);
const rack = scene.racks[0]!;

describe('walking the room', () => {
  it('stands on the floor, clear of walls and racks by a body’s width', () => {
    expect(walkable(scene, 0.5, 0.5)).toBe(true);
    expect(walkable(scene, 0.1, 0.5)).toBe(false);
    expect(walkable(scene, rack.position[0], rack.position[2])).toBe(false);
    expect(walkable(scene, -1, 1)).toBe(false);
  });

  it('slides along a rack instead of walking through it', () => {
    const at: WalkCamera = { x: rack.position[0] - 1, z: rack.position[2], heading: 0, pitch: 0 };
    const pushed = moveTo(scene, at, rack.position[0], rack.position[2] + 0.1);
    expect(pushed.x).toBe(at.x);
    expect(pushed.z).toBeCloseTo(rack.position[2] + 0.1);
  });

  it('stands in front of a rack’s Front, looking at it', () => {
    const c = standAt(scene, rack);
    const [fx, fz] = rotateY(rack.yaw, [0, 1]);
    // In front: along the Front direction from the rack's centre.
    expect((c.x - rack.position[0]) * fx + (c.z - rack.position[2]) * fz).toBeGreaterThan(rack.size[2] / 2);
    // Facing back at it.
    expect(Math.sin(c.heading) * fx + Math.cos(c.heading) * fz).toBeCloseTo(-1);
    expect(walkable(scene, c.x, c.z)).toBe(true);
  });

  it('steps forward along the heading, and looks with the drag, never past straight up or down', () => {
    const c: WalkCamera = { x: 1, z: 1, heading: 0, pitch: 0 };
    expect(step(scene, c, 0.5, 0)).toMatchObject({ x: 1, z: 1.5 });
    expect(look(c, 0, -10_000).pitch).toBeLessThan(Math.PI / 2);
    expect(look(c, 100, 0).heading).toBeLessThan(0);
  });

  it('starts somewhere it can stand', () => {
    const start = entrance(scene);
    expect(walkable(scene, start.x, start.z)).toBe(true);
  });

  it('drops you where you click, or at the nearest free spot beside a rack, facing into the room', () => {
    expect(standHere(scene, 0.6, 0.6)).toMatchObject({ x: 0.6, z: 0.6 });
    const beside = standHere(scene, rack.position[0] + rack.size[0] / 2 + 0.2, rack.position[2])!;
    expect(walkable(scene, beside.x, beside.z)).toBe(true);
    expect(standHere(scene, -5, -5)).toBeNull();
  });
});

