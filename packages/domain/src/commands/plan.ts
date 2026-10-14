import type { Id, PlanContent, Rect } from '../model/types';
import type { Result } from '../result';
import { applyEquipmentCommand, type EquipmentCommand } from './equipment';
import { applyNodeCommand, type NodeCommand } from './nodes';
import { addFloorRect, removeFloorRect, updateFloorRect } from './floor';
import { addObject, removeObject, rotateObject, updateObject, type ObjectCommand } from './objects';
import { updateSurvey, type SurveyPatch } from './survey';
import { applyDimensionCommand, type DimensionCommand } from '../dimensions';
import { applyFeedCommand, type FeedCommand } from '../feeds';
import { applyPanelCommand, type PanelCommand } from '../sources';
import { applyPortCommand, pruneLinks, type PortCommand } from '../ports';

export type PlanCommand =
  | { type: 'survey/update'; patch: SurveyPatch }
  | { type: 'floor/add'; rect: Rect }
  | { type: 'floor/cut'; rect: Rect }
  | { type: 'floor/update'; id: Id; patch: Partial<Omit<Rect, 'id'>> }
  | { type: 'floor/remove'; id: Id }
  | ObjectCommand
  | EquipmentCommand
  | NodeCommand
  | DimensionCommand
  | FeedCommand
  | PanelCommand
  | PortCommand;

export function applyPlanCommand(content: PlanContent, cmd: PlanCommand): Result<PlanContent> {
  const result = applyOne(content, cmd);
  // Removing a rack, device, node or port leaves links pointing nowhere; drop them in one place.
  return result.ok ? { ...result, value: pruneLinks(result.value) } : result;
}

function applyOne(content: PlanContent, cmd: PlanCommand): Result<PlanContent> {
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
    case 'object/add':
      return addObject(content, cmd.object);
    case 'object/update':
      return updateObject(content, cmd.id, cmd.patch);
    case 'object/rotate':
      return rotateObject(content, cmd.id, cmd.by);
    case 'object/remove':
      return removeObject(content, cmd.id);
    case 'device/place':
    case 'device/move':
    case 'device/update':
    case 'device/remove':
    case 'reserved/add':
    case 'reserved/update':
    case 'reserved/remove':
      return applyEquipmentCommand(content, cmd);
    case 'node/insert':
    case 'node/update':
    case 'node/remove':
      return applyNodeCommand(content, cmd);
    case 'dimension/add':
    case 'dimension/update':
    case 'dimension/remove':
      return applyDimensionCommand(content, cmd);
    case 'feed/add':
    case 'feed/update':
    case 'feed/remove':
      return applyFeedCommand(content, cmd);
    case 'panel/configure':
    case 'panel/way':
      return applyPanelCommand(content, cmd);
    case 'port/add':
    case 'port/update':
    case 'port/remove':
    case 'port/reset':
    case 'link/add':
    case 'link/update':
    case 'link/remove':
      return applyPortCommand(content, cmd);
  }
}
