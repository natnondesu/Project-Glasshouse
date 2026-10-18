import { usesFeedObject } from '../feeds';
import { usesObject } from '../dimensions';
import { centerOf, placementWithin, rotatedBoundsSize, topLeftForCenter } from '../geometry/polygon';
import { LIMITS } from '../model/defaults';
import type { Id, Metres, Millimetres, PlanContent, Rack, RackOwner, RoomObject, Survey, Units, DoorHinge, DoorOpening } from '../model/types';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { formatMetres, normalizeAngle, rackAutoHeightM, snapTyped } from '../units';
import { hasKeepClear, isWallHung } from '../objects';
import { rackSpans, topU } from '../occupancy';
import { definedOnly, inRange, isWholeInRange, validateName } from '../validation';

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
  /** Racks: a height hangs the rack on the wall; null stands it on the floor. Split ACs and display walls: always on a wall, so a number only. */
  wallBottomM?: Metres | null;
  /** Wall split ACs, precision ACs and display walls: the depth kept clear in front; null returns to the default, 0 means none. */
  keepClearM?: Metres | null;
  hinge?: DoorHinge;
  opening?: DoorOpening;
}

export type ObjectCommand =
  | { type: 'object/add'; object: RoomObject }
  | { type: 'object/update'; id: Id; patch: ObjectPatch }
  | { type: 'object/rotate'; id: Id; by: 45 | -45 }
  | { type: 'object/remove'; id: Id };

const RACK_ONLY: (keyof ObjectPatch)[] = ['capacityU', 'usableDepthMm', 'owner', 'clearance'];
/** Rounding to 0.01 m after a rotation can push a flush object a hair past the wall; absorb that. */
const OVERFLOW_TOLERANCE_M = 0.01;

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
  return { ...o, ...geometry, ...(o.keepClearM === undefined ? {} : { keepClearM: snapTyped(o.keepClearM) }) };
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
  if (r.wallBottomM !== undefined && !inRange(r.wallBottomM, 0, LIMITS.wallBottomMaxM)) {
    return err('invalid_value', `The bottom of a wall rack is at most ${formatMetres(LIMITS.wallBottomMaxM)} m off the floor.`, [r.id]);
  }
  const minHeight = rackAutoHeightM(r.capacityU);
  if (r.height !== null && r.height < minHeight) {
    return err('invalid_value', `${name} needs at least ${formatMetres(minHeight)} m of height for ${r.capacityU}U.`, [r.id]);
  }
  const highest = rackSpans(r).reduce((m, s) => Math.max(m, topU(s)), 0);
  if (highest > r.capacityU) {
    return err('invalid_value', `${name} is occupied up to U${highest}, so its capacity can't go below ${highest}U.`, [r.id]);
  }
  return null;
}

/** undefined leaves the mounting alone; null takes the rack off the wall. */
function withWallBottom(rack: Rack, bottom: Metres | null | undefined): Rack {
  if (bottom === undefined) return rack;
  if (bottom === null) {
    const { wallBottomM: _off, ...floor } = rack;
    return floor;
  }
  return { ...rack, wallBottomM: bottom };
}

/** A floor object from an old file may carry a height it never used; editing it drops that, rather than refusing the edit. */
function withoutStrayHeight(o: RoomObject): RoomObject {
  if (o.type === 'rack') return o;
  const { wallBottomM, keepClearM, ...rest } = o;
  return { ...rest, ...(wallBottomM !== undefined && isWallHung(o) ? { wallBottomM } : {}), ...(keepClearM !== undefined && hasKeepClear(o.type) ? { keepClearM } : {}) };
}

/** undefined leaves the depth alone; null returns to the type's default. */
function withKeepClear(o: RoomObject, depth: Metres | null | undefined): RoomObject {
  if (depth === undefined || o.type === 'rack') return o;
  const { keepClearM: _old, ...rest } = o;
  return depth === null ? rest : { ...rest, keepClearM: depth };
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
  } else if (n.wallBottomM !== undefined && !isWallHung(n)) {
    return err('invalid_value', `${name.value} stands on the floor; only racks and wall-hung objects have a height off it.`, [o.id]);
  } else if (n.wallBottomM !== undefined && !inRange(n.wallBottomM, 0, LIMITS.wallBottomMaxM)) {
    return err('invalid_value', `The bottom of ${name.value} is at most ${formatMetres(LIMITS.wallBottomMaxM)} m off the floor.`, [o.id]);
  }
  if (n.type !== 'rack' && n.keepClearM !== undefined) {
    if (!hasKeepClear(n.type)) return err('invalid_value', `${name.value} has no space to keep clear in front of it.`, [o.id]);
    if (!inRange(n.keepClearM, 0, LIMITS.keepClearMaxM)) return err('invalid_value', `The space kept clear in front of ${name.value} is between 0 and ${formatMetres(LIMITS.keepClearMaxM)} m.`, [o.id]);
  } else if (n.type === 'rack' && 'keepClearM' in n) {
    return err('invalid_value', `${name.value} is a rack; racks have clearance instead.`, [o.id]);
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
  if (current.type !== 'rack' && (RACK_ONLY.some((key) => patch[key] !== undefined) || (patch.wallBottomM !== undefined && !isWallHung(current)))) {
    return err('invalid_value', `${current.name} is not a rack.`, [id]);
  }
  if (patch.wallBottomM === null && isWallHung(current)) return err('invalid_value', `${current.name} always hangs on a wall; give its height instead.`, [id]);
  if ((patch.hinge !== undefined || patch.opening !== undefined) && current.type !== 'door') return err('invalid_value', `${current.name} is not a door.`, [id]);
  if (patch.keepClearM !== undefined && !hasKeepClear(current.type)) return err('invalid_value', `${current.name} has no space to keep clear in front of it.`, [id]);
  const { clearance, capacityU, usableDepthMm, owner, wallBottomM, keepClearM, ...common } = patch;
  let merged: RoomObject =
    current.type === 'rack'
      ? withWallBottom(
          {
            ...current,
            ...definedOnly(common),
            ...definedOnly({ capacityU, usableDepthMm, owner }),
            clearance: { ...current.clearance, ...definedOnly(clearance ?? {}) },
          },
          wallBottomM,
        )
      : withKeepClear({ ...withoutStrayHeight(current), ...definedOnly(common), ...(typeof wallBottomM === 'number' ? { wallBottomM } : {}) }, keepClearM);

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
  // A dimension to a removed object would point at nothing, so it goes with it (undo restores both).
  return ok({ ...content, objects: content.objects.filter((o) => o.id !== id), dimensions: content.dimensions.filter((d) => !usesObject(d, id)), feeds: content.feeds.filter((f) => !usesFeedObject(f, id)) });
}
