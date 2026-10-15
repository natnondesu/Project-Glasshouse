import type { RoomObjectType } from '@glasshouse/domain';

/** What the 3D labels menu can switch on: a checked kind always shows its labels, the rest on hover. */
export type LabelKind = 'rack' | 'existing' | 'power' | 'door' | 'furniture';

export const LABEL_KINDS: LabelKind[] = ['rack', 'existing', 'power', 'door', 'furniture'];
export const DEFAULT_LABEL_KINDS: LabelKind[] = ['rack', 'existing', 'power'];

export function labelKindOf(type: RoomObjectType): LabelKind {
  if (type === 'rack') return 'rack';
  if (type === 'existing_rack') return 'existing';
  if (type === 'door') return 'door';
  if (type === 'furniture') return 'furniture';
  return 'power';
}

/** Before label kinds there was one switch; someone who chose "on hover" keeps seeing no labels until hover. */
export function initialLabelKinds(legacy: string | null): LabelKind[] {
  return legacy === '"hover"' ? [] : DEFAULT_LABEL_KINDS;
}
