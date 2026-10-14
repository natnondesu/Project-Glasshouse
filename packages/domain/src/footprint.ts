import type { CutOutKind, Rect } from './model/types';
import { difference, rectPolygon, union, type MultiPoly } from './geometry/polygon';
import type { Survey } from './model/types';

export function footprintOf(survey: Pick<Survey, 'floorAreas' | 'cutOuts'>): MultiPoly {
  const areas = union(survey.floorAreas.map((r) => rectPolygon(r.x, r.y, r.w, r.d)));
  if (areas.length === 0 || survey.cutOuts.length === 0) return areas;
  const cuts = union(survey.cutOuts.map((r) => rectPolygon(r.x, r.y, r.w, r.d)));
  return difference(areas, cuts);
}

export const isDisconnected = (fp: MultiPoly): boolean => fp.length > 1;

export const cutOutKind = (r: Rect): CutOutKind => r.kind ?? 'solid';
