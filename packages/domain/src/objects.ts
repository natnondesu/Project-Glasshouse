import { newId } from './ids';
import { DEFAULT_CLEARANCE, DEFAULT_HEIGHTS_M, DEFAULT_KEEP_CLEAR_M, DEFAULT_RACK, DEFAULT_SIZES, DEFAULT_WALL_BOTTOM_M, LIMITS, NAME_PREFIX } from './model/defaults';
import type { Metres, RoomObject, RoomObjectType } from './model/types';
import { rackAutoHeightM } from './units';

export function nextName(objects: Pick<RoomObject, 'name'>[], type: RoomObjectType): string {
  const prefix = NAME_PREFIX[type];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = objects.reduce((highest, o) => {
    const match = pattern.exec(o.name);
    return match?.[1] ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

export function createObject(type: RoomObjectType, at: { x: Metres; y: Metres }, existing: Pick<RoomObject, 'name'>[]): RoomObject {
  const base = { id: newId(), name: nextName(existing, type), x: at.x, y: at.y, angle: 0, height: null, notes: '' };
  if (type === 'rack') {
    return {
      ...base,
      type,
      w: DEFAULT_RACK.w,
      d: DEFAULT_RACK.d,
      capacityU: DEFAULT_RACK.capacityU,
      usableDepthMm: DEFAULT_RACK.usableDepthMm,
      owner: 'oxygenai',
      clearance: { ...DEFAULT_CLEARANCE },
      devices: [],
      reserved: [],
    };
  }
  const size = DEFAULT_SIZES[type];
  const wallBottomM = DEFAULT_WALL_BOTTOM_M[type];
  return { ...base, type, w: size.w, d: size.d, ...(wallBottomM === undefined ? {} : { wallBottomM }) };
}

/** A split AC or display wall: hung on a wall with its bottom at `wallBottomM`, like a wall rack. */
export const isWallHung = (o: RoomObject): boolean => o.type !== 'rack' && DEFAULT_WALL_BOTTOM_M[o.type] !== undefined;

/** Whether this type has a space kept clear in front of it that can be sized. */
export const hasKeepClear = (type: RoomObjectType): boolean => DEFAULT_KEEP_CLEAR_M[type] !== undefined;

/** The depth of the space kept clear in front of an air conditioner or display wall (0 = none); null for objects without one. */
export function keepClearOf(o: RoomObject): Metres | null {
  const fallback = DEFAULT_KEEP_CLEAR_M[o.type];
  if (fallback === undefined) return null;
  if (o.type === 'rack') return null;
  return isKeepClearInRange(o.keepClearM) ? o.keepClearM : fallback;
}

/** A depth a person could have set: commands refuse anything else, and a hand-edited file's out-of-range value is ignored. */
export const isKeepClearInRange = (depth: unknown): depth is Metres =>
  typeof depth === 'number' && Number.isFinite(depth) && depth >= 0 && depth <= LIMITS.keepClearMaxM;

/**
 * Height of the object's bottom above the floor. Only racks and wall-hung objects have one: a stray
 * height on anything else (from an imported file) is ignored, so it can't lift an object out of overlap checks.
 * A hung item from a file with no height keeps its default, so it still hangs.
 */
export function wallBottomOf(o: RoomObject): Metres {
  if (o.type === 'rack') return o.wallBottomM ?? 0;
  const hung = DEFAULT_WALL_BOTTOM_M[o.type];
  return hung === undefined ? 0 : (o.wallBottomM ?? hung);
}

export function effectiveHeight(o: RoomObject): Metres {
  if (o.height !== null) return o.height;
  return o.type === 'rack' ? rackAutoHeightM(o.capacityU) : DEFAULT_HEIGHTS_M[o.type];
}

/** The heights an object fills: a wall rack, split AC or display wall from its bottom up, everything else from the floor. */
export function verticalSpan(o: RoomObject): [Metres, Metres] {
  const bottom = wallBottomOf(o);
  return [bottom, bottom + effectiveHeight(o)];
}

/** Two objects only collide where their heights overlap too; touching is fine. */
export const heightsOverlap = (a: RoomObject, b: RoomObject): boolean => {
  const [a0, a1] = verticalSpan(a);
  const [b0, b1] = verticalSpan(b);
  return a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
};
