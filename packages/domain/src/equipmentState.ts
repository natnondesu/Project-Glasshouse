import { racksOf } from './devices';
import { currentRevision } from './lookup';
import type { EquipmentState, Id, Plan } from './model/types';
import { err, ok, type Result } from './result';

export const EQUIPMENT_STATES: EquipmentState[] = ['planned', 'deployed', 'maintenance'];

export const EQUIPMENT_STATE_LABEL: Record<EquipmentState, string> = {
  planned: 'Planned',
  deployed: 'Deployed',
  maintenance: 'In maintenance',
};

export const equipmentStateOf = (plan: Plan, id: Id): EquipmentState => plan.equipmentState[id] ?? 'planned';

/** Devices, chassis and nodes in the current revision: the things a state can be set on. */
function equipmentIds(plan: Plan): Set<Id> {
  const ids = new Set<Id>();
  for (const rack of racksOf(currentRevision(plan).content)) {
    for (const d of rack.devices) {
      ids.add(d.id);
      if (d.kind === 'chassis') for (const n of d.nodes) ids.add(n.id);
    }
  }
  return ids;
}

/**
 * Sets what is physically true on site. It lives beside the revisions, not inside them, so onsite
 * engineers can mark progress on an approved plan. States for equipment that no longer exists are dropped.
 */
export function setEquipmentState(plan: Plan, ids: Id[], state: EquipmentState): Result<Plan> {
  if (!EQUIPMENT_STATES.includes(state)) return err('invalid_value', 'Unknown equipment state.');
  const known = equipmentIds(plan);
  if (ids.length === 0 || ids.some((id) => !known.has(id))) return err('invalid_value', 'Only devices, chassis and nodes have a state.', ids);
  const next: Record<Id, EquipmentState> = {};
  for (const [id, s] of Object.entries(plan.equipmentState)) if (known.has(id)) next[id] = s;
  for (const id of ids) {
    if (state === 'planned') delete next[id];
    else next[id] = state;
  }
  return ok({ ...plan, equipmentState: next });
}
