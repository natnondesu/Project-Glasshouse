import { err, ok, type Result } from './result';
import { localToWorld, worldToLocal, type Point } from './geometry/polygon';
import type { Dimension, DimensionAnchor, Id, PlanContent } from './model/types';

const MIN_LENGTH_M = 0.01;
export const MAX_DIMENSIONS = 300;

/** Where an anchor sits now; null when its object is gone. */
export function anchorPoint(content: PlanContent, anchor: DimensionAnchor): Point | null {
  if (anchor.kind === 'point') return [anchor.x, anchor.y];
  const o = content.objects.find((x) => x.id === anchor.objectId);
  return o ? localToWorld(o, [anchor.u * o.w, anchor.v * o.d]) : null;
}

export function dimensionPoints(content: PlanContent, dim: Dimension): [Point, Point] | null {
  const a = anchorPoint(content, dim.a);
  const b = anchorPoint(content, dim.b);
  return a && b ? [a, b] : null;
}

export function dimensionLength(content: PlanContent, dim: Dimension): number {
  const pts = dimensionPoints(content, dim);
  return pts ? Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) : 0;
}

/** An anchor at `point`: on the object when one is given (so it follows it), otherwise fixed on the floor. */
export function anchorAt(content: PlanContent, point: Point, objectId: Id | null): DimensionAnchor {
  const o = objectId ? content.objects.find((x) => x.id === objectId) : undefined;
  if (!o) return { kind: 'point', x: point[0], y: point[1] };
  const [lx, ly] = worldToLocal(o, point);
  const round = (n: number): number => Math.round(n * 1e6) / 1e6;
  return { kind: 'object', objectId: o.id, u: round(lx / o.w), v: round(ly / o.d) };
}

export const usesObject = (dim: Dimension, objectId: Id): boolean =>
  (dim.a.kind === 'object' && dim.a.objectId === objectId) || (dim.b.kind === 'object' && dim.b.objectId === objectId);

export type DimensionCommand =
  | { type: 'dimension/add'; dimension: Dimension }
  | { type: 'dimension/update'; id: Id; patch: { offset: number } }
  | { type: 'dimension/remove'; id: Id };

export function applyDimensionCommand(content: PlanContent, cmd: DimensionCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'dimension/add': {
      if (content.dimensions.length >= MAX_DIMENSIONS) return err('invalid_value', `A plan can hold up to ${MAX_DIMENSIONS} dimensions.`);
      if (content.dimensions.some((d) => d.id === cmd.dimension.id)) return err('invalid_value', 'That ID is already in use.', [cmd.dimension.id]);
      for (const anchor of [cmd.dimension.a, cmd.dimension.b]) {
        if (anchor.kind === 'object' && !content.objects.some((o) => o.id === anchor.objectId)) return err('not_found', 'That object no longer exists.', [anchor.objectId]);
      }
      if (dimensionLength(content, cmd.dimension) < MIN_LENGTH_M) return err('invalid_value', 'Pick two different points.');
      return ok({ ...content, dimensions: [...content.dimensions, cmd.dimension] });
    }
    case 'dimension/update': {
      if (!content.dimensions.some((d) => d.id === cmd.id)) return err('not_found', 'That dimension no longer exists.', [cmd.id]);
      if (!Number.isFinite(cmd.patch.offset)) return err('invalid_value', 'Enter a number.');
      return ok({ ...content, dimensions: content.dimensions.map((d) => (d.id === cmd.id ? { ...d, offset: cmd.patch.offset } : d)) });
    }
    case 'dimension/remove':
      if (!content.dimensions.some((d) => d.id === cmd.id)) return err('not_found', 'That dimension no longer exists.', [cmd.id]);
      return ok({ ...content, dimensions: content.dimensions.filter((d) => d.id !== cmd.id) });
  }
}
