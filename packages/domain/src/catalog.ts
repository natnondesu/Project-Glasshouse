import { validatePortGroups } from './ports';
import defaultCatalog from './default-catalog.json';
import { validateDemand } from './demand';
import { LIMITS } from './model/defaults';
import { racksOf } from './devices';
import { currentRevision } from './lookup';
import type { Category, Id, Template, Workspace } from './model/types';
import { err, ok, withTarget, type Result } from './result';
import { isWholeInRange, validateName } from './validation';

export const CATEGORY_LABEL: Record<Category, string> = {
  server: 'Server',
  network: 'Network',
  power: 'Power',
  chassis: 'Chassis',
  misc: 'Misc',
};

/** The order categories are listed in, wherever templates are grouped. */
export const CATEGORY_ORDER: Category[] = ['server', 'chassis', 'network', 'power', 'misc'];

/**
 * The catalog every new workspace starts with. Replace this file with an export from the Catalog screen
 * ("Export catalog") to change the default; it is checked against the editor's rules in the tests.
 */
const SEED: readonly Template[] = (defaultCatalog as { templates: Template[] }).templates;

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
  if (t.ports) {
    const portError = validatePortGroups(t.ports);
    if (portError) return err('invalid_value', portError, [t.id]);
  }
  const base = { ...t, label: label.value, model };

  if (t.mounting === 'slot') {
    if (t.category !== 'server') return err('invalid_value', 'Nodes use the Server category.', [t.id]);
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

/** How many placed devices and nodes, across every room's current revision, came from this template. */
export function templateUses(ws: Workspace, templateId: Id): number {
  let n = 0;
  for (const p of ws.projects)
    for (const s of p.sites)
      for (const r of s.rooms)
        for (const rack of racksOf(currentRevision(r.plan).content))
          for (const d of rack.devices) {
            if (d.templateId === templateId) n += 1;
            if (d.kind === 'chassis') n += d.nodes.filter((x) => x.templateId === templateId).length;
          }
  return n;
}
