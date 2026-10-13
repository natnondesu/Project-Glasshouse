import { centerOf, placementWithin, rotatedBoundsSize, topLeftForCenter } from '../geometry/polygon';
import { LIMITS } from '../model/defaults';
import type { Id, Metres, Millimetres, PlanContent, Rack, RackOwner, RoomObject, Survey, Units } from '../model/types';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { formatMetres, normalizeAngle, rackAutoHeightM, snapTyped } from '../units';
import { inRange, isWholeInRange, validateName } from '../validation';

export interface ObjectPatch {
  name?: string;
  x?: Metres;
  y?: Metres;
  w?: Metres;
  d?: Metres;
  angle?: number;
  height?: Metres | null;
  notes?: string;
  capacityU?: Units;
  usableDepthMm?: Millimetres;
  owner?: RackOwner;
  clearance?: Partial<Rack['clearance']>;
}

export type ObjectCommand =
  | { type: 'object/add'; object: RoomObject }
  | { type: 'object/update'; id: Id; patch: ObjectPatch }
  | { type: 'object/rotate'; id: Id; by: 45 | -45 }
  | { type: 'object/remove'; id: Id };

const RACK_ONLY: (keyof ObjectPatch)[] = ['capacityU', 'usableDepthMm', 'owner', 'clearance'];
/** Rounding to 0.01 m after a rotation can push a flush object a hair past the wall; absorb that. */
const OVERFLOW_TOLERANCE_M = 0.01;

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function normalizeObject(o: RoomObject): RoomObject {
  const geometry = {
    x: snapTyped(o.x),
    y: snapTyped(o.y),
    w: snapTyped(o.w),
    d: snapTyped(o.d),
    angle: normalizeAngle(o.angle),
    height: o.height === null ? null : snapTyped(o.height),
  };
  if (o.type === 'rack') {
    return { ...o, ...geometry, clearance: { front: snapTyped(o.clearance.front), rear: snapTyped(o.clearance.rear) } };
  }
  return { ...o, ...geometry };
}

function validateRackFields(r: Rack, name: string): Failure | null {
  if (!isWholeInRange(r.capacityU, LIMITS.rackMinU, LIMITS.rackMaxU)) {
    return err('invalid_value', 'Capacity must be a whole number from 1 to 60 U.', [r.id]);
  }
  if (!isWholeInRange(r.usableDepthMm, LIMITS.usableDepthMinMm, LIMITS.usableDepthMaxMm)) {
    return err('invalid_value', 'Usable depth must be a whole number from 300 to 1500 mm.', [r.id]);
  }
  if (!inRange(r.clearance.front, 0, LIMITS.clearanceMaxM) || !inRange(r.clearance.rear, 0, LIMITS.clearanceMaxM)) {
    return err('invalid_value', 'Clearance must be between 0 and 3.00 m.', [r.id]);
  }
  const minHeight = rackAutoHeightM(r.capacityU);
  if (r.height !== null && r.height < minHeight) {
    return err('invalid_value', `${name} needs at least ${formatMetres(minHeight)} m of height for ${r.capacityU}U.`, [r.id]);
  }
  return null;
}

function validateObject(o: RoomObject, survey: Survey): Result<RoomObject> {
  const n = normalizeObject(o);
  const name = validateName(n.name);
  if (!name.ok) return withTarget(name, o.id);
  if (![n.x, n.y, n.w, n.d, n.angle].every(Number.isFinite)) {
    return err('invalid_value', 'Enter numbers for position, size and angle.', [o.id]);
  }
  if (n.w < LIMITS.minObjectM || n.d < LIMITS.minObjectM) {
    return err('invalid_value', `${name.value} must be at least 0.10 m wide and deep.`, [o.id]);
  }
  if (n.height !== null && !(n.height > 0 && n.height <= LIMITS.heightMaxM)) {
    return err('invalid_value', 'Height must be more than 0 and at most 10 m.', [o.id]);
  }
  if (n.type === 'rack') {
    const rackError = validateRackFields(n, name.value);
    if (rackError) return rackError;
  }
  if (!placementWithin(n, survey.width, survey.length)) {
    return err('out_of_bounds', `${name.value} would extend outside the room bounds.`, [o.id]);
  }
  return ok({ ...n, name: name.value });
}

function clampTinyOverflow(o: RoomObject, survey: Survey): RoomObject {
  const b = rotatedBoundsSize(o.w, o.d, o.angle);
  const clamp = (pos: number, size: number, max: number): number => {
    if (pos < 0 && pos > -OVERFLOW_TOLERANCE_M) return 0;
    const over = pos + size - max;
    if (over > 0 && over < OVERFLOW_TOLERANCE_M) return pos - over;
    return pos;
  };
  return { ...o, x: clamp(o.x, b.w, survey.width), y: clamp(o.y, b.d, survey.length) };
}

const replaceObject = (content: PlanContent, next: RoomObject): PlanContent => ({
  ...content,
  objects: content.objects.map((o) => (o.id === next.id ? next : o)),
});

export function addObject(content: PlanContent, object: RoomObject): Result<PlanContent> {
  if (content.objects.some((o) => o.id === object.id)) return err('invalid_value', 'An object with this ID already exists.', [object.id]);
  const valid = validateObject(object, content.survey);
  if (!valid.ok) return valid;
  return ok({ ...content, objects: [...content.objects, valid.value] });
}

export function updateObject(content: PlanContent, id: Id, patch: ObjectPatch): Result<PlanContent> {
  const current = content.objects.find((o) => o.id === id);
  if (!current) return err('not_found', 'That object no longer exists.', [id]);
  if (current.type !== 'rack' && RACK_ONLY.some((key) => patch[key] !== undefined)) {
    return err('invalid_value', `${current.name} is not a rack.`, [id]);
  }
  const { clearance, capacityU, usableDepthMm, owner, ...common } = patch;
  let merged: RoomObject =
    current.type === 'rack'
      ? {
          ...current,
          ...definedOnly(common),
          ...definedOnly({ capacityU, usableDepthMm, owner }),
          clearance: { ...current.clearance, ...definedOnly(clearance ?? {}) },
        }
      : { ...current, ...definedOnly(common) };

  if (patch.angle !== undefined && patch.x === undefined && patch.y === undefined) {
    const [x, y] = topLeftForCenter(centerOf(current), merged.w, merged.d, normalizeAngle(merged.angle));
    merged = clampTinyOverflow({ ...merged, x: snapTyped(x), y: snapTyped(y) }, content.survey);
  }
  const valid = validateObject(merged, content.survey);
  if (!valid.ok) return valid;
  return ok(replaceObject(content, valid.value));
}

export function rotateObject(content: PlanContent, id: Id, by: 45 | -45): Result<PlanContent> {
  const current = content.objects.find((o) => o.id === id);
  if (!current) return err('not_found', 'That object no longer exists.', [id]);
  const result = updateObject(content, id, { angle: current.angle + by });
  if (!result.ok && result.error.code === 'out_of_bounds') {
    return err('out_of_bounds', `There isn't room to turn ${current.name} here. Move it away from the wall first.`, [id]);
  }
  return result;
}

export function removeObject(content: PlanContent, id: Id): Result<PlanContent> {
  if (!content.objects.some((o) => o.id === id)) return err('not_found', 'That object no longer exists.', [id]);
  return ok({ ...content, objects: content.objects.filter((o) => o.id !== id) });
}
