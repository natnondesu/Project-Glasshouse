import { z } from 'zod';
import { migrate } from './migrations';
import { CURRENT_SCHEMA_VERSION } from './model/defaults';
import type { Workspace } from './model/types';
import { err, ok, type Result } from './result';

const id = z.string().min(1);
const num = z.number();
const int = z.number().int();
const demand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('known'), watts: z.number().nonnegative() }),
  z.object({ kind: z.literal('unknown') }),
]);
const category = z.enum(['compute', 'storage', 'network', 'power', 'chassis', 'misc']);
export const templateSchema = z.object({
  id,
  version: int.positive(),
  label: z.string(),
  model: z.string(),
  category,
  mounting: z.enum(['rack', 'slot']),
  heightU: int.nonnegative(),
  depthMm: num.nonnegative(),
  demand,
  color: z.string(),
  defaultConfig: z.string(),
  slotCount: int.positive().nullable(),
  slotsPerRow: int.positive().nullable(),
  illustrative: z.boolean(),
});
const rect = z.object({ id, x: num, y: num, w: num, d: num, kind: z.enum(['void', 'solid']).optional() });
const survey = z.object({
  width: num,
  length: num,
  floorAreas: z.array(rect),
  cutOuts: z.array(rect),
  powerBudget: num,
  designLimitPct: num,
  networkHandoff: z.string(),
  notes: z.string(),
});
const objectBase = { id, name: z.string(), x: num, y: num, w: num, d: num, angle: num, height: num.nullable(), notes: z.string() };
const deviceBase = { id, templateId: id, templateVersion: int, name: z.string(), demand, config: z.string(), notes: z.string() };
const node = z.object({ ...deviceBase, slot: int.positive() });
const placedDevice = z.object({ ...deviceBase, kind: z.literal('device'), category, bottomU: int.positive(), heightU: int.positive(), depthMm: num });
const chassis = z.object({
  ...deviceBase,
  kind: z.literal('chassis'),
  bottomU: int.positive(),
  heightU: int.positive(),
  depthMm: num,
  slotCount: int.positive(),
  slotsPerRow: int.positive(),
  nodes: z.array(node),
});
const reserved = z.object({ id, label: z.string(), bottomU: int.positive(), heightU: int.positive(), demand, notes: z.string() });
const rack = z.object({
  ...objectBase,
  type: z.literal('rack'),
  capacityU: int,
  usableDepthMm: num,
  owner: z.enum(['oxygenai', 'customer']),
  clearance: z.object({ front: num, rear: num }),
  devices: z.array(z.discriminatedUnion('kind', [placedDevice, chassis])),
  reserved: z.array(reserved),
});
const simpleObject = z.object({ ...objectBase, type: z.enum(['existing_rack', 'door', 'mcb', 'furniture', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu']),
  hinge: z.enum(['left', 'right']).optional(),
  panel: z.object({ phase: z.enum(['single', 'three']), ways: z.array(z.object({ ratingA: num, label: z.string() })) }).optional(),
});
const unverifiedName = z.object({ name: z.string(), at: z.string() });
const anchor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), x: num, y: num }),
  z.object({ kind: z.literal('object'), objectId: id, u: num, v: num }),
]);
const dimension = z.object({ id, a: anchor, b: anchor, offset: num });
const feed = z.object({ id, rackId: id, sourceId: id, label: z.string(), way: int.positive().optional() });
const revision = z.object({
  number: int.positive(),
  state: z.enum(['draft', 'in_review', 'approved']),
  content: z.object({ survey, objects: z.array(z.union([rack, simpleObject])), templatesUsed: z.array(templateSchema), dimensions: z.array(dimension), feeds: z.array(feed) }),
  designedBy: unverifiedName.nullable(),
  approvedBy: unverifiedName.nullable(),
  submittedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  acknowledgements: z.array(z.object({ reservedRangeId: id, reason: z.string(), by: unverifiedName })),
});
const plan = z.object({
  revisions: z.array(revision).min(1),
  notes: z.array(z.object({ id, text: z.string(), resolved: z.boolean(), createdAt: z.string() })),
  history: z.array(z.object({ revision: int, action: z.string(), at: z.string() })),
});
const room = z.object({ id, name: z.string(), notes: z.string(), plan });
const site = z.object({ id, name: z.string(), notes: z.string(), rooms: z.array(room) });
const project = z.object({ id, name: z.string(), notes: z.string(), isSample: z.boolean(), sites: z.array(site) });

export const workspaceSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  projects: z.array(project),
  catalog: z.array(templateSchema),
  lastBackupAt: z.string().nullable(),
});

export function parseWorkspace(raw: unknown): Result<Workspace> {
  const migrated = migrate(raw);
  if (!migrated.ok) return migrated;
  const parsed = workspaceSchema.safeParse(migrated.value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? ` (at ${first.path.join('.') || 'root'}: ${first.message})` : '';
    return err('invalid_value', `Saved data is not a valid Glasshouse workspace${where}.`);
  }
  return ok(parsed.data satisfies Workspace);
}
