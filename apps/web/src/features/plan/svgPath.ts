import type { MultiPoly, Poly } from '@glasshouse/domain';
import { toScreen, type View } from '../../viewport/math';

export function polygonPath(poly: Poly, view: View): string {
  return poly
    .map(
      (ring) =>
        ring
          .map((pt, i) => {
            const [x, y] = toScreen(view, pt);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ') + ' Z',
    )
    .join(' ');
}

export const multiPolygonPath = (shape: MultiPoly, view: View): string => shape.map((p) => polygonPath(p, view)).join(' ');
