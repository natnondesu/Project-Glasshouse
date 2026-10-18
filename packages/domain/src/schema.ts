import { z } from './zod';
import { migrate } from './migrations';
import { CURRENT_SCHEMA_VERSION, LIMITS } from './model/defaults';
import type { Workspace } from './model/types';
import { err, ok, type Result } from './result';

/** Every stored string has a ceiling, so one pasted blob can't bloat a shared workspace. */
const text = z.string().max(LIMITS.storedTextMaxLength);
const id = text.min(1);
const num = z.number();
const int = z.number().int();
const demand = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('known'), watts: z.number().nonnegative() }),
  z.object({ kind: z.literal('unknown') }),
]);
const category = z.enum(['server', 'network', 'power', 'chassis', 'misc']);
export const templateSchema = z.object({
  id,
  version: int.positive(),
  label: text,
  model: text,
  category,
  mounting: z.enum(['rack', 'slot']),
  heightU: int.nonnegative(),
  depthMm: num.nonnegative(),
  demand,
  color: text,
  defaultConfig: text,
  slotCount: int.positive().nullable(),
  slotsPerRow: int.positive().nullable(),
  illustrative: z.boolean(),
  ports: z
    .array(
      z.object({
        count: int,
        prefix: text,
        start: int,
        media: z.enum(['rj45', 'sfp', 'sfp_plus', 'qsfp']),
        speed: text,
        rows: z.union([z.literal(1), z.literal(2)]).optional(),
        order: z.enum(['odd_top', 'linear']).optional(),
      }),
    )
    .optional(),
});
const rect = z.object({ id, x: num, y: num, w: num, d: num, kind: z.enum(['void', 'solid']).optional() });
const survey = z.object({
  width: num,
  length: num,
  floorAreas: z.array(rect),
  cutOuts: z.array(rect),
  powerBudget: num,
  designLimitPct: num,
  networkHandoff: text,
  notes: text,
});
const objectBase = { id, name: text, x: num, y: num, w: num, d: num, angle: num, height: num.nullable(), notes: text };
const portVlan = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('access'), vid: int }),
  z.object({ mode: z.literal('trunk'), allowed: z.union([z.array(int), z.literal('all')]), native: int.nullable() }),
]);
const port = z.object({
  name: text.min(1),
  media: z.enum(['rj45', 'sfp', 'sfp_plus', 'qsfp']),
  speed: text,
  vlan: portVlan.optional(),
  lag: text.optional(),
  remote: z.object({ roomId: id, deviceId: id, port: text }).optional(),
});
const deviceBase = { id, templateId: id, templateVersion: int, name: text, demand, config: text, notes: text, ports: z.array(port).optional() };
const portRef = z.object({ deviceId: id, port: text.min(1) });
const link = z.object({ id, a: portRef, b: portRef, label: text, cable: z.enum(['cat6', 'cat6a', 'om3', 'om4', 'os2', 'dac', 'aoc']).nullable() });
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
const reserved = z.object({ id, label: text, bottomU: int.positive(), heightU: int.positive(), demand, notes: text });
const rack = z.object({
  ...objectBase,
  type: z.literal('rack'),
  capacityU: int,
  usableDepthMm: num,
  owner: z.enum(['oxygenai', 'customer']),
  clearance: z.object({ front: num, rear: num }),
  devices: z.array(z.discriminatedUnion('kind', [placedDevice, chassis])),
  reserved: z.array(reserved),
  wallBottomM: num.optional(),
});
const simpleObject = z.object({ ...objectBase, type: z.enum(['existing_rack', 'door', 'mcb', 'furniture', 'wall_plug', 'industrial_socket', 'floor_box', 'ups', 'pdu', 'partition', 'wall_split_ac', 'precision_ac', 'display_wall']),
  hinge: z.enum(['left', 'right']).optional(),
  opening: z.enum(['swing', 'slide']).optional(),
  panel: z.object({ phase: z.enum(['single', 'three']), ways: z.array(z.object({ ratingA: num, label: text })) }).optional(),
  wallBottomM: num.optional(),
});
const unverifiedName = z.object({ name: text, at: text, userId: text.optional() });
const anchor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), x: num, y: num }),
  z.object({ kind: z.literal('object'), objectId: id, u: num, v: num }),
]);
const dimension = z.object({ id, a: anchor, b: anchor, offset: num });
const feed = z.object({ id, targetId: id, sourceId: id, label: text, way: int.positive().optional() });
const revision = z.object({
  number: int.positive(),
  state: z.enum(['draft', 'in_review', 'approved']),
  content: z.object({ survey, objects: z.array(z.union([rack, simpleObject])), templatesUsed: z.array(templateSchema), dimensions: z.array(dimension), feeds: z.array(feed), links: z.array(link), vlans: z.array(z.object({ vid: int, name: text })), stacks: z.array(z.object({ id, name: text, members: z.array(z.object({ deviceId: id, member: int })) })).optional() }),
  designedBy: unverifiedName.nullable(),
  approvedBy: unverifiedName.nullable(),
  submittedAt: text.nullable(),
  approvedAt: text.nullable(),
  approvedHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  acknowledgements: z.array(z.object({ reservedRangeId: id, reason: text, by: unverifiedName })),
});
const plan = z.object({
  revisions: z.array(revision).min(1),
  notes: z.array(z.object({ id, text: text, revision: int, createdAt: text, by: text.optional(), byId: text.optional() })),
  history: z.array(
    z.object({
      revision: int,
      action: text,
      at: text,
      code: z.enum(['submitted', 'approved', 'new_draft', 'draft_discarded', 'acknowledged', 'unacknowledged', 'note_added']).optional(),
      params: z.record(text, z.union([text, z.number()])).optional(),
    }),
  ),
  equipmentState: z.record(text, z.enum(['planned', 'deployed', 'maintenance'])),
  rackOrder: z.array(text).optional(),
});
const room = z.object({ id, name: text, notes: text, plan });
const site = z.object({ id, name: text, notes: text, rooms: z.array(room) });
const project = z.object({ id, name: text, notes: text, isSample: z.boolean(), sites: z.array(site) });

export const workspaceSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  projects: z.array(project),
  catalog: z.array(templateSchema),
  lastBackupAt: text.nullable(),
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
