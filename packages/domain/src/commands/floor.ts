import { LIMITS } from '../model/defaults';
import type { Id, PlanContent, Rect, Survey } from '../model/types';
import { err, ok, type Result } from '../result';
import { formatMetres, snapFloor } from '../units';
import { rectWithinCanvas } from './survey';

export type FloorKind = 'floorAreas' | 'cutOuts';

const withSurvey = (content: PlanContent, patch: Partial<Survey>): PlanContent => ({
  ...content,
  survey: { ...content.survey, ...patch },
});

function findFloorRect(s: Survey, id: Id): { kind: FloorKind; rect: Rect } | null {
  const area = s.floorAreas.find((r) => r.id === id);
  if (area) return { kind: 'floorAreas', rect: area };
  const cut = s.cutOuts.find((r) => r.id === id);
  return cut ? { kind: 'cutOuts', rect: cut } : null;
}

function validateRect(r: Rect, survey: Survey): Result<Rect> {
  const n: Rect = { id: r.id, x: snapFloor(r.x), y: snapFloor(r.y), w: snapFloor(r.w), d: snapFloor(r.d), ...(r.kind ? { kind: r.kind } : {}) };
  if (![n.x, n.y, n.w, n.d].every(Number.isFinite)) return err('invalid_value', 'Enter numbers for every side.', [r.id]);
  if (n.w < LIMITS.minFloorRectM || n.d < LIMITS.minFloorRectM) {
    return err('invalid_value', 'Areas must be at least 0.10 m on each side.', [r.id]);
  }
  if (!rectWithinCanvas(n, survey)) {
    return err(
      'out_of_bounds',
      `Areas must stay inside the room's ${formatMetres(survey.width)} × ${formatMetres(survey.length)} m bounds.`,
      [r.id],
    );
  }
  return ok(n);
}

export function addFloorRect(content: PlanContent, kind: FloorKind, rect: Rect): Result<PlanContent> {
  if (findFloorRect(content.survey, rect.id)) return err('invalid_value', 'An area with this ID already exists.', [rect.id]);
  const valid = validateRect(rect, content.survey);
  if (!valid.ok) return valid;
  return ok(withSurvey(content, { [kind]: [...content.survey[kind], valid.value] }));
}

export function updateFloorRect(content: PlanContent, id: Id, patch: Partial<Omit<Rect, 'id'>>): Result<PlanContent> {
  const found = findFloorRect(content.survey, id);
  if (!found) return err('not_found', 'That area no longer exists.', [id]);
  if (patch.kind !== undefined && found.kind !== 'cutOuts') return err('invalid_value', 'Only cut-outs can be a void or a wall/column.', [id]);
  const valid = validateRect({ ...found.rect, ...patch, id }, content.survey);
  if (!valid.ok) return valid;
  const list = content.survey[found.kind].map((r) => (r.id === id ? valid.value : r));
  return ok(withSurvey(content, { [found.kind]: list }));
}

export function removeFloorRect(content: PlanContent, id: Id): Result<PlanContent> {
  const found = findFloorRect(content.survey, id);
  if (!found) return err('not_found', 'That area no longer exists.', [id]);
  return ok(withSurvey(content, { [found.kind]: content.survey[found.kind].filter((r) => r.id !== id) }));
}
