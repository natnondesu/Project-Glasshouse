import { effectiveHeight, feedRoute, footprintOf, localToWorld, usedU, type PowerFeed, type Point, type Category, type MultiPoly, type PlanContent, type Rack, type RoomObject, type SimpleObjectType } from '@glasshouse/domain';

/** One rack unit (EIA-310) in metres. */
export const U_M = 0.04445;
/** Plinth below U1, so faces sit inside the rack frame rather than on the floor. */
export const RACK_BASE_M = 0.06;
const FACE_INSET_M = 0.05;
const FACE_GAP_M = 0.003;
const FRONT_OFFSET_M = 0.004;

type Vec3 = [number, number, number];

export interface Face3D {
  id: string;
  name: string;
  category: Category;
  /** Local to the rack group: x across the front, y up, z towards the Front. */
  y: number;
  z: number;
  width: number;
  height: number;
  unknown: boolean;
  /** Metres from the front rails back into the rack, capped so a device never pokes out of the rear. */
  depth: number;
  heightU: number;
  kind: 'device' | 'chassis';
}

export interface Slot3D {
  chassisId: string;
  slot: number;
  filled: boolean;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

export interface Rack3D {
  id: string;
  name: string;
  owner: Rack['owner'];
  position: Vec3;
  size: Vec3;
  yaw: number;
  faces: Face3D[];
  slots: Slot3D[];
  reserved: Reserved3D[];
  capacityU: number;
  usedU: number;
}

export interface Reserved3D {
  id: string;
  label: string;
  y: number;
  height: number;
}

export interface Object3D {
  id: string;
  name: string;
  type: SimpleObjectType;
  position: Vec3;
  size: Vec3;
  yaw: number;
}

/** Cut-outs are columns and notches the floor can't use: shown solid so they read as obstacles, not holes. */
export const COLUMN_HEIGHT_M = 2.6;

export interface Column3D {
  id: string;
  position: Vec3;
  size: Vec3;
}

export interface Feed3D {
  feed: PowerFeed;
  /** Floor-plan route: panel centre, then along the walls, then the rack's rear. */
  route: Point[];
  /** Height of the bottom of the panel cabinet, where the drop starts. */
  dropFrom: number;
}

/** MCB cabinets hang from the top of their height; the drop leaves from the cabinet's underside. */
const MCB_CABINET_M = 0.8;

export interface Scene3D {
  width: number;
  length: number;
  /** Plan coordinates (x, y); the 3D floor maps plan y to world z. */
  floor: MultiPoly;
  racks: Rack3D[];
  others: Object3D[];
  columns: Column3D[];
  feeds: Feed3D[];
}

/** Rotation about the world Y axis applied to (x, z), matching three.js Object3D.rotation.y. */
export function rotateY(yaw: number, [x, z]: [number, number]): [number, number] {
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
}

/** Derived from the domain's own transform, so 3D can never disagree with the plan about which way a Rack faces. */
function placement(o: RoomObject): { position: Vec3; yaw: number; size: Vec3 } {
  const [cx, cz] = localToWorld(o, [0, 0]);
  const [ax, az] = localToWorld(o, [1, 0]);
  const yaw = -Math.atan2(az - cz, ax - cx);
  const h = effectiveHeight(o);
  return { position: [cx, h / 2, cz], yaw, size: [o.w, h, o.d] };
}

const REAR_CLEARANCE_M = 0.08;

function rackFaces(rack: Rack): Pick<Rack3D, 'faces' | 'slots' | 'reserved'> {
  const z = rack.d / 2 + FRONT_OFFSET_M;
  const width = rack.w - FACE_INSET_M * 2;
  const faces: Face3D[] = [];
  const slots: Slot3D[] = [];
  for (const d of rack.devices) {
    const height = d.heightU * U_M - FACE_GAP_M;
    const y = RACK_BASE_M + (d.bottomU - 1) * U_M + (d.heightU * U_M) / 2;
    const unknown = d.demand.kind === 'unknown' || (d.kind === 'chassis' && d.nodes.some((n) => n.demand.kind === 'unknown'));
    const depth = Math.min(d.depthMm / 1000, rack.d - REAR_CLEARANCE_M);
    faces.push({ id: d.id, name: d.name, category: d.kind === 'chassis' ? 'chassis' : d.category, y, z, width, height, unknown, depth, heightU: d.heightU, kind: d.kind });
    if (d.kind !== 'chassis') continue;
    const cols = d.slotsPerRow;
    const rows = Math.ceil(d.slotCount / cols);
    const cellW = width / cols;
    const cellH = height / rows;
    for (let i = 0; i < d.slotCount; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      slots.push({
        chassisId: d.id,
        slot: i + 1,
        filled: d.nodes.some((n) => n.slot === i + 1),
        x: -width / 2 + cellW * (col + 0.5),
        y: y + height / 2 - cellH * (row + 0.5),
        z: z + FRONT_OFFSET_M,
        width: cellW * 0.86,
        height: cellH * 0.8,
      });
    }
  }
  const reserved = rack.reserved.map((r) => ({ id: r.id, label: r.label, y: RACK_BASE_M + (r.bottomU - 1) * U_M + (r.heightU * U_M) / 2, height: r.heightU * U_M - FACE_GAP_M }));
  return { faces, slots, reserved };
}

export function buildScene(content: PlanContent): Scene3D {
  const racks: Rack3D[] = [];
  const others: Object3D[] = [];
  for (const o of content.objects) {
    const p = placement(o);
    if (o.type === 'rack') racks.push({ id: o.id, name: o.name, owner: o.owner, ...p, ...rackFaces(o), capacityU: o.capacityU, usedU: usedU(o) });
    else others.push({ id: o.id, name: o.name, type: o.type, ...p });
  }
  const columns = content.survey.cutOuts.map((c) => ({ id: c.id, position: [c.x + c.w / 2, COLUMN_HEIGHT_M / 2, c.y + c.d / 2] as Vec3, size: [c.w, COLUMN_HEIGHT_M, c.d] as Vec3 }));
  const feeds = content.feeds.flatMap((feed) => {
    const route = feedRoute(content, feed);
    const panel = content.objects.find((o) => o.id === feed.sourceId);
    return route && panel ? [{ feed, route, dropFrom: Math.max(0.1, effectiveHeight(panel) - Math.min(MCB_CABINET_M, effectiveHeight(panel))) }] : [];
  });
  return { width: content.survey.width, length: content.survey.length, floor: footprintOf(content.survey), racks, others, columns, feeds };
}
