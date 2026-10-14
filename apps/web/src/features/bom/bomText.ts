import { CATEGORY_LABEL, EQUIPMENT_STATE_LABEL, type BomRow, type Category, type EquipmentState } from '@glasshouse/domain';
import type { Messages } from '../../i18n';

// BOM rows carry the domain's English words (the CSV stays English); map them back to keys for display.
const CATEGORY_BY_LABEL = new Map(Object.entries(CATEGORY_LABEL).map(([k, v]) => [v, k as Category]));
const STATE_BY_LABEL = new Map(Object.entries(EQUIPMENT_STATE_LABEL).map(([k, v]) => [v, k as EquipmentState]));

export const bomHeader = (m: Messages, key: keyof BomRow): string => m.bom.col[key];

/** One BOM cell in the active language: type, state, category and unknown demand are translated; data stays as entered. */
export function bomCell(m: Messages, row: BomRow, key: keyof BomRow): string {
  const value = row[key];
  if (key === 'kind') return m.bom.kind[value] ?? value;
  if (key === 'state') {
    const state = STATE_BY_LABEL.get(value);
    return state ? m.equipment.state[state] : value;
  }
  if (key === 'category') {
    const category = CATEGORY_BY_LABEL.get(value);
    return category ? m.categories[category] : value;
  }
  if (key === 'demandW' && value === 'unknown') return m.bom.unknown;
  return value;
}
