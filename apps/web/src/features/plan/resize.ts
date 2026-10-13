import { localToWorld, snapDrag, snapTyped, topLeftForCenter, worldToLocal, type Placement, type Point } from '@glasshouse/domain';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_SIZE_M = 0.1;

export function resizePlacement(p: Placement, handle: Handle, pointer: Point, minSize = MIN_SIZE_M): { x: number; y: number; w: number; d: number } {
  const [lx, ly] = worldToLocal(p, pointer);
  let left = -p.w / 2;
  let right = p.w / 2;
  let top = -p.d / 2;
  let bottom = p.d / 2;
  if (handle.includes('e')) right = left + Math.max(minSize, snapDrag(lx - left));
  if (handle.includes('w')) left = right - Math.max(minSize, snapDrag(right - lx));
  if (handle.includes('s')) bottom = top + Math.max(minSize, snapDrag(ly - top));
  if (handle.includes('n')) top = bottom - Math.max(minSize, snapDrag(bottom - ly));
  const w = snapTyped(right - left);
  const d = snapTyped(bottom - top);
  const center = localToWorld(p, [(left + right) / 2, (top + bottom) / 2]);
  const [x, y] = topLeftForCenter(center, w, d, p.angle);
  return { x: snapTyped(x), y: snapTyped(y), w, d };
}
