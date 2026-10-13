type Vec3 = [number, number, number];

export interface OrbitCamera {
  target: Vec3;
  distance: number;
  /** Radians around the vertical axis; 0 looks from +z towards -z. */
  azimuth: number;
  /** Radians above the floor plane. */
  elevation: number;
}

const DEG = Math.PI / 180;
/** Never below the floor and never straight down, so Racks can't look inverted or floating (FR08). */
export const MIN_ELEVATION = 8 * DEG;
export const MAX_ELEVATION = 85 * DEG;
export const MIN_DISTANCE = 1.5;
export const MAX_DISTANCE = 80;
const ORBIT_RAD_PER_PX = 0.006;
const TARGET_HEIGHT_M = 0.8;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function defaultCamera(width: number, length: number): OrbitCamera {
  return {
    target: [width / 2, TARGET_HEIGHT_M, length / 2],
    distance: clamp(Math.max(width, length) * 1.7, MIN_DISTANCE, MAX_DISTANCE),
    azimuth: 35 * DEG,
    elevation: 40 * DEG,
  };
}

export function cameraPosition(c: OrbitCamera): Vec3 {
  const flat = Math.cos(c.elevation) * c.distance;
  return [c.target[0] + flat * Math.sin(c.azimuth), c.target[1] + Math.sin(c.elevation) * c.distance, c.target[2] + flat * Math.cos(c.azimuth)];
}

export function orbit(c: OrbitCamera, dxPx: number, dyPx: number): OrbitCamera {
  return { ...c, azimuth: c.azimuth - dxPx * ORBIT_RAD_PER_PX, elevation: clamp(c.elevation + dyPx * ORBIT_RAD_PER_PX, MIN_ELEVATION, MAX_ELEVATION) };
}

/** Two-finger scroll: slide the view across the floor, like the 2D plan. */
export function panGround(c: OrbitCamera, dxPx: number, dyPx: number, viewportHeightPx: number, fovDeg: number): OrbitCamera {
  const metresPerPx = (2 * c.distance * Math.tan((fovDeg * DEG) / 2)) / Math.max(1, viewportHeightPx);
  const right: [number, number] = [Math.cos(c.azimuth), -Math.sin(c.azimuth)];
  const away: [number, number] = [-Math.sin(c.azimuth), -Math.cos(c.azimuth)];
  const dx = (dxPx * right[0] - dyPx * away[0]) * metresPerPx;
  const dz = (dxPx * right[1] - dyPx * away[1]) * metresPerPx;
  return { ...c, target: [c.target[0] + dx, c.target[1], c.target[2] + dz] };
}

/**
 * Pinch / ⌘-scroll: scale the distance and pull the target towards the floor point under the pointer,
 * so that point stays under the pointer (the same rule as the 2D plan).
 */
export function dollyToward(c: OrbitCamera, factor: number, anchor: Vec3 | null): OrbitCamera {
  const distance = clamp(c.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
  if (!anchor) return { ...c, distance };
  const k = distance / c.distance;
  const target: Vec3 = [anchor[0] + (c.target[0] - anchor[0]) * k, anchor[1] + (c.target[1] - anchor[1]) * k, anchor[2] + (c.target[2] - anchor[2]) * k];
  return { ...c, distance, target };
}
