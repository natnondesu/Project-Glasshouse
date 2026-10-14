import { seedTemplates } from './catalog';
import { newId } from './ids';
import { CURRENT_SCHEMA_VERSION, DEFAULT_DESIGN_LIMIT_PCT, DEFAULT_POWER_BUDGET_W, DEFAULT_ROOM } from './model/defaults';
import type { Plan, PlanContent, Revision, Survey, Workspace } from './model/types';

export function createSurvey(): Survey {
  return {
    width: DEFAULT_ROOM.width,
    length: DEFAULT_ROOM.length,
    floorAreas: [{ id: newId(), x: 0, y: 0, w: DEFAULT_ROOM.width, d: DEFAULT_ROOM.length }],
    cutOuts: [],
    powerBudget: DEFAULT_POWER_BUDGET_W,
    designLimitPct: DEFAULT_DESIGN_LIMIT_PCT,
    networkHandoff: '',
    notes: '',
  };
}

export const emptyContent = (): PlanContent => ({ survey: createSurvey(), objects: [], templatesUsed: [], dimensions: [] });

export function createDraftRevision(number: number, content: PlanContent): Revision {
  return {
    number,
    state: 'draft',
    content,
    designedBy: null,
    approvedBy: null,
    submittedAt: null,
    approvedAt: null,
    acknowledgements: [],
  };
}

export const createPlan = (): Plan => ({ revisions: [createDraftRevision(1, emptyContent())], notes: [], history: [] });

export const createWorkspace = (): Workspace => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  projects: [],
  catalog: seedTemplates(),
  lastBackupAt: null,
});
