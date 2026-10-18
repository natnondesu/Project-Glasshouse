import type { RoomObjectType } from '@glasshouse/domain';

/** What the 3D labels menu can switch on: a checked kind always shows its labels, the rest on hover. */
export type LabelKind = 'rack' | 'existing' | 'power' | 'door' | 'furniture' | 'cooling';

export const LABEL_KINDS: LabelKind[] = ['rack', 'existing', 'power', 'door', 'furniture', 'cooling'];
/** Only the planned racks by default; every other kind is the viewer's choice. */
export const DEFAULT_LABEL_KINDS: LabelKind[] = ['rack'];

export function labelKindOf(type: RoomObjectType): LabelKind {
  if (type === 'rack') return 'rack';
  if (type === 'existing_rack') return 'existing';
  if (type === 'door' || type === 'partition') return 'door';
  if (type === 'furniture' || type === 'display_wall') return 'furniture';
  if (type === 'wall_split_ac' || type === 'precision_ac') return 'cooling';
  return 'power';
}

/** Before label kinds there was one switch; someone who chose "on hover" keeps seeing no labels until hover. */
export function initialLabelKinds(legacy: string | null): LabelKind[] {
  return legacy === '"hover"' ? [] : DEFAULT_LABEL_KINDS;
}
