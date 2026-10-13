import type { Id, PlanContent, Rect } from '../model/types';
import type { Result } from '../result';
import { addFloorRect, removeFloorRect, updateFloorRect } from './floor';
import { updateSurvey, type SurveyPatch } from './survey';

export type PlanCommand =
  | { type: 'survey/update'; patch: SurveyPatch }
  | { type: 'floor/add'; rect: Rect }
  | { type: 'floor/cut'; rect: Rect }
  | { type: 'floor/update'; id: Id; patch: Partial<Omit<Rect, 'id'>> }
  | { type: 'floor/remove'; id: Id };

export function applyPlanCommand(content: PlanContent, cmd: PlanCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'survey/update':
      return updateSurvey(content, cmd.patch);
    case 'floor/add':
      return addFloorRect(content, 'floorAreas', cmd.rect);
    case 'floor/cut':
      return addFloorRect(content, 'cutOuts', cmd.rect);
    case 'floor/update':
      return updateFloorRect(content, cmd.id, cmd.patch);
    case 'floor/remove':
      return removeFloorRect(content, cmd.id);
  }
}
