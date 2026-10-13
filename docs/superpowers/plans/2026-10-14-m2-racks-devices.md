# M2 — Racks & Devices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An IT planner can plan a full Room's racks. That means a shared Catalog of Templates, a rack elevation with U occupancy, Reserved ranges for customer gear, Chassis with Slots and Nodes, Demand against the Design limit, the Usable depth check, and a BOM with CSV export.

**Architecture:** This extends the M1 pure domain package with Demand, Catalog, occupancy, equipment and Node commands, power aggregation, equipment checks and BOM, all fully unit-tested. Device commands are Plan commands, so they are undoable per room through the existing store. Catalog commands are workspace commands and are not undoable, like the hierarchy commands. The web app gains a Catalog screen, an Elevation view (racks, palette, equipment inspector, Slot map, power bar, checks) and a Devices & BOM view, all in the glass theme.

**Tech Stack:** As in M1. TypeScript strict, vitest, immer, zod, React 19, React Router 8, zustand 5, Testing Library, Playwright. There are no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-glasshouse-mvp-design.md` (§4 model, §5 commands, §11 M2 row) and `docs/product/Glasshouse-Product-Specification.md` v1.1 (FR05 Racks and Reserved ranges, FR06 Catalog and Devices, FR07 Chassis and Nodes, FR09 space/depth/power, FR12 BOM; AC05–AC10, AC14 partly, AC19). Terms: `CONTEXT.md`. Visual system: `DESIGN.md` (glass and depth).

## Decisions taken in this plan (review these)

1. **Placing a Device** copies the Template into the Device and records `templateId` + `templateVersion`. A frozen copy of that Template version is added to `PlanContent.templatesUsed` once.
2. **Editing a Template** bumps its `version` and clears `illustrative`. Deleting it removes it from the Catalog only. Placed Devices never change (AC09).
3. **The seed Catalog** consists of six illustrative generic Templates: network switch, 1U/2U/4U servers, a 6U Chassis with 5 Slots, and a Node server. A new workspace starts with them. If any are missing, the Catalog screen offers "Add illustrative templates" (`catalog/seed`), which restores only the missing ones.
4. **Placed Devices, Reserved ranges and Nodes autosave**, and are undoable per room like the plan. **Catalog Templates use an explicit Save / Discard**, because they are shared by every Project. FR01 is updated to say so.
5. **The Elevation view** shows every Rack of the Room side by side at 16 px/U, with U1 at the bottom and U numbers on both rails. The Front/Rear toggle is left out of M2 because occupancy is single-face (FR05). It comes back if rear-mounted equipment is modelled.
6. **Adding a Device:** drag a Template from the palette onto a rack (it lands with its bottom at the U under the pointer, shifted down if it would overflow). Alternatively, use "Add *Template* to *Rack*", which places it at the lowest free U. Node Templates go only through a Chassis Slot map.
7. **Adding Nodes:** click an empty Slot in the Chassis Slot map. Selection stays on the Chassis, so all five Slots can be filled in a row.
8. **A Reserved range** is created from the rack summary ("Add reserved range": 1U at the lowest free U, Demand unknown), then edited in the inspector.
9. **Demand entry** is a Known / Unknown switch plus watts. Unknown is never typed as 0, and switching to Known commits nothing until a number is entered.
10. **The BOM CSV** is RFC 4180 with CRLF line endings. Cells starting with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection.

## Global Constraints

- Everything in the M1 plan's Global Constraints still applies (Node ≥ 22, pnpm 10.33.2, strict TS, pure domain, immutability, units, no emojis, laptop-only, trackpad-safe, conventional commits with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer).
- UI copy uses `CONTEXT.md` terms: Device, Rack device, Chassis, Slot, Node, Reserved range, Template, Catalog, Demand, Design limit, BOM. Never "equipment", "item", "internal computer" or "blade".
- U1 is at the bottom. A Rack device needs a whole-number bottom U and height; its span must fit capacity and must not overlap another Rack device or Reserved range in the same Rack.
- Demand is `{ kind: 'known', watts }` or `{ kind: 'unknown' }`, never a nullable number. A Chassis's own `demand` is its overhead.
- Visuals follow `DESIGN.md` (glass and depth, light only). Category colour is never the only signal; every Device also shows its name and U range.

## Review Focus

1. **Moving a populated Chassis to a rack where it doesn't fit:** expect a clear rejection, with the Chassis, its Nodes, their IDs and Slots all unchanged. Pinned in Task 4.
2. **Reducing a Rack's capacity, or a Chassis's Slot count, below what is occupied:** expect a rejection naming the Device or Node in the way, never a silent truncation. Pinned in Tasks 2 and 3.
3. **Editing or deleting a Template after Devices are placed from it (AC09):** placed Devices keep their copied values and their `templateVersion`. Pinned in Task 3.
4. **Unknown versus zero watts:** 0 W is a known value; Unknown is an explicit choice; switching a field to Known commits nothing until a number is typed. Pinned in Tasks 5 and 8.
5. **BOM cells containing commas, quotes, newlines or a leading `=`:** the CSV opens correctly and never executes as a formula. Pinned in Task 7.

---

### Task 1: Demand helpers, seed Catalog and Catalog commands

**Files:**
- Create: `packages/domain/src/demand.ts`, `packages/domain/src/catalog.ts`, `packages/domain/src/commands/catalog.ts`
- Modify: `packages/domain/src/model/defaults.ts`, `packages/domain/src/validation.ts`, `packages/domain/src/commands/objects.ts`, `packages/domain/src/commands/workspace.ts`, `packages/domain/src/factories.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/catalog.test.ts`

**Interfaces:**
- Consumes: `Template`, `Demand`, `Category` types; `validateName`, `isWholeInRange`; `apply`.
- Produces: `known(watts)`, `unknownDemand()`, `DemandTotal { knownW; unknownCount }`, `ZERO_TOTAL`, `sumDemand(demands)`, `formatDemand(demand)`, `validateDemand(demand): string | null`; `CATEGORY_LABEL`, `SEED_TEMPLATE_IDS`, `seedTemplates()`, `validateTemplate(t): Result<Template>`; `CatalogCommand` (`template/create | template/update | template/delete | catalog/seed`), `applyCatalogCommand(catalog, cmd)`. `WorkspaceCommand` now includes `CatalogCommand`. `definedOnly(o)` now lives in `validation.ts`. New `LIMITS` keys: `deviceDepthMinMm = 100`, `deviceDepthMaxMm = 1500`, `chassisMaxSlots = 64`, `deviceDemandMaxW = 20_000`. `createWorkspace()` starts with the seed Catalog.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SEED_TEMPLATE_IDS } from '../catalog';
import { formatDemand, known, sumDemand, unknownDemand } from '../demand';
import { createWorkspace } from '../factories';
import type { Template, Workspace } from '../model/types';
import { apply, type WorkspaceCommand } from './workspace';

const custom = (over: Partial<Template> = {}): Omit<Template, 'version'> => ({
  id: 't-gpu',
  label: 'GPU node 4U',
  model: 'Acme G4',
  category: 'compute',
  mounting: 'rack',
  heightU: 4,
  depthMm: 900,
  demand: known(1200),
  color: '',
  defaultConfig: '8× GPU',
  slotCount: null,
  slotsPerRow: null,
  illustrative: false,
  ...over,
});

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}

const message = (ws: Workspace, cmd: WorkspaceCommand): string | null => {
  const r = apply(ws, cmd);
  return r.ok ? null : r.error.message;
};

describe('demand', () => {
  it('sums known watts and counts unknowns separately', () => {
    expect(sumDemand([known(20), unknownDemand(), known(150)])).toEqual({ knownW: 170, unknownCount: 1 });
    expect(formatDemand(known(1500))).toBe('1,500 W');
    expect(formatDemand(unknownDemand())).toBe('unknown');
  });
});

describe('seed catalog', () => {
  it('starts every workspace with six illustrative generic templates', () => {
    const { catalog } = createWorkspace();
    expect(catalog.map((t) => t.id)).toEqual(SEED_TEMPLATE_IDS);
    expect(catalog.every((t) => t.illustrative)).toBe(true);
    expect(catalog.find((t) => t.id === 'tpl-chassis-6u')).toMatchObject({ category: 'chassis', heightU: 6, slotCount: 5, slotsPerRow: 5 });
    expect(catalog.find((t) => t.id === 'tpl-node')).toMatchObject({ mounting: 'slot', heightU: 0, demand: { kind: 'known', watts: 150 } });
  });
});

describe('catalog commands', () => {
  it('creates a version-1 template and rejects a duplicate id', () => {
    const ws = run(createWorkspace(), { type: 'template/create', template: custom() });
    expect(ws.catalog.find((t) => t.id === 't-gpu')).toMatchObject({ version: 1, label: 'GPU node 4U' });
    expect(message(ws, { type: 'template/create', template: custom() })).toBe('A template with this ID already exists.');
  });

  it('bumps the version and clears "illustrative" on update', () => {
    const ws = run(createWorkspace(), { type: 'template/update', id: 'tpl-server-2u', patch: { demand: known(500) } });
    expect(ws.catalog.find((t) => t.id === 'tpl-server-2u')).toMatchObject({ version: 2, illustrative: false, demand: { watts: 500 } });
  });

  it('validates templates with plain messages', () => {
    const ws = createWorkspace();
    expect(message(ws, { type: 'template/create', template: custom({ mounting: 'slot', category: 'network' }) })).toBe('Nodes use the Compute category.');
    expect(message(ws, { type: 'template/create', template: custom({ category: 'chassis' }) })).toBe('A Chassis needs between 1 and 64 slots.');
    expect(message(ws, { type: 'template/create', template: custom({ category: 'chassis', slotCount: 4, slotsPerRow: 5 }) })).toBe('Slots per row must be between 1 and 4.');
    expect(message(ws, { type: 'template/create', template: custom({ heightU: 0 }) })).toBe('Rack devices are 1 to 60 U high.');
    expect(message(ws, { type: 'template/create', template: custom({ depthMm: 50 }) })).toBe('Depth must be a whole number from 100 to 1500 mm.');
    expect(message(ws, { type: 'template/create', template: custom({ demand: known(-5) }) })).toBe('Demand must be between 0 and 20,000 W.');
    expect(message(ws, { type: 'template/create', template: custom({ label: ' ' }) })).toBe("Template name can't be empty.");
  });

  it('normalises slot templates to zero U and no slots', () => {
    const ws = run(createWorkspace(), { type: 'template/create', template: custom({ id: 't-n', mounting: 'slot', heightU: 2, depthMm: 400 }) });
    expect(ws.catalog.find((t) => t.id === 't-n')).toMatchObject({ heightU: 0, depthMm: 0, slotCount: null });
  });

  it('deletes, and restores only the missing seed templates', () => {
    let ws = run(createWorkspace(), { type: 'template/update', id: 'tpl-server-1u', patch: { label: 'Our 1U' } }, { type: 'template/delete', id: 'tpl-node' });
    expect(ws.catalog.some((t) => t.id === 'tpl-node')).toBe(false);
    expect(message(ws, { type: 'template/delete', id: 'tpl-node' })).toBe('That template no longer exists.');
    ws = run(ws, { type: 'catalog/seed' });
    expect(ws.catalog.some((t) => t.id === 'tpl-node')).toBe(true);
    expect(ws.catalog.find((t) => t.id === 'tpl-server-1u')).toMatchObject({ label: 'Our 1U', version: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `../catalog`.

- [ ] **Step 3: Implement**

In `packages/domain/src/model/defaults.ts`, add these keys inside `LIMITS` (after `textMaxLength: 2000,`):
```ts
  deviceDepthMinMm: 100,
  deviceDepthMaxMm: 1500,
  chassisMaxSlots: 64,
  deviceDemandMaxW: 20_000,
```

In `packages/domain/src/validation.ts`, append:
```ts
/** Drops keys whose value is undefined, so a partial patch never overwrites a field with undefined. */
export function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
```
In `packages/domain/src/commands/objects.ts`, delete its local `definedOnly` function and add `definedOnly` to its import from `'../validation'`.

`packages/domain/src/demand.ts`:
```ts
import { LIMITS } from './model/defaults';
import type { Demand, Watts } from './model/types';

export const known = (watts: Watts): Demand => ({ kind: 'known', watts });
export const unknownDemand = (): Demand => ({ kind: 'unknown' });

export interface DemandTotal {
  knownW: Watts;
  unknownCount: number;
}

export const ZERO_TOTAL: DemandTotal = { knownW: 0, unknownCount: 0 };

export const sumDemand = (demands: Demand[]): DemandTotal =>
  demands.reduce<DemandTotal>(
    (t, d) => (d.kind === 'known' ? { knownW: t.knownW + d.watts, unknownCount: t.unknownCount } : { knownW: t.knownW, unknownCount: t.unknownCount + 1 }),
    ZERO_TOTAL,
  );

export const formatWatts = (w: Watts): string => `${Math.round(w).toLocaleString('en-US')} W`;

export const formatDemand = (d: Demand): string => (d.kind === 'known' ? formatWatts(d.watts) : 'unknown');

export function validateDemand(d: Demand): string | null {
  if (d.kind === 'unknown') return null;
  if (!Number.isFinite(d.watts) || d.watts < 0 || d.watts > LIMITS.deviceDemandMaxW) return 'Demand must be between 0 and 20,000 W.';
  return null;
}
```

`packages/domain/src/catalog.ts`:
```ts
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
```

`packages/domain/src/commands/catalog.ts`:
```ts
import { seedTemplates, validateTemplate } from '../catalog';
import type { Id, Template } from '../model/types';
import { err, ok, type Result } from '../result';
import { definedOnly } from '../validation';

export type CatalogCommand =
  | { type: 'template/create'; template: Omit<Template, 'version'> }
  | { type: 'template/update'; id: Id; patch: Partial<Omit<Template, 'id' | 'version'>> }
  | { type: 'template/delete'; id: Id }
  | { type: 'catalog/seed' };

const gone = (id: Id) => err('not_found', 'That template no longer exists.', [id]);

export function applyCatalogCommand(catalog: Template[], cmd: CatalogCommand): Result<Template[]> {
  switch (cmd.type) {
    case 'template/create': {
      if (catalog.some((t) => t.id === cmd.template.id)) return err('invalid_value', 'A template with this ID already exists.', [cmd.template.id]);
      const valid = validateTemplate({ ...cmd.template, version: 1 });
      if (!valid.ok) return valid;
      return ok([...catalog, valid.value]);
    }
    case 'template/update': {
      const current = catalog.find((t) => t.id === cmd.id);
      if (!current) return gone(cmd.id);
      const valid = validateTemplate({ ...current, ...definedOnly(cmd.patch), id: current.id, version: current.version + 1, illustrative: false });
      if (!valid.ok) return valid;
      return ok(catalog.map((t) => (t.id === cmd.id ? valid.value : t)));
    }
    case 'template/delete':
      if (!catalog.some((t) => t.id === cmd.id)) return gone(cmd.id);
      return ok(catalog.filter((t) => t.id !== cmd.id));
    case 'catalog/seed':
      return ok([...catalog, ...seedTemplates().filter((s) => !catalog.some((t) => t.id === s.id))]);
  }
}
```

In `packages/domain/src/commands/workspace.ts`:
- Add `import { applyCatalogCommand, type CatalogCommand } from './catalog';`.
- Extend the union by appending `  | CatalogCommand;` after the `plan` member, replacing its trailing `;`.
- Add these cases to the `switch` in `apply`, before `case 'plan':`:
```ts
    case 'template/create':
    case 'template/update':
    case 'template/delete':
    case 'catalog/seed': {
      const result = applyCatalogCommand(ws.catalog, cmd);
      if (!result.ok) return result;
      return ok(produce(ws, (d) => void (d.catalog = castDraft(result.value))));
    }
```

In `packages/domain/src/factories.ts`, add `import { seedTemplates } from './catalog';` and change `catalog: [],` inside `createWorkspace` to `catalog: seedTemplates(),`.

Append to `packages/domain/src/index.ts`:
```ts
export * from './demand';
export * from './catalog';
export * from './commands/catalog';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck && pnpm --filter @glasshouse/web test`
Expected: PASS. The web suite still passes, because a seeded Catalog changes no M1 behaviour.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): demand helpers, seed catalog and template commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: U occupancy and the rack capacity guard

**Files:**
- Create: `packages/domain/src/occupancy.ts`
- Modify: `packages/domain/src/commands/objects.ts` (`validateRackFields`), `packages/domain/src/index.ts`
- Test: `packages/domain/src/occupancy.test.ts`

**Interfaces:**
- Consumes: `Rack`, `Failure`, `err`.
- Produces: `USpan { id; label; bottomU; heightU }`, `topU(span)`, `rackSpans(rack): USpan[]` (sorted by bottom U), `usedU(rack)`, `checkSpan(rack, span): Failure | null` (ignores a span with the same id), `lowestFreeBottomU(rack, heightU): number | null`, `formatURange(span)` ("U5" or "U5–U10").

- [ ] **Step 1: Write the failing test**

`packages/domain/src/occupancy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyPlanCommand } from './commands/plan';
import { known } from './demand';
import { emptyContent } from './factories';
import type { PlacedDevice, Rack, ReservedRange } from './model/types';
import { createObject } from './objects';
import { checkSpan, formatURange, lowestFreeBottomU, rackSpans, usedU } from './occupancy';

const dev = (id: string, bottomU: number, heightU: number): PlacedDevice => ({
  id,
  templateId: 't',
  templateVersion: 1,
  name: id,
  demand: known(100),
  config: '',
  notes: '',
  kind: 'device',
  category: 'compute',
  bottomU,
  heightU,
  depthMm: 700,
});
const reserved = (id: string, bottomU: number, heightU: number): ReservedRange => ({ id, label: 'Customer core', bottomU, heightU, demand: { kind: 'unknown' }, notes: '' });
const rackWith = (devices: PlacedDevice[], ranges: ReservedRange[] = []): Rack => ({
  ...(createObject('rack', { x: 1, y: 1 }, []) as Rack),
  name: 'RK-01',
  devices,
  reserved: ranges,
});

describe('occupancy', () => {
  it('lists spans bottom-up and counts used U', () => {
    const rack = rackWith([dev('SRV-B', 10, 2), dev('SRV-A', 1, 4)], [reserved('r', 20, 5)]);
    expect(rackSpans(rack).map((s) => s.id)).toEqual(['SRV-A', 'SRV-B', 'r']);
    expect(usedU(rack)).toBe(11);
  });

  it('rejects overlaps, overflow and non-whole positions with plain messages', () => {
    const rack = rackWith([dev('SRV-A', 10, 2)]);
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 11, heightU: 2 })?.error.message).toBe('SRV-B would overlap SRV-A at U11.');
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 40, heightU: 4 })?.error.message).toBe('SRV-B needs U40–U43, but RK-01 has 42U.');
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 2.5, heightU: 1 })?.error.message).toBe('Positions are whole U, starting at U1.');
    expect(checkSpan(rack, { id: 'SRV-A', label: 'SRV-A', bottomU: 11, heightU: 2 })).toBeNull();
    expect(checkSpan(rack, { id: 'SRV-B', label: 'SRV-B', bottomU: 12, heightU: 2 })).toBeNull();
  });

  it('finds the lowest free span', () => {
    const rack = rackWith([dev('a', 1, 4), dev('b', 7, 1)]);
    expect(lowestFreeBottomU(rack, 2)).toBe(5);
    expect(lowestFreeBottomU(rack, 3)).toBe(8);
    expect(lowestFreeBottomU(rackWith([dev('full', 1, 42)]), 1)).toBeNull();
  });

  it('formats U ranges', () => {
    expect(formatURange({ bottomU: 5, heightU: 6 })).toBe('U5–U10');
    expect(formatURange({ bottomU: 42, heightU: 1 })).toBe('U42');
  });
});

describe('rack capacity guard', () => {
  it('refuses to shrink capacity below the highest occupied U, naming the rack', () => {
    const rack = rackWith([dev('SRV-A', 19, 2)]);
    const added = applyPlanCommand(emptyContent(), { type: 'object/add', object: rack });
    if (!added.ok) throw new Error(added.error.message);
    const r = applyPlanCommand(added.value, { type: 'object/update', id: rack.id, patch: { capacityU: 18 } });
    expect(r).toMatchObject({ ok: false, error: { message: "RK-01 has equipment up to U20, so its capacity can't go below 20U." } });
    expect(applyPlanCommand(added.value, { type: 'object/update', id: rack.id, patch: { capacityU: 20 } }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./occupancy`.

- [ ] **Step 3: Implement**

`packages/domain/src/occupancy.ts`:
```ts
import type { Id, Rack, Units } from './model/types';
import { err, type Failure } from './result';

export interface USpan {
  id: Id;
  label: string;
  bottomU: Units;
  heightU: Units;
}

export const topU = (s: Pick<USpan, 'bottomU' | 'heightU'>): Units => s.bottomU + s.heightU - 1;

export const formatURange = (s: Pick<USpan, 'bottomU' | 'heightU'>): string =>
  s.heightU <= 1 ? `U${s.bottomU}` : `U${s.bottomU}–U${topU(s)}`;

export function rackSpans(rack: Rack): USpan[] {
  return [
    ...rack.devices.map((d) => ({ id: d.id, label: d.name, bottomU: d.bottomU, heightU: d.heightU })),
    ...rack.reserved.map((r) => ({ id: r.id, label: r.label, bottomU: r.bottomU, heightU: r.heightU })),
  ].sort((a, b) => a.bottomU - b.bottomU);
}

export const usedU = (rack: Rack): Units => rackSpans(rack).reduce((n, s) => n + s.heightU, 0);

const spansOverlap = (a: Pick<USpan, 'bottomU' | 'heightU'>, b: Pick<USpan, 'bottomU' | 'heightU'>): boolean =>
  a.bottomU <= topU(b) && b.bottomU <= topU(a);

/** Hard rule for every Rack device and Reserved range; a span with the same id is the thing being moved. */
export function checkSpan(rack: Rack, span: USpan): Failure | null {
  if (!Number.isInteger(span.bottomU) || span.bottomU < 1 || !Number.isInteger(span.heightU) || span.heightU < 1) {
    return err('invalid_value', 'Positions are whole U, starting at U1.', [span.id]);
  }
  if (topU(span) > rack.capacityU) {
    return err('out_of_bounds', `${span.label} needs ${formatURange(span)}, but ${rack.name} has ${rack.capacityU}U.`, [span.id]);
  }
  const clash = rackSpans(rack).find((s) => s.id !== span.id && spansOverlap(s, span));
  if (clash) {
    return err('invalid_value', `${span.label} would overlap ${clash.label} at U${Math.max(span.bottomU, clash.bottomU)}.`, [span.id, clash.id]);
  }
  return null;
}

export function lowestFreeBottomU(rack: Rack, heightU: Units): Units | null {
  const spans = rackSpans(rack);
  for (let u = 1; u + heightU - 1 <= rack.capacityU; u += 1) {
    if (!spans.some((s) => spansOverlap(s, { bottomU: u, heightU }))) return u;
  }
  return null;
}
```

In `packages/domain/src/commands/objects.ts`:
- Add `import { rackSpans, topU } from '../occupancy';`.
- In `validateRackFields`, insert before the final `return null;`:
```ts
  const highest = rackSpans(r).reduce((m, s) => Math.max(m, topU(s)), 0);
  if (highest > r.capacityU) {
    return err('invalid_value', `${name} has equipment up to U${highest}, so its capacity can't go below ${highest}U.`, [r.id]);
  }
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './occupancy';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): U occupancy rules and rack capacity guard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rack device and Reserved range commands

**Files:**
- Create: `packages/domain/src/devices.ts`, `packages/domain/src/commands/equipment.ts`
- Modify: `packages/domain/src/commands/plan.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/equipment.test.ts`

**Interfaces:**
- Consumes: `checkSpan` (Task 2); `validateDemand`, `seedTemplates` (Task 1); `apply`, `createObject`.
- Produces from `devices.ts`: `racksOf(content)`, `getRack(content, id)`, `DeviceLocation { rack; device }`, `findRackDevice(content, id)`, `NodeLocation { rack; chassis; node }`, `findNode(content, id)`, `findReserved(content, id)` → `{ rack; range } | null`, `nextDeviceName(content, template)` (SRV/SW/STO/PWR/CH/NODE-NN), `deviceFromTemplate(template, id, name, bottomU)`, `nodeFromTemplate(template, id, name, slot)`, `replaceRack(content, rack)`, `rememberTemplate(content, template)`.
- Produces from `commands/equipment.ts`: `DevicePatch { name?; demand?; config?; notes?; depthMm?; slotCount?; slotsPerRow? }`, `EquipmentCommand` (`device/place {id, rackId, bottomU, template}`, `device/move {id, rackId, bottomU}`, `device/update {id, patch}`, `device/remove {id}`, `reserved/add {rackId, range}`, `reserved/update {id, patch}`, `reserved/remove {id}`), `applyEquipmentCommand(content, cmd)`. `PlanCommand` now includes `EquipmentCommand`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/equipment.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { known, unknownDemand } from '../demand';
import { findRackDevice, findReserved } from '../devices';
import { createWorkspace, emptyContent } from '../factories';
import { currentRevision, findRoom } from '../lookup';
import type { PlanContent, Rack, Template, Workspace } from '../model/types';
import { createObject } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';
import { apply, type WorkspaceCommand } from './workspace';

const T: Record<string, Template> = Object.fromEntries(seedTemplates().map((t) => [t.id, t]));
const tpl = (id: string): Template => {
  const t = T[id];
  if (!t) throw new Error(`no template ${id}`);
  return t;
};

function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}
const fail = (content: PlanContent, cmd: PlanCommand): string => {
  const r = applyPlanCommand(content, cmd);
  if (r.ok) throw new Error('expected a rejection');
  return r.error.message;
};

function twoRacks(): { content: PlanContent; a: Rack; b: Rack } {
  const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), name: 'RK-02' };
  return { content: run(emptyContent(), { type: 'object/add', object: a }, { type: 'object/add', object: b }), a, b };
}
const place = (rackId: string, templateId: string, bottomU: number, id: string): PlanCommand => ({
  type: 'device/place',
  id,
  rackId,
  bottomU,
  template: tpl(templateId),
});

describe('placing devices', () => {
  it('AC05: the same U range works in two racks; overlap inside one rack is refused', () => {
    const { content, a, b } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 10, 'd1'), place(b.id, 'tpl-server-2u', 10, 'd2'));
    expect(findRackDevice(c, 'd2')?.rack.id).toBe(b.id);
    expect(fail(c, place(a.id, 'tpl-server-2u', 11, 'd3'))).toBe('SRV-03 would overlap SRV-01 at U11.');
  });

  it('copies the template, names by category and records the template version once', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 1, 'd1'), place(a.id, 'tpl-server-2u', 3, 'd2'), place(a.id, 'tpl-switch-1u', 42, 'd3'));
    expect(findRackDevice(c, 'd1')?.device).toMatchObject({ name: 'SRV-01', kind: 'device', heightU: 2, depthMm: 780, demand: { watts: 450 }, templateVersion: 1 });
    expect(findRackDevice(c, 'd3')?.device.name).toBe('SW-01');
    expect(c.templatesUsed.map((t) => t.id)).toEqual(['tpl-server-2u', 'tpl-switch-1u']);
  });

  it('refuses overflow, slot templates and missing racks', () => {
    const { content, a } = twoRacks();
    expect(fail(content, place(a.id, 'tpl-server-4u', 40, 'd1'))).toBe('SRV-01 needs U40–U43, but RK-01 has 42U.');
    expect(fail(content, place(a.id, 'tpl-node', 1, 'd1'))).toBe('Node server goes in a Chassis slot, not directly in a rack.');
    expect(fail(content, place('nope', 'tpl-server-1u', 1, 'd1'))).toBe('That rack no longer exists.');
  });
});

describe('moving, editing and removing devices', () => {
  it('moves a device to another rack, keeping its id', () => {
    const { content, a, b } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 1, 'd1'), { type: 'device/move', id: 'd1', rackId: b.id, bottomU: 20 });
    expect(findRackDevice(c, 'd1')).toMatchObject({ rack: { id: b.id }, device: { bottomU: 20 } });
    expect(c.objects.find((o) => o.id === a.id)).toMatchObject({ devices: [] });
  });

  it('moves within a rack onto its own old span, but not onto a neighbour', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-2u', 1, 'd1'), place(a.id, 'tpl-server-2u', 5, 'd2'));
    expect(findRackDevice(run(c, { type: 'device/move', id: 'd1', rackId: a.id, bottomU: 2 }), 'd1')?.device.bottomU).toBe(2);
    expect(fail(c, { type: 'device/move', id: 'd1', rackId: a.id, bottomU: 4 })).toBe('SRV-01 would overlap SRV-02 at U5.');
  });

  it('updates demand, depth and text, and validates', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-1u', 1, 'd1'), { type: 'device/update', id: 'd1', patch: { demand: unknownDemand(), depthMm: 1070, config: '2× CPU' } });
    expect(findRackDevice(c, 'd1')?.device).toMatchObject({ demand: { kind: 'unknown' }, depthMm: 1070, config: '2× CPU' });
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { demand: known(-1) } })).toBe('Demand must be between 0 and 20,000 W.');
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { name: '' } })).toBe("Name can't be empty.");
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { slotCount: 4 } })).toBe('SRV-01 is not a Chassis.');
    expect(fail(c, { type: 'device/update', id: 'd1', patch: { depthMm: 3000 } })).toBe('Depth must be a whole number from 100 to 1500 mm.');
  });

  it('removes a device', () => {
    const { content, a } = twoRacks();
    const c = run(content, place(a.id, 'tpl-server-1u', 1, 'd1'), { type: 'device/remove', id: 'd1' });
    expect(findRackDevice(c, 'd1')).toBeNull();
    expect(fail(c, { type: 'device/remove', id: 'd1' })).toBe('That device no longer exists.');
  });
});

describe('reserved ranges', () => {
  it('occupies U like a device and can be edited and removed', () => {
    const { content, a } = twoRacks();
    const range = { id: 'r1', label: 'Customer core', bottomU: 1, heightU: 14, demand: unknownDemand(), notes: '' };
    let c = run(content, { type: 'reserved/add', rackId: a.id, range });
    expect(fail(c, place(a.id, 'tpl-server-2u', 13, 'd1'))).toBe('SRV-01 would overlap Customer core at U13.');
    c = run(c, { type: 'reserved/update', id: 'r1', patch: { heightU: 10, demand: known(900) } });
    expect(findReserved(c, 'r1')?.range).toMatchObject({ heightU: 10, demand: { watts: 900 } });
    expect(fail(c, { type: 'reserved/update', id: 'r1', patch: { label: ' ' } })).toBe("Label can't be empty.");
    c = run(c, { type: 'reserved/remove', id: 'r1' });
    expect(findReserved(c, 'r1')).toBeNull();
  });
});

describe('AC09: template changes never touch placed devices', () => {
  it('keeps the copied values after the template is edited and deleted', () => {
    const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
    const cmds: WorkspaceCommand[] = [
      { type: 'project/create', id: 'p', name: 'P' },
      { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
      { type: 'room/create', siteId: 's', id: 'r', name: 'R' },
      { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    ];
    let ws: Workspace = cmds.reduce((w, cmd) => {
      const res = apply(w, cmd);
      if (!res.ok) throw new Error(res.error.message);
      return res.value;
    }, createWorkspace());
    const template = ws.catalog.find((t) => t.id === 'tpl-server-2u');
    if (!template) throw new Error('seed missing');
    for (const cmd of [
      { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'd1', rackId: rack.id, bottomU: 1, template } },
      { type: 'template/update', id: 'tpl-server-2u', patch: { demand: known(999), heightU: 3 } },
      { type: 'template/delete', id: 'tpl-server-2u' },
    ] as WorkspaceCommand[]) {
      const res = apply(ws, cmd);
      if (!res.ok) throw new Error(res.error.message);
      ws = res.value;
    }
    const content = currentRevision(findRoom(ws, 'r')!.room.plan).content;
    expect(findRackDevice(content, 'd1')?.device).toMatchObject({ heightU: 2, demand: { watts: 450 }, templateVersion: 1 });
    expect(content.templatesUsed[0]).toMatchObject({ id: 'tpl-server-2u', version: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `../devices`.

- [ ] **Step 3: Implement**

`packages/domain/src/devices.ts`:
```ts
import { isRack } from './model/types';
import type { Category, Chassis, Id, Node, PlanContent, Rack, RackDevice, ReservedRange, Template, Units } from './model/types';

const PREFIX: Record<Category, string> = { compute: 'SRV', storage: 'STO', network: 'SW', power: 'PWR', chassis: 'CH' };

export const racksOf = (content: PlanContent): Rack[] => content.objects.filter(isRack);

export const getRack = (content: PlanContent, id: Id): Rack | null => racksOf(content).find((r) => r.id === id) ?? null;

export interface DeviceLocation {
  rack: Rack;
  device: RackDevice;
}

export function findRackDevice(content: PlanContent, id: Id): DeviceLocation | null {
  for (const rack of racksOf(content)) {
    const device = rack.devices.find((d) => d.id === id);
    if (device) return { rack, device };
  }
  return null;
}

export interface NodeLocation {
  rack: Rack;
  chassis: Chassis;
  node: Node;
}

export function findNode(content: PlanContent, id: Id): NodeLocation | null {
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      if (d.kind !== 'chassis') continue;
      const node = d.nodes.find((n) => n.id === id);
      if (node) return { rack, chassis: d, node };
    }
  }
  return null;
}

export function findReserved(content: PlanContent, id: Id): { rack: Rack; range: ReservedRange } | null {
  for (const rack of racksOf(content)) {
    const range = rack.reserved.find((r) => r.id === id);
    if (range) return { rack, range };
  }
  return null;
}

const allDeviceNames = (content: PlanContent): string[] =>
  racksOf(content).flatMap((r) => r.devices.flatMap((d) => (d.kind === 'chassis' ? [d.name, ...d.nodes.map((n) => n.name)] : [d.name])));

export function nextDeviceName(content: PlanContent, template: Template): string {
  const prefix = template.mounting === 'slot' ? 'NODE' : PREFIX[template.category];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = allDeviceNames(content).reduce((m, n) => {
    const match = pattern.exec(n);
    return match?.[1] ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

export function deviceFromTemplate(template: Template, id: Id, name: string, bottomU: Units): RackDevice {
  const base = {
    id,
    templateId: template.id,
    templateVersion: template.version,
    name,
    demand: { ...template.demand },
    config: template.defaultConfig,
    notes: '',
    bottomU,
    heightU: template.heightU,
    depthMm: template.depthMm,
  };
  if (template.category === 'chassis') {
    const slotCount = template.slotCount ?? 1;
    return { ...base, kind: 'chassis', slotCount, slotsPerRow: template.slotsPerRow ?? slotCount, nodes: [] };
  }
  return { ...base, kind: 'device', category: template.category };
}

export const nodeFromTemplate = (template: Template, id: Id, name: string, slot: number): Node => ({
  id,
  templateId: template.id,
  templateVersion: template.version,
  name,
  demand: { ...template.demand },
  config: template.defaultConfig,
  notes: '',
  slot,
});

export const replaceRack = (content: PlanContent, rack: Rack): PlanContent => ({
  ...content,
  objects: content.objects.map((o) => (o.id === rack.id ? rack : o)),
});

export function rememberTemplate(content: PlanContent, template: Template): PlanContent {
  if (content.templatesUsed.some((t) => t.id === template.id && t.version === template.version)) return content;
  return { ...content, templatesUsed: [...content.templatesUsed, { ...template, demand: { ...template.demand } }] };
}
```

`packages/domain/src/commands/equipment.ts`:
```ts
import { validateDemand } from '../demand';
import { deviceFromTemplate, findNode, findRackDevice, findReserved, getRack, nextDeviceName, rememberTemplate, replaceRack } from '../devices';
import { LIMITS } from '../model/defaults';
import type { Demand, Id, Millimetres, PlanContent, RackDevice, ReservedRange, Template, Units } from '../model/types';
import { checkSpan } from '../occupancy';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { definedOnly, isWholeInRange, validateName } from '../validation';

export interface DevicePatch {
  name?: string;
  demand?: Demand;
  config?: string;
  notes?: string;
  depthMm?: Millimetres;
  slotCount?: number;
  slotsPerRow?: number;
}

export type EquipmentCommand =
  | { type: 'device/place'; id: Id; rackId: Id; bottomU: Units; template: Template }
  | { type: 'device/move'; id: Id; rackId: Id; bottomU: Units }
  | { type: 'device/update'; id: Id; patch: DevicePatch }
  | { type: 'device/remove'; id: Id }
  | { type: 'reserved/add'; rackId: Id; range: ReservedRange }
  | { type: 'reserved/update'; id: Id; patch: Partial<Omit<ReservedRange, 'id'>> }
  | { type: 'reserved/remove'; id: Id };

const rackGone = (id: Id): Failure => err('not_found', 'That rack no longer exists.', [id]);
const deviceGone = (id: Id): Failure => err('not_found', 'That device no longer exists.', [id]);
const rangeGone = (id: Id): Failure => err('not_found', 'That reserved range no longer exists.', [id]);

const idTaken = (content: PlanContent, id: Id): boolean =>
  findRackDevice(content, id) !== null || findNode(content, id) !== null || findReserved(content, id) !== null;

function textError(value: string | undefined, label: string, id: Id): Failure | null {
  if (value !== undefined && value.length > LIMITS.textMaxLength) {
    return err('invalid_value', `${label} must be ${LIMITS.textMaxLength} characters or fewer.`, [id]);
  }
  return null;
}

function placeDevice(content: PlanContent, cmd: Extract<EquipmentCommand, { type: 'device/place' }>): Result<PlanContent> {
  const { template } = cmd;
  if (template.mounting !== 'rack') return err('invalid_value', `${template.label} goes in a Chassis slot, not directly in a rack.`, [template.id]);
  const rack = getRack(content, cmd.rackId);
  if (!rack) return rackGone(cmd.rackId);
  if (idTaken(content, cmd.id)) return err('invalid_value', 'A device with this ID already exists.', [cmd.id]);
  const device = deviceFromTemplate(template, cmd.id, nextDeviceName(content, template), cmd.bottomU);
  const clash = checkSpan(rack, { id: device.id, label: device.name, bottomU: device.bottomU, heightU: device.heightU });
  if (clash) return clash;
  return ok(rememberTemplate(replaceRack(content, { ...rack, devices: [...rack.devices, device] }), template));
}

function moveDevice(content: PlanContent, id: Id, rackId: Id, bottomU: Units): Result<PlanContent> {
  const loc = findRackDevice(content, id);
  if (!loc) return deviceGone(id);
  const dest = getRack(content, rackId);
  if (!dest) return rackGone(rackId);
  const moved: RackDevice = { ...loc.device, bottomU };
  const clash = checkSpan(dest, { id, label: moved.name, bottomU, heightU: moved.heightU });
  if (clash) return clash;
  const without = replaceRack(content, { ...loc.rack, devices: loc.rack.devices.filter((d) => d.id !== id) });
  const target = getRack(without, rackId);
  if (!target) return rackGone(rackId);
  return ok(replaceRack(without, { ...target, devices: [...target.devices, moved] }));
}

function updateDevice(content: PlanContent, id: Id, patch: DevicePatch): Result<PlanContent> {
  const loc = findRackDevice(content, id);
  if (!loc) return deviceGone(id);
  const { device, rack } = loc;
  if (device.kind !== 'chassis' && (patch.slotCount !== undefined || patch.slotsPerRow !== undefined)) {
    return err('invalid_value', `${device.name} is not a Chassis.`, [id]);
  }
  let name = device.name;
  if (patch.name !== undefined) {
    const valid = validateName(patch.name);
    if (!valid.ok) return withTarget(valid, id);
    name = valid.value;
  }
  if (patch.demand) {
    const problem = validateDemand(patch.demand);
    if (problem) return err('invalid_value', problem, [id]);
  }
  if (patch.depthMm !== undefined && !isWholeInRange(patch.depthMm, LIMITS.deviceDepthMinMm, LIMITS.deviceDepthMaxMm)) {
    return err('invalid_value', 'Depth must be a whole number from 100 to 1500 mm.', [id]);
  }
  const text = textError(patch.config, 'Configuration', id) ?? textError(patch.notes, 'Notes', id);
  if (text) return text;

  const { slotCount, slotsPerRow, ...common } = patch;
  let next: RackDevice = { ...device, ...definedOnly(common), name };
  if (next.kind === 'chassis') {
    const slots = slotCount ?? next.slotCount;
    if (!isWholeInRange(slots, 1, LIMITS.chassisMaxSlots)) return err('invalid_value', 'A Chassis needs between 1 and 64 slots.', [id]);
    const blocking = next.nodes.find((n) => n.slot > slots);
    if (blocking) {
      return err('invalid_value', `Slot ${blocking.slot} holds ${blocking.name}. Move or remove it before reducing ${next.name} to ${slots} slots.`, [id, blocking.id]);
    }
    const perRow = slotsPerRow ?? Math.min(next.slotsPerRow, slots);
    if (!isWholeInRange(perRow, 1, slots)) return err('invalid_value', `Slots per row must be between 1 and ${slots}.`, [id]);
    next = { ...next, slotCount: slots, slotsPerRow: perRow };
  }
  const updated = next;
  return ok(replaceRack(content, { ...rack, devices: rack.devices.map((d) => (d.id === id ? updated : d)) }));
}

function removeDevice(content: PlanContent, id: Id): Result<PlanContent> {
  const loc = findRackDevice(content, id);
  if (!loc) return deviceGone(id);
  return ok(replaceRack(content, { ...loc.rack, devices: loc.rack.devices.filter((d) => d.id !== id) }));
}

function validateRange(range: ReservedRange): Result<ReservedRange> {
  const label = validateName(range.label, 'Label');
  if (!label.ok) return withTarget(label, range.id);
  const problem = validateDemand(range.demand);
  if (problem) return err('invalid_value', problem, [range.id]);
  const text = textError(range.notes, 'Notes', range.id);
  if (text) return text;
  return ok({ ...range, label: label.value });
}

function addReserved(content: PlanContent, rackId: Id, range: ReservedRange): Result<PlanContent> {
  const rack = getRack(content, rackId);
  if (!rack) return rackGone(rackId);
  if (idTaken(content, range.id)) return err('invalid_value', 'A reserved range with this ID already exists.', [range.id]);
  const valid = validateRange(range);
  if (!valid.ok) return valid;
  const clash = checkSpan(rack, { id: range.id, label: valid.value.label, bottomU: range.bottomU, heightU: range.heightU });
  if (clash) return clash;
  return ok(replaceRack(content, { ...rack, reserved: [...rack.reserved, valid.value] }));
}

function updateReserved(content: PlanContent, id: Id, patch: Partial<Omit<ReservedRange, 'id'>>): Result<PlanContent> {
  const found = findReserved(content, id);
  if (!found) return rangeGone(id);
  const valid = validateRange({ ...found.range, ...definedOnly(patch), id });
  if (!valid.ok) return valid;
  const clash = checkSpan(found.rack, { id, label: valid.value.label, bottomU: valid.value.bottomU, heightU: valid.value.heightU });
  if (clash) return clash;
  return ok(replaceRack(content, { ...found.rack, reserved: found.rack.reserved.map((r) => (r.id === id ? valid.value : r)) }));
}

function removeReserved(content: PlanContent, id: Id): Result<PlanContent> {
  const found = findReserved(content, id);
  if (!found) return rangeGone(id);
  return ok(replaceRack(content, { ...found.rack, reserved: found.rack.reserved.filter((r) => r.id !== id) }));
}

export function applyEquipmentCommand(content: PlanContent, cmd: EquipmentCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'device/place':
      return placeDevice(content, cmd);
    case 'device/move':
      return moveDevice(content, cmd.id, cmd.rackId, cmd.bottomU);
    case 'device/update':
      return updateDevice(content, cmd.id, cmd.patch);
    case 'device/remove':
      return removeDevice(content, cmd.id);
    case 'reserved/add':
      return addReserved(content, cmd.rackId, cmd.range);
    case 'reserved/update':
      return updateReserved(content, cmd.id, cmd.patch);
    case 'reserved/remove':
      return removeReserved(content, cmd.id);
  }
}
```

Replace `packages/domain/src/commands/plan.ts`:
```ts
import type { Id, PlanContent, Rect } from '../model/types';
import type { Result } from '../result';
import { applyEquipmentCommand, type EquipmentCommand } from './equipment';
import { addFloorRect, removeFloorRect, updateFloorRect } from './floor';
import { addObject, removeObject, rotateObject, updateObject, type ObjectCommand } from './objects';
import { updateSurvey, type SurveyPatch } from './survey';

export type PlanCommand =
  | { type: 'survey/update'; patch: SurveyPatch }
  | { type: 'floor/add'; rect: Rect }
  | { type: 'floor/cut'; rect: Rect }
  | { type: 'floor/update'; id: Id; patch: Partial<Omit<Rect, 'id'>> }
  | { type: 'floor/remove'; id: Id }
  | ObjectCommand
  | EquipmentCommand;

export function applyPlanCommand(content: PlanContent, cmd: PlanCommand): Result<PlanContent> {
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
  }
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './devices';
export * from './commands/equipment';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): place, move, edit and remove devices and reserved ranges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chassis Nodes

**Files:**
- Create: `packages/domain/src/commands/nodes.ts`
- Modify: `packages/domain/src/commands/plan.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/nodes.test.ts`

**Interfaces:**
- Consumes: `findRackDevice`, `findNode`, `nodeFromTemplate`, `nextDeviceName`, `replaceRack`, `rememberTemplate` (Task 3); `validateDemand`.
- Produces: `NodePatch { name?; demand?; config?; notes? }`, `NodeCommand` (`node/insert {id, chassisId, slot, template}`, `node/update {id, patch}`, `node/remove {id}`), `applyNodeCommand(content, cmd)`. `PlanCommand` now includes `NodeCommand`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/nodes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { unknownDemand } from '../demand';
import { findNode, findRackDevice } from '../devices';
import { emptyContent } from '../factories';
import type { Chassis, PlanContent, Rack, Template } from '../model/types';
import { createObject } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';

const T: Record<string, Template> = Object.fromEntries(seedTemplates().map((t) => [t.id, t]));
const tpl = (id: string): Template => T[id] as Template;

function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}
const fail = (content: PlanContent, cmd: PlanCommand): string => {
  const r = applyPlanCommand(content, cmd);
  if (r.ok) throw new Error('expected a rejection');
  return r.error.message;
};
const insert = (slot: number, id = `n${slot}`, templateId = 'tpl-node'): PlanCommand => ({ type: 'node/insert', id, chassisId: 'ch', slot, template: tpl(templateId) });

function withChassis(): { content: PlanContent; a: Rack; b: Rack } {
  const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), name: 'RK-02' };
  const content = run(
    emptyContent(),
    { type: 'object/add', object: a },
    { type: 'object/add', object: b },
    { type: 'device/place', id: 'ch', rackId: a.id, bottomU: 5, template: tpl('tpl-chassis-6u') },
  );
  return { content, a, b };
}
const chassisOf = (c: PlanContent): Chassis => findRackDevice(c, 'ch')?.device as Chassis;

describe('chassis nodes', () => {
  it('AC06: five nodes fill a 6U chassis without using rack units', () => {
    const { content } = withChassis();
    const c = run(content, insert(1), insert(2), insert(3), insert(4), insert(5));
    expect(chassisOf(c).nodes.map((n) => [n.slot, n.name])).toEqual([
      [1, 'NODE-01'],
      [2, 'NODE-02'],
      [3, 'NODE-03'],
      [4, 'NODE-04'],
      [5, 'NODE-05'],
    ]);
    expect(chassisOf(c)).toMatchObject({ bottomU: 5, heightU: 6 });
    expect(c.templatesUsed.map((t) => t.id)).toEqual(['tpl-chassis-6u', 'tpl-node']);
  });

  it('AC07: refuses an occupied slot, a missing slot and a rack-mounted template', () => {
    const { content } = withChassis();
    const c = run(content, insert(1));
    expect(fail(c, insert(1, 'x'))).toBe('Slot 1 of CH-01 already holds NODE-01.');
    expect(fail(c, insert(6, 'x'))).toBe('CH-01 has slots 1–5.');
    expect(fail(c, insert(2, 'x', 'tpl-server-1u'))).toBe('Server 1U mounts in a rack, not in a Chassis slot.');
    expect(chassisOf(c).nodes).toHaveLength(1);
  });

  it('AC08: moving the chassis keeps every node, id and slot', () => {
    const { content, b } = withChassis();
    const c = run(content, insert(1), insert(4), { type: 'device/move', id: 'ch', rackId: b.id, bottomU: 30 });
    expect(findNode(c, 'n4')).toMatchObject({ rack: { id: b.id }, chassis: { id: 'ch', bottomU: 30 }, node: { slot: 4, name: 'NODE-02' } });
  });

  it('refuses a move that does not fit and leaves the assembly intact', () => {
    const { content, b } = withChassis();
    const c = run(content, insert(1), { type: 'device/place', id: 'sw', rackId: b.id, bottomU: 40, template: tpl('tpl-switch-1u') });
    expect(fail(c, { type: 'device/move', id: 'ch', rackId: b.id, bottomU: 37 })).toBe('CH-01 would overlap SW-01 at U40.');
    expect(findNode(c, 'n1')?.chassis.bottomU).toBe(5);
  });

  it('refuses to drop below an occupied slot', () => {
    const { content } = withChassis();
    const c = run(content, insert(5));
    expect(fail(c, { type: 'device/update', id: 'ch', patch: { slotCount: 4 } })).toBe('Slot 5 holds NODE-01. Move or remove it before reducing CH-01 to 4 slots.');
    expect(chassisOf(run(c, { type: 'device/update', id: 'ch', patch: { slotCount: 8, slotsPerRow: 4 } }))).toMatchObject({ slotCount: 8, slotsPerRow: 4 });
  });

  it('updates and removes nodes; removing the chassis removes its nodes', () => {
    const { content } = withChassis();
    let c = run(content, insert(2), { type: 'node/update', id: 'n2', patch: { demand: unknownDemand(), config: '256 GB RAM' } });
    expect(findNode(c, 'n2')?.node).toMatchObject({ demand: { kind: 'unknown' }, config: '256 GB RAM' });
    expect(fail(c, { type: 'node/update', id: 'n2', patch: { name: '' } })).toBe("Name can't be empty.");
    c = run(c, { type: 'node/remove', id: 'n2' });
    expect(chassisOf(c).nodes).toEqual([]);
    c = run(c, insert(3), { type: 'device/remove', id: 'ch' });
    expect(findNode(c, 'n3')).toBeNull();
    expect(fail(c, insert(1, 'z'))).toBe('That Chassis no longer exists.');
  });

  it('refuses to insert into something that is not a chassis', () => {
    const { content, a } = withChassis();
    const c = run(content, { type: 'device/place', id: 'srv', rackId: a.id, bottomU: 20, template: tpl('tpl-server-1u') });
    expect(fail(c, { type: 'node/insert', id: 'x', chassisId: 'srv', slot: 1, template: tpl('tpl-node') })).toBe('SRV-01 is not a Chassis.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL. TypeScript and vitest reject `node/insert` because `applyPlanCommand` has no such case and returns undefined, so assertions fail with `Cannot read properties of undefined`.

- [ ] **Step 3: Implement**

`packages/domain/src/commands/nodes.ts`:
```ts
import { validateDemand } from '../demand';
import { findNode, findRackDevice, nextDeviceName, nodeFromTemplate, rememberTemplate, replaceRack } from '../devices';
import { LIMITS } from '../model/defaults';
import type { Chassis, Demand, Id, Node, PlanContent, Rack, Template } from '../model/types';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { definedOnly, isWholeInRange, validateName } from '../validation';

export interface NodePatch {
  name?: string;
  demand?: Demand;
  config?: string;
  notes?: string;
}

export type NodeCommand =
  | { type: 'node/insert'; id: Id; chassisId: Id; slot: number; template: Template }
  | { type: 'node/update'; id: Id; patch: NodePatch }
  | { type: 'node/remove'; id: Id };

const nodeGone = (id: Id): Failure => err('not_found', 'That Node no longer exists.', [id]);

const replaceChassis = (content: PlanContent, rack: Rack, chassis: Chassis): PlanContent =>
  replaceRack(content, { ...rack, devices: rack.devices.map((d) => (d.id === chassis.id ? chassis : d)) });

function insertNode(content: PlanContent, cmd: Extract<NodeCommand, { type: 'node/insert' }>): Result<PlanContent> {
  const { template, slot } = cmd;
  if (template.mounting !== 'slot') return err('invalid_value', `${template.label} mounts in a rack, not in a Chassis slot.`, [template.id]);
  const loc = findRackDevice(content, cmd.chassisId);
  if (!loc) return err('not_found', 'That Chassis no longer exists.', [cmd.chassisId]);
  if (loc.device.kind !== 'chassis') return err('invalid_value', `${loc.device.name} is not a Chassis.`, [cmd.chassisId]);
  const chassis = loc.device;
  if (!isWholeInRange(slot, 1, chassis.slotCount)) return err('out_of_bounds', `${chassis.name} has slots 1–${chassis.slotCount}.`, [chassis.id]);
  const occupant = chassis.nodes.find((n) => n.slot === slot);
  if (occupant) return err('invalid_value', `Slot ${slot} of ${chassis.name} already holds ${occupant.name}.`, [chassis.id, occupant.id]);
  if (findRackDevice(content, cmd.id) || findNode(content, cmd.id)) return err('invalid_value', 'A Node with this ID already exists.', [cmd.id]);
  const node = nodeFromTemplate(template, cmd.id, nextDeviceName(content, template), slot);
  const nodes = [...chassis.nodes, node].sort((a, b) => a.slot - b.slot);
  return ok(rememberTemplate(replaceChassis(content, loc.rack, { ...chassis, nodes }), template));
}

function updateNode(content: PlanContent, id: Id, patch: NodePatch): Result<PlanContent> {
  const loc = findNode(content, id);
  if (!loc) return nodeGone(id);
  let name = loc.node.name;
  if (patch.name !== undefined) {
    const valid = validateName(patch.name);
    if (!valid.ok) return withTarget(valid, id);
    name = valid.value;
  }
  if (patch.demand) {
    const problem = validateDemand(patch.demand);
    if (problem) return err('invalid_value', problem, [id]);
  }
  for (const [label, value] of [
    ['Configuration', patch.config],
    ['Notes', patch.notes],
  ] as const) {
    if (value !== undefined && value.length > LIMITS.textMaxLength) {
      return err('invalid_value', `${label} must be ${LIMITS.textMaxLength} characters or fewer.`, [id]);
    }
  }
  const next: Node = { ...loc.node, ...definedOnly(patch), name };
  return ok(replaceChassis(content, loc.rack, { ...loc.chassis, nodes: loc.chassis.nodes.map((n) => (n.id === id ? next : n)) }));
}

function removeNode(content: PlanContent, id: Id): Result<PlanContent> {
  const loc = findNode(content, id);
  if (!loc) return nodeGone(id);
  return ok(replaceChassis(content, loc.rack, { ...loc.chassis, nodes: loc.chassis.nodes.filter((n) => n.id !== id) }));
}

export function applyNodeCommand(content: PlanContent, cmd: NodeCommand): Result<PlanContent> {
  switch (cmd.type) {
    case 'node/insert':
      return insertNode(content, cmd);
    case 'node/update':
      return updateNode(content, cmd.id, cmd.patch);
    case 'node/remove':
      return removeNode(content, cmd.id);
  }
}
```

In `packages/domain/src/commands/plan.ts`:
- Add `import { applyNodeCommand, type NodeCommand } from './nodes';`.
- Change the union's last line `  | EquipmentCommand;` to `  | EquipmentCommand\n  | NodeCommand;`.
- Add these cases at the end of the `switch`:
```ts
    case 'node/insert':
    case 'node/update':
    case 'node/remove':
      return applyNodeCommand(content, cmd);
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './commands/nodes';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): insert, edit and remove chassis nodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Power aggregation

**Files:**
- Create: `packages/domain/src/power.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/power.test.ts`

**Interfaces:**
- Consumes: `sumDemand`, `ZERO_TOTAL`, `DemandTotal` (Task 1); `racksOf` (Task 3).
- Produces: `deviceDemandTotal(device): DemandTotal` (a Chassis counts its overhead plus each Node once), `RackPower { devices: DemandTotal; reserved: DemandTotal }`, `rackPower(rack)`, `RoomPower { knownW; unknownDevices; unknownReserved; budgetW; limitW; limitPct; overLimit }`, `roomPower(content)`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/power.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { known, unknownDemand } from './demand';
import { emptyContent } from './factories';
import type { Chassis, PlacedDevice, PlanContent, Rack } from './model/types';
import { createObject } from './objects';
import { deviceDemandTotal, rackPower, roomPower } from './power';

const node = (slot: number, watts: number | null) => ({
  id: `n${slot}`,
  templateId: 't',
  templateVersion: 1,
  name: `NODE-0${slot}`,
  demand: watts === null ? unknownDemand() : known(watts),
  config: '',
  notes: '',
  slot,
});
const chassis = (nodes: ReturnType<typeof node>[]): Chassis => ({
  id: 'ch',
  templateId: 't',
  templateVersion: 1,
  name: 'CH-01',
  demand: known(20),
  config: '',
  notes: '',
  kind: 'chassis',
  bottomU: 5,
  heightU: 6,
  depthMm: 780,
  slotCount: 5,
  slotsPerRow: 5,
  nodes,
});
const server = (watts: number | null): PlacedDevice => ({
  id: 's',
  templateId: 't',
  templateVersion: 1,
  name: 'SRV-01',
  demand: watts === null ? unknownDemand() : known(watts),
  config: '',
  notes: '',
  kind: 'device',
  category: 'compute',
  bottomU: 20,
  heightU: 2,
  depthMm: 780,
});
const roomWith = (rack: Partial<Rack>, survey: Partial<PlanContent['survey']> = {}): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, ...survey }, objects: [{ ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), ...rack }] };
};

describe('power', () => {
  it('AC06: a 6U chassis with 20 W overhead and five 150 W nodes draws 770 W', () => {
    expect(deviceDemandTotal(chassis([1, 2, 3, 4, 5].map((s) => node(s, 150))))).toEqual({ knownW: 770, unknownCount: 0 });
  });

  it('counts unknown demand separately and never as zero', () => {
    expect(deviceDemandTotal(chassis([node(1, 150), node(2, null)]))).toEqual({ knownW: 170, unknownCount: 1 });
    const rack = { devices: [server(null)], reserved: [{ id: 'r', label: 'Customer', bottomU: 1, heightU: 4, demand: unknownDemand(), notes: '' }] };
    expect(rackPower({ ...(createObject('rack', { x: 0, y: 0 }, []) as Rack), ...rack })).toEqual({
      devices: { knownW: 0, unknownCount: 1 },
      reserved: { knownW: 0, unknownCount: 1 },
    });
  });

  it('compares known room demand with the design limit, including known reserved ranges', () => {
    const content = roomWith(
      { devices: [server(3500)], reserved: [{ id: 'r', label: 'Customer', bottomU: 1, heightU: 4, demand: known(600), notes: '' }] },
      { powerBudget: 5000, designLimitPct: 80 },
    );
    expect(roomPower(content)).toEqual({ knownW: 4100, unknownDevices: 0, unknownReserved: 0, budgetW: 5000, limitW: 4000, limitPct: 80, overLimit: true });
  });

  it('treats a known 0 W as known', () => {
    expect(deviceDemandTotal(server(0))).toEqual({ knownW: 0, unknownCount: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./power`.

- [ ] **Step 3: Implement**

`packages/domain/src/power.ts`:
```ts
import { sumDemand, ZERO_TOTAL, type DemandTotal } from './demand';
import { racksOf } from './devices';
import type { PlanContent, Rack, RackDevice, Watts } from './model/types';

const add = (a: DemandTotal, b: DemandTotal): DemandTotal => ({ knownW: a.knownW + b.knownW, unknownCount: a.unknownCount + b.unknownCount });

export const deviceDemandTotal = (d: RackDevice): DemandTotal =>
  d.kind === 'chassis' ? sumDemand([d.demand, ...d.nodes.map((n) => n.demand)]) : sumDemand([d.demand]);

export interface RackPower {
  devices: DemandTotal;
  reserved: DemandTotal;
}

export const rackPower = (rack: Rack): RackPower => ({
  devices: rack.devices.map(deviceDemandTotal).reduce(add, ZERO_TOTAL),
  reserved: sumDemand(rack.reserved.map((r) => r.demand)),
});

export interface RoomPower {
  knownW: Watts;
  unknownDevices: number;
  unknownReserved: number;
  budgetW: Watts;
  limitW: Watts;
  limitPct: number;
  overLimit: boolean;
}

export function roomPower(content: PlanContent): RoomPower {
  const racks = racksOf(content).map(rackPower);
  const devices = racks.map((r) => r.devices).reduce(add, ZERO_TOTAL);
  const reserved = racks.map((r) => r.reserved).reduce(add, ZERO_TOTAL);
  const { powerBudget, designLimitPct } = content.survey;
  const limitW = Math.round((powerBudget * designLimitPct) / 100);
  const knownW = devices.knownW + reserved.knownW;
  return {
    knownW,
    unknownDevices: devices.unknownCount,
    unknownReserved: reserved.unknownCount,
    budgetW: powerBudget,
    limitW,
    limitPct: designLimitPct,
    overLimit: knownW > limitW,
  };
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './power';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): device, rack and room power totals against the design limit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Depth and power checks

**Files:**
- Create: `packages/domain/src/checks/equipment.ts`
- Modify: `packages/domain/src/checks/types.ts`, `packages/domain/src/checks/index.ts`
- Test: `packages/domain/src/checks/equipment.test.ts`

**Interfaces:**
- Consumes: `racksOf`, `roomPower`, `formatURange`, `formatWatts`.
- Produces: `IssueCode` gains `'device_too_deep' | 'demand_unknown' | 'reserved_demand_unknown' | 'over_design_limit'`; `equipmentIssues(content): Issue[]`; `checkPlan` now returns placement and equipment issues.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/checks/equipment.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { seedTemplates } from '../catalog';
import { applyPlanCommand, type PlanCommand } from '../commands/plan';
import { known, unknownDemand } from '../demand';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, Template } from '../model/types';
import { createObject } from '../objects';
import { checkPlan } from './index';

const T: Record<string, Template> = Object.fromEntries(seedTemplates().map((t) => [t.id, t]));
function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}
const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
const base = (): PlanContent => run(emptyContent(), { type: 'object/add', object: rack });
const place = (id: string, templateId: string, bottomU: number): PlanCommand => ({ type: 'device/place', id, rackId: rack.id, bottomU, template: T[templateId] as Template });
const codes = (c: PlanContent) => checkPlan(c).map((i) => `${i.severity}:${i.code}`);

describe('equipment checks', () => {
  it('passes a rack whose devices are known and fit', () => {
    expect(codes(run(base(), place('s', 'tpl-server-2u', 1)))).toEqual([]);
  });

  it('AC10: blocks a device deeper than the usable depth', () => {
    const c = run(base(), place('s', 'tpl-server-2u', 1), { type: 'device/update', id: 's', patch: { depthMm: 1070 } });
    expect(checkPlan(c)[0]).toMatchObject({ code: 'device_too_deep', severity: 'block', message: 'SRV-01 is 1070 mm deep, but RK-01 accepts 1000 mm.', targets: ['s', rack.id] });
  });

  it('AC14: blocks unknown demand on a device, a chassis overhead and a node', () => {
    const c = run(
      base(),
      place('s', 'tpl-server-1u', 1),
      place('ch', 'tpl-chassis-6u', 5),
      { type: 'node/insert', id: 'n', chassisId: 'ch', slot: 4, template: T['tpl-node'] as Template },
      { type: 'device/update', id: 's', patch: { demand: unknownDemand() } },
      { type: 'device/update', id: 'ch', patch: { demand: unknownDemand() } },
      { type: 'node/update', id: 'n', patch: { demand: unknownDemand() } },
    );
    expect(checkPlan(c).map((i) => i.message)).toEqual([
      'SRV-01 has unknown demand.',
      'CH-01 has unknown chassis overhead.',
      'NODE-01 in slot 4 of CH-01 has unknown demand.',
    ]);
  });

  it('asks for acknowledgement of an unknown reserved range instead of blocking', () => {
    const c = run(base(), { type: 'reserved/add', rackId: rack.id, range: { id: 'r', label: 'Customer core', bottomU: 1, heightU: 14, demand: unknownDemand(), notes: '' } });
    expect(checkPlan(c)).toMatchObject([{ code: 'reserved_demand_unknown', severity: 'needs_ack', message: 'Reserved range U1–U14 in RK-01 has unknown demand.' }]);
  });

  it('blocks known demand above the design limit', () => {
    const c = run(base(), place('s', 'tpl-server-4u', 1), { type: 'device/update', id: 's', patch: { demand: known(4200) } });
    expect(checkPlan(c)[0]).toMatchObject({
      code: 'over_design_limit',
      severity: 'block',
      message: 'Known demand is 4,200 W, above the 4,000 W design limit (80% of 5,000 W).',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL. The depth, demand and limit assertions get empty issue lists.

- [ ] **Step 3: Implement**

In `packages/domain/src/checks/types.ts`, extend `IssueCode` by replacing `| 'clearance_door';` with:
```ts
  | 'clearance_door'
  | 'device_too_deep'
  | 'demand_unknown'
  | 'reserved_demand_unknown'
  | 'over_design_limit';
```

`packages/domain/src/checks/equipment.ts`:
```ts
import { formatWatts } from '../demand';
import { racksOf } from '../devices';
import type { PlanContent } from '../model/types';
import { formatURange } from '../occupancy';
import { roomPower } from '../power';
import type { Issue } from './types';

const UNKNOWN_HINT = "Enter its watts. Your own Devices can't stay unknown.";

export function equipmentIssues(content: PlanContent): Issue[] {
  const issues: Issue[] = [];
  for (const rack of racksOf(content)) {
    for (const d of rack.devices) {
      if (d.depthMm > rack.usableDepthMm) {
        issues.push({
          key: `device_too_deep:${d.id}`,
          code: 'device_too_deep',
          severity: 'block',
          message: `${d.name} is ${d.depthMm} mm deep, but ${rack.name} accepts ${rack.usableDepthMm} mm.`,
          hint: 'Use a deeper rack, or a shorter Device.',
          targets: [d.id, rack.id],
        });
      }
      if (d.demand.kind === 'unknown') {
        issues.push({
          key: `demand_unknown:${d.id}`,
          code: 'demand_unknown',
          severity: 'block',
          message: d.kind === 'chassis' ? `${d.name} has unknown chassis overhead.` : `${d.name} has unknown demand.`,
          hint: UNKNOWN_HINT,
          targets: [d.id],
        });
      }
      if (d.kind !== 'chassis') continue;
      for (const n of d.nodes) {
        if (n.demand.kind !== 'unknown') continue;
        issues.push({
          key: `demand_unknown:${n.id}`,
          code: 'demand_unknown',
          severity: 'block',
          message: `${n.name} in slot ${n.slot} of ${d.name} has unknown demand.`,
          hint: UNKNOWN_HINT,
          targets: [n.id, d.id],
        });
      }
    }
    for (const r of rack.reserved) {
      if (r.demand.kind !== 'unknown') continue;
      issues.push({
        key: `reserved_demand_unknown:${r.id}`,
        code: 'reserved_demand_unknown',
        severity: 'needs_ack',
        message: `Reserved range ${formatURange(r)} in ${rack.name} has unknown demand.`,
        hint: 'A reviewer must acknowledge it with a reason before approval.',
        targets: [r.id, rack.id],
      });
    }
  }
  const power = roomPower(content);
  if (power.overLimit) {
    issues.push({
      key: 'over_design_limit',
      code: 'over_design_limit',
      severity: 'block',
      message: `Known demand is ${formatWatts(power.knownW)}, above the ${formatWatts(power.limitW)} design limit (${power.limitPct}% of ${formatWatts(power.budgetW)}).`,
      hint: 'Move load to another room, or raise the power budget only if the site really has it.',
      targets: [],
    });
  }
  return issues;
}
```

Replace `packages/domain/src/checks/index.ts`:
```ts
import type { PlanContent } from '../model/types';
import { equipmentIssues } from './equipment';
import { placementIssues } from './placement';
import type { Issue, Severity } from './types';

export * from './types';
export { placementIssues } from './placement';
export { equipmentIssues } from './equipment';

const ORDER: Record<Severity, number> = { block: 0, needs_ack: 1, warn: 2 };

export function checkPlan(content: PlanContent): Issue[] {
  return [...placementIssues(content), ...equipmentIssues(content)].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export const blockingIssues = (issues: Issue[]): Issue[] => issues.filter((i) => i.severity === 'block');
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): usable depth, unknown demand and design limit checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: BOM rows and CSV

**Files:**
- Create: `packages/domain/src/bom.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/bom.test.ts`

**Interfaces:**
- Consumes: `RoomLocation`, `currentRevision`, `racksOf`, `formatURange`, `CATEGORY_LABEL`.
- Produces: `BomRow` (all string fields: `project, site, room, rack, chassis, slot, kind ('Device' | 'Chassis' | 'Node'), name, model, category, position, heightU, depthMm, demandW, config, notes`), `BOM_COLUMNS: readonly { key: keyof BomRow; header: string }[]`, `bomRows(location)`, `csvCell(value)`, `bomCsv(rows)`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/bom.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bomCsv, bomRows, csvCell } from './bom';
import { apply, type WorkspaceCommand } from './commands/workspace';
import { unknownDemand } from './demand';
import { createWorkspace } from './factories';
import { findRoom } from './lookup';
import type { Rack, Template, Workspace } from './model/types';
import { createObject } from './objects';

function seeded(): Workspace {
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  let ws = createWorkspace();
  const t = (id: string) => ws.catalog.find((x) => x.id === id) as Template;
  const steps: WorkspaceCommand[] = [
    { type: 'project/create', id: 'p', name: 'Northgate' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' },
    { type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'srv', rackId: rack.id, bottomU: 20, template: t('tpl-server-2u') } },
    { type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: rack.id, bottomU: 5, template: t('tpl-chassis-6u') } },
    ...[1, 2, 3, 4, 5].map((slot): WorkspaceCommand => ({ type: 'plan', roomId: 'r', command: { type: 'node/insert', id: `n${slot}`, chassisId: 'ch', slot, template: t('tpl-node') } })),
    { type: 'plan', roomId: 'r', command: { type: 'node/update', id: 'n3', patch: { demand: unknownDemand(), config: '2× CPU, "fast" RAM\nhot-swap' } } },
  ];
  for (const step of steps) {
    const r = apply(ws, step);
    if (!r.ok) throw new Error(r.error.message);
    ws = r.value;
  }
  return ws;
}

describe('BOM', () => {
  it('AC19: lists every device including each node, with parent chassis and slot', () => {
    const rows = bomRows(findRoom(seeded(), 'r')!);
    expect(rows.map((r) => [r.kind, r.name, r.chassis, r.slot, r.position])).toEqual([
      ['Chassis', 'CH-01', '', '', 'U5–U10'],
      ['Node', 'NODE-01', 'CH-01', '1', 'U5–U10'],
      ['Node', 'NODE-02', 'CH-01', '2', 'U5–U10'],
      ['Node', 'NODE-03', 'CH-01', '3', 'U5–U10'],
      ['Node', 'NODE-04', 'CH-01', '4', 'U5–U10'],
      ['Node', 'NODE-05', 'CH-01', '5', 'U5–U10'],
      ['Device', 'SRV-01', '', '', 'U20–U21'],
    ]);
    expect(rows[0]).toMatchObject({ project: 'Northgate', site: 'Site A', room: 'MDF-1', rack: 'RK-01', model: 'Chassis 6U · 5 slots (Generic 6U chassis)', demandW: '20' });
    expect(rows[3]).toMatchObject({ demandW: 'unknown', heightU: '0' });
  });

  it('writes RFC 4180 CSV with a header and escaped cells', () => {
    const csv = bomCsv(bomRows(findRoom(seeded(), 'r')!));
    const [header] = csv.split('\r\n');
    expect(header).toBe('Project,Site,Room,Rack,Parent chassis,Slot,Type,Name,Template / model,Category,Position,Height (U),Depth (mm),Demand (W),Configuration,Notes');
    expect(csv).toContain('"2× CPU, ""fast"" RAM\nhot-swap"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell('plain')).toBe('plain');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./bom`.

- [ ] **Step 3: Implement**

`packages/domain/src/bom.ts`:
```ts
import { CATEGORY_LABEL } from './catalog';
import { racksOf } from './devices';
import { currentRevision, type RoomLocation } from './lookup';
import type { Demand, Id, PlanContent } from './model/types';
import { formatURange } from './occupancy';

export interface BomRow {
  project: string;
  site: string;
  room: string;
  rack: string;
  chassis: string;
  slot: string;
  kind: 'Device' | 'Chassis' | 'Node';
  name: string;
  model: string;
  category: string;
  position: string;
  heightU: string;
  depthMm: string;
  demandW: string;
  config: string;
  notes: string;
}

export const BOM_COLUMNS: readonly { key: keyof BomRow; header: string }[] = [
  { key: 'project', header: 'Project' },
  { key: 'site', header: 'Site' },
  { key: 'room', header: 'Room' },
  { key: 'rack', header: 'Rack' },
  { key: 'chassis', header: 'Parent chassis' },
  { key: 'slot', header: 'Slot' },
  { key: 'kind', header: 'Type' },
  { key: 'name', header: 'Name' },
  { key: 'model', header: 'Template / model' },
  { key: 'category', header: 'Category' },
  { key: 'position', header: 'Position' },
  { key: 'heightU', header: 'Height (U)' },
  { key: 'depthMm', header: 'Depth (mm)' },
  { key: 'demandW', header: 'Demand (W)' },
  { key: 'config', header: 'Configuration' },
  { key: 'notes', header: 'Notes' },
];

function templateText(content: PlanContent, id: Id, version: number): string {
  const t = content.templatesUsed.find((x) => x.id === id && x.version === version);
  if (!t) return '';
  return t.model ? `${t.label} (${t.model})` : t.label;
}

const demandText = (d: Demand): string => (d.kind === 'known' ? String(d.watts) : 'unknown');

export function bomRows(loc: RoomLocation): BomRow[] {
  const content = currentRevision(loc.room.plan).content;
  const where = { project: loc.project.name, site: loc.site.name, room: loc.room.name };
  const racks = [...racksOf(content)].sort((a, b) => a.name.localeCompare(b.name));
  return racks.flatMap((rack) =>
    [...rack.devices]
      .sort((a, b) => a.bottomU - b.bottomU)
      .flatMap((d): BomRow[] => {
        const position = formatURange(d);
        const row: BomRow = {
          ...where,
          rack: rack.name,
          chassis: '',
          slot: '',
          kind: d.kind === 'chassis' ? 'Chassis' : 'Device',
          name: d.name,
          model: templateText(content, d.templateId, d.templateVersion),
          category: CATEGORY_LABEL[d.kind === 'chassis' ? 'chassis' : d.category],
          position,
          heightU: String(d.heightU),
          depthMm: String(d.depthMm),
          demandW: demandText(d.demand),
          config: d.config,
          notes: d.notes,
        };
        if (d.kind !== 'chassis') return [row];
        const nodes = [...d.nodes]
          .sort((a, b) => a.slot - b.slot)
          .map(
            (n): BomRow => ({
              ...where,
              rack: rack.name,
              chassis: d.name,
              slot: String(n.slot),
              kind: 'Node',
              name: n.name,
              model: templateText(content, n.templateId, n.templateVersion),
              category: CATEGORY_LABEL.compute,
              position,
              heightU: '0',
              depthMm: '',
              demandW: demandText(n.demand),
              config: n.config,
              notes: n.notes,
            }),
          );
        return [row, ...nodes];
      }),
  );
}

/** Cells starting with = + - @ would run as formulas in a spreadsheet; a leading quote keeps them as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function bomCsv(rows: BomRow[]): string {
  const header = BOM_COLUMNS.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => BOM_COLUMNS.map((c) => csvCell(r[c.key])).join(','));
  return `${[header, ...body].join('\r\n')}\r\n`;
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './bom';
```

- [ ] **Step 4: Run tests, typecheck and coverage**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck && pnpm --filter @glasshouse/domain coverage`
Expected: PASS, with coverage at or above the thresholds (90/90/90/85).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): BOM rows and injection-safe CSV export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Shared view hooks and the Demand field

**Files:**
- Modify: `apps/web/src/store/hooks.ts`, `apps/web/src/features/plan/usePlanGestures.ts`, `apps/web/src/features/plan/PlanView.tsx`, `apps/web/src/styles/base.css`, `apps/web/src/features/plan/inspector.css`
- Create: `apps/web/src/ui/DemandField.tsx`
- Test: `apps/web/src/ui/DemandField.test.tsx`

**Interfaces:**
- Consumes: `NumberField`, `Demand`, `PlanCommand`.
- Produces: `CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null` (now defined in `store/hooks.ts`, still re-exported from `usePlanGestures.ts`), `usePlanCommit(roomId): CommitFn`, `useSearchParamState(key): [string | null, (value: string | null) => void]`, `DemandField({ id; label; value: Demand; onCommit(d): string | null; unknownHint? })`. The `.seg` segmented-control styles move to `base.css` so every screen can use them.

- [ ] **Step 1: Write the failing test**

`apps/web/src/ui/DemandField.test.tsx`:
```tsx
import type { Demand } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DemandField } from './DemandField';

it('switches to Known without inventing a zero, then commits typed watts', async () => {
  const user = userEvent.setup();
  const onCommit = vi.fn<(d: Demand) => string | null>(() => null);
  render(<DemandField id="d" label="Demand" value={{ kind: 'unknown' }} onCommit={onCommit} />);
  expect(screen.getByText('Blocks approval until the watts are known.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Known' }));
  expect(onCommit).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Demand in watts'), '0');
  expect(onCommit).toHaveBeenLastCalledWith({ kind: 'known', watts: 0 });
});

it('commits Unknown explicitly and shows a custom hint', async () => {
  const user = userEvent.setup();
  const onCommit = vi.fn<(d: Demand) => string | null>(() => null);
  render(<DemandField id="d" label="Demand" value={{ kind: 'known', watts: 150 }} onCommit={onCommit} unknownHint="A reviewer must acknowledge this." />);
  expect(screen.getByLabelText('Demand in watts')).toHaveValue('150');
  await user.click(screen.getByRole('button', { name: 'Unknown' }));
  expect(onCommit).toHaveBeenLastCalledWith({ kind: 'unknown' });
  expect(screen.getByText('A reviewer must acknowledge this.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Unknown' })).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./DemandField`.

- [ ] **Step 3: Implement**

Replace `apps/web/src/store/hooks.ts`:
```ts
import { findRoom, type Id, type PlanCommand, type RoomLocation } from '@glasshouse/domain';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useWorkspaceStore } from './workspaceStore';

export type CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null;

export function useRoomLocation(roomId: string | null): RoomLocation | null {
  const workspace = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => (roomId ? findRoom(workspace, roomId) : null), [workspace, roomId]);
}

/** Plan commands for one room; returns the domain error message or null. */
export function usePlanCommit(roomId: Id): CommitFn {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  return useCallback<CommitFn>(
    (command, coalesceKey) => dispatch({ type: 'plan', roomId, command }, coalesceKey === undefined ? {} : { coalesceKey })?.message ?? null,
    [dispatch, roomId],
  );
}

/** One URL search param as state (selection, chosen template) so a view survives reloads and can be shared. */
export function useSearchParamState(key: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (value: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [key, setParams],
  );
  return [params.get(key), set];
}
```

In `apps/web/src/features/plan/usePlanGestures.ts`, replace the line `export type CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null;` with:
```ts
export type { CommitFn } from '../../store/hooks';
```
Then add `import type { CommitFn } from '../../store/hooks';` to its imports.

Replace `apps/web/src/features/plan/PlanView.tsx`:
```tsx
import { checkPlan, currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo, useState } from 'react';
import { usePlanCommit, useSearchParamState } from '../../store/hooks';
import { useViewport } from '../../viewport/useViewport';
import { ChecksStrip } from './ChecksStrip';
import { Inspector } from './Inspector';
import { PlanCanvas } from './PlanCanvas';
import { Toolbar } from './Toolbar';
import type { Tool } from './tools';
import { usePlanGestures } from './usePlanGestures';
import { ZoomControls } from './ZoomControls';
import './plan.css';

export function PlanView({ location }: { location: RoomLocation }) {
  const content = currentRevision(location.room.plan).content;
  const commit = usePlanCommit(location.room.id);
  const [selectedParam, select] = useSearchParamState('sel');
  const [tool, setTool] = useState<Tool>('select');
  const selected = content.objects.find((o) => o.id === selectedParam) ?? null;

  const issues = useMemo(() => checkPlan(content), [content]);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length });
  const gestures = usePlanGestures({ content, tool, setTool, selectedId: selected?.id ?? null, select, viewport, commit });

  return (
    <div className="plan-view">
      <section className="plan-view__canvas" aria-label="Room plan" onKeyDown={gestures.onKeyDown} onKeyUp={gestures.onKeyUp}>
        <Toolbar tool={tool} onTool={setTool} />
        <PlanCanvas
          content={content}
          issues={issues}
          selectedId={selected?.id ?? null}
          viewport={viewport}
          preview={gestures.preview}
          measure={gestures.measure}
          cursor={gestures.cursor}
          svgHandlers={gestures.svgHandlers}
          onFocusObject={select}
        />
        <ZoomControls viewport={viewport} />
        {gestures.message ? (
          <p role="status" className="plan-view__message">
            {gestures.message}
          </p>
        ) : null}
      </section>
      <ChecksStrip issues={issues} objects={content.objects} onSelect={select} />
      <Inspector content={content} selected={selected} commit={commit} onDeleted={() => select(null)} />
    </div>
  );
}
```

Move the `.seg`, `.seg button`, `.seg button:hover` and `.seg button[aria-pressed='true']` rules from `apps/web/src/features/plan/inspector.css` to the end of `apps/web/src/styles/base.css`, unchanged. Then append:
```css
.seg--compact button {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}

.field__hint {
  font-size: 12px;
  color: var(--ink-2);
}
```

`apps/web/src/ui/DemandField.tsx`:
```tsx
import type { Demand } from '@glasshouse/domain';
import { useState } from 'react';
import { NumberField } from './NumberField';
import './fields.css';

interface DemandFieldProps {
  id: string;
  label: string;
  value: Demand;
  onCommit: (value: Demand) => string | null;
  unknownHint?: string;
}

/** Unknown is a deliberate choice, never an empty number: switching to Known commits nothing until watts are typed. */
export function DemandField({ id, label, value, onCommit, unknownHint = 'Blocks approval until the watts are known.' }: DemandFieldProps) {
  const [mode, setMode] = useState<Demand['kind']>(value.kind);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: Demand['kind']): void => {
    setMode(next);
    setError(next === 'unknown' ? onCommit({ kind: 'unknown' }) : null);
  };

  return (
    <div className="field">
      <span className="field__label" id={`${id}-label`}>
        {label}
      </span>
      <div className="seg seg--compact" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" aria-pressed={mode === 'known'} onClick={() => choose('known')}>
          Known
        </button>
        <button type="button" aria-pressed={mode === 'unknown'} onClick={() => choose('unknown')}>
          Unknown
        </button>
      </div>
      {mode === 'known' ? (
        <NumberField
          id={id}
          label={`${label} in watts`}
          unit="W"
          decimals={0}
          value={value.kind === 'known' ? value.watts : null}
          onCommit={(watts) => (watts === null ? null : onCommit({ kind: 'known', watts }))}
        />
      ) : (
        <p className="field__hint">{unknownHint}</p>
      )}
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS, including every M1 web test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): plan-commit and URL-state hooks, demand field

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Catalog screen

**Files:**
- Create: `apps/web/src/features/catalog/CatalogScreen.tsx`, `apps/web/src/features/catalog/TemplateEditor.tsx`, `apps/web/src/features/catalog/catalog.css`
- Modify: `apps/web/src/app/routes.tsx`, `apps/web/src/features/tree/ProjectTree.tsx`, `apps/web/src/features/tree/tree.css`
- Test: `apps/web/src/features/catalog/CatalogScreen.test.tsx`

**Interfaces:**
- Consumes: `useSearchParamState`, `DemandField`, `NumberField`, `TextField`, `CATEGORY_LABEL`, `formatDemand`, `SEED_TEMPLATE_IDS`, `CatalogCommand`.
- Produces: route `/catalog` → `CatalogScreen`; `TemplateEditor({ mode: 'create' | 'edit'; initial: Template; onDone(id: string | null) })`; `blankTemplate()`; tree footer link "Device catalog · N templates".

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/catalog/CatalogScreen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

const catalog = () => useWorkspaceStore.getState().workspace.catalog;
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/catalog'] })} />);

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

it('edits a template only when Save is pressed', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: /^Server 2U/ }));
  const watts = screen.getByLabelText('Demand in watts');
  await user.clear(watts);
  await user.type(watts, '500');
  expect(catalog().find((t) => t.id === 'tpl-server-2u')?.demand).toEqual({ kind: 'known', watts: 450 });
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(catalog().find((t) => t.id === 'tpl-server-2u')).toMatchObject({ version: 2, illustrative: false, demand: { watts: 500 } });
});

it('creates a template, shows save errors, and deletes after confirmation', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'New template' }));
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(screen.getByRole('alert')).toHaveTextContent("Template name can't be empty.");
  await user.type(screen.getByLabelText('Name'), 'GPU node 4U');
  const height = screen.getByLabelText('Height');
  await user.clear(height);
  await user.type(height, '4');
  await user.click(screen.getByRole('button', { name: 'Save template' }));
  expect(catalog().find((t) => t.label === 'GPU node 4U')).toMatchObject({ heightU: 4, version: 1 });
  await user.click(screen.getByRole('button', { name: 'Delete template' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(catalog().some((t) => t.label === 'GPU node 4U')).toBe(false);
});

it('restores missing illustrative templates', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'template/delete', id: 'tpl-node' });
  open();
  await user.click(screen.getByRole('button', { name: 'Add 1 illustrative template' }));
  expect(catalog().some((t) => t.id === 'tpl-node')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL. `/catalog` hits the NotFound route, so there is no "Server 2U" button.

- [ ] **Step 3: Implement**

`apps/web/src/features/catalog/TemplateEditor.tsx`:
```tsx
import { CATEGORY_LABEL, newId, type Category, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';

export const CATEGORY_ORDER: Category[] = ['compute', 'chassis', 'network', 'storage', 'power'];

export const blankTemplate = (): Template => ({
  id: newId(),
  version: 0,
  label: '',
  model: '',
  category: 'compute',
  mounting: 'rack',
  heightU: 1,
  depthMm: 750,
  demand: { kind: 'known', watts: 300 },
  color: '',
  defaultConfig: '',
  slotCount: null,
  slotsPerRow: null,
  illustrative: false,
});

interface TemplateEditorProps {
  mode: 'create' | 'edit';
  initial: Template;
  onDone: (id: string | null) => void;
}

export function TemplateEditor({ mode, initial, onDone }: TemplateEditorProps) {
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Template>): null => {
    setDraft((d) => ({ ...d, ...patch }));
    return null;
  };
  const isSlot = draft.mounting === 'slot';
  const isChassis = draft.category === 'chassis';
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = (): void => {
    const { version: _version, ...fields } = draft;
    const { id: _id, illustrative: _illustrative, ...patch } = fields;
    const problem = mode === 'create' ? dispatch({ type: 'template/create', template: fields }) : dispatch({ type: 'template/update', id: draft.id, patch });
    setError(problem?.message ?? null);
    if (!problem) onDone(draft.id);
  };
  const remove = (): void => {
    const problem = dispatch({ type: 'template/delete', id: draft.id });
    setError(problem?.message ?? null);
    if (!problem) onDone(null);
  };
  const chooseCategory = (category: Category): void => {
    set({
      category,
      mounting: category === 'chassis' ? 'rack' : draft.mounting,
      slotCount: category === 'chassis' ? (draft.slotCount ?? 5) : null,
      slotsPerRow: category === 'chassis' ? (draft.slotsPerRow ?? 5) : null,
    });
  };

  return (
    <form
      className="tpl-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <header className="inspector__head">
        <h2>{mode === 'create' ? 'New template' : initial.label}</h2>
        {mode === 'edit' ? <span className="stamp">v{initial.version}</span> : null}
      </header>
      {initial.illustrative ? <p className="inspector__note">Illustrative sample. Saving changes makes it your own Template.</p> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Identity</legend>
        <TextField id={`${draft.id}-label`} label="Name" value={draft.label} onCommit={(v) => set({ label: v })} />
        <TextField id={`${draft.id}-model`} label="Manufacturer / model" value={draft.model} onCommit={(v) => set({ model: v })} />
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${draft.id}-category`} className="field__label">
              Category
            </label>
            <div className="field__box">
              <select id={`${draft.id}-category`} className="field__input" value={draft.category} onChange={(e) => chooseCategory(e.target.value as Category)}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c} disabled={isSlot && c !== 'compute'}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <span className="field__label">Mounting</span>
            <div className="seg seg--compact" role="group" aria-label="Mounting">
              <button type="button" aria-pressed={!isSlot} onClick={() => set({ mounting: 'rack' })}>
                Rack
              </button>
              <button type="button" aria-pressed={isSlot} disabled={isChassis} onClick={() => set({ mounting: 'slot', category: 'compute' })}>
                Chassis slot
              </button>
            </div>
          </div>
        </div>
      </fieldset>

      {isSlot ? (
        <p className="inspector__note">A Node takes a Chassis Slot and no rack units.</p>
      ) : (
        <fieldset className="inspector__group">
          <legend className="lbl">Size</legend>
          <div className="field-pair">
            <NumberField id={`${draft.id}-u`} label="Height" unit="U" decimals={0} value={draft.heightU} onCommit={(v) => (v === null ? null : set({ heightU: v }))} />
            <NumberField id={`${draft.id}-depth`} label="Depth" unit="mm" decimals={0} value={draft.depthMm} onCommit={(v) => (v === null ? null : set({ depthMm: v }))} />
          </div>
          {isChassis ? (
            <div className="field-pair">
              <NumberField id={`${draft.id}-slots`} label="Slots" decimals={0} value={draft.slotCount} onCommit={(v) => (v === null ? null : set({ slotCount: v }))} />
              <NumberField id={`${draft.id}-per-row`} label="Slots per row" decimals={0} value={draft.slotsPerRow} onCommit={(v) => (v === null ? null : set({ slotsPerRow: v }))} />
            </div>
          ) : null}
        </fieldset>
      )}

      <fieldset className="inspector__group">
        <legend className="lbl">Power and configuration</legend>
        <DemandField id={`${draft.id}-demand`} label={isChassis ? 'Chassis overhead' : 'Demand'} value={draft.demand} onCommit={(d) => set({ demand: d })} />
        <TextField id={`${draft.id}-config`} label="Default configuration" multiline value={draft.defaultConfig} onCommit={(v) => set({ defaultConfig: v })} />
      </fieldset>

      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
      <div className="tpl-editor__actions">
        <button type="submit" className="btn btn--ink" disabled={mode === 'edit' && !dirty}>
          Save template
        </button>
        <button type="button" className="btn btn--quiet" disabled={!dirty} onClick={() => setDraft(initial)}>
          Discard changes
        </button>
      </div>
      {mode === 'edit' ? (
        <div className="inspector__danger">
          {confirmDelete ? (
            <>
              <span>Delete {initial.label}? Devices already placed keep their copy.</span>
              <button type="button" className="btn btn--sm btn--danger" onClick={remove}>
                Delete
              </button>
              <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
              Delete template
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
```

`apps/web/src/features/catalog/CatalogScreen.tsx`:
```tsx
import { CATEGORY_LABEL, formatDemand, SEED_TEMPLATE_IDS, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import { useSearchParamState } from '../../store/hooks';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { blankTemplate, CATEGORY_ORDER, TemplateEditor } from './TemplateEditor';
import '../plan/inspector.css';
import './catalog.css';

export function CatalogScreen() {
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [selectedId, select] = useSearchParamState('tpl');
  const [draft, setDraft] = useState<Template | null>(null);
  const selected = catalog.find((t) => t.id === selectedId) ?? null;
  const missing = SEED_TEMPLATE_IDS.filter((id) => !catalog.some((t) => t.id === id)).length;

  return (
    <div className="catalog">
      <section className="catalog__list glass" aria-labelledby="catalog-h">
        <header className="catalog__head">
          <h1 id="catalog-h">Device catalog</h1>
          <button
            type="button"
            className="btn btn--sm btn--ink"
            onClick={() => {
              select(null);
              setDraft(blankTemplate());
            }}
          >
            New template
          </button>
        </header>
        <p className="catalog__note">Shared by every Project in this browser. Editing a Template never changes Devices already placed.</p>
        {missing > 0 ? (
          <button type="button" className="btn btn--sm" onClick={() => dispatch({ type: 'catalog/seed' })}>
            Add {missing} illustrative {missing === 1 ? 'template' : 'templates'}
          </button>
        ) : null}
        {CATEGORY_ORDER.map((category) => {
          const items = catalog.filter((t) => t.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="catalog__group">
              <h2 className="lbl">{CATEGORY_LABEL[category]}</h2>
              <ul>
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`catalog__item${t.id === selected?.id ? ' is-active' : ''}`}
                      aria-current={t.id === selected?.id ? 'true' : undefined}
                      onClick={() => {
                        setDraft(null);
                        select(t.id);
                      }}
                    >
                      <span className="catalog__name">{t.label}</span>
                      <span className="stamp">{t.mounting === 'slot' ? 'SLOT' : `${t.heightU}U`}</span>
                      <span className="catalog__w mono">{formatDemand(t.demand)}</span>
                      {t.illustrative ? <span className="catalog__flag">illustrative</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
      <section className="catalog__editor glass" aria-label="Template editor">
        {draft ? (
          <TemplateEditor
            key={draft.id}
            mode="create"
            initial={draft}
            onDone={(id) => {
              setDraft(null);
              if (id) select(id);
            }}
          />
        ) : selected ? (
          <TemplateEditor key={`${selected.id}:${selected.version}`} mode="edit" initial={selected} onDone={(id) => select(id)} />
        ) : (
          <p className="catalog__empty">Pick a Template to edit it, or create a new one.</p>
        )}
      </section>
    </div>
  );
}
```

`apps/web/src/features/catalog/catalog.css`:
```css
.catalog {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(300px, 420px) minmax(0, 560px);
  gap: var(--gap);
  align-items: start;
}

.catalog__list,
.catalog__editor {
  max-height: 100%;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.catalog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.catalog__head h1 {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.catalog__note,
.catalog__empty {
  font-size: 12px;
  color: var(--ink-2);
}

.catalog__group ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.catalog__item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: rgb(255 255 255 / 0.45);
  text-align: left;
  transition: background var(--duration-fast) ease-out;
}

.catalog__item:hover {
  background: #fff;
}

.catalog__item.is-active {
  background: #fff;
  border-color: var(--acc);
  box-shadow: 0 0 0 3px var(--acc-soft);
}

.catalog__name {
  font-weight: 600;
  font-size: 13px;
}

.catalog__w {
  font-size: 12px;
  color: var(--ink-2);
}

.catalog__flag {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--ink-2);
}

.tpl-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.tpl-editor__actions {
  display: flex;
  gap: 8px;
}
```

In `apps/web/src/app/routes.tsx`, add `import { CatalogScreen } from '../features/catalog/CatalogScreen';` and insert `{ path: 'catalog', element: <CatalogScreen /> },` before the `'*'` route.

In `apps/web/src/features/tree/ProjectTree.tsx`:
- Add `import { Link } from 'react-router';` (merge it with the existing `useNavigate` import: `import { Link, useNavigate } from 'react-router';`).
- Add `const templateCount = useWorkspaceStore((s) => s.workspace.catalog.length);` after the `projects` selector.
- Insert just before the closing `</aside>`:
```tsx
      <Link to="/catalog" className="tree__catalog">
        Device catalog · {templateCount} {templateCount === 1 ? 'template' : 'templates'}
      </Link>
```

Append to `apps/web/src/features/tree/tree.css`:
```css
.tree {
  display: flex;
  flex-direction: column;
}

.tree__catalog {
  margin-top: auto;
  padding: 12px 10px 2px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  color: var(--ink);
}

.tree__catalog:hover {
  color: var(--acc);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): device catalog screen with explicit-save template editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Rack elevation drawing

**Files:**
- Create: `apps/web/src/features/elevation/dnd.ts`, `apps/web/src/features/elevation/RackElevation.tsx`, `apps/web/src/features/elevation/elevation.css`
- Test: `apps/web/src/features/elevation/RackElevation.test.tsx`

**Interfaces:**
- Consumes: `Rack`, `RackDevice`, `ReservedRange`, `Chassis`, `formatURange`, `topU`, `usedU`, `rackPower`, `formatDemand`.
- Produces: `TEMPLATE_MIME = 'application/x-glasshouse-template'`; `U_PX = 16`; `RackElevation({ rack; active; selectedId; flagged: ReadonlySet<string>; onSelect(id); onActivate(); onDropTemplate(templateId, bottomU) })`. Every Device is a focusable `role="button"` named `"<name>, <U range>"`; a Reserved range is named `"Reserved range <U range>, <label>"`; the caption's rack-name button activates the rack.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/elevation/RackElevation.test.tsx`:
```tsx
import { createObject, known, unknownDemand, type Chassis, type PlacedDevice, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RackElevation } from './RackElevation';

const base = { templateId: 't', templateVersion: 1, config: '', notes: '' };
const chassis: Chassis = {
  ...base,
  id: 'ch',
  name: 'CH-01',
  demand: known(20),
  kind: 'chassis',
  bottomU: 5,
  heightU: 6,
  depthMm: 780,
  slotCount: 5,
  slotsPerRow: 5,
  nodes: [{ ...base, id: 'n2', name: 'NODE-01', demand: unknownDemand(), slot: 2 }],
};
const server: PlacedDevice = { ...base, id: 'srv', name: 'SRV-01', demand: known(450), kind: 'device', category: 'compute', bottomU: 20, heightU: 2, depthMm: 780 };
const rack: Rack = {
  ...(createObject('rack', { x: 1, y: 1 }, []) as Rack),
  id: 'rk',
  name: 'RK-01',
  devices: [chassis, server],
  reserved: [{ id: 'r', label: 'Customer core', bottomU: 1, heightU: 4, demand: unknownDemand(), notes: '' }],
};

it('draws devices, the reserved range and U numbers on both rails', () => {
  render(<RackElevation rack={rack} active selectedId={null} flagged={new Set()} onSelect={() => {}} onActivate={() => {}} onDropTemplate={() => {}} />);
  expect(screen.getByRole('button', { name: 'CH-01, U5–U10' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'SRV-01, U20–U21' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reserved range U1–U4, Customer core' })).toBeInTheDocument();
  expect(screen.getAllByText('42')).toHaveLength(2);
  expect(screen.getByText('12/42U')).toBeInTheDocument();
  expect(screen.getByText('470 W + 2 unknown')).toBeInTheDocument();
});

it('selects devices and nodes, and activates the rack from its caption', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const onActivate = vi.fn();
  render(<RackElevation rack={rack} active={false} selectedId="srv" flagged={new Set(['srv'])} onSelect={onSelect} onActivate={onActivate} onDropTemplate={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'SRV-01, U20–U21' }));
  expect(onSelect).toHaveBeenLastCalledWith('srv');
  await user.click(screen.getByTitle('Slot 2: NODE-01'));
  expect(onSelect).toHaveBeenLastCalledWith('n2');
  await user.click(screen.getByRole('button', { name: 'RK-01' }));
  expect(onActivate).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'SRV-01, U20–U21' })).toHaveClass('is-selected', 'is-flagged');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./RackElevation`.

- [ ] **Step 3: Implement**

`apps/web/src/features/elevation/dnd.ts`:
```ts
/** Drag payload type for a Catalog Template dragged from the palette onto a rack elevation. */
export const TEMPLATE_MIME = 'application/x-glasshouse-template';
```

`apps/web/src/features/elevation/RackElevation.tsx`:
```tsx
import { formatDemand, formatURange, rackPower, topU, usedU, type Chassis, type Rack, type RackDevice, type ReservedRange } from '@glasshouse/domain';
import type { DragEvent, KeyboardEvent } from 'react';
import { TEMPLATE_MIME } from './dnd';
import './elevation.css';

export const U_PX = 16;
const LABEL_W = 30;
const RACK_W = 252;
const PAD = 2;

interface RackElevationProps {
  rack: Rack;
  active: boolean;
  selectedId: string | null;
  flagged: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onActivate: () => void;
  onDropTemplate: (templateId: string, bottomU: number) => void;
}

const categoryOf = (d: RackDevice): string => (d.kind === 'chassis' ? 'chassis' : d.category);

function ChassisSlots({ chassis, y, onSelect }: { chassis: Chassis; y: number; onSelect: (id: string) => void }) {
  const left = 74;
  const right = RACK_W - 12;
  const top = y + 5;
  const bottom = y + chassis.heightU * U_PX - 5;
  const gap = 3;
  const cols = chassis.slotsPerRow;
  const rows = Math.ceil(chassis.slotCount / cols);
  const w = (right - left - gap * (cols - 1)) / cols;
  const h = (bottom - top - gap * (rows - 1)) / rows;
  return (
    <g>
      {Array.from({ length: chassis.slotCount }, (_, i) => {
        const slot = i + 1;
        const node = chassis.nodes.find((n) => n.slot === slot);
        const x = left + (i % cols) * (w + gap);
        const cy = top + Math.floor(i / cols) * (h + gap);
        const cls = node ? (node.demand.kind === 'unknown' ? 'slot-cell slot-cell--unknown' : 'slot-cell slot-cell--filled') : 'slot-cell';
        return (
          <g
            key={slot}
            onClick={
              node
                ? (e) => {
                    e.stopPropagation();
                    onSelect(node.id);
                  }
                : undefined
            }
          >
            <rect x={x} y={cy} width={w} height={h} rx={2} className={cls}>
              <title>{node ? `Slot ${slot}: ${node.name}` : `Slot ${slot}: empty`}</title>
            </rect>
            <text x={x + w / 2} y={cy + h / 2 + 4} textAnchor="middle" className="slot-cell__n">
              {node && node.demand.kind === 'unknown' ? '?' : slot}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function DeviceBlock(props: { device: RackDevice; y: number; selected: boolean; flagged: boolean; onSelect: (id: string) => void; onKey: (e: KeyboardEvent) => void }) {
  const { device, y, selected, flagged, onSelect, onKey } = props;
  const h = device.heightU * U_PX;
  const textY = y + Math.min(h, 32) / 2 + 4;
  const classes = ['dev', `dev--${categoryOf(device)}`, selected ? 'is-selected' : '', flagged ? 'is-flagged' : ''].filter(Boolean).join(' ');
  return (
    <g role="button" tabIndex={0} aria-label={`${device.name}, ${formatURange(device)}`} aria-pressed={selected} className={classes} onClick={() => onSelect(device.id)} onKeyDown={onKey}>
      <rect x={4} y={y + 1} width={RACK_W - 8} height={h - 2} rx={3} className="dev__body" />
      <text x={12} y={textY} className="dev__name">
        {device.name}
      </text>
      {device.kind === 'chassis' ? (
        <ChassisSlots chassis={device} y={y} onSelect={onSelect} />
      ) : (
        <text x={RACK_W - 12} y={textY} textAnchor="end" className="dev__w">
          {formatDemand(device.demand)}
        </text>
      )}
    </g>
  );
}

function ReservedBlock(props: { range: ReservedRange; y: number; patternId: string; selected: boolean; onSelect: (id: string) => void; onKey: (e: KeyboardEvent) => void }) {
  const { range, y, patternId, selected, onSelect, onKey } = props;
  const h = range.heightU * U_PX;
  const midY = y + h / 2;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Reserved range ${formatURange(range)}, ${range.label}`}
      aria-pressed={selected}
      className={`rsv${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(range.id)}
      onKeyDown={onKey}
    >
      <rect x={4} y={y + 1} width={RACK_W - 8} height={h - 2} rx={3} fill={`url(#${patternId})`} className="rsv__body" />
      {h >= 48 ? (
        <>
          <rect x={24} y={midY - 22} width={RACK_W - 48} height={44} rx={8} className="rsv__label-bg" />
          <text x={RACK_W / 2} y={midY - 6} textAnchor="middle" className="rsv__title">
            {`RESERVED · ${formatURange(range)}`}
          </text>
          <text x={RACK_W / 2} y={midY + 12} textAnchor="middle" className="rsv__sub">
            {`${range.label} · ${formatDemand(range.demand)}`}
          </text>
        </>
      ) : (
        <text x={12} y={y + Math.min(h, 32) / 2 + 4} className="rsv__sub">
          {`${range.label} · ${formatURange(range)}`}
        </text>
      )}
    </g>
  );
}

export function RackElevation({ rack, active, selectedId, flagged, onSelect, onActivate, onDropTemplate }: RackElevationProps) {
  const height = rack.capacityU * U_PX;
  const yTop = (top: number): number => PAD + (rack.capacityU - top) * U_PX;
  const power = rackPower(rack);
  const knownW = power.devices.knownW + power.reserved.knownW;
  const unknown = power.devices.unknownCount + power.reserved.unknownCount;
  const patternId = `rsv-${rack.id}`;
  const units = Array.from({ length: rack.capacityU }, (_, i) => rack.capacityU - i);

  const keySelect = (id: string) => (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onSelect(id);
  };
  const onDragOver = (e: DragEvent<SVGSVGElement>): void => {
    if (!e.dataTransfer.types.includes(TEMPLATE_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent<SVGSVGElement>): void => {
    const templateId = e.dataTransfer.getData(TEMPLATE_MIME);
    if (!templateId) return;
    e.preventDefault();
    const top = e.currentTarget.getBoundingClientRect().top;
    const u = rack.capacityU - Math.floor((e.clientY - top - PAD) / U_PX);
    onDropTemplate(templateId, Math.min(rack.capacityU, Math.max(1, u)));
  };

  return (
    <figure className={`rack-elev${active ? ' is-active' : ''}`}>
      <figcaption className="rack-elev__cap">
        <button type="button" className="rack-elev__name mono" aria-pressed={active} onClick={onActivate}>
          {rack.name}
        </button>
        <span className="rack-elev__meta">
          {rack.owner === 'customer' ? 'Customer' : 'OxygenAI'} · <span className="mono">{`${usedU(rack)}/${rack.capacityU}U`}</span> ·{' '}
          <span className="mono">{`${knownW.toLocaleString('en-US')} W${unknown ? ` + ${unknown} unknown` : ''}`}</span>
        </span>
        <span className="rack-elev__depth mono">usable depth {rack.usableDepthMm} mm</span>
      </figcaption>
      <svg className="rack-elev__svg" width={LABEL_W * 2 + RACK_W} height={height + PAD * 2} role="group" aria-label={`${rack.name} front elevation, ${rack.capacityU}U`} onDragOver={onDragOver} onDrop={onDrop}>
        <defs>
          <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <path d="M0 0V8" className="rsv-hatch" />
          </pattern>
        </defs>
        <rect x={LABEL_W} y={PAD} width={RACK_W} height={height} className="rack-frame__fill" />
        {units.map((u) => (
          <g key={u} aria-hidden="true">
            <line x1={LABEL_W} x2={LABEL_W + RACK_W} y1={yTop(u) + U_PX} y2={yTop(u) + U_PX} className="u-line" />
            <text x={LABEL_W - 8} y={yTop(u) + 12} textAnchor="end" className={u === 1 || u % 5 === 0 ? 'u-label u-label--major' : 'u-label'}>
              {u}
            </text>
            <text x={LABEL_W + RACK_W + 8} y={yTop(u) + 12} className={u === 1 || u % 5 === 0 ? 'u-label u-label--major' : 'u-label'}>
              {u}
            </text>
          </g>
        ))}
        <rect x={LABEL_W} y={PAD} width={RACK_W} height={height} className="rack-frame" />
        <g transform={`translate(${LABEL_W} 0)`}>
          {rack.reserved.map((r) => (
            <ReservedBlock key={r.id} range={r} y={yTop(topU(r))} patternId={patternId} selected={r.id === selectedId} onSelect={onSelect} onKey={keySelect(r.id)} />
          ))}
          {rack.devices.map((d) => (
            <DeviceBlock key={d.id} device={d} y={yTop(topU(d))} selected={d.id === selectedId} flagged={flagged.has(d.id)} onSelect={onSelect} onKey={keySelect(d.id)} />
          ))}
        </g>
      </svg>
    </figure>
  );
}
```

`apps/web/src/features/elevation/elevation.css`:
```css
.rack-elev {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 0 0 auto;
}

.rack-elev__cap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 30px;
}

.rack-elev__name {
  align-self: flex-start;
  padding: 2px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.55);
  font-size: 16px;
  font-weight: 700;
}

.rack-elev__name:hover {
  background: #fff;
}

.rack-elev.is-active .rack-elev__name {
  background: var(--ink);
  color: #fff;
}

.rack-elev__meta,
.rack-elev__depth {
  font-size: 12px;
  color: var(--ink-2);
}

.rack-elev__svg {
  display: block;
  overflow: visible;
}

.rack-frame__fill {
  fill: rgb(255 255 255 / 0.6);
}

.rack-frame {
  fill: none;
  stroke: var(--ink);
  stroke-width: 2;
  rx: 4px;
}

.u-line {
  stroke: rgb(14 24 36 / 0.07);
}

.u-label {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: var(--ink-2);
}

.u-label--major {
  fill: var(--ink);
  font-weight: 600;
}

.dev {
  cursor: pointer;
  outline: none;
}

.dev__body {
  stroke-width: 1.25;
  transition: filter var(--duration-fast) ease-out;
}

.dev:hover .dev__body {
  filter: brightness(1.04) drop-shadow(0 2px 4px rgb(14 24 36 / 0.18));
}

.dev--compute .dev__body {
  fill: rgb(127 162 232 / 0.34);
  stroke: #4e78c9;
}

.dev--network .dev__body {
  fill: rgb(183 154 240 / 0.34);
  stroke: #7c5bc4;
}

.dev--storage .dev__body {
  fill: rgb(76 194 172 / 0.3);
  stroke: #1f8f7b;
}

.dev--power .dev__body {
  fill: rgb(212 174 98 / 0.34);
  stroke: #9a7a2e;
}

.dev--chassis .dev__body {
  fill: #dfe5ea;
  stroke: #5c6875;
}

.dev.is-selected .dev__body,
.rsv.is-selected .rsv__body {
  stroke: var(--acc);
  stroke-width: 2.5;
}

.dev.is-flagged .dev__body {
  fill: var(--block-bg);
  stroke: var(--block);
  stroke-width: 2;
}

.dev:focus-visible .dev__body,
.rsv:focus-visible .rsv__body {
  stroke: var(--acc);
  stroke-width: 3;
}

.dev__name {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  fill: var(--ink);
  pointer-events: none;
}

.dev__w {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: var(--ink-2);
  pointer-events: none;
}

.slot-cell {
  fill: rgb(255 255 255 / 0.7);
  stroke: #9aa6b2;
  stroke-dasharray: 2 2;
}

.slot-cell--filled {
  fill: rgb(127 162 232 / 0.55);
  stroke: #4e78c9;
  stroke-dasharray: none;
}

.slot-cell--unknown {
  fill: var(--warn-bg);
  stroke: var(--warn);
}

.slot-cell__n {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  fill: var(--ink);
  pointer-events: none;
}

.rsv {
  cursor: pointer;
  outline: none;
}

.rsv__body {
  stroke: var(--ink-2);
  stroke-width: 1.25;
}

.rsv-hatch {
  stroke: var(--ink-2);
  stroke-width: 1.2;
  opacity: 0.45;
}

.rsv__label-bg {
  fill: rgb(255 255 255 / 0.92);
  stroke: var(--line);
}

.rsv__title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  fill: var(--ink);
}

.rsv__sub {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: var(--ink-2);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): rack elevation drawing with devices, slots and reserved ranges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Chassis Slot map

**Files:**
- Create: `apps/web/src/features/elevation/SlotMap.tsx`
- Modify: `apps/web/src/features/elevation/elevation.css`
- Test: `apps/web/src/features/elevation/SlotMap.test.tsx`

**Interfaces:**
- Consumes: `CommitFn`, `Chassis`, `Template`, `sumDemand`, `formatWatts`, `newId`.
- Produces: `SlotMap({ chassis; catalog; commit; onSelect(id) })`. Each filled slot is a button `"Slot N: <node name>"` that selects the Node. Each empty slot is a button `"Add node to slot N"` that inserts the chosen Node Template and keeps the Chassis selected.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/elevation/SlotMap.test.tsx`:
```tsx
import { known, seedTemplates, unknownDemand, type Chassis } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SlotMap } from './SlotMap';

const base = { templateId: 'tpl-node', templateVersion: 1, config: '', notes: '' };
const chassis: Chassis = {
  ...base,
  templateId: 'tpl-chassis-6u',
  id: 'ch',
  name: 'CH-01',
  demand: known(20),
  kind: 'chassis',
  bottomU: 5,
  heightU: 6,
  depthMm: 780,
  slotCount: 5,
  slotsPerRow: 5,
  nodes: [
    { ...base, id: 'n1', name: 'NODE-01', demand: known(150), slot: 1 },
    { ...base, id: 'n2', name: 'NODE-02', demand: unknownDemand(), slot: 2 },
  ],
};

it('shows filled and empty slots with the assembly total', () => {
  render(<SlotMap chassis={chassis} catalog={seedTemplates()} commit={() => null} onSelect={() => {}} />);
  expect(screen.getByText('2 of 5 filled')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Slot 2: NODE-02' })).toHaveTextContent('? W');
  expect(screen.getAllByRole('button', { name: /^Add node to slot/ })).toHaveLength(3);
  expect(screen.getByText('170 W + 1 unknown')).toBeInTheDocument();
});

it('inserts into an empty slot and selects a filled one', async () => {
  const user = userEvent.setup();
  const commit = vi.fn<(command: unknown) => string | null>(() => null);
  const onSelect = vi.fn();
  render(<SlotMap chassis={chassis} catalog={seedTemplates()} commit={commit} onSelect={onSelect} />);
  await user.click(screen.getByRole('button', { name: 'Add node to slot 3' }));
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'node/insert', chassisId: 'ch', slot: 3, template: { id: 'tpl-node' } });
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Slot 1: NODE-01' }));
  expect(onSelect).toHaveBeenCalledWith('n1');
});

it('explains when the catalog has no node template', async () => {
  const user = userEvent.setup();
  render(<SlotMap chassis={chassis} catalog={seedTemplates().filter((t) => t.mounting === 'rack')} commit={() => null} onSelect={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Add node to slot 3' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Add a Node template to the Catalog first.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./SlotMap`.

- [ ] **Step 3: Implement**

`apps/web/src/features/elevation/SlotMap.tsx`:
```tsx
import { formatWatts, newId, sumDemand, type Chassis, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';

interface SlotMapProps {
  chassis: Chassis;
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string) => void;
}

export function SlotMap({ chassis, catalog, commit, onSelect }: SlotMapProps) {
  const slotTemplates = catalog.filter((t) => t.mounting === 'slot');
  const [templateId, setTemplateId] = useState(slotTemplates[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const template = slotTemplates.find((t) => t.id === templateId) ?? slotTemplates[0] ?? null;
  const nodes = sumDemand(chassis.nodes.map((n) => n.demand));
  const total = sumDemand([chassis.demand, ...chassis.nodes.map((n) => n.demand)]);
  const headingId = `${chassis.id}-slots`;

  // Selection stays on the Chassis so every empty slot can be filled in a row.
  const insert = (slot: number): void => {
    if (!template) {
      setError('Add a Node template to the Catalog first.');
      return;
    }
    setError(commit({ type: 'node/insert', id: newId(), chassisId: chassis.id, slot, template }));
  };

  return (
    <section className="slot-map" aria-labelledby={headingId}>
      <div className="slot-map__head">
        <h3 id={headingId}>Slot map</h3>
        <span className="mono slot-map__count">{`${chassis.nodes.length} of ${chassis.slotCount} filled`}</span>
      </div>
      {slotTemplates.length > 1 ? (
        <div className="field">
          <label htmlFor={`${chassis.id}-node-tpl`} className="field__label">
            Node template
          </label>
          <div className="field__box">
            <select id={`${chassis.id}-node-tpl`} className="field__input" value={template?.id ?? ''} onChange={(e) => setTemplateId(e.target.value)}>
              {slotTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      <div className="slot-map__grid" style={{ gridTemplateColumns: `repeat(${chassis.slotsPerRow}, minmax(0, 1fr))` }}>
        {Array.from({ length: chassis.slotCount }, (_, i) => i + 1).map((slot) => {
          const node = chassis.nodes.find((n) => n.slot === slot);
          if (!node) {
            return (
              <button key={slot} type="button" className="slot slot--empty" aria-label={`Add node to slot ${slot}`} onClick={() => insert(slot)}>
                <span className="slot__n mono">{slot}</span>
                <span className="slot__add">Add node</span>
              </button>
            );
          }
          return (
            <button key={slot} type="button" className={`slot${node.demand.kind === 'unknown' ? ' slot--unknown' : ''}`} aria-label={`Slot ${slot}: ${node.name}`} onClick={() => onSelect(node.id)}>
              <span className="slot__n mono">{slot}</span>
              <span className="slot__name mono">{node.name}</span>
              <span className="slot__w mono">{node.demand.kind === 'known' ? `${node.demand.watts} W` : '? W'}</span>
            </button>
          );
        })}
      </div>
      <dl className="slot-map__sum">
        <dt>Chassis overhead</dt>
        <dd className="mono">{chassis.demand.kind === 'known' ? formatWatts(chassis.demand.watts) : 'unknown'}</dd>
        <dt>{`Nodes (${chassis.nodes.length - nodes.unknownCount} known)`}</dt>
        <dd className="mono">{formatWatts(nodes.knownW)}</dd>
        <dt>Assembly</dt>
        <dd className="mono">{`${formatWatts(total.knownW)}${total.unknownCount ? ` + ${total.unknownCount} unknown` : ''}`}</dd>
      </dl>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
```

Append to `apps/web/src/features/elevation/elevation.css`:
```css
.slot-map {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slot-map__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.slot-map__head h3 {
  font-size: 14px;
  font-weight: 700;
}

.slot-map__count {
  font-size: 12px;
  color: var(--ink-2);
}

.slot-map__grid {
  display: grid;
  gap: 6px;
}

.slot {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  min-height: 104px;
  padding: 8px;
  border: 1px solid #4e78c9;
  border-radius: var(--radius-field);
  background: rgb(127 162 232 / 0.3);
  text-align: left;
  font-size: 12px;
  transition: box-shadow var(--duration-fast) ease-out;
}

.slot:hover {
  box-shadow: 0 4px 12px rgb(14 24 36 / 0.14);
}

.slot--unknown {
  border-color: var(--warn);
  background: var(--warn-bg);
}

.slot--unknown .slot__w {
  color: var(--warn);
  font-weight: 700;
}

.slot--empty {
  align-items: center;
  justify-content: center;
  border-style: dashed;
  border-color: var(--line-strong);
  background: rgb(255 255 255 / 0.4);
}

.slot__n {
  color: var(--ink-2);
  font-size: 11px;
}

.slot__name {
  font-weight: 600;
  word-break: break-all;
}

.slot__add {
  font-weight: 600;
}

.slot-map__sum {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  row-gap: 4px;
  margin: 0;
  font-size: 12px;
}

.slot-map__sum dt {
  color: var(--ink-2);
}

.slot-map__sum dd {
  margin: 0;
  text-align: right;
}

.slot-map__sum dt:last-of-type,
.slot-map__sum dd:last-of-type {
  padding-top: 4px;
  border-top: 1px solid var(--line);
  font-weight: 600;
  color: var(--ink);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): chassis slot map for inserting and selecting nodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Catalog palette and equipment inspector

**Files:**
- Create: `apps/web/src/features/elevation/CatalogPalette.tsx`, `apps/web/src/features/elevation/EquipmentInspector.tsx`, `apps/web/src/features/elevation/DeviceInspector.tsx`, `apps/web/src/features/elevation/NodeInspector.tsx`, `apps/web/src/features/elevation/ReservedInspector.tsx`, `apps/web/src/features/elevation/RackSummary.tsx`
- Modify: `apps/web/src/features/elevation/elevation.css`
- Test: `apps/web/src/features/elevation/EquipmentInspector.test.tsx`

**Interfaces:**
- Consumes: `SlotMap` (Task 11), `TEMPLATE_MIME` (Task 10), `DemandField` (Task 8), `NumberField`, `TextField`, `findRackDevice`, `findNode`, `findReserved`, `racksOf`, `rackPower`, `usedU`, `lowestFreeBottomU`, `formatURange`, `CATEGORY_LABEL`, `formatDemand`, `formatWatts`.
- Produces: `CatalogPalette({ catalog; activeRack: Rack | null; onAdd(template) })`, which shows an "Add <label> to <rack>" button per rack Template and makes rack Templates draggable. `EquipmentInspector({ content; roomId; selectedId; activeRack; catalog; commit; onSelect(id | null) })` routes the selection to `DeviceInspector`, `NodeInspector`, `ReservedInspector` or `RackSummary`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/elevation/EquipmentInspector.test.tsx`:
```tsx
import { applyPlanCommand, createObject, emptyContent, seedTemplates, type PlanCommand, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { CatalogPalette } from './CatalogPalette';
import { EquipmentInspector } from './EquipmentInspector';

const catalog = seedTemplates();
const tpl = (id: string) => catalog.find((t) => t.id === id) as Template;
const a = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), id: 'ra', name: 'RK-01' };
const b = { ...(createObject('rack', { x: 2, y: 0.6 }, []) as Rack), id: 'rb', name: 'RK-02' };
function build(...cmds: PlanCommand[]): PlanContent {
  return [{ type: 'object/add', object: a } as PlanCommand, { type: 'object/add', object: b } as PlanCommand, ...cmds].reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, emptyContent());
}
const content = build(
  { type: 'device/place', id: 'srv', rackId: 'ra', bottomU: 20, template: tpl('tpl-server-2u') },
  { type: 'device/place', id: 'ch', rackId: 'ra', bottomU: 5, template: tpl('tpl-chassis-6u') },
  { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 1, template: tpl('tpl-node') },
);
const show = (selectedId: string | null, commit = vi.fn<(c: unknown, k?: string) => string | null>(() => null), onSelect = vi.fn()) => {
  render(
    <MemoryRouter>
      <EquipmentInspector content={content} roomId="room" selectedId={selectedId} activeRack={content.objects[0] as Rack} catalog={catalog} commit={commit} onSelect={onSelect} />
    </MemoryRouter>,
  );
  return { commit, onSelect };
};

it('edits a device: move to another rack, unknown demand, remove after confirmation', async () => {
  const user = userEvent.setup();
  const { commit, onSelect } = show('srv');
  expect(screen.getByRole('heading', { name: 'SRV-01' })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Rack'), 'RK-02');
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'device/move', id: 'srv', rackId: 'rb', bottomU: 20 });
  await user.click(screen.getByRole('button', { name: 'Unknown' }));
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'device/update', id: 'srv', patch: { demand: { kind: 'unknown' } } });
  await user.click(screen.getByRole('button', { name: 'Remove SRV-01' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'device/remove', id: 'srv' });
  expect(onSelect).toHaveBeenCalledWith(null);
});

it('shows the slot map for a chassis and node details for a node', () => {
  show('ch');
  expect(screen.getByText('1 of 5 filled')).toBeInTheDocument();
  expect(screen.getByLabelText('Chassis overhead in watts')).toHaveValue('20');
});

it('shows a node with a way back to its chassis', async () => {
  const user = userEvent.setup();
  const { onSelect } = show('n1');
  expect(screen.getByRole('heading', { name: 'NODE-01' })).toBeInTheDocument();
  expect(screen.getByText('Slot 1 of CH-01 · RK-01 U5–U10')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back to CH-01' }));
  expect(onSelect).toHaveBeenCalledWith('ch');
});

it('adds a reserved range from the rack summary', async () => {
  const user = userEvent.setup();
  const { commit, onSelect } = show(null);
  expect(screen.getByRole('heading', { name: 'RK-01' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Add reserved range' }));
  expect(commit.mock.lastCall?.[0]).toMatchObject({ type: 'reserved/add', rackId: 'ra', range: { label: 'Reserved', bottomU: 1, heightU: 1, demand: { kind: 'unknown' } } });
  expect(onSelect).toHaveBeenCalledWith(expect.any(String));
});

it('lists the catalog with add buttons for rack templates only', async () => {
  const user = userEvent.setup();
  const onAdd = vi.fn();
  render(
    <MemoryRouter>
      <CatalogPalette catalog={catalog} activeRack={a} onAdd={onAdd} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Add Server 4U to RK-01' }));
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-server-4u' }));
  expect(screen.queryByRole('button', { name: 'Add Node server to RK-01' })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./CatalogPalette`.

- [ ] **Step 3: Implement**

`apps/web/src/features/elevation/CatalogPalette.tsx`:
```tsx
import { formatDemand, type Rack, type Template } from '@glasshouse/domain';
import { Link } from 'react-router';
import { IconPlus } from '../../ui/icons';
import { TEMPLATE_MIME } from './dnd';

interface CatalogPaletteProps {
  catalog: Template[];
  activeRack: Rack | null;
  onAdd: (template: Template) => void;
}

export function CatalogPalette({ catalog, activeRack, onAdd }: CatalogPaletteProps) {
  return (
    <section className="palette" aria-labelledby="palette-h">
      <div className="palette__head">
        <h2 id="palette-h">Catalog</h2>
        <Link to="/catalog" className="palette__edit">
          Edit catalog
        </Link>
      </div>
      <p className="palette__note">Drag onto a rack, or add to {activeRack ? activeRack.name : 'the selected rack'} at its lowest free U.</p>
      <ul className="palette__list">
        {catalog.map((t) => (
          <li
            key={t.id}
            className={`palette__item palette__item--${t.mounting === 'slot' ? 'slot' : t.category}`}
            draggable={t.mounting === 'rack'}
            onDragStart={(e) => {
              e.dataTransfer.setData(TEMPLATE_MIME, t.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className="stamp">{t.mounting === 'slot' ? 'SLOT' : `${t.heightU}U`}</span>
            <span className="palette__label">{t.label}</span>
            <span className="palette__w mono">{formatDemand(t.demand)}</span>
            {t.mounting === 'rack' && activeRack ? (
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`Add ${t.label} to ${activeRack.name}`} title={`Add to ${activeRack.name}`} onClick={() => onAdd(t)}>
                <IconPlus />
              </button>
            ) : (
              <span className="palette__hint" title="Add from a Chassis slot map">
                in Chassis
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`apps/web/src/features/elevation/DeviceInspector.tsx`:
```tsx
import { CATEGORY_LABEL, formatURange, type DeviceLocation, type DevicePatch, type Rack, type Template } from '@glasshouse/domain';
import { useState } from 'react';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { SlotMap } from './SlotMap';

interface DeviceInspectorProps {
  location: DeviceLocation;
  racks: Rack[];
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function DeviceInspector({ location: { rack, device }, racks, catalog, commit, onSelect }: DeviceInspectorProps) {
  const [confirm, setConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const key = (k: string): string => `dev:${device.id}:${k}`;
  const update = (patch: DevicePatch, k?: string): string | null => commit({ type: 'device/update', id: device.id, patch }, k === undefined ? undefined : key(k));
  const move = (rackId: string, bottomU: number): string | null => commit({ type: 'device/move', id: device.id, rackId, bottomU }, key('move'));
  const isChassis = device.kind === 'chassis';
  const nodeCount = device.kind === 'chassis' ? device.nodes.length : 0;

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{device.name}</h2>
        <span className="inspector__hint">
          {device.kind === 'chassis' ? `Chassis · ${device.heightU}U · ${device.slotCount} slots` : `${CATEGORY_LABEL[device.category]} · ${device.heightU}U`}
        </span>
      </header>

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Identity</legend>
        <TextField id={`${device.id}-name`} label="Name" value={device.name} onCommit={(v) => update({ name: v }, 'name')} />
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Position</legend>
        <div className="field-pair">
          <div className="field">
            <label htmlFor={`${device.id}-rack`} className="field__label">
              Rack
            </label>
            <div className="field__box">
              <select id={`${device.id}-rack`} className="field__input" value={rack.id} onChange={(e) => setActionError(move(e.target.value, device.bottomU))}>
                {racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <NumberField id={`${device.id}-u`} label="Bottom U" decimals={0} value={device.bottomU} onCommit={(v) => (v === null ? null : move(rack.id, v))} />
        </div>
        <p className="inspector__note mono">{`${formatURange(device)} · depth ${device.depthMm} / ${rack.usableDepthMm} mm usable`}</p>
        {actionError ? (
          <p role="alert" className="field__error">
            {actionError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Power and size</legend>
        <DemandField id={`${device.id}-demand`} label={isChassis ? 'Chassis overhead' : 'Demand'} value={device.demand} onCommit={(d) => update({ demand: d })} />
        <NumberField id={`${device.id}-depth`} label="Depth" unit="mm" decimals={0} value={device.depthMm} onCommit={(v) => (v === null ? null : update({ depthMm: v }, 'depth'))} />
        {device.kind === 'chassis' ? (
          <div className="field-pair">
            <NumberField id={`${device.id}-slots`} label="Slots" decimals={0} value={device.slotCount} onCommit={(v) => (v === null ? null : update({ slotCount: v }, 'slots'))} />
            <NumberField id={`${device.id}-per-row`} label="Slots per row" decimals={0} value={device.slotsPerRow} onCommit={(v) => (v === null ? null : update({ slotsPerRow: v }, 'perRow'))} />
          </div>
        ) : null}
      </fieldset>

      {device.kind === 'chassis' ? <SlotMap chassis={device} catalog={catalog} commit={commit} onSelect={onSelect} /> : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Notes</legend>
        <TextField id={`${device.id}-config`} label="Configuration" multiline value={device.config} onCommit={(v) => update({ config: v }, 'config')} />
        <TextField id={`${device.id}-notes`} label="Notes" multiline value={device.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>

      <div className="inspector__danger">
        {confirm ? (
          <>
            <span>{`Remove ${device.name}${nodeCount ? ` and its ${nodeCount} ${nodeCount === 1 ? 'Node' : 'Nodes'}` : ''}?`}</span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                const problem = commit({ type: 'device/remove', id: device.id });
                setActionError(problem);
                if (problem === null) onSelect(null);
              }}
            >
              Remove
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirm(true)}>
            Remove {device.name}
          </button>
        )}
      </div>
    </div>
  );
}
```

`apps/web/src/features/elevation/NodeInspector.tsx`:
```tsx
import { formatURange, type NodeLocation, type NodePatch } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { TextField } from '../../ui/TextField';

interface NodeInspectorProps {
  location: NodeLocation;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function NodeInspector({ location: { rack, chassis, node }, commit, onSelect }: NodeInspectorProps) {
  const update = (patch: NodePatch, k?: string): string | null => commit({ type: 'node/update', id: node.id, patch }, k === undefined ? undefined : `node:${node.id}:${k}`);
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{node.name}</h2>
        <span className="inspector__hint">Node</span>
      </header>
      <p className="inspector__note mono">{`Slot ${node.slot} of ${chassis.name} · ${rack.name} ${formatURange(chassis)}`}</p>
      <button type="button" className="btn btn--sm" onClick={() => onSelect(chassis.id)}>
        Back to {chassis.name}
      </button>
      <fieldset className="inspector__group">
        <legend className="visually-hidden">Node details</legend>
        <TextField id={`${node.id}-name`} label="Name" value={node.name} onCommit={(v) => update({ name: v }, 'name')} />
        <DemandField id={`${node.id}-demand`} label="Demand" value={node.demand} onCommit={(d) => update({ demand: d })} />
        <TextField id={`${node.id}-config`} label="Configuration" multiline value={node.config} onCommit={(v) => update({ config: v }, 'config')} />
        <TextField id={`${node.id}-notes`} label="Notes" multiline value={node.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>
      <div className="inspector__danger">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            if (commit({ type: 'node/remove', id: node.id }) === null) onSelect(chassis.id);
          }}
        >
          Remove {node.name} from slot {node.slot}
        </button>
      </div>
    </div>
  );
}
```

`apps/web/src/features/elevation/ReservedInspector.tsx`:
```tsx
import type { Rack, ReservedRange } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DemandField } from '../../ui/DemandField';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';

interface ReservedInspectorProps {
  rack: Rack;
  range: ReservedRange;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function ReservedInspector({ rack, range, commit, onSelect }: ReservedInspectorProps) {
  const update = (patch: Partial<Omit<ReservedRange, 'id'>>, k?: string): string | null =>
    commit({ type: 'reserved/update', id: range.id, patch }, k === undefined ? undefined : `rsv:${range.id}:${k}`);
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>Reserved range</h2>
        <span className="inspector__hint">{rack.name}</span>
      </header>
      <p className="inspector__note">Space taken by hardware Glasshouse does not model, such as existing customer gear.</p>
      <fieldset className="inspector__group">
        <legend className="visually-hidden">Reserved range</legend>
        <TextField id={`${range.id}-label`} label="Label" value={range.label} onCommit={(v) => update({ label: v }, 'label')} />
        <div className="field-pair">
          <NumberField id={`${range.id}-u`} label="Bottom U" decimals={0} value={range.bottomU} onCommit={(v) => (v === null ? null : update({ bottomU: v }, 'u'))} />
          <NumberField id={`${range.id}-h`} label="Height" unit="U" decimals={0} value={range.heightU} onCommit={(v) => (v === null ? null : update({ heightU: v }, 'h'))} />
        </div>
        <DemandField
          id={`${range.id}-demand`}
          label="Demand"
          value={range.demand}
          onCommit={(d) => update({ demand: d })}
          unknownHint="Allowed, but a reviewer must acknowledge it with a reason before approval."
        />
        <TextField id={`${range.id}-notes`} label="Notes" multiline value={range.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>
      <div className="inspector__danger">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            if (commit({ type: 'reserved/remove', id: range.id }) === null) onSelect(rack.id);
          }}
        >
          Remove reserved range
        </button>
      </div>
    </div>
  );
}
```

`apps/web/src/features/elevation/RackSummary.tsx`:
```tsx
import { formatWatts, lowestFreeBottomU, newId, rackPower, usedU, type Rack } from '@glasshouse/domain';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CommitFn } from '../../store/hooks';

interface RackSummaryProps {
  rack: Rack;
  roomId: string;
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function RackSummary({ rack, roomId, commit, onSelect }: RackSummaryProps) {
  const [error, setError] = useState<string | null>(null);
  const power = rackPower(rack);
  const unknown = (n: number): string => (n ? ` + ${n} unknown` : '');

  const addReserved = (): void => {
    const bottomU = lowestFreeBottomU(rack, 1);
    if (bottomU === null) {
      setError(`${rack.name} has no free U for a reserved range.`);
      return;
    }
    const id = newId();
    const problem = commit({ type: 'reserved/add', rackId: rack.id, range: { id, label: 'Reserved', bottomU, heightU: 1, demand: { kind: 'unknown' }, notes: '' } });
    setError(problem);
    if (problem === null) onSelect(id);
  };

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{rack.name}</h2>
        <span className="inspector__hint">Rack · {rack.owner === 'customer' ? 'Customer' : 'OxygenAI'}</span>
      </header>
      <dl className="equip__facts">
        <dt>Occupied</dt>
        <dd className="mono">{`${usedU(rack)} / ${rack.capacityU}U`}</dd>
        <dt>Usable depth</dt>
        <dd className="mono">{rack.usableDepthMm} mm</dd>
        <dt>Devices</dt>
        <dd className="mono">{`${formatWatts(power.devices.knownW)}${unknown(power.devices.unknownCount)}`}</dd>
        <dt>Reserved</dt>
        <dd className="mono">{`${formatWatts(power.reserved.knownW)}${unknown(power.reserved.unknownCount)}`}</dd>
      </dl>
      <p className="inspector__note">Drag a Template onto the rack or use Add in the Catalog. Select a Device to edit it.</p>
      <div className="equip__actions">
        <button type="button" className="btn btn--sm" onClick={addReserved}>
          Add reserved range
        </button>
        <Link className="btn btn--sm btn--quiet" to={`/rooms/${roomId}/plan?sel=${rack.id}`}>
          Edit rack on the plan
        </Link>
      </div>
      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`apps/web/src/features/elevation/EquipmentInspector.tsx`:
```tsx
import { findNode, findRackDevice, findReserved, racksOf, type PlanContent, type Rack, type Template } from '@glasshouse/domain';
import type { CommitFn } from '../../store/hooks';
import { DeviceInspector } from './DeviceInspector';
import { NodeInspector } from './NodeInspector';
import { RackSummary } from './RackSummary';
import { ReservedInspector } from './ReservedInspector';
import '../plan/inspector.css';

interface EquipmentInspectorProps {
  content: PlanContent;
  roomId: string;
  selectedId: string | null;
  activeRack: Rack | null;
  catalog: Template[];
  commit: CommitFn;
  onSelect: (id: string | null) => void;
}

export function EquipmentInspector({ content, roomId, selectedId, activeRack, catalog, commit, onSelect }: EquipmentInspectorProps) {
  const device = selectedId ? findRackDevice(content, selectedId) : null;
  const node = !device && selectedId ? findNode(content, selectedId) : null;
  const reserved = !device && !node && selectedId ? findReserved(content, selectedId) : null;

  let body;
  if (device) body = <DeviceInspector key={device.device.id} location={device} racks={racksOf(content)} catalog={catalog} commit={commit} onSelect={onSelect} />;
  else if (node) body = <NodeInspector key={node.node.id} location={node} commit={commit} onSelect={onSelect} />;
  else if (reserved) body = <ReservedInspector key={reserved.range.id} rack={reserved.rack} range={reserved.range} commit={commit} onSelect={onSelect} />;
  else if (activeRack) body = <RackSummary key={activeRack.id} rack={activeRack} roomId={roomId} commit={commit} onSelect={onSelect} />;
  else body = <p className="inspector__empty">Select a Device to edit it.</p>;

  return (
    <aside className="equip glass" aria-label="Equipment details">
      {body}
    </aside>
  );
}
```

Append to `apps/web/src/features/elevation/elevation.css`:
```css
.palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.palette__head h2 {
  font-size: 14px;
  font-weight: 700;
}

.palette__edit {
  font-size: 12px;
  color: var(--acc);
}

.palette__note {
  font-size: 12px;
  color: var(--ink-2);
}

.palette__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.palette__item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 4px 6px 4px 8px;
  border: 1px solid rgb(255 255 255 / 0.8);
  border-radius: var(--radius-control);
  background: rgb(255 255 255 / 0.5);
  font-size: 13px;
}

.palette__item[draggable='true'] {
  cursor: grab;
}

.palette__item[draggable='true']:hover {
  background: #fff;
  box-shadow: 0 4px 12px rgb(14 24 36 / 0.12);
}

.palette__item .stamp {
  justify-self: start;
}

.palette__label {
  font-weight: 600;
}

.palette__w {
  font-size: 11px;
  color: var(--ink-2);
}

.palette__hint {
  font-size: 11px;
  color: var(--ink-2);
}

.equip {
  overflow-y: auto;
}

.equip__facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  row-gap: 6px;
  margin: 0;
  font-size: 13px;
}

.equip__facts dt {
  color: var(--ink-2);
}

.equip__facts dd {
  margin: 0;
  text-align: right;
}

.equip__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): catalog palette and device, node, reserved range inspectors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Elevation view, power bar and rack occupancy on the plan

**Files:**
- Create: `apps/web/src/features/elevation/PowerBar.tsx`, `apps/web/src/features/elevation/ElevationView.tsx`
- Modify: `apps/web/src/app/ViewTabs.tsx`, `apps/web/src/app/RoomScreen.tsx`, `apps/web/src/features/plan/ChecksStrip.tsx`, `apps/web/src/features/plan/checks.css`, `apps/web/src/features/plan/layers.tsx`, `apps/web/src/features/plan/PlanCanvas.test.tsx`, `apps/web/src/features/elevation/elevation.css`
- Test: `apps/web/src/features/elevation/ElevationView.test.tsx`

**Interfaces:**
- Consumes: Tasks 8–12; `checkPlan`, `roomPower`, `flaggedObjectIds`, `ChecksStrip`.
- Produces: `PowerBar({ content })`; `ElevationView({ location })` at `/rooms/:roomId/elevation`; `ChecksStrip` gains an optional `className`; plan racks are labelled `"<used>/<capacity>U"` instead of `"<capacity>U"`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/elevation/ElevationView.test.tsx`:
```tsx
import { createObject, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

function seed(withRack: boolean): void {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  s.dispatch({ type: 'project/create', id: 'p', name: 'P' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'S' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' });
  if (withRack) s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' } } });
}
const open = () => render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/elevation'] })} />);

beforeEach(() => seed(true));

it('adds a device from the palette and edits it in the inspector', async () => {
  const user = userEvent.setup();
  open();
  expect(screen.getByRole('heading', { name: 'Room demand' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Elevation' })).toHaveAttribute('aria-current', 'page');
  await user.click(screen.getByRole('button', { name: 'Add Server 2U to RK-01' }));
  expect(screen.getByRole('button', { name: 'SRV-01, U1–U2' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'SRV-01' })).toBeInTheDocument();
  expect(screen.getByText('450 W known')).toBeInTheDocument();
});

it('lists depth and demand problems in the checks', async () => {
  const user = userEvent.setup();
  open();
  await user.click(screen.getByRole('button', { name: 'Add Server 1U to RK-01' }));
  const depth = screen.getByLabelText('Depth');
  await user.clear(depth);
  await user.type(depth, '1070');
  expect(screen.getByText('SRV-01 is 1070 mm deep, but RK-01 accepts 1000 mm.')).toBeInTheDocument();
});

it('sends you to the plan when the room has no racks', () => {
  seed(false);
  open();
  expect(screen.getByRole('heading', { name: 'This room has no racks yet' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to the plan' })).toHaveAttribute('href', '/rooms/r/plan');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL. `/rooms/r/elevation` renders "That view doesn't exist for this room."

- [ ] **Step 3: Implement**

`apps/web/src/features/elevation/PowerBar.tsx`:
```tsx
import { formatWatts, roomPower, type PlanContent } from '@glasshouse/domain';

const BAR_W = 1000;

export function PowerBar({ content }: { content: PlanContent }) {
  const p = roomPower(content);
  const max = Math.max(p.budgetW, p.knownW, 1);
  const x = (w: number): number => Math.min(BAR_W, (w / max) * BAR_W);
  const unknownParts = [
    p.unknownDevices ? `${p.unknownDevices} unknown ${p.unknownDevices === 1 ? 'Device' : 'Devices'}` : '',
    p.unknownReserved ? `${p.unknownReserved} unknown Reserved ${p.unknownReserved === 1 ? 'range' : 'ranges'}` : '',
  ].filter(Boolean);
  return (
    <section className="power glass" aria-labelledby="power-h">
      <div className="power__head">
        <h2 id="power-h">Room demand</h2>
        <span className={`mono power__known${p.overLimit ? ' power__known--over' : ''}`}>{`${formatWatts(p.knownW)} known`}</span>
        <span className="power__of">
          of <span className="mono">{formatWatts(p.limitW)}</span> design limit ({p.limitPct}% of <span className="mono">{formatWatts(p.budgetW)}</span>)
        </span>
        {unknownParts.length ? <span className="power__unknown">{unknownParts.join(' · ')}</span> : null}
      </div>
      <svg className="power__bar" viewBox={`0 0 ${BAR_W} 18`} preserveAspectRatio="none" role="img" aria-label={`${p.knownW} watts known of a ${p.limitW} watt design limit and ${p.budgetW} watt budget`}>
        <rect x={0} y={4} width={BAR_W} height={10} rx={5} className="power__track" />
        <rect x={0} y={4} width={x(p.knownW)} height={10} rx={5} className={p.overLimit ? 'power__fill power__fill--over' : 'power__fill'} />
        <line x1={x(p.limitW)} x2={x(p.limitW)} y1={0} y2={18} className="power__limit" />
      </svg>
    </section>
  );
}
```

`apps/web/src/features/elevation/ElevationView.tsx`:
```tsx
import {
  checkPlan,
  currentRevision,
  findNode,
  findRackDevice,
  findReserved,
  formatURange,
  getRack,
  lowestFreeBottomU,
  newId,
  racksOf,
  type PlanContent,
  type Rack,
  type RoomLocation,
  type Template,
} from '@glasshouse/domain';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { usePlanCommit, useSearchParamState } from '../../store/hooks';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { ChecksStrip } from '../plan/ChecksStrip';
import { flaggedObjectIds } from '../plan/flagged';
import { CatalogPalette } from './CatalogPalette';
import { EquipmentInspector } from './EquipmentInspector';
import { PowerBar } from './PowerBar';
import { RackElevation } from './RackElevation';
import './elevation.css';

const MESSAGE_MS = 4000;

function owningRack(content: PlanContent, id: string | null): Rack | null {
  if (!id) return null;
  return getRack(content, id) ?? findRackDevice(content, id)?.rack ?? findNode(content, id)?.rack ?? findReserved(content, id)?.rack ?? null;
}

function entityNames(content: PlanContent): { id: string; name: string }[] {
  return racksOf(content).flatMap((rack) => [
    { id: rack.id, name: rack.name },
    ...rack.devices.flatMap((d) => [{ id: d.id, name: d.name }, ...(d.kind === 'chassis' ? d.nodes.map((n) => ({ id: n.id, name: n.name })) : [])]),
    ...rack.reserved.map((r) => ({ id: r.id, name: `${r.label} ${formatURange(r)}` })),
  ]);
}

export function ElevationView({ location }: { location: RoomLocation }) {
  const content = currentRevision(location.room.plan).content;
  const roomId = location.room.id;
  const commit = usePlanCommit(roomId);
  const catalog = useWorkspaceStore((s) => s.workspace.catalog);
  const [selectedId, select] = useSearchParamState('sel');
  const [message, setMessage] = useState<string | null>(null);
  const racks = racksOf(content);
  const issues = useMemo(() => checkPlan(content), [content]);
  const flagged = useMemo(() => flaggedObjectIds(issues), [issues]);
  const names = useMemo(() => entityNames(content), [content]);
  const activeRack = owningRack(content, selectedId) ?? racks[0] ?? null;

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const place = (template: Template, rack: Rack, atU?: number): void => {
    if (template.mounting === 'slot') {
      setMessage('Nodes go into a Chassis. Select one and use its slot map.');
      return;
    }
    const bottomU = atU === undefined ? lowestFreeBottomU(rack, template.heightU) : Math.max(1, Math.min(atU, rack.capacityU - template.heightU + 1));
    if (bottomU === null) {
      setMessage(`${rack.name} has no free ${template.heightU}U space.`);
      return;
    }
    const id = newId();
    const problem = commit({ type: 'device/place', id, rackId: rack.id, bottomU, template });
    setMessage(problem);
    if (problem === null) select(id);
  };

  if (racks.length === 0) {
    return (
      <section className="elev-empty glass">
        <h2>This room has no racks yet</h2>
        <p>Place a rack on the Plan first, then come back to fill it.</p>
        <Link className="btn btn--ink" to={`/rooms/${roomId}/plan`}>
          Go to the plan
        </Link>
      </section>
    );
  }

  return (
    <div className="elev">
      <aside className="elev__side glass" aria-label="Catalog">
        <CatalogPalette catalog={catalog} activeRack={activeRack} onAdd={(t) => activeRack && place(t, activeRack)} />
      </aside>
      <section className="elev__racks" aria-label="Rack elevations">
        {racks.map((rack) => (
          <RackElevation
            key={rack.id}
            rack={rack}
            active={rack.id === activeRack?.id}
            selectedId={selectedId}
            flagged={flagged}
            onSelect={select}
            onActivate={() => select(rack.id)}
            onDropTemplate={(templateId, u) => {
              const template = catalog.find((t) => t.id === templateId);
              if (template) place(template, rack, u);
            }}
          />
        ))}
      </section>
      <div className="elev__foot">
        <PowerBar content={content} />
        <ChecksStrip className="checks--static" issues={issues} objects={names} onSelect={select} />
      </div>
      <EquipmentInspector content={content} roomId={roomId} selectedId={selectedId} activeRack={activeRack} catalog={catalog} commit={commit} onSelect={select} />
      {message ? (
        <p role="status" className="elev__message">
          {message}
        </p>
      ) : null}
    </div>
  );
}
```

In `apps/web/src/features/plan/ChecksStrip.tsx`:
- Add `className?: string;` to `ChecksStripProps`.
- Destructure it: `export function ChecksStrip({ issues, objects, onSelect, className }: ChecksStripProps) {`.
- Change the section's class to `` className={`checks glass${className ? ` ${className}` : ''}`} ``.

Append to `apps/web/src/features/plan/checks.css`:
```css
.checks--static {
  position: static;
  max-height: 220px;
}
```

In `apps/web/src/app/ViewTabs.tsx`, replace the `VIEWS` constant:
```ts
const VIEWS = [
  { id: 'plan', label: 'Plan' },
  { id: 'elevation', label: 'Elevation' },
] as const;
```

Replace `apps/web/src/app/RoomScreen.tsx`:
```tsx
import { useParams } from 'react-router';
import { ElevationView } from '../features/elevation/ElevationView';
import { PlanView } from '../features/plan/PlanView';
import { useRoomLocation } from '../store/hooks';
import { ErrorBoundary } from './ErrorBoundary';
import { NotFound } from './NotFound';
import { ViewTabs } from './ViewTabs';

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const location = useRoomLocation(roomId);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  let body;
  if (view === 'plan') body = <PlanView key={roomId} location={location} />;
  else if (view === 'elevation') body = <ElevationView key={roomId} location={location} />;
  else return <NotFound message="That view doesn't exist for this room." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      <ErrorBoundary key={view} label={view === 'plan' ? 'the plan' : 'the elevation'}>
        {body}
      </ErrorBoundary>
    </div>
  );
}
```

In `apps/web/src/features/plan/layers.tsx`:
- Add `usedU` to the `@glasshouse/domain` import list.
- Replace `{o.owner === 'customer' ? 'CUST' : `${o.capacityU}U`}` with `{o.owner === 'customer' ? 'CUST' : `${usedU(o)}/${o.capacityU}U`}`.

In `apps/web/src/features/plan/PlanCanvas.test.tsx`, change `expect(screen.getByText('42U')).toBeInTheDocument();` to `expect(screen.getByText('0/42U')).toBeInTheDocument();`.

Append to `apps/web/src/features/elevation/elevation.css`:
```css
.elev {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr) 352px;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
}

.elev__side {
  grid-column: 1;
  grid-row: 1 / span 2;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 10px;
}

.elev__racks {
  grid-column: 2;
  grid-row: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  gap: 40px;
  padding: 18px 20px;
  border-radius: 20px;
  background: rgb(255 255 255 / 0.25);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.55);
}

.elev__foot {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.equip {
  grid-column: 3;
  grid-row: 1 / span 2;
  min-height: 0;
}

.elev__message {
  position: absolute;
  left: 50%;
  top: 12px;
  z-index: 3;
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 13px;
  box-shadow: var(--shadow-float);
  transform: translateX(-50%);
}

.elev-empty {
  max-width: 56ch;
  margin: 48px auto 0;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.elev-empty h2 {
  font-size: 20px;
  font-weight: 700;
}

.elev-empty p {
  color: var(--ink-2);
}

.power {
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.power__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 14px;
  font-size: 12px;
  color: var(--ink-2);
}

.power__head h2 {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}

.power__known {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.power__known--over {
  color: var(--block);
}

.power__unknown {
  margin-left: auto;
  font-weight: 600;
  color: var(--warn);
}

.power__bar {
  width: 100%;
  height: 18px;
  display: block;
}

.power__track {
  fill: rgb(14 24 36 / 0.08);
}

.power__fill {
  fill: var(--acc);
}

.power__fill--over {
  fill: var(--block-fill);
}

.power__limit {
  stroke: var(--ink);
  stroke-width: 3;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Look at it**

Run `pnpm dev`. Open a room with two racks and go to Elevation. Check that you can:
- drag a Template onto a rack;
- add a Chassis and fill its Slots;
- move the Chassis to the other rack through the inspector;
- see the Room demand bar move.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): elevation view with palette, inspector, power bar and checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Devices & BOM view

**Files:**
- Create: `apps/web/src/features/bom/BomView.tsx`, `apps/web/src/features/bom/bom.css`
- Modify: `apps/web/src/app/ViewTabs.tsx`, `apps/web/src/app/RoomScreen.tsx`
- Test: `apps/web/src/features/bom/BomView.test.tsx`

**Interfaces:**
- Consumes: `bomRows`, `bomCsv`, `BOM_COLUMNS` (Task 7); `pad2`; `currentRevision`.
- Produces: `BomView({ location })` at `/rooms/:roomId/bom`, a table of BOM rows plus a "Download CSV" button saving `<room-slug>-R<NN>-bom.csv`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/bom/BomView.test.tsx`:
```tsx
import { createObject, type Rack, type Template } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  const s = useWorkspaceStore.getState();
  s.setLoad({ kind: 'ready' });
  const t = (id: string) => s.workspace.catalog.find((x) => x.id === id) as Template;
  const rack = { ...(createObject('rack', { x: 1, y: 0.6 }, []) as Rack), name: 'RK-01' };
  s.dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  s.dispatch({ type: 'site/create', projectId: 'p', id: 's', name: 'Site A' });
  s.dispatch({ type: 'room/create', siteId: 's', id: 'r', name: 'MDF 1' });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'object/add', object: rack } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'device/place', id: 'ch', rackId: rack.id, bottomU: 5, template: t('tpl-chassis-6u') } });
  s.dispatch({ type: 'plan', roomId: 'r', command: { type: 'node/insert', id: 'n1', chassisId: 'ch', slot: 1, template: t('tpl-node') } });
});
afterEach(() => vi.restoreAllMocks());

it('lists devices with nodes and downloads the CSV', async () => {
  const user = userEvent.setup();
  const created: Blob[] = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return 'blob:bom';
  });
  URL.revokeObjectURL = vi.fn();
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/rooms/r/bom'] })} />);
  expect(screen.getByRole('link', { name: 'Devices & BOM' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getAllByRole('row')).toHaveLength(3);
  expect(screen.getByRole('cell', { name: 'NODE-01' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Download CSV' }));
  expect(created).toHaveLength(1);
  expect(await created[0]!.text()).toContain('RK-01,CH-01,1,Node,NODE-01');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, because there is no "Devices & BOM" link.

- [ ] **Step 3: Implement**

`apps/web/src/features/bom/BomView.tsx`:
```tsx
import { BOM_COLUMNS, bomCsv, bomRows, currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo } from 'react';
import { pad2 } from '../../ui/StatusStamp';
import './bom.css';

const VISIBLE = BOM_COLUMNS.filter((c) => c.key !== 'project' && c.key !== 'site' && c.key !== 'room');

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';

export function BomView({ location }: { location: RoomLocation }) {
  const rows = useMemo(() => bomRows(location), [location]);
  const revision = currentRevision(location.room.plan);

  const download = (): void => {
    const blob = new Blob([bomCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug(location.room.name)}-R${pad2(revision.number)}-bom.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="bom glass" aria-labelledby="bom-h">
      <header className="bom__head">
        <h2 id="bom-h">Devices &amp; BOM</h2>
        <span className="bom__count">{`${rows.length} ${rows.length === 1 ? 'Device' : 'Devices'}, each Node listed separately`}</span>
        <button type="button" className="btn btn--ink" onClick={download} disabled={rows.length === 0}>
          Download CSV
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="bom__empty">No Devices yet. Add them on the Elevation tab.</p>
      ) : (
        <div className="bom__scroll">
          <table className="bom__table">
            <thead>
              <tr>
                {VISIBLE.map((c) => (
                  <th key={c.key} scope="col">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.rack}-${r.name}-${i}`} className={`bom__row bom__row--${r.kind.toLowerCase()}`}>
                  {VISIBLE.map((c) => (
                    <td key={c.key} className={c.key === 'name' || c.key === 'position' || c.key === 'demandW' ? 'mono' : undefined}>
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

`apps/web/src/features/bom/bom.css`:
```css
.bom {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
}

.bom__head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.bom__head h2 {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.bom__count {
  font-size: 12px;
  color: var(--ink-2);
}

.bom__head .btn {
  margin-left: auto;
}

.bom__empty {
  color: var(--ink-2);
}

.bom__scroll {
  min-height: 0;
  overflow: auto;
  border-radius: var(--radius-control);
  background: rgb(255 255 255 / 0.45);
}

.bom__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.bom__table th {
  position: sticky;
  top: 0;
  padding: 9px 10px;
  background: rgb(247 249 251 / 0.95);
  border-bottom: 1px solid var(--line-strong);
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
  white-space: nowrap;
}

.bom__table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  white-space: pre-line;
}

.bom__row--node td:first-child,
.bom__row--node td:nth-child(2),
.bom__row--node td:nth-child(3) {
  color: var(--ink-2);
}

.bom__row--chassis td {
  font-weight: 600;
}
```

In `apps/web/src/app/ViewTabs.tsx`, add `{ id: 'bom', label: 'Devices & BOM' },` as the third entry of `VIEWS`.

In `apps/web/src/app/RoomScreen.tsx`:
- Add `import { BomView } from '../features/bom/BomView';`.
- Add `else if (view === 'bom') body = <BomView key={roomId} location={location} />;` before the `else return` line.
- Change the boundary label to `label={view === 'plan' ? 'the plan' : view === 'elevation' ? 'the elevation' : 'the BOM'}`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): devices and BOM view with CSV download

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: M2 end-to-end journeys and verification

**Files:**
- Create: `apps/web/e2e/devices.spec.ts`
- Modify: `docs/product/Glasshouse-Product-Specification.md` (FR01 save rule, decision 4)
- Test: `apps/web/e2e/devices.spec.ts`

**Interfaces:**
- Consumes: everything above. It reuses the plan helpers by duplicating the small `createRoom` / `placeRack` functions, so each spec file stays independent.

- [ ] **Step 1: Write the journeys**

`apps/web/e2e/devices.spec.ts`:
```ts
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function createRoom(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Northgate');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add site to Northgate' }).click();
  await page.getByRole('textbox', { name: 'Site name' }).fill('Site A');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Add room to Site A' }).click();
  await page.getByRole('textbox', { name: 'Room name' }).fill('MDF-1');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('footprint')).toBeVisible();
}

async function placeRack(page: Page, fx: number, fy: number, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Place rack' }).click();
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('AC06/AC08/AC14/AC19: fill a chassis, move it, flag an unknown node, export the BOM', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.25, 0.35, 'RK-01');
  await placeRack(page, 0.6, 0.35, 'RK-02');
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'RK-01', exact: true }).click();
  await page.getByRole('button', { name: 'Add Chassis 6U · 5 slots to RK-01' }).click();
  await expect(page.getByRole('heading', { name: 'CH-01' })).toBeVisible();
  for (let slot = 1; slot <= 5; slot += 1) await page.getByRole('button', { name: `Add node to slot ${slot}` }).click();
  await expect(page.getByText('5 of 5 filled')).toBeVisible();
  await expect(page.getByText('770 W known')).toBeVisible();

  await page.getByLabel('Rack', { exact: true }).selectOption({ label: 'RK-02' });
  await expect(page.getByRole('button', { name: 'CH-01, U1–U6' })).toBeVisible();
  await expect(page.getByText('5 of 5 filled')).toBeVisible();

  await page.getByRole('button', { name: 'Slot 3: NODE-03' }).click();
  await page.getByRole('button', { name: 'Unknown' }).click();
  await expect(page.getByText('NODE-03 in slot 3 of CH-01 has unknown demand.')).toBeVisible();

  await page.getByRole('link', { name: 'Devices & BOM' }).click();
  await expect(page.getByRole('row')).toHaveCount(7);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await (await downloading).path();
  const csv = readFileSync(file, 'utf8');
  expect(csv).toContain('RK-02,CH-01,3,Node,NODE-03');
  expect(csv).toContain(',unknown,');
});

test('AC09/AC10: template edits leave placed devices alone; a too-deep device blocks', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.35, 'RK-01');
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: 'Add Server 4U to RK-01' }).click();
  await expect(page.getByLabel('Demand in watts')).toHaveValue('780');

  await page.getByRole('link', { name: /Device catalog/ }).click();
  await page.getByRole('button', { name: /^Server 4U/ }).click();
  await page.getByLabel('Demand in watts').fill('999');
  await page.getByRole('button', { name: 'Save template' }).click();

  await page.getByRole('link', { name: /MDF-1/ }).click();
  await page.getByRole('link', { name: 'Elevation' }).click();
  await page.getByRole('button', { name: /^SRV-01,/ }).click();
  await expect(page.getByLabel('Demand in watts')).toHaveValue('780');

  await page.getByLabel('Depth', { exact: true }).fill('1070');
  await expect(page.getByText('SRV-01 is 1070 mm deep, but RK-01 accepts 1000 mm.')).toBeVisible();
});

test('drag a template from the palette onto a rack', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.35, 'RK-01');
  await page.getByRole('link', { name: 'Elevation' }).click();
  const rack = page.getByRole('group', { name: 'RK-01 front elevation, 42U' });
  const box = await rack.boundingBox();
  if (!box) throw new Error('Elevation not rendered');
  await page.getByText('Network switch').dragTo(rack, { targetPosition: { x: box.width / 2, y: 8 } });
  await expect(page.getByRole('button', { name: 'SW-01, U42' })).toBeVisible();
});
```

- [ ] **Step 2: Run the journeys**

Run:
```bash
cd /Users/snatchanon/workspace/operations/development/glasshouse
pnpm e2e
```
Expected: every M1 and M2 journey passes (9 tests). In the drag test, `y: 8` targets the top U, U42. If HTML5 drag-and-drop is flaky in Chromium, use `page.dragAndDrop('li:has-text("Network switch")', 'svg[aria-label="RK-01 front elevation, 42U"]', { targetPosition: … })`. Do not weaken the assertion.

- [ ] **Step 3: Record decision 4 in the product spec**

In `docs/product/Glasshouse-Product-Specification.md`, FR01, replace the sentence `Device and Catalog forms use explicit Save; the interface distinguishes autosaved fields from Save forms.` with:
```markdown
Placed Devices, Reserved ranges and Nodes autosave and can be undone per Room like the plan. Catalog Templates use explicit Save / Discard because they are shared by every Project; the interface distinguishes the two.
```
Copy the updated file to `/Users/snatchanon/workspace/operations/aios/ideaverse/project-glasshouse/Glasshouse-Product-Specification.md`.

- [ ] **Step 4: Full verification and a browser look**

Run:
```bash
pnpm test && pnpm typecheck && pnpm build && pnpm --filter @glasshouse/domain coverage && pnpm e2e
```
Expected: everything passes, and domain coverage is at or above the thresholds.

Then, with `pnpm dev` at 1440 and 1280 wide, take screenshots of:
- an Elevation with two racks (one Chassis with five Nodes, one Reserved range) with the inspector on the Chassis;
- the Catalog editor;
- the BOM table.

Fix anything that looks broken before committing: overlapping labels, clipped racks, or the inspector hiding content.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): M2 rack, chassis, catalog and BOM journeys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After M2

- Run the whole-branch review, then merge `feat/m2-racks-devices`.
- Write the M3 plan against the real code: Revisions and Snapshots, Review notes, Acknowledged unknowns, Unverified names, approval checks, Project file import/export with conflict handling, and the Workspace backup reminder.
