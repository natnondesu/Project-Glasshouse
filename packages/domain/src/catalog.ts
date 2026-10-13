import { validateDemand } from './demand';
import { LIMITS } from './model/defaults';
import type { Category, Template } from './model/types';
import { err, ok, withTarget, type Result } from './result';
import { isWholeInRange, validateName } from './validation';

export const CATEGORY_LABEL: Record<Category, string> = {
  compute: 'Compute',
  storage: 'Storage',
  network: 'Network',
  power: 'Power',
  chassis: 'Chassis',
};

type SeedInput = Pick<Template, 'id' | 'label' | 'model' | 'category' | 'mounting' | 'heightU' | 'depthMm' | 'demand'> & Partial<Template>;

const seed = (t: SeedInput): Template => ({
  version: 1,
  color: '',
  defaultConfig: '',
  slotCount: null,
  slotsPerRow: null,
  illustrative: true,
  ...t,
});

const SEED: readonly Template[] = [
  seed({ id: 'tpl-switch-1u', label: 'Network switch', model: 'Generic 48-port 1U', category: 'network', mounting: 'rack', heightU: 1, depthMm: 300, demand: { kind: 'known', watts: 110 } }),
  seed({ id: 'tpl-server-1u', label: 'Server 1U', model: 'Generic 1U server', category: 'compute', mounting: 'rack', heightU: 1, depthMm: 750, demand: { kind: 'known', watts: 300 } }),
  seed({ id: 'tpl-server-2u', label: 'Server 2U', model: 'Generic 2U server', category: 'compute', mounting: 'rack', heightU: 2, depthMm: 780, demand: { kind: 'known', watts: 450 } }),
  seed({ id: 'tpl-server-4u', label: 'Server 4U', model: 'Generic 4U server', category: 'compute', mounting: 'rack', heightU: 4, depthMm: 800, demand: { kind: 'known', watts: 780 } }),
  seed({
    id: 'tpl-chassis-6u',
    label: 'Chassis 6U · 5 slots',
    model: 'Generic 6U chassis',
    category: 'chassis',
    mounting: 'rack',
    heightU: 6,
    depthMm: 780,
    demand: { kind: 'known', watts: 20 },
    slotCount: 5,
    slotsPerRow: 5,
  }),
  seed({ id: 'tpl-node', label: 'Node server', model: 'Generic chassis node', category: 'compute', mounting: 'slot', heightU: 0, depthMm: 0, demand: { kind: 'known', watts: 150 } }),
];

export const SEED_TEMPLATE_IDS: string[] = SEED.map((t) => t.id);

export const seedTemplates = (): Template[] => SEED.map((t) => ({ ...t, demand: { ...t.demand } }));

export function validateTemplate(t: Template): Result<Template> {
  const label = validateName(t.label, 'Template name');
  if (!label.ok) return withTarget(label, t.id);
  const model = t.model.trim();
  if (model.length > LIMITS.nameMaxLength) return err('invalid_value', `Model must be ${LIMITS.nameMaxLength} characters or fewer.`, [t.id]);
  const demandError = validateDemand(t.demand);
  if (demandError) return err('invalid_value', demandError, [t.id]);
  if (t.defaultConfig.length > LIMITS.textMaxLength) return err('invalid_value', 'Default configuration must be 2000 characters or fewer.', [t.id]);
  const base = { ...t, label: label.value, model };

  if (t.mounting === 'slot') {
    if (t.category !== 'compute') return err('invalid_value', 'Nodes use the Compute category.', [t.id]);
    return ok({ ...base, heightU: 0, depthMm: 0, slotCount: null, slotsPerRow: null });
  }
  if (!isWholeInRange(t.heightU, 1, LIMITS.rackMaxU)) return err('invalid_value', 'Rack devices are 1 to 60 U high.', [t.id]);
  if (!isWholeInRange(t.depthMm, LIMITS.deviceDepthMinMm, LIMITS.deviceDepthMaxMm)) {
    return err('invalid_value', 'Depth must be a whole number from 100 to 1500 mm.', [t.id]);
  }
  if (t.category !== 'chassis') return ok({ ...base, slotCount: null, slotsPerRow: null });
  const slots = t.slotCount ?? 0;
  if (!isWholeInRange(slots, 1, LIMITS.chassisMaxSlots)) return err('invalid_value', 'A Chassis needs between 1 and 64 slots.', [t.id]);
  const perRow = t.slotsPerRow ?? slots;
  if (!isWholeInRange(perRow, 1, slots)) return err('invalid_value', `Slots per row must be between 1 and ${slots}.`, [t.id]);
  return ok({ ...base, slotCount: slots, slotsPerRow: perRow });
}
