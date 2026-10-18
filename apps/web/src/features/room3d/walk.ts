import { CLEARANCE_HEADROOM_M, pointInPolygon } from '@glasshouse/domain';
import { rotateY, type Scene3D } from './scene';

/** Standing in the room: where (plan x, z), which way (heading), and how far up or down you look. */
export interface WalkCamera {
  x: number;
  z: number;
  /** Radians; forward is (sin h, cos h) in x and z. */
  heading: number;
  pitch: number;
}

/** Eye height of someone standing: what a rack face looks like from the aisle. */
export const EYE_M = 1.6;
/** How close to a wall, rack or column you can stand. */
const BODY_M = 0.25;
/** Where "stand at this rack" puts you: an aisle's width in front of its front face. */
const STAND_OFF_M = 1.2;
const LOOK_RAD_PER_PX = 0.005;
const MAX_PITCH = 1.2;

const forwardOf = (heading: number): [number, number] => [Math.sin(heading), Math.cos(heading)];

/** Where the camera looks, one metre ahead, for three's lookAt. */
export function lookTarget(c: WalkCamera): [number, number, number] {
  const [fx, fz] = forwardOf(c.heading);
  const flat = Math.cos(c.pitch);
  return [c.x + fx * flat, EYE_M + Math.sin(c.pitch), c.z + fz * flat];
}

/** Dragging looks around: right turns right, up looks up. */
export function look(c: WalkCamera, dx: number, dy: number): WalkCamera {
  return { ...c, heading: c.heading - dx * LOOK_RAD_PER_PX, pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, c.pitch - dy * LOOK_RAD_PER_PX)) };
}

interface Blocker {
  position: [number, number, number];
  size: [number, number, number];
  yaw: number;
}

/** A partition is solid except at its doorways; the rest of the room's boxes are solid as they stand. */
function solidBoxes(scene: Scene3D): Blocker[] {
  const boxes: Blocker[] = [...scene.racks, ...scene.columns.map((c) => ({ ...c, yaw: 0 }))];
  for (const o of scene.others) {
    if (o.type === 'door' || o.position[1] - o.size[1] / 2 >= CLEARANCE_HEADROOM_M) continue;
    if (o.type !== 'partition') {
      boxes.push(o);
      continue;
    }
    // Between the doorways, left to right along the wall.
    const edges = [-o.size[0] / 2, ...(o.openings ?? []).flatMap((g) => [g.from, g.to]), o.size[0] / 2];
    for (let i = 0; i < edges.length; i += 2) {
      const [from, to] = [edges[i]!, edges[i + 1]!];
      if (to - from <= 0) continue;
      const [dx, dz] = rotateY(o.yaw, [(from + to) / 2, 0]);
      boxes.push({ position: [o.position[0] + dx, o.position[1], o.position[2] + dz], size: [to - from, o.size[1], o.size[2]], yaw: o.yaw });
    }
  }
  return boxes;
}

/** Can someone stand here: on the floor, clear of racks, other objects and columns by a body's width? */
export function walkable(scene: Scene3D, x: number, z: number): boolean {
  const onFloor = scene.floor.some((poly) => pointInPolygon([x, z], poly));
  if (!onFloor) return false;
  // Keep a body's width from the floor's edge (the walls).
  const probes: [number, number][] = [[BODY_M, 0], [-BODY_M, 0], [0, BODY_M], [0, -BODY_M]];
  if (!probes.every(([dx, dz]) => scene.floor.some((poly) => pointInPolygon([x + dx, z + dz], poly)))) return false;
  return !solidBoxes(scene).some((o) => {
    const [lx, lz] = rotateY(-o.yaw, [x - o.position[0], z - o.position[2]]);
    return Math.abs(lx) < o.size[0] / 2 + BODY_M && Math.abs(lz) < o.size[2] / 2 + BODY_M;
  });
}

/** Moves toward (x, z); blocked, it slides along whichever axis is still free, like walking along a wall. */
export function moveTo(scene: Scene3D, c: WalkCamera, x: number, z: number): WalkCamera {
  if (walkable(scene, x, z)) return { ...c, x, z };
  if (walkable(scene, x, c.z)) return { ...c, x };
  if (walkable(scene, c.x, z)) return { ...c, z };
  return c;
}

/** A step: `ahead` metres forward (negative back) and `side` metres right (negative left). */
export function step(scene: Scene3D, c: WalkCamera, ahead: number, side: number): WalkCamera {
  const [fx, fz] = forwardOf(c.heading);
  // Right of forward, seen from above with z down the plan.
  const [rx, rz] = [-fz, fx];
  return moveTo(scene, c, c.x + fx * ahead + rx * side, c.z + fz * ahead + rz * side);
}

/** In front of a rack's front face, looking at it; or as close to that as there's floor for. */
export function standAt(scene: Scene3D, rack: { position: [number, number, number]; size: [number, number, number]; yaw: number }): WalkCamera {
  const [dx, dz] = rotateY(rack.yaw, [0, 1]);
  const facing = Math.atan2(-dx, -dz);
  for (let off = STAND_OFF_M; off >= 0.5; off -= 0.1) {
    const x = rack.position[0] + dx * (rack.size[2] / 2 + off);
    const z = rack.position[2] + dz * (rack.size[2] / 2 + off);
    if (walkable(scene, x, z)) return { x, z, heading: facing, pitch: -0.12 };
  }
  return { x: rack.position[0] + dx * (rack.size[2] / 2 + STAND_OFF_M), z: rack.position[2] + dz * (rack.size[2] / 2 + STAND_OFF_M), heading: facing, pitch: -0.12 };
}

/** Where a walk starts: just inside the door, facing into the room; else the free spot nearest the middle. */
export function entrance(scene: Scene3D): WalkCamera {
  const cx = scene.width / 2;
  const cz = scene.length / 2;
  const door = scene.others.find((o) => o.type === 'door');
  if (door) {
    // Step in from the door toward the middle of the room until there's floor to stand on.
    const toward = Math.atan2(cx - door.position[0], cz - door.position[2]);
    const [fx, fz] = forwardOf(toward);
    for (let d = 0.6; d < Math.max(scene.width, scene.length); d += 0.2) {
      const x = door.position[0] + fx * d;
      const z = door.position[2] + fz * d;
      if (walkable(scene, x, z)) return { x, z, heading: toward, pitch: 0 };
    }
  }
  for (let r = 0; r < Math.max(scene.width, scene.length); r += 0.2) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (walkable(scene, x, z)) return { x, z, heading: Math.PI, pitch: 0 };
    }
  }
  return { x: cx, z: cz, heading: Math.PI, pitch: 0 };
}

/**
 * Dropped at a spot on the floor, facing the middle of the room; a spot too close to a rack or wall
 * moves to the nearest place someone can stand (null when there's none within a metre).
 */
export function standHere(scene: Scene3D, x: number, z: number): WalkCamera | null {
  const face = (px: number, pz: number): WalkCamera => ({ x: px, z: pz, heading: Math.atan2(scene.width / 2 - px, scene.length / 2 - pz), pitch: 0 });
  if (walkable(scene, x, z)) return face(x, z);
  for (let r = 0.1; r <= 1; r += 0.1) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (walkable(scene, px, pz)) return face(px, pz);
    }
  }
  return null;
}
