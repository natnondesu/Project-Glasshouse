import type { Point } from '@glasshouse/domain';

/** screen = world × scale + t, with scale in px per metre. */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_SCALE = 20;
export const MAX_SCALE = 1200;
const WHEEL_SENSITIVITY = 0.01;
const LINE_HEIGHT_PX = 16;

const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export const toScreen = (v: View, [x, y]: Point): Point => [x * v.scale + v.tx, y * v.scale + v.ty];
export const toWorld = (v: View, [sx, sy]: Point): Point => [(sx - v.tx) / v.scale, (sy - v.ty) / v.scale];

export function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const scale = clampScale(v.scale * factor);
  const k = scale / v.scale;
  return { scale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k };
}

export const pan = (v: View, dx: number, dy: number): View => ({ ...v, tx: v.tx + dx, ty: v.ty + dy });

export function fit(content: { w: number; d: number }, size: { width: number; height: number }, padding = 64): View {
  const scale = clampScale(Math.min((size.width - 2 * padding) / content.w, (size.height - 2 * padding) / content.d));
  return { scale, tx: (size.width - content.w * scale) / 2, ty: (size.height - content.d * scale) / 2 };
}

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaY;
  return Math.exp(-px * WHEEL_SENSITIVITY);
}
