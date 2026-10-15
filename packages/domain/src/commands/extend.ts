import { LIMITS } from '../model/defaults';
import type { DimensionAnchor, PlanContent, Rect, Survey } from '../model/types';
import { err, type Result } from '../result';
import { formatMetres, snapFloor } from '../units';
import { addFloorRect } from './floor';
import { rectWithinCanvas } from './survey';

export interface RoomExtension {
  width: number;
  length: number;
  /** How far everything moves right and down so the room keeps its top-left origin. */
  dx: number;
  dy: number;
}

/** What drawing `rect` would do to the room's bounds; null when it already fits. */
export function roomExtensionFor(survey: Pick<Survey, 'width' | 'length'>, rect: Pick<Rect, 'x' | 'y' | 'w' | 'd'>): RoomExtension | null {
  const r = { x: snapFloor(rect.x), y: snapFloor(rect.y), w: snapFloor(rect.w), d: snapFloor(rect.d) };
  if (rectWithinCanvas(r, survey)) return null;
  const dx = Math.max(0, -r.x);
  const dy = Math.max(0, -r.y);
  return { width: snapFloor(Math.max(survey.width + dx, r.x + dx + r.w)), length: snapFloor(Math.max(survey.length + dy, r.y + dy + r.d)), dx, dy };
}

const shiftAnchor = (a: DimensionAnchor, dx: number, dy: number): DimensionAnchor => (a.kind === 'point' ? { ...a, x: a.x + dx, y: a.y + dy } : a);

/** Grows the room so the drawn floor area fits, moving existing content over when it grows left or up. One step. */
export function extendFloor(content: PlanContent, rect: Rect): Result<PlanContent> {
  const ext = roomExtensionFor(content.survey, rect);
  if (!ext) return addFloorRect(content, 'floorAreas', rect);
  if (ext.width > LIMITS.roomMaxM || ext.length > LIMITS.roomMaxM) {
    return err('out_of_bounds', `That would make the room ${formatMetres(ext.width)} × ${formatMetres(ext.length)} m; a room is at most ${LIMITS.roomMaxM} m on each side.`, [rect.id]);
  }
  const { dx, dy } = ext;
  const move = <T extends { x: number; y: number }>(o: T): T => ({ ...o, x: snapFloor(o.x + dx), y: snapFloor(o.y + dy) });
  const shifted: PlanContent = {
    ...content,
    survey: { ...content.survey, width: ext.width, length: ext.length, floorAreas: content.survey.floorAreas.map(move), cutOuts: content.survey.cutOuts.map(move) },
    objects: content.objects.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
    dimensions: content.dimensions.map((d) => ({ ...d, a: shiftAnchor(d.a, dx, dy), b: shiftAnchor(d.b, dx, dy) })),
  };
  return addFloorRect(shifted, 'floorAreas', { ...rect, x: rect.x + dx, y: rect.y + dy });
}
