import { placementWithin } from '../geometry/polygon';
import { LIMITS } from '../model/defaults';
import type { PlanContent, Rect, Survey } from '../model/types';
import { err, ok, type Result } from '../result';
import { snapFloor } from '../units';
import { inRange } from '../validation';

export interface SurveyPatch {
  width?: number;
  length?: number;
  powerBudget?: number;
  designLimitPct?: number;
  networkHandoff?: string;
  notes?: string;
}

const EPS = 1e-9;

export function rectWithinCanvas(r: Pick<Rect, 'x' | 'y' | 'w' | 'd'>, canvas: Pick<Survey, 'width' | 'length'>): boolean {
  return r.x >= -EPS && r.y >= -EPS && r.x + r.w <= canvas.width + EPS && r.y + r.d <= canvas.length + EPS;
}

const coversCanvas = (r: Rect, s: Survey): boolean =>
  Math.abs(r.x) < EPS && Math.abs(r.y) < EPS && Math.abs(r.w - s.width) < EPS && Math.abs(r.d - s.length) < EPS;

function validateText(value: string | undefined, label: string): string | null {
  if (value !== undefined && value.length > LIMITS.textMaxLength) {
    return `${label} must be ${LIMITS.textMaxLength} characters or fewer.`;
  }
  return null;
}

export function updateSurvey(content: PlanContent, patch: SurveyPatch): Result<PlanContent> {
  const s = content.survey;
  const width = patch.width === undefined ? s.width : snapFloor(patch.width);
  const length = patch.length === undefined ? s.length : snapFloor(patch.length);
  if (!inRange(width, LIMITS.roomMinM, LIMITS.roomMaxM)) {
    return err('invalid_value', `Room width must be between ${LIMITS.roomMinM} and ${LIMITS.roomMaxM} m.`);
  }
  if (!inRange(length, LIMITS.roomMinM, LIMITS.roomMaxM)) {
    return err('invalid_value', `Room length must be between ${LIMITS.roomMinM} and ${LIMITS.roomMaxM} m.`);
  }
  const powerBudget = patch.powerBudget === undefined ? s.powerBudget : Math.round(patch.powerBudget);
  if (!inRange(powerBudget, LIMITS.powerMinW, LIMITS.powerMaxW)) {
    return err('invalid_value', 'Power budget must be between 100 and 100,000 W.');
  }
  const designLimitPct = patch.designLimitPct === undefined ? s.designLimitPct : Math.round(patch.designLimitPct);
  if (!inRange(designLimitPct, LIMITS.designLimitMinPct, LIMITS.designLimitMaxPct)) {
    return err('invalid_value', 'Design limit must be between 50% and 100%.');
  }
  const textError = validateText(patch.networkHandoff, 'Network handoff') ?? validateText(patch.notes, 'Notes');
  if (textError) return err('invalid_value', textError);

  const [first] = s.floorAreas;
  const followsCanvas = s.floorAreas.length === 1 && first !== undefined && coversCanvas(first, s);
  const floorAreas = followsCanvas ? [{ ...first, w: width, d: length }] : s.floorAreas;
  const canvas = { width, length };

  const strayRect = [...floorAreas, ...s.cutOuts].find((r) => !rectWithinCanvas(r, canvas));
  if (strayRect) {
    return err('out_of_bounds', 'Shrinking the room would leave a floor area outside it. Edit the floor areas first.', [strayRect.id]);
  }
  const strayObject = content.objects.find((o) => !placementWithin(o, width, length));
  if (strayObject) {
    return err('out_of_bounds', `Shrinking the room would leave ${strayObject.name} outside it. Move or resize it first.`, [strayObject.id]);
  }

  const survey: Survey = {
    ...s,
    width,
    length,
    powerBudget,
    designLimitPct,
    networkHandoff: patch.networkHandoff ?? s.networkHandoff,
    notes: patch.notes ?? s.notes,
    floorAreas,
  };
  return ok({ ...content, survey });
}
