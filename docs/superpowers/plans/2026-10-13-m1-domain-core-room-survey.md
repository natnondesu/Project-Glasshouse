# M1 — Domain Core + Room Survey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An onsite engineer can create Project → Site → Room, survey the room (bounds, Footprint from Floor areas and Cut-outs, Power budget, notes), place and edit room objects (Racks, Existing racks, doors, MCB panels, furniture) with 45° rotation and Clearance zones, and see placement checks. Everything saves in the browser.

**Architecture:** A pnpm monorepo. `packages/domain` is pure TypeScript with no DOM: the model types, geometry, Footprint, commands, checks and the schema with migrations, all fully unit-tested. `apps/web` is React + Vite. A zustand store holds the immutable `Workspace`, dispatches domain commands, keeps undo/redo and persists to IndexedDB behind a `Repository` interface. The plan editor is SVG drawn in screen space from world metres through a shared pan/zoom viewport.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, immer, zod, polygon-clipping, React 19, React Router 7, zustand 5, idb-keyval, @fontsource fonts, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-glasshouse-mvp-design.md` (technical design) and `docs/product/Glasshouse-Product-Specification.md` v1.1 (FR01–FR04, FR08, FR11-persistence; AC01–AC04, AC11, AC12, AC20). Terms: `CONTEXT.md`. Visual system: `DESIGN.md`.

## Global Constraints

- Node ≥ 22 (dev machine: 26.5), pnpm 10.33.2. Repo root: `/Users/snatchanon/workspace/operations/development/glasshouse`.
- TypeScript `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` everywhere.
- `packages/domain` must not use DOM or Node APIs. Its tsconfig `lib` is `ES2022` only.
- Immutability: domain functions never mutate inputs; they return new objects (immer `produce` or spreads).
- Units: room geometry in metres, Device/Usable depth in millimetres, rack capacity in U, Demand in watts. Floor rectangles snap to **0.10 m**, object drags snap to **0.10 m**, typed object values round to **0.01 m**.
- UI copy uses the canonical terms from `CONTEXT.md`: Project, Site, Room, Plan, Survey, Footprint, Floor area, Cut-out, Rack, Existing rack, Clearance zone, Front/Rear, Revision, Draft. Never "equipment", "own rack", "floor mask" or "published".
- No emojis. No text below 12 px except 11 px title-block field labels. Colours only via the CSS tokens in `apps/web/src/styles/tokens.css`. Colour is never the only signal.
- Laptop/desktop only. Trackpad gestures (pinch, two-finger pan) must work; no action may require a middle button or right-drag.
- Conventional commits; every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Floating-point drift in typed values** (`0.1 + 0.2`, `1.006`): stored values must be rounded at the command boundary, never `0.30000000000000004`. Pinned in Task 6.
2. **Rotating an object flush against a wall:** a 45° turn grows its bounding box past the wall. Expect either a clean rotation (overflow ≤ 0.01 m is clamped) or a clear rejection naming the object, never a silent corrupt position. Pinned in Task 6.
3. **Shrinking room width or length below placed objects or custom Floor areas:** reject with a message naming the blocker; a default single Floor area follows the new size. Pinned in Tasks 5 and 6.
4. **Corrupted or newer-schema data in IndexedDB:** show a recovery screen with a download, never silently reset the workspace. Pinned in Tasks 9 and 11.
5. **Intermediate keyboard input in number fields** (`""`, `"1."`, `"-"`, `"1,5"`): the field keeps focus and text, the model keeps its last valid value, and the error is explained. Pinned in Task 16.

---

### Task 1: Monorepo scaffold and unit helpers

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/units.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/units.test.ts`

**Interfaces:**
- Produces: `roundTo(value, step)`, `snapFloor(m)`, `snapDrag(m)`, `snapTyped(m)`, `normalizeAngle(deg)`, `rackAutoHeightM(capacityU)`, `formatMetres(m)`, constants `FLOOR_STEP_M = 0.1`, `DRAG_STEP_M = 0.1`, `TYPED_STEP_M = 0.01`, `U_HEIGHT_M = 0.04445`, `RACK_FRAME_ALLOWANCE_M = 0.18`.

- [ ] **Step 1: Create the workspace files**

`package.json`:
```json
{
  "name": "glasshouse",
  "private": true,
  "packageManager": "pnpm@10.33.2",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --filter @glasshouse/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "e2e": "pnpm --filter @glasshouse/web e2e"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`packages/domain/package.json`:
```json
{
  "name": "@glasshouse/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit"
  }
}
```

`packages/domain/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": [] },
  "include": ["src", "vitest.config.ts"]
}
```

`packages/domain/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/model/types.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
```

Run:
```bash
cd /Users/snatchanon/workspace/operations/development/glasshouse
pnpm add -Dw typescript
pnpm --filter @glasshouse/domain add immer polygon-clipping zod
pnpm --filter @glasshouse/domain add -D vitest @vitest/coverage-v8 typescript
```
Expected: `pnpm-lock.yaml` created; no errors.

- [ ] **Step 2: Write the failing test**

`packages/domain/src/units.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatMetres, normalizeAngle, rackAutoHeightM, roundTo, snapDrag, snapFloor, snapTyped } from './units';

describe('units', () => {
  it('rounds without floating-point drift', () => {
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snapTyped(1.006)).toBe(1.01);
    expect(snapTyped(-0.001)).toBe(0);
  });

  it('snaps floor and drag values to 0.10 m', () => {
    expect(snapFloor(1.04)).toBe(1);
    expect(snapDrag(1.25)).toBe(1.3);
  });

  it('normalises angles into 0–360', () => {
    expect(normalizeAngle(-45)).toBe(315);
    expect(normalizeAngle(405)).toBe(45);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(37.004)).toBe(37);
  });

  it('derives rack height from capacity plus frame allowance', () => {
    expect(rackAutoHeightM(42)).toBe(2.05);
  });

  it('formats metres with two decimals', () => {
    expect(formatMetres(5)).toBe('5.00');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, `Failed to resolve import "./units"`.

- [ ] **Step 4: Implement**

`packages/domain/src/units.ts`:
```ts
export const FLOOR_STEP_M = 0.1;
export const DRAG_STEP_M = 0.1;
export const TYPED_STEP_M = 0.01;
export const U_HEIGHT_M = 0.04445;
export const RACK_FRAME_ALLOWANCE_M = 0.18;

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function roundTo(value: number, step: number): number {
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimalsOf(step)));
}

export const snapFloor = (m: number): number => roundTo(m, FLOOR_STEP_M);
export const snapDrag = (m: number): number => roundTo(m, DRAG_STEP_M);
export const snapTyped = (m: number): number => roundTo(m, TYPED_STEP_M);

export function normalizeAngle(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  const rounded = roundTo(wrapped, 0.01);
  return rounded === 360 ? 0 : rounded;
}

export function rackAutoHeightM(capacityU: number): number {
  return roundTo(capacityU * U_HEIGHT_M + RACK_FRAME_ALLOWANCE_M, 0.01);
}

export const formatMetres = (m: number): string => m.toFixed(2);
```

`packages/domain/src/index.ts`:
```ts
export * from './units';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: 5 tests PASS; tsc exits 0.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/m1-domain-survey
git add -A
git commit -m "chore: scaffold pnpm monorepo and domain unit helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Model types, defaults, Result and IDs

**Files:**
- Create: `packages/domain/src/model/types.ts`, `packages/domain/src/model/defaults.ts`, `packages/domain/src/result.ts`, `packages/domain/src/ids.ts`, `packages/domain/src/validation.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/result.test.ts`

**Interfaces:**
- Produces: every type in `model/types.ts` (`Workspace`, `Project`, `Site`, `Room`, `Plan`, `Revision`, `PlanContent`, `Survey`, `Rect`, `RoomObject`, `Rack`, `SimpleObject`, `RoomObjectType`, `SimpleObjectType`, `RackOwner`, `Demand`, `Template`, `RackDevice`, `Chassis`, `Node`, `ReservedRange`, …), `isRack(o)`; `LIMITS`, `CURRENT_SCHEMA_VERSION = 1`, `DEFAULT_ROOM`, `DEFAULT_POWER_BUDGET_W`, `DEFAULT_DESIGN_LIMIT_PCT`, `DEFAULT_CLEARANCE`, `DEFAULT_RACK`, `DEFAULT_SIZES`, `DEFAULT_HEIGHTS_M`, `NAME_PREFIX`; `Result<T>`, `Failure`, `DomainError`, `DomainErrorCode`, `ok(value)`, `err(code, message, targets?)`, `withTarget(failure, id)`; `newId()`; `validateName(raw, what?)`, `inRange(v, min, max)`, `isWholeInRange(v, min, max)`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/result.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { err, ok, withTarget } from './result';
import { inRange, isWholeInRange, validateName } from './validation';

describe('result', () => {
  it('wraps values and errors', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('not_found', 'Gone.')).toEqual({ ok: false, error: { code: 'not_found', message: 'Gone.', targets: [] } });
  });

  it('attaches a target to a failure', () => {
    expect(withTarget(err('invalid_value', 'Bad.'), 'a').error.targets).toEqual(['a']);
  });
});

describe('ids', () => {
  it('creates unique UUIDs', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(newId()).not.toBe(a);
  });
});

describe('validation', () => {
  it('trims names and rejects empty or long ones', () => {
    expect(validateName('  MDF-1 ')).toEqual({ ok: true, value: 'MDF-1' });
    expect(validateName('   ', 'Room name')).toMatchObject({ ok: false, error: { message: "Room name can't be empty." } });
    expect(validateName('x'.repeat(81)).ok).toBe(false);
  });

  it('checks ranges', () => {
    expect(inRange(5, 1, 50)).toBe(true);
    expect(inRange(Number.NaN, 1, 50)).toBe(false);
    expect(isWholeInRange(42, 1, 60)).toBe(true);
    expect(isWholeInRange(4.5, 1, 60)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./ids`.

- [ ] **Step 3: Implement**

`packages/domain/src/model/types.ts`:
```ts
export type Id = string;
export type Metres = number;
export type Millimetres = number;
export type Units = number;
export type Watts = number;

/** Demand is either known or explicitly unknown — never an implied zero. */
export type Demand = { kind: 'known'; watts: Watts } | { kind: 'unknown' };

export type Category = 'compute' | 'storage' | 'network' | 'power' | 'chassis';
export type Mounting = 'rack' | 'slot';

export interface Template {
  id: Id;
  version: number;
  label: string;
  model: string;
  category: Category;
  mounting: Mounting;
  heightU: Units;
  depthMm: Millimetres;
  demand: Demand;
  color: string;
  defaultConfig: string;
  slotCount: number | null;
  slotsPerRow: number | null;
  illustrative: boolean;
}

export interface Rect {
  id: Id;
  x: Metres;
  y: Metres;
  w: Metres;
  d: Metres;
}

/** width/length are the room's bounding canvas; the Footprint is floorAreas minus cutOuts. */
export interface Survey {
  width: Metres;
  length: Metres;
  floorAreas: Rect[];
  cutOuts: Rect[];
  powerBudget: Watts;
  designLimitPct: number;
  networkHandoff: string;
  notes: string;
}

/** x/y is the top-left of the rotated object's axis-aligned bounding box. */
export interface ObjectBase {
  id: Id;
  name: string;
  x: Metres;
  y: Metres;
  w: Metres;
  d: Metres;
  angle: number;
  height: Metres | null;
  notes: string;
}

export type RackOwner = 'oxygenai' | 'customer';

export interface DeviceBase {
  id: Id;
  templateId: Id;
  templateVersion: number;
  name: string;
  demand: Demand;
  config: string;
  notes: string;
}

export interface PlacedDevice extends DeviceBase {
  kind: 'device';
  category: Category;
  bottomU: Units;
  heightU: Units;
  depthMm: Millimetres;
}

export interface Node extends DeviceBase {
  slot: number;
}

/** A Chassis's own `demand` is its chassis-only overhead; each Node carries its own Demand. */
export interface Chassis extends DeviceBase {
  kind: 'chassis';
  bottomU: Units;
  heightU: Units;
  depthMm: Millimetres;
  slotCount: number;
  slotsPerRow: number;
  nodes: Node[];
}

export type RackDevice = PlacedDevice | Chassis;

export interface ReservedRange {
  id: Id;
  label: string;
  bottomU: Units;
  heightU: Units;
  demand: Demand;
  notes: string;
}

export interface Rack extends ObjectBase {
  type: 'rack';
  capacityU: Units;
  usableDepthMm: Millimetres;
  owner: RackOwner;
  clearance: { front: Metres; rear: Metres };
  devices: RackDevice[];
  reserved: ReservedRange[];
}

export type SimpleObjectType = 'existing_rack' | 'door' | 'mcb' | 'furniture';

export interface SimpleObject extends ObjectBase {
  type: SimpleObjectType;
}

export type RoomObject = Rack | SimpleObject;
export type RoomObjectType = RoomObject['type'];

export interface UnverifiedName {
  name: string;
  at: string;
}

export interface AcknowledgedUnknown {
  reservedRangeId: Id;
  reason: string;
  by: UnverifiedName;
}

export interface PlanContent {
  survey: Survey;
  objects: RoomObject[];
  templatesUsed: Template[];
}

export type RevisionState = 'draft' | 'in_review' | 'approved';

export interface Revision {
  number: number;
  state: RevisionState;
  content: PlanContent;
  designedBy: UnverifiedName | null;
  approvedBy: UnverifiedName | null;
  submittedAt: string | null;
  approvedAt: string | null;
  acknowledgements: AcknowledgedUnknown[];
}

export interface ReviewNote {
  id: Id;
  text: string;
  resolved: boolean;
  createdAt: string;
}

export interface HistoryEvent {
  revision: number;
  action: string;
  at: string;
}

/** The last Revision is the current one; a Plan always has at least one. */
export interface Plan {
  revisions: Revision[];
  notes: ReviewNote[];
  history: HistoryEvent[];
}

export interface Room {
  id: Id;
  name: string;
  notes: string;
  plan: Plan;
}

export interface Site {
  id: Id;
  name: string;
  notes: string;
  rooms: Room[];
}

export interface Project {
  id: Id;
  name: string;
  notes: string;
  isSample: boolean;
  sites: Site[];
}

export interface Workspace {
  schemaVersion: number;
  projects: Project[];
  catalog: Template[];
  lastBackupAt: string | null;
}

export const isRack = (o: RoomObject): o is Rack => o.type === 'rack';
```

`packages/domain/src/model/defaults.ts`:
```ts
import type { RoomObjectType, SimpleObjectType } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export const LIMITS = {
  roomMinM: 1,
  roomMaxM: 50,
  minObjectM: 0.1,
  minFloorRectM: 0.1,
  rackMinU: 1,
  rackMaxU: 60,
  usableDepthMinMm: 300,
  usableDepthMaxMm: 1500,
  clearanceMaxM: 3,
  heightMaxM: 10,
  powerMinW: 100,
  powerMaxW: 100_000,
  designLimitMinPct: 50,
  designLimitMaxPct: 100,
  nameMaxLength: 80,
  textMaxLength: 2000,
} as const;

export const DEFAULT_ROOM = { width: 5, length: 4 } as const;
export const DEFAULT_POWER_BUDGET_W = 5000;
export const DEFAULT_DESIGN_LIMIT_PCT = 80;
export const DEFAULT_CLEARANCE = { front: 1, rear: 0.6 } as const;
export const DEFAULT_RACK = { w: 0.6, d: 1.07, capacityU: 42, usableDepthMm: 1000 } as const;

export const DEFAULT_SIZES: Record<SimpleObjectType, { w: number; d: number }> = {
  existing_rack: { w: 0.6, d: 1 },
  door: { w: 0.9, d: 0.1 },
  mcb: { w: 0.5, d: 0.2 },
  furniture: { w: 1.2, d: 0.6 },
};

export const DEFAULT_HEIGHTS_M: Record<SimpleObjectType, number> = {
  existing_rack: 2,
  door: 2.1,
  mcb: 1.4,
  furniture: 0.75,
};

export const NAME_PREFIX: Record<RoomObjectType, string> = {
  rack: 'RK',
  existing_rack: 'EX',
  door: 'D',
  mcb: 'MCB',
  furniture: 'F',
};
```

`packages/domain/src/result.ts`:
```ts
import type { Id } from './model/types';

export type DomainErrorCode = 'not_found' | 'not_draft' | 'invalid_value' | 'out_of_bounds';

export interface DomainError {
  code: DomainErrorCode;
  message: string;
  targets: Id[];
}

export interface Failure {
  ok: false;
  error: DomainError;
}

export type Result<T> = { ok: true; value: T } | Failure;

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = (code: DomainErrorCode, message: string, targets: Id[] = []): Failure => ({
  ok: false,
  error: { code, message, targets },
});

export const withTarget = (failure: Failure, id: Id): Failure => ({
  ok: false,
  error: { ...failure.error, targets: [id] },
});
```

`packages/domain/src/ids.ts`:
```ts
import type { Id } from './model/types';

// `crypto` is a web-standard global in browsers and Node; typed locally so the domain keeps an ES-only lib.
const cryptoApi = (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto;

export const newId = (): Id => cryptoApi.randomUUID();
```

`packages/domain/src/validation.ts`:
```ts
import { LIMITS } from './model/defaults';
import { err, ok, type Result } from './result';

export function validateName(raw: string, what = 'Name'): Result<string> {
  const name = raw.trim();
  if (name.length === 0) return err('invalid_value', `${what} can't be empty.`);
  if (name.length > LIMITS.nameMaxLength) {
    return err('invalid_value', `${what} must be ${LIMITS.nameMaxLength} characters or fewer.`);
  }
  return ok(name);
}

export const inRange = (v: number, min: number, max: number): boolean =>
  Number.isFinite(v) && v >= min && v <= max;

export const isWholeInRange = (v: number, min: number, max: number): boolean =>
  Number.isInteger(v) && v >= min && v <= max;
```

Replace `packages/domain/src/index.ts`:
```ts
export * from './units';
export * from './model/types';
export * from './model/defaults';
export * from './result';
export * from './ids';
export * from './validation';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: all PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): model types, defaults, Result and validation helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Geometry — rotated placements and polygon operations

**Files:**
- Create: `packages/domain/src/geometry/polygon.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/geometry/polygon.test.ts`

**Interfaces:**
- Consumes: nothing beyond `polygon-clipping`.
- Produces: types `Point`, `Ring`, `Poly`, `MultiPoly`, `Placement`; `EPS_AREA`; `rotatedBoundsSize(w, d, angle)`, `centerOf(p)`, `topLeftForCenter(center, w, d, angle)`, `localToWorld(p, local)`, `worldToLocal(p, world)`, `localRectPolygon(p, x0, y0, x1, y1)`, `placementPolygon(p)`, `rectPolygon(x, y, w, d)`, `placementWithin(p, width, length)`, `area(shape)`, `union(polys)`, `intersection(a, b)`, `difference(a, b)`, `overlaps(a, b)`, `containedIn(shape, region)`, `pointInPolygon(point, poly)`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/geometry/polygon.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  area,
  centerOf,
  containedIn,
  difference,
  overlaps,
  placementPolygon,
  placementWithin,
  pointInPolygon,
  rectPolygon,
  rotatedBoundsSize,
  topLeftForCenter,
  union,
  worldToLocal,
  localToWorld,
} from './polygon';

describe('rotated placements', () => {
  it('computes rotated bounding size', () => {
    const b = rotatedBoundsSize(2, 1, 90);
    expect(b.w).toBeCloseTo(1);
    expect(b.d).toBeCloseTo(2);
  });

  it('keeps the centre when re-deriving the top-left for a new angle', () => {
    const p = { x: 0, y: 0, w: 2, d: 1, angle: 0 };
    const [x, y] = topLeftForCenter(centerOf(p), 2, 1, 90);
    expect(x).toBeCloseTo(0.5);
    expect(y).toBeCloseTo(-0.5);
  });

  it('round-trips local and world coordinates', () => {
    const p = { x: 1, y: 2, w: 0.6, d: 1.07, angle: 37 };
    const [lx, ly] = worldToLocal(p, localToWorld(p, [0.2, -0.3]));
    expect(lx).toBeCloseTo(0.2);
    expect(ly).toBeCloseTo(-0.3);
  });

  it('matches the axis-aligned rectangle at 0°', () => {
    expect(area([placementPolygon({ x: 1, y: 1, w: 2, d: 3, angle: 0 })])).toBeCloseTo(6);
  });

  it('checks bounding-box containment in the room canvas', () => {
    expect(placementWithin({ x: 4.4, y: 0, w: 0.6, d: 1, angle: 0 }, 5, 4)).toBe(true);
    expect(placementWithin({ x: 4.5, y: 0, w: 0.6, d: 1, angle: 0 }, 5, 4)).toBe(false);
  });
});

describe('polygon operations', () => {
  const lShape = union([rectPolygon(0, 0, 6, 3), rectPolygon(0, 3, 3.6, 1.8)]);

  it('measures unions and differences', () => {
    expect(area(lShape)).toBeCloseTo(24.48);
    expect(area(difference(lShape, rectPolygon(5.4, 0, 0.6, 0.6)))).toBeCloseTo(24.12);
  });

  it('treats shared edges as contact, not overlap', () => {
    expect(overlaps(rectPolygon(0, 0, 1, 1), rectPolygon(1, 0, 1, 1))).toBe(false);
    expect(overlaps(rectPolygon(0, 0, 1, 1), rectPolygon(0.9, 0, 1, 1))).toBe(true);
  });

  it('AC03: uses the rotated polygon, not the bounding box, for overlap', () => {
    const stick = placementPolygon({ x: 0, y: 0, w: 0.2, d: 2, angle: 37 });
    const boxInEmptyCorner = rectPolygon(0, 0, 0.2, 0.2);
    expect(overlaps(stick, boxInEmptyCorner)).toBe(false);
  });

  it('checks containment against a region', () => {
    expect(containedIn(rectPolygon(1, 3.5, 1, 1), lShape)).toBe(true);
    expect(containedIn(rectPolygon(4, 3.5, 1, 1), lShape)).toBe(false);
    expect(containedIn(rectPolygon(0, 0, 1, 1), [])).toBe(false);
  });

  it('handles empty inputs', () => {
    expect(union([])).toEqual([]);
    expect(difference([], rectPolygon(0, 0, 1, 1))).toEqual([]);
    expect(area(difference(rectPolygon(0, 0, 1, 1), []))).toBeCloseTo(1);
  });

  it('hit-tests points', () => {
    const p = placementPolygon({ x: 0, y: 0, w: 2, d: 1, angle: 0 });
    expect(pointInPolygon([1, 0.5], p)).toBe(true);
    expect(pointInPolygon([3, 0.5], p)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./polygon`.

- [ ] **Step 3: Implement**

`packages/domain/src/geometry/polygon.ts`:
```ts
import polygonClipping from 'polygon-clipping';

export type Point = [number, number];
export type Ring = Point[];
export type Poly = Ring[];
export type MultiPoly = Poly[];
type Shape = Poly | MultiPoly;

/** Areas at or below this (m²) count as zero, so touching edges never count as overlap. */
export const EPS_AREA = 1e-6;
const EPS_LEN = 1e-9;

export interface Placement {
  x: number;
  y: number;
  w: number;
  d: number;
  angle: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function rotatedBoundsSize(w: number, d: number, angle: number): { w: number; d: number } {
  const a = toRad(angle);
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return { w: w * c + d * s, d: w * s + d * c };
}

export function centerOf(p: Placement): Point {
  const b = rotatedBoundsSize(p.w, p.d, p.angle);
  return [p.x + b.w / 2, p.y + b.d / 2];
}

export function topLeftForCenter(center: Point, w: number, d: number, angle: number): Point {
  const b = rotatedBoundsSize(w, d, angle);
  return [center[0] - b.w / 2, center[1] - b.d / 2];
}

/** Local coordinates are relative to the centre; +y is the object's Front (down the plan at 0°). */
export function localToWorld(p: Placement, local: Point): Point {
  const [cx, cy] = centerOf(p);
  const a = toRad(p.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + local[0] * c - local[1] * s, cy + local[0] * s + local[1] * c];
}

export function worldToLocal(p: Placement, world: Point): Point {
  const [cx, cy] = centerOf(p);
  const a = toRad(p.angle);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = world[0] - cx;
  const dy = world[1] - cy;
  return [dx * c + dy * s, -dx * s + dy * c];
}

export function localRectPolygon(p: Placement, x0: number, y0: number, x1: number, y1: number): Poly {
  const local: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const corners = local.map((pt) => localToWorld(p, pt));
  return [[...corners, corners[0] as Point]];
}

export const placementPolygon = (p: Placement): Poly =>
  localRectPolygon(p, -p.w / 2, -p.d / 2, p.w / 2, p.d / 2);

export const rectPolygon = (x: number, y: number, w: number, d: number): Poly => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + d],
    [x, y + d],
    [x, y],
  ],
];

export function placementWithin(p: Placement, width: number, length: number): boolean {
  const b = rotatedBoundsSize(p.w, p.d, p.angle);
  return p.x >= -EPS_LEN && p.y >= -EPS_LEN && p.x + b.w <= width + EPS_LEN && p.y + b.d <= length + EPS_LEN;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i] as Point;
    const b = ring[i + 1] as Point;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

export function area(shape: MultiPoly): number {
  return shape.reduce((total, poly) => {
    const [outer, ...holes] = poly;
    if (!outer) return total;
    return total + ringArea(outer) - holes.reduce((h, ring) => h + ringArea(ring), 0);
  }, 0);
}

export function union(polys: Poly[]): MultiPoly {
  const [first, ...rest] = polys;
  if (!first) return [];
  return polygonClipping.union(first, ...rest);
}

const isEmpty = (s: Shape): boolean => s.length === 0;

export function intersection(a: Shape, b: Shape): MultiPoly {
  if (isEmpty(a) || isEmpty(b)) return [];
  return polygonClipping.intersection(a, b);
}

export function difference(a: Shape, b: Shape): MultiPoly {
  if (isEmpty(a)) return [];
  if (isEmpty(b)) return polygonClipping.union(a);
  return polygonClipping.difference(a, b);
}

export const overlaps = (a: Poly, b: Poly): boolean => area(intersection(a, b)) > EPS_AREA;

export const containedIn = (shape: Poly, region: MultiPoly): boolean =>
  region.length > 0 && area(difference(shape, region)) <= EPS_AREA;

function inRing([px, py]: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] as Point;
    const [xj, yj] = ring[j] as Point;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Point, poly: Poly): boolean {
  const [outer, ...holes] = poly;
  if (!outer || !inRing(point, outer)) return false;
  return !holes.some((hole) => inRing(point, hole));
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './geometry/polygon';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS. If tsc reports missing types for `polygon-clipping`, check `node_modules/polygon-clipping/package.json` → `"types"`. If it really ships none, add `packages/domain/src/types/polygon-clipping.d.ts` declaring `union`, `intersection` and `difference` as `(geom: Pair[][] | Pair[][][], ...geoms: (Pair[][] | Pair[][][])[]) => Pair[][][]` on the default export.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): rotated placement geometry and polygon operations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Footprint and Clearance zones

**Files:**
- Create: `packages/domain/src/footprint.ts`, `packages/domain/src/clearance.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/footprint.test.ts`

**Interfaces:**
- Consumes: `union`, `difference`, `rectPolygon`, `localRectPolygon`, `localToWorld`, `area` (Task 3); `Survey`, `Rack` (Task 2).
- Produces: `footprintOf(survey: Pick<Survey, 'floorAreas' | 'cutOuts'>): MultiPoly`, `isDisconnected(fp: MultiPoly): boolean`; `clearanceZones(rack): { front: Poly | null; rear: Poly | null }`, `frontEdge(rack): [Point, Point]`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/footprint.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clearanceZones, frontEdge } from './clearance';
import { footprintOf, isDisconnected } from './footprint';
import { area } from './geometry/polygon';

const rect = (id: string, x: number, y: number, w: number, d: number) => ({ id, x, y, w, d });

describe('footprint', () => {
  it('builds an L-shape with a column cut-out', () => {
    const fp = footprintOf({
      floorAreas: [rect('a', 0, 0, 6, 3), rect('b', 0, 3, 3.6, 1.8)],
      cutOuts: [rect('c', 5.4, 0, 0.6, 0.6)],
    });
    expect(area(fp)).toBeCloseTo(24.12);
    expect(isDisconnected(fp)).toBe(false);
  });

  it('detects disconnected floor areas', () => {
    const fp = footprintOf({ floorAreas: [rect('a', 0, 0, 1, 1), rect('b', 3, 0, 1, 1)], cutOuts: [] });
    expect(isDisconnected(fp)).toBe(true);
  });

  it('is empty when there are no areas or a cut-out covers everything', () => {
    expect(footprintOf({ floorAreas: [], cutOuts: [] })).toEqual([]);
    expect(area(footprintOf({ floorAreas: [rect('a', 0, 0, 1, 1)], cutOuts: [rect('c', 0, 0, 2, 2)] }))).toBe(0);
  });
});

describe('clearance zones', () => {
  const rack = { x: 1, y: 1, w: 0.6, d: 1, angle: 0, clearance: { front: 1, rear: 0.6 } };

  it('places the front zone below and the rear zone above at 0°', () => {
    const zones = clearanceZones(rack);
    expect(zones.front).not.toBeNull();
    expect(area([zones.front!])).toBeCloseTo(0.6);
    expect(area([zones.rear!])).toBeCloseTo(0.36);
    const ys = zones.front![0]!.map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(2);
    expect(Math.max(...ys)).toBeCloseTo(3);
  });

  it('omits a side with zero depth', () => {
    expect(clearanceZones({ ...rack, clearance: { front: 0, rear: 0.6 } }).front).toBeNull();
  });

  it('rotates the front with the rack', () => {
    const [a, b] = frontEdge({ ...rack, angle: 90 });
    expect(a[0]).toBeCloseTo(b[0]);
    expect(a[0]).toBeLessThan(1.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./clearance`.

- [ ] **Step 3: Implement**

`packages/domain/src/footprint.ts`:
```ts
import { difference, rectPolygon, union, type MultiPoly } from './geometry/polygon';
import type { Survey } from './model/types';

export function footprintOf(survey: Pick<Survey, 'floorAreas' | 'cutOuts'>): MultiPoly {
  const areas = union(survey.floorAreas.map((r) => rectPolygon(r.x, r.y, r.w, r.d)));
  if (areas.length === 0 || survey.cutOuts.length === 0) return areas;
  const cuts = union(survey.cutOuts.map((r) => rectPolygon(r.x, r.y, r.w, r.d)));
  return difference(areas, cuts);
}

export const isDisconnected = (fp: MultiPoly): boolean => fp.length > 1;
```

`packages/domain/src/clearance.ts`:
```ts
import { localRectPolygon, localToWorld, type Placement, type Point, type Poly } from './geometry/polygon';
import type { Rack } from './model/types';

type ZoneSource = Placement & Pick<Rack, 'clearance'>;

export interface ClearanceZones {
  front: Poly | null;
  rear: Poly | null;
}

export function clearanceZones(rack: ZoneSource): ClearanceZones {
  const hw = rack.w / 2;
  const hd = rack.d / 2;
  return {
    front: rack.clearance.front > 0 ? localRectPolygon(rack, -hw, hd, hw, hd + rack.clearance.front) : null,
    rear: rack.clearance.rear > 0 ? localRectPolygon(rack, -hw, -hd - rack.clearance.rear, hw, -hd) : null,
  };
}

export function frontEdge(rack: Placement): [Point, Point] {
  const hw = rack.w / 2;
  const hd = rack.d / 2;
  return [localToWorld(rack, [-hw, hd]), localToWorld(rack, [hw, hd])];
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './footprint';
export * from './clearance';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): footprint from floor areas and rack clearance zones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Factories, Survey and Floor commands

**Files:**
- Create: `packages/domain/src/factories.ts`, `packages/domain/src/commands/survey.ts`, `packages/domain/src/commands/floor.ts`, `packages/domain/src/commands/plan.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/survey.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `createSurvey()`, `emptyContent()`, `createDraftRevision(number, content)`, `createPlan()`, `createWorkspace()`; `SurveyPatch`, `updateSurvey(content, patch)`, `rectWithinCanvas(r, canvas)`; `FloorKind = 'floorAreas' | 'cutOuts'`, `addFloorRect(content, kind, rect)`, `updateFloorRect(content, id, patch)`, `removeFloorRect(content, id)`; `PlanCommand` (survey and floor variants) and `applyPlanCommand(content, cmd): Result<PlanContent>`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/survey.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent } from '../model/types';
import { applyPlanCommand } from './plan';

function run(content: PlanContent, ...cmds: Parameters<typeof applyPlanCommand>[1][]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}

describe('survey', () => {
  it('starts as a 5 × 4 m room with one full floor area', () => {
    const c = emptyContent();
    expect(c.survey).toMatchObject({ width: 5, length: 4, powerBudget: 5000, designLimitPct: 80 });
    expect(c.survey.floorAreas).toHaveLength(1);
    expect(c.survey.floorAreas[0]).toMatchObject({ x: 0, y: 0, w: 5, d: 4 });
  });

  it('resizes the default floor area with the room', () => {
    const c = run(emptyContent(), { type: 'survey/update', patch: { width: 6.04, length: 4.8 } });
    expect(c.survey.width).toBe(6);
    expect(c.survey.floorAreas[0]).toMatchObject({ w: 6, d: 4.8 });
  });

  it('rejects out-of-range values with a plain message', () => {
    const r = applyPlanCommand(emptyContent(), { type: 'survey/update', patch: { width: 0.5 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'invalid_value', message: 'Room width must be between 1 and 50 m.' } });
    expect(applyPlanCommand(emptyContent(), { type: 'survey/update', patch: { powerBudget: 50 } }).ok).toBe(false);
    expect(applyPlanCommand(emptyContent(), { type: 'survey/update', patch: { designLimitPct: 120 } }).ok).toBe(false);
  });

  it('keeps custom floor areas and refuses to shrink past them', () => {
    const base = run(emptyContent(), { type: 'floor/add', rect: { id: 'x', x: 3, y: 0, w: 2, d: 1 } });
    const r = applyPlanCommand(base, { type: 'survey/update', patch: { width: 4 } });
    expect(r).toMatchObject({ ok: false, error: { code: 'out_of_bounds', targets: expect.any(Array) } });
  });

  it('updates power, design limit and text fields', () => {
    const c = run(emptyContent(), {
      type: 'survey/update',
      patch: { powerBudget: 9000.4, designLimitPct: 75, networkHandoff: 'Customer core, port 24', notes: 'Raised floor' },
    });
    expect(c.survey).toMatchObject({ powerBudget: 9000, designLimitPct: 75, networkHandoff: 'Customer core, port 24' });
  });
});

describe('floor areas and cut-outs', () => {
  it('builds an L-shape by resizing the first area and adding a second', () => {
    const base = run(emptyContent(), { type: 'survey/update', patch: { width: 6, length: 4.8 } });
    const first = base.survey.floorAreas[0]!;
    const c = run(
      base,
      { type: 'floor/update', id: first.id, patch: { d: 3 } },
      { type: 'floor/add', rect: { id: 'b', x: 0, y: 3, w: 3.62, d: 1.8 } },
    );
    expect(c.survey.floorAreas.map((r) => [r.w, r.d])).toEqual([[6, 3], [3.6, 1.8]]);
  });

  it('adds, updates and removes rectangles', () => {
    let c = emptyContent();
    c = run(c, { type: 'floor/cut', rect: { id: 'cut', x: 4.42, y: 0, w: 0.61, d: 0.6 } });
    expect(c.survey.cutOuts[0]).toMatchObject({ x: 4.4, w: 0.6 });
    c = run(c, { type: 'floor/update', id: 'cut', patch: { w: 0.5 } });
    expect(c.survey.cutOuts[0]?.w).toBe(0.5);
    c = run(c, { type: 'floor/remove', id: 'cut' });
    expect(c.survey.cutOuts).toEqual([]);
  });

  it('rejects tiny, out-of-bounds, duplicate and missing rectangles', () => {
    const c = emptyContent();
    expect(applyPlanCommand(c, { type: 'floor/add', rect: { id: 'a', x: 0, y: 0, w: 0.04, d: 1 } }).ok).toBe(false);
    expect(applyPlanCommand(c, { type: 'floor/add', rect: { id: 'a', x: 4.5, y: 0, w: 1, d: 1 } })).toMatchObject({
      ok: false,
      error: { code: 'out_of_bounds' },
    });
    const first = c.survey.floorAreas[0]!;
    expect(applyPlanCommand(c, { type: 'floor/add', rect: { ...first } }).ok).toBe(false);
    expect(applyPlanCommand(c, { type: 'floor/remove', id: 'nope' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(applyPlanCommand(c, { type: 'floor/update', id: 'nope', patch: {} }).ok).toBe(false);
  });

  it('allows removing the last floor area while building', () => {
    const c = emptyContent();
    const r = applyPlanCommand(c, { type: 'floor/remove', id: c.survey.floorAreas[0]!.id });
    expect(r.ok && r.value.survey.floorAreas).toEqual([]);
  });

  it('never mutates its input', () => {
    const c = emptyContent();
    const before = JSON.parse(JSON.stringify(c)) as typeof c;
    applyPlanCommand(c, { type: 'survey/update', patch: { width: 8 } });
    expect(c).toEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `../factories`.

- [ ] **Step 3: Implement**

`packages/domain/src/factories.ts`:
```ts
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

export const emptyContent = (): PlanContent => ({ survey: createSurvey(), objects: [], templatesUsed: [] });

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
  catalog: [],
  lastBackupAt: null,
});
```

`packages/domain/src/commands/survey.ts`:
```ts
import { placementWithin } from '../geometry/polygon';
import { LIMITS } from '../model/defaults';
import type { PlanContent, Rect, Survey } from '../model/types';
import { err, ok, type Result } from '../result';
import { snapFloor } from '../units';
import { inRange } from '../validation';

export interface SurveyPatch {
  width?: number;
  length?: number;
  powerBudget?: number;
  designLimitPct?: number;
  networkHandoff?: string;
  notes?: string;
}

const EPS = 1e-9;

export function rectWithinCanvas(r: Pick<Rect, 'x' | 'y' | 'w' | 'd'>, canvas: Pick<Survey, 'width' | 'length'>): boolean {
  return r.x >= -EPS && r.y >= -EPS && r.x + r.w <= canvas.width + EPS && r.y + r.d <= canvas.length + EPS;
}

const coversCanvas = (r: Rect, s: Survey): boolean =>
  Math.abs(r.x) < EPS && Math.abs(r.y) < EPS && Math.abs(r.w - s.width) < EPS && Math.abs(r.d - s.length) < EPS;

function validateText(value: string | undefined, label: string): string | null {
  if (value !== undefined && value.length > LIMITS.textMaxLength) {
    return `${label} must be ${LIMITS.textMaxLength} characters or fewer.`;
  }
  return null;
}

export function updateSurvey(content: PlanContent, patch: SurveyPatch): Result<PlanContent> {
  const s = content.survey;
  const width = patch.width === undefined ? s.width : snapFloor(patch.width);
  const length = patch.length === undefined ? s.length : snapFloor(patch.length);
  if (!inRange(width, LIMITS.roomMinM, LIMITS.roomMaxM)) {
    return err('invalid_value', `Room width must be between ${LIMITS.roomMinM} and ${LIMITS.roomMaxM} m.`);
  }
  if (!inRange(length, LIMITS.roomMinM, LIMITS.roomMaxM)) {
    return err('invalid_value', `Room length must be between ${LIMITS.roomMinM} and ${LIMITS.roomMaxM} m.`);
  }
  const powerBudget = patch.powerBudget === undefined ? s.powerBudget : Math.round(patch.powerBudget);
  if (!inRange(powerBudget, LIMITS.powerMinW, LIMITS.powerMaxW)) {
    return err('invalid_value', 'Power budget must be between 100 and 100,000 W.');
  }
  const designLimitPct = patch.designLimitPct === undefined ? s.designLimitPct : Math.round(patch.designLimitPct);
  if (!inRange(designLimitPct, LIMITS.designLimitMinPct, LIMITS.designLimitMaxPct)) {
    return err('invalid_value', 'Design limit must be between 50% and 100%.');
  }
  const textError = validateText(patch.networkHandoff, 'Network handoff') ?? validateText(patch.notes, 'Notes');
  if (textError) return err('invalid_value', textError);

  const [first] = s.floorAreas;
  const followsCanvas = s.floorAreas.length === 1 && first !== undefined && coversCanvas(first, s);
  const floorAreas = followsCanvas ? [{ ...first, w: width, d: length }] : s.floorAreas;
  const canvas = { width, length };

  const strayRect = [...floorAreas, ...s.cutOuts].find((r) => !rectWithinCanvas(r, canvas));
  if (strayRect) {
    return err('out_of_bounds', 'Shrinking the room would leave a floor area outside it. Edit the floor areas first.', [strayRect.id]);
  }
  const strayObject = content.objects.find((o) => !placementWithin(o, width, length));
  if (strayObject) {
    return err('out_of_bounds', `Shrinking the room would leave ${strayObject.name} outside it. Move or resize it first.`, [strayObject.id]);
  }

  const survey: Survey = {
    ...s,
    width,
    length,
    powerBudget,
    designLimitPct,
    networkHandoff: patch.networkHandoff ?? s.networkHandoff,
    notes: patch.notes ?? s.notes,
    floorAreas,
  };
  return ok({ ...content, survey });
}
```

`packages/domain/src/commands/floor.ts`:
```ts
import { LIMITS } from '../model/defaults';
import type { Id, PlanContent, Rect, Survey } from '../model/types';
import { err, ok, type Result } from '../result';
import { formatMetres, snapFloor } from '../units';
import { rectWithinCanvas } from './survey';

export type FloorKind = 'floorAreas' | 'cutOuts';

const withSurvey = (content: PlanContent, patch: Partial<Survey>): PlanContent => ({
  ...content,
  survey: { ...content.survey, ...patch },
});

function findFloorRect(s: Survey, id: Id): { kind: FloorKind; rect: Rect } | null {
  const area = s.floorAreas.find((r) => r.id === id);
  if (area) return { kind: 'floorAreas', rect: area };
  const cut = s.cutOuts.find((r) => r.id === id);
  return cut ? { kind: 'cutOuts', rect: cut } : null;
}

function validateRect(r: Rect, survey: Survey): Result<Rect> {
  const n: Rect = { id: r.id, x: snapFloor(r.x), y: snapFloor(r.y), w: snapFloor(r.w), d: snapFloor(r.d) };
  if (![n.x, n.y, n.w, n.d].every(Number.isFinite)) return err('invalid_value', 'Enter numbers for every side.', [r.id]);
  if (n.w < LIMITS.minFloorRectM || n.d < LIMITS.minFloorRectM) {
    return err('invalid_value', 'Areas must be at least 0.10 m on each side.', [r.id]);
  }
  if (!rectWithinCanvas(n, survey)) {
    return err(
      'out_of_bounds',
      `Areas must stay inside the room's ${formatMetres(survey.width)} × ${formatMetres(survey.length)} m bounds.`,
      [r.id],
    );
  }
  return ok(n);
}

export function addFloorRect(content: PlanContent, kind: FloorKind, rect: Rect): Result<PlanContent> {
  if (findFloorRect(content.survey, rect.id)) return err('invalid_value', 'An area with this ID already exists.', [rect.id]);
  const valid = validateRect(rect, content.survey);
  if (!valid.ok) return valid;
  return ok(withSurvey(content, { [kind]: [...content.survey[kind], valid.value] }));
}

export function updateFloorRect(content: PlanContent, id: Id, patch: Partial<Omit<Rect, 'id'>>): Result<PlanContent> {
  const found = findFloorRect(content.survey, id);
  if (!found) return err('not_found', 'That area no longer exists.', [id]);
  const valid = validateRect({ ...found.rect, ...patch, id }, content.survey);
  if (!valid.ok) return valid;
  const list = content.survey[found.kind].map((r) => (r.id === id ? valid.value : r));
  return ok(withSurvey(content, { [found.kind]: list }));
}

export function removeFloorRect(content: PlanContent, id: Id): Result<PlanContent> {
  const found = findFloorRect(content.survey, id);
  if (!found) return err('not_found', 'That area no longer exists.', [id]);
  return ok(withSurvey(content, { [found.kind]: content.survey[found.kind].filter((r) => r.id !== id) }));
}
```

`packages/domain/src/commands/plan.ts`:
```ts
import type { Id, PlanContent, Rect } from '../model/types';
import type { Result } from '../result';
import { addFloorRect, removeFloorRect, updateFloorRect } from './floor';
import { updateSurvey, type SurveyPatch } from './survey';

export type PlanCommand =
  | { type: 'survey/update'; patch: SurveyPatch }
  | { type: 'floor/add'; rect: Rect }
  | { type: 'floor/cut'; rect: Rect }
  | { type: 'floor/update'; id: Id; patch: Partial<Omit<Rect, 'id'>> }
  | { type: 'floor/remove'; id: Id };

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
  }
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './factories';
export * from './commands/survey';
export * from './commands/floor';
export * from './commands/plan';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): survey and floor area commands with 0.10 m snapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Room object factories and commands

**Files:**
- Create: `packages/domain/src/objects.ts`, `packages/domain/src/commands/objects.ts`
- Modify: `packages/domain/src/commands/plan.ts`, `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/objects.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `nextName(objects, type)`, `createObject(type, at, existing)`, `effectiveHeight(o)`; `ObjectPatch`, `ObjectCommand`, `addObject`, `updateObject`, `rotateObject`, `removeObject`; `PlanCommand` now includes `ObjectCommand`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/objects.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import { centerOf } from '../geometry/polygon';
import type { PlanContent, Rack, RoomObject } from '../model/types';
import { createObject, effectiveHeight, nextName } from '../objects';
import { applyPlanCommand, type PlanCommand } from './plan';

function run(content: PlanContent, ...cmds: PlanCommand[]): PlanContent {
  return cmds.reduce((c, cmd) => {
    const r = applyPlanCommand(c, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, content);
}

const withRack = (x = 1, y = 1): { content: PlanContent; rack: Rack } => {
  const rack = createObject('rack', { x, y }, []) as Rack;
  return { content: run(emptyContent(), { type: 'object/add', object: rack }), rack };
};

describe('object factories', () => {
  it('names objects by type with the next free number', () => {
    const existing = [{ name: 'RK-01' }, { name: 'RK-02' }, { name: 'Desk' }] as RoomObject[];
    expect(nextName(existing, 'rack')).toBe('RK-03');
    expect(nextName([], 'door')).toBe('D-01');
  });

  it('creates racks with defaults', () => {
    const rack = createObject('rack', { x: 1, y: 2 }, []);
    expect(rack).toMatchObject({ type: 'rack', w: 0.6, d: 1.07, capacityU: 42, usableDepthMm: 1000, owner: 'oxygenai', clearance: { front: 1, rear: 0.6 } });
    expect(effectiveHeight(rack)).toBe(2.05);
    expect(effectiveHeight(createObject('door', { x: 0, y: 0 }, []))).toBe(2.1);
  });
});

describe('object commands', () => {
  it('adds an object and rejects one outside the room bounds', () => {
    const { content } = withRack();
    expect(content.objects).toHaveLength(1);
    const outside = createObject('rack', { x: 4.7, y: 0 }, []);
    expect(applyPlanCommand(emptyContent(), { type: 'object/add', object: outside })).toMatchObject({ ok: false, error: { code: 'out_of_bounds' } });
  });

  it('rounds typed values at the boundary (no float drift)', () => {
    const { content, rack } = withRack();
    const c = run(content, { type: 'object/update', id: rack.id, patch: { x: 0.1 + 0.2, y: 1.006 } });
    expect(c.objects[0]).toMatchObject({ x: 0.3, y: 1.01 });
  });

  it('rejects rack-only fields on other objects', () => {
    const door = createObject('door', { x: 1, y: 3.9 }, []);
    const c = run(emptyContent(), { type: 'object/add', object: door });
    expect(applyPlanCommand(c, { type: 'object/update', id: door.id, patch: { capacityU: 42 } }).ok).toBe(false);
  });

  it('AC03: a typed angle keeps the physical centre', () => {
    const { content, rack } = withRack(2, 1);
    const before = centerOf(rack);
    const c = run(content, { type: 'object/update', id: rack.id, patch: { angle: 37 } });
    const after = centerOf(c.objects[0]!);
    expect(after[0]).toBeCloseTo(before[0], 1);
    expect(after[1]).toBeCloseTo(before[1], 1);
  });

  it('rotates in 45° steps around the centre and returns to 0 after eight steps', () => {
    const { content, rack } = withRack(2, 1);
    const step: PlanCommand = { type: 'object/rotate', id: rack.id, by: 45 };
    const once = run(content, step);
    expect(once.objects[0]?.angle).toBe(45);
    const full = run(content, step, step, step, step, step, step, step, step);
    expect(full.objects[0]?.angle).toBe(0);
    expect(full.objects[0]?.x).toBeCloseTo(2, 1);
  });

  it('refuses to rotate an object flush against a wall when there is no room', () => {
    const { content, rack } = withRack(0, 0);
    const r = applyPlanCommand(content, { type: 'object/rotate', id: rack.id, by: 45 });
    expect(r).toMatchObject({ ok: false, error: { message: `There isn't room to turn ${rack.name} here. Move it away from the wall first.` } });
  });

  it('turns an object 90° flush against the wall when it exactly fits', () => {
    const desk = { ...createObject('furniture', { x: 0, y: 0.2 }, []), w: 1, d: 0.6 };
    const c = run(emptyContent(), { type: 'object/add', object: desk }, { type: 'object/update', id: desk.id, patch: { angle: 90 } });
    expect(c.objects[0]).toMatchObject({ angle: 90, x: 0.2, y: 0 });
  });

  it('validates rack fields', () => {
    const { content, rack } = withRack();
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { capacityU: 61 } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { usableDepthMm: 200 } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { clearance: { front: 3.5 } } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { height: 1.5 } })).toMatchObject({
      ok: false,
      error: { message: `${rack.name} needs at least 2.05 m of height for 42U.` },
    });
    const c = run(content, { type: 'object/update', id: rack.id, patch: { clearance: { rear: 0 }, owner: 'customer' } });
    expect(c.objects[0]).toMatchObject({ owner: 'customer', clearance: { front: 1, rear: 0 } });
  });

  it('rejects empty names, tiny sizes and unknown ids', () => {
    const { content, rack } = withRack();
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { name: ' ' } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/update', id: rack.id, patch: { w: 0.05 } }).ok).toBe(false);
    expect(applyPlanCommand(content, { type: 'object/remove', id: 'nope' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(applyPlanCommand(content, { type: 'object/add', object: rack }).ok).toBe(false);
  });

  it('removes an object', () => {
    const { content, rack } = withRack();
    expect(run(content, { type: 'object/remove', id: rack.id }).objects).toEqual([]);
  });

  it('refuses to shrink the room past a placed object, naming it', () => {
    const { content, rack } = withRack(4, 1);
    expect(applyPlanCommand(content, { type: 'survey/update', patch: { width: 4 } })).toMatchObject({
      ok: false,
      error: { code: 'out_of_bounds', message: `Shrinking the room would leave ${rack.name} outside it. Move or resize it first.` },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `../objects`.

- [ ] **Step 3: Implement**

`packages/domain/src/objects.ts`:
```ts
import { newId } from './ids';
import { DEFAULT_CLEARANCE, DEFAULT_HEIGHTS_M, DEFAULT_RACK, DEFAULT_SIZES, NAME_PREFIX } from './model/defaults';
import type { Metres, RoomObject, RoomObjectType } from './model/types';
import { rackAutoHeightM } from './units';

export function nextName(objects: Pick<RoomObject, 'name'>[], type: RoomObjectType): string {
  const prefix = NAME_PREFIX[type];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = objects.reduce((highest, o) => {
    const match = pattern.exec(o.name);
    return match?.[1] ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

export function createObject(type: RoomObjectType, at: { x: Metres; y: Metres }, existing: Pick<RoomObject, 'name'>[]): RoomObject {
  const base = { id: newId(), name: nextName(existing, type), x: at.x, y: at.y, angle: 0, height: null, notes: '' };
  if (type === 'rack') {
    return {
      ...base,
      type,
      w: DEFAULT_RACK.w,
      d: DEFAULT_RACK.d,
      capacityU: DEFAULT_RACK.capacityU,
      usableDepthMm: DEFAULT_RACK.usableDepthMm,
      owner: 'oxygenai',
      clearance: { ...DEFAULT_CLEARANCE },
      devices: [],
      reserved: [],
    };
  }
  const size = DEFAULT_SIZES[type];
  return { ...base, type, w: size.w, d: size.d };
}

export function effectiveHeight(o: RoomObject): Metres {
  if (o.height !== null) return o.height;
  return o.type === 'rack' ? rackAutoHeightM(o.capacityU) : DEFAULT_HEIGHTS_M[o.type];
}
```

`packages/domain/src/commands/objects.ts`:
```ts
import { centerOf, placementWithin, rotatedBoundsSize, topLeftForCenter } from '../geometry/polygon';
import { LIMITS } from '../model/defaults';
import type { Id, Metres, Millimetres, PlanContent, Rack, RackOwner, RoomObject, Survey, Units } from '../model/types';
import { err, ok, withTarget, type Failure, type Result } from '../result';
import { formatMetres, normalizeAngle, rackAutoHeightM, snapTyped } from '../units';
import { inRange, isWholeInRange, validateName } from '../validation';

export interface ObjectPatch {
  name?: string;
  x?: Metres;
  y?: Metres;
  w?: Metres;
  d?: Metres;
  angle?: number;
  height?: Metres | null;
  notes?: string;
  capacityU?: Units;
  usableDepthMm?: Millimetres;
  owner?: RackOwner;
  clearance?: Partial<Rack['clearance']>;
}

export type ObjectCommand =
  | { type: 'object/add'; object: RoomObject }
  | { type: 'object/update'; id: Id; patch: ObjectPatch }
  | { type: 'object/rotate'; id: Id; by: 45 | -45 }
  | { type: 'object/remove'; id: Id };

const RACK_ONLY: (keyof ObjectPatch)[] = ['capacityU', 'usableDepthMm', 'owner', 'clearance'];
/** Rounding to 0.01 m after a rotation can push a flush object a hair past the wall; absorb that. */
const OVERFLOW_TOLERANCE_M = 0.01;

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function normalizeObject(o: RoomObject): RoomObject {
  const geometry = {
    x: snapTyped(o.x),
    y: snapTyped(o.y),
    w: snapTyped(o.w),
    d: snapTyped(o.d),
    angle: normalizeAngle(o.angle),
    height: o.height === null ? null : snapTyped(o.height),
  };
  if (o.type === 'rack') {
    return { ...o, ...geometry, clearance: { front: snapTyped(o.clearance.front), rear: snapTyped(o.clearance.rear) } };
  }
  return { ...o, ...geometry };
}

function validateRackFields(r: Rack, name: string): Failure | null {
  if (!isWholeInRange(r.capacityU, LIMITS.rackMinU, LIMITS.rackMaxU)) {
    return err('invalid_value', 'Capacity must be a whole number from 1 to 60 U.', [r.id]);
  }
  if (!isWholeInRange(r.usableDepthMm, LIMITS.usableDepthMinMm, LIMITS.usableDepthMaxMm)) {
    return err('invalid_value', 'Usable depth must be a whole number from 300 to 1500 mm.', [r.id]);
  }
  if (!inRange(r.clearance.front, 0, LIMITS.clearanceMaxM) || !inRange(r.clearance.rear, 0, LIMITS.clearanceMaxM)) {
    return err('invalid_value', 'Clearance must be between 0 and 3.00 m.', [r.id]);
  }
  const minHeight = rackAutoHeightM(r.capacityU);
  if (r.height !== null && r.height < minHeight) {
    return err('invalid_value', `${name} needs at least ${formatMetres(minHeight)} m of height for ${r.capacityU}U.`, [r.id]);
  }
  return null;
}

function validateObject(o: RoomObject, survey: Survey): Result<RoomObject> {
  const n = normalizeObject(o);
  const name = validateName(n.name);
  if (!name.ok) return withTarget(name, o.id);
  if (![n.x, n.y, n.w, n.d, n.angle].every(Number.isFinite)) {
    return err('invalid_value', 'Enter numbers for position, size and angle.', [o.id]);
  }
  if (n.w < LIMITS.minObjectM || n.d < LIMITS.minObjectM) {
    return err('invalid_value', `${name.value} must be at least 0.10 m wide and deep.`, [o.id]);
  }
  if (n.height !== null && !(n.height > 0 && n.height <= LIMITS.heightMaxM)) {
    return err('invalid_value', 'Height must be more than 0 and at most 10 m.', [o.id]);
  }
  if (n.type === 'rack') {
    const rackError = validateRackFields(n, name.value);
    if (rackError) return rackError;
  }
  if (!placementWithin(n, survey.width, survey.length)) {
    return err('out_of_bounds', `${name.value} would extend outside the room bounds.`, [o.id]);
  }
  return ok({ ...n, name: name.value });
}

function clampTinyOverflow(o: RoomObject, survey: Survey): RoomObject {
  const b = rotatedBoundsSize(o.w, o.d, o.angle);
  const clamp = (pos: number, size: number, max: number): number => {
    if (pos < 0 && pos > -OVERFLOW_TOLERANCE_M) return 0;
    const over = pos + size - max;
    if (over > 0 && over < OVERFLOW_TOLERANCE_M) return pos - over;
    return pos;
  };
  return { ...o, x: clamp(o.x, b.w, survey.width), y: clamp(o.y, b.d, survey.length) };
}

const replaceObject = (content: PlanContent, next: RoomObject): PlanContent => ({
  ...content,
  objects: content.objects.map((o) => (o.id === next.id ? next : o)),
});

export function addObject(content: PlanContent, object: RoomObject): Result<PlanContent> {
  if (content.objects.some((o) => o.id === object.id)) return err('invalid_value', 'An object with this ID already exists.', [object.id]);
  const valid = validateObject(object, content.survey);
  if (!valid.ok) return valid;
  return ok({ ...content, objects: [...content.objects, valid.value] });
}

export function updateObject(content: PlanContent, id: Id, patch: ObjectPatch): Result<PlanContent> {
  const current = content.objects.find((o) => o.id === id);
  if (!current) return err('not_found', 'That object no longer exists.', [id]);
  if (current.type !== 'rack' && RACK_ONLY.some((key) => patch[key] !== undefined)) {
    return err('invalid_value', `${current.name} is not a rack.`, [id]);
  }
  const { clearance, capacityU, usableDepthMm, owner, ...common } = patch;
  let merged: RoomObject =
    current.type === 'rack'
      ? {
          ...current,
          ...definedOnly(common),
          ...definedOnly({ capacityU, usableDepthMm, owner }),
          clearance: { ...current.clearance, ...definedOnly(clearance ?? {}) },
        }
      : { ...current, ...definedOnly(common) };

  if (patch.angle !== undefined && patch.x === undefined && patch.y === undefined) {
    const [x, y] = topLeftForCenter(centerOf(current), merged.w, merged.d, normalizeAngle(merged.angle));
    merged = clampTinyOverflow({ ...merged, x: snapTyped(x), y: snapTyped(y) }, content.survey);
  }
  const valid = validateObject(merged, content.survey);
  if (!valid.ok) return valid;
  return ok(replaceObject(content, valid.value));
}

export function rotateObject(content: PlanContent, id: Id, by: 45 | -45): Result<PlanContent> {
  const current = content.objects.find((o) => o.id === id);
  if (!current) return err('not_found', 'That object no longer exists.', [id]);
  const result = updateObject(content, id, { angle: current.angle + by });
  if (!result.ok && result.error.code === 'out_of_bounds') {
    return err('out_of_bounds', `There isn't room to turn ${current.name} here. Move it away from the wall first.`, [id]);
  }
  return result;
}

export function removeObject(content: PlanContent, id: Id): Result<PlanContent> {
  if (!content.objects.some((o) => o.id === id)) return err('not_found', 'That object no longer exists.', [id]);
  return ok({ ...content, objects: content.objects.filter((o) => o.id !== id) });
}
```

Replace `packages/domain/src/commands/plan.ts`:
```ts
import type { Id, PlanContent, Rect } from '../model/types';
import type { Result } from '../result';
import { addFloorRect, removeFloorRect, updateFloorRect } from './floor';
import { addObject, removeObject, rotateObject, updateObject, type ObjectCommand } from './objects';
import { updateSurvey, type SurveyPatch } from './survey';

export type PlanCommand =
  | { type: 'survey/update'; patch: SurveyPatch }
  | { type: 'floor/add'; rect: Rect }
  | { type: 'floor/cut'; rect: Rect }
  | { type: 'floor/update'; id: Id; patch: Partial<Omit<Rect, 'id'>> }
  | { type: 'floor/remove'; id: Id }
  | ObjectCommand;

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
  }
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './objects';
export * from './commands/objects';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS. (A 1.00 × 0.60 m desk at (0, 0.2) has centre (0.5, 0.5); turned 90° its box is 0.60 × 1.00, so its top-left becomes (0.2, 0), flush with the top wall. The sub-centimetre clamp absorbs rounding in cases like this.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): room object commands with 45° rotation around the centre

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Workspace hierarchy commands and `apply`

**Files:**
- Create: `packages/domain/src/lookup.ts`, `packages/domain/src/commands/workspace.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/commands/workspace.test.ts`

**Interfaces:**
- Consumes: `applyPlanCommand`, `PlanCommand` (Task 6); factories (Task 5).
- Produces: `RoomLocation { project; site; room }`, `findProject(ws, id)`, `findSite(ws, id): { project; site } | null`, `findRoom(ws, id): RoomLocation | null`, `currentRevision(plan): Revision`; `WorkspaceCommand`, `apply(ws, cmd): Result<Workspace>`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/commands/workspace.test.ts`:
```ts
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { createWorkspace } from '../factories';
import { currentRevision, findRoom } from '../lookup';
import type { Workspace } from '../model/types';
import { apply, type WorkspaceCommand } from './workspace';

function run(ws: Workspace, ...cmds: WorkspaceCommand[]): Workspace {
  return cmds.reduce((w, cmd) => {
    const r = apply(w, cmd);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  }, ws);
}

const seeded = (): Workspace =>
  run(
    createWorkspace(),
    { type: 'project/create', id: 'p', name: '  Northgate ' },
    { type: 'site/create', projectId: 'p', id: 's', name: 'Site A' },
    { type: 'room/create', siteId: 's', id: 'r', name: 'MDF-1' },
  );

describe('hierarchy', () => {
  it('creates Project → Site → Room with a draft plan', () => {
    const ws = seeded();
    const loc = findRoom(ws, 'r');
    expect(loc?.project.name).toBe('Northgate');
    expect(loc?.site.name).toBe('Site A');
    expect(currentRevision(loc!.room.plan)).toMatchObject({ number: 1, state: 'draft' });
  });

  it('renames each level', () => {
    const ws = run(
      seeded(),
      { type: 'project/rename', projectId: 'p', name: 'Northgate Logistics' },
      { type: 'site/rename', siteId: 's', name: 'Warehouse 2' },
      { type: 'room/rename', roomId: 'r', name: 'MDF-2' },
    );
    expect(findRoom(ws, 'r')).toMatchObject({ project: { name: 'Northgate Logistics' }, site: { name: 'Warehouse 2' }, room: { name: 'MDF-2' } });
  });

  it('deletes with cascade', () => {
    expect(findRoom(run(seeded(), { type: 'room/delete', roomId: 'r' }), 'r')).toBeNull();
    expect(run(seeded(), { type: 'site/delete', siteId: 's' }).projects[0]?.sites).toEqual([]);
    expect(run(seeded(), { type: 'project/delete', projectId: 'p' }).projects).toEqual([]);
  });

  it('rejects empty names, duplicate ids and unknown parents', () => {
    const ws = seeded();
    expect(apply(ws, { type: 'project/create', id: 'q', name: '' })).toMatchObject({ ok: false, error: { message: "Project name can't be empty." } });
    expect(apply(ws, { type: 'project/create', id: 'p', name: 'Again' }).ok).toBe(false);
    expect(apply(ws, { type: 'site/create', projectId: 'nope', id: 'x', name: 'S' })).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(apply(ws, { type: 'room/create', siteId: 'nope', id: 'x', name: 'R' }).ok).toBe(false);
    expect(apply(ws, { type: 'room/rename', roomId: 'nope', name: 'R' }).ok).toBe(false);
    expect(apply(ws, { type: 'site/delete', siteId: 'nope' }).ok).toBe(false);
  });
});

describe('plan routing', () => {
  it('applies plan commands to the draft revision only', () => {
    const ws = run(seeded(), { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 6 } } });
    expect(currentRevision(findRoom(ws, 'r')!.room.plan).content.survey.width).toBe(6);
  });

  it('refuses edits to a frozen revision', () => {
    const frozen = produce(seeded(), (d) => {
      const rev = d.projects[0]!.sites[0]!.rooms[0]!.plan.revisions[0]!;
      rev.state = 'in_review';
    });
    expect(apply(frozen, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 6 } } })).toMatchObject({
      ok: false,
      error: { code: 'not_draft', message: 'Revision 1 is frozen. Start a new draft to edit it.' },
    });
  });

  it('passes plan errors through and never mutates the input', () => {
    const ws = seeded();
    const before = JSON.parse(JSON.stringify(ws)) as typeof ws;
    expect(apply(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 0 } } }).ok).toBe(false);
    expect(apply(ws, { type: 'plan', roomId: 'nope', command: { type: 'survey/update', patch: {} } }).ok).toBe(false);
    run(ws, { type: 'plan', roomId: 'r', command: { type: 'survey/update', patch: { width: 7 } } });
    expect(ws).toEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `../lookup`.

- [ ] **Step 3: Implement**

`packages/domain/src/lookup.ts`:
```ts
import type { Id, Plan, Project, Revision, Room, Site, Workspace } from './model/types';

export interface RoomLocation {
  project: Project;
  site: Site;
  room: Room;
}

export const findProject = (ws: Workspace, id: Id): Project | null => ws.projects.find((p) => p.id === id) ?? null;

export function findSite(ws: Workspace, id: Id): { project: Project; site: Site } | null {
  for (const project of ws.projects) {
    const site = project.sites.find((s) => s.id === id);
    if (site) return { project, site };
  }
  return null;
}

export function findRoom(ws: Workspace, id: Id): RoomLocation | null {
  for (const project of ws.projects) {
    for (const site of project.sites) {
      const room = site.rooms.find((r) => r.id === id);
      if (room) return { project, site, room };
    }
  }
  return null;
}

export function currentRevision(plan: Plan): Revision {
  const revision = plan.revisions[plan.revisions.length - 1];
  if (!revision) throw new Error('Invariant violated: a plan has no revisions.');
  return revision;
}
```

`packages/domain/src/commands/workspace.ts`:
```ts
import { castDraft, produce, type Draft } from 'immer';
import { createPlan } from '../factories';
import { currentRevision, findProject, findRoom, findSite } from '../lookup';
import type { Id, Room, Site, Workspace } from '../model/types';
import { err, ok, type Result } from '../result';
import { validateName } from '../validation';
import { applyPlanCommand, type PlanCommand } from './plan';

export type WorkspaceCommand =
  | { type: 'project/create'; id: Id; name: string }
  | { type: 'project/rename'; projectId: Id; name: string }
  | { type: 'project/delete'; projectId: Id }
  | { type: 'site/create'; projectId: Id; id: Id; name: string }
  | { type: 'site/rename'; siteId: Id; name: string }
  | { type: 'site/delete'; siteId: Id }
  | { type: 'room/create'; siteId: Id; id: Id; name: string }
  | { type: 'room/rename'; roomId: Id; name: string }
  | { type: 'room/delete'; roomId: Id }
  | { type: 'plan'; roomId: Id; command: PlanCommand };

const gone = (what: string, id: Id) => err('not_found', `That ${what} no longer exists.`, [id]);

function draftSite(d: Draft<Workspace>, siteId: Id): Draft<Site> {
  for (const p of d.projects) {
    const site = p.sites.find((s) => s.id === siteId);
    if (site) return site;
  }
  throw new Error(`Invariant violated: site ${siteId} vanished during an update.`);
}

function draftRoom(d: Draft<Workspace>, roomId: Id): Draft<Room> {
  for (const p of d.projects) {
    for (const s of p.sites) {
      const room = s.rooms.find((r) => r.id === roomId);
      if (room) return room;
    }
  }
  throw new Error(`Invariant violated: room ${roomId} vanished during an update.`);
}

const idTaken = (ws: Workspace, id: Id): boolean =>
  findProject(ws, id) !== null || findSite(ws, id) !== null || findRoom(ws, id) !== null;

function applyToPlan(ws: Workspace, roomId: Id, command: PlanCommand): Result<Workspace> {
  const loc = findRoom(ws, roomId);
  if (!loc) return gone('room', roomId);
  const revision = currentRevision(loc.room.plan);
  if (revision.state !== 'draft') {
    return err('not_draft', `Revision ${revision.number} is frozen. Start a new draft to edit it.`, [roomId]);
  }
  const result = applyPlanCommand(revision.content, command);
  if (!result.ok) return result;
  return ok(
    produce(ws, (d) => {
      const revisions = draftRoom(d, roomId).plan.revisions;
      const last = revisions[revisions.length - 1];
      if (last) last.content = castDraft(result.value);
    }),
  );
}

export function apply(ws: Workspace, cmd: WorkspaceCommand): Result<Workspace> {
  switch (cmd.type) {
    case 'project/create': {
      const name = validateName(cmd.name, 'Project name');
      if (!name.ok) return name;
      if (idTaken(ws, cmd.id)) return err('invalid_value', 'That ID is already in use.', [cmd.id]);
      return ok(produce(ws, (d) => void d.projects.push({ id: cmd.id, name: name.value, notes: '', isSample: false, sites: [] })));
    }
    case 'project/rename': {
      const name = validateName(cmd.name, 'Project name');
      if (!name.ok) return name;
      if (!findProject(ws, cmd.projectId)) return gone('project', cmd.projectId);
      return ok(produce(ws, (d) => {
        const p = d.projects.find((x) => x.id === cmd.projectId);
        if (p) p.name = name.value;
      }));
    }
    case 'project/delete':
      if (!findProject(ws, cmd.projectId)) return gone('project', cmd.projectId);
      return ok(produce(ws, (d) => void (d.projects = d.projects.filter((p) => p.id !== cmd.projectId))));
    case 'site/create': {
      const name = validateName(cmd.name, 'Site name');
      if (!name.ok) return name;
      if (!findProject(ws, cmd.projectId)) return gone('project', cmd.projectId);
      if (idTaken(ws, cmd.id)) return err('invalid_value', 'That ID is already in use.', [cmd.id]);
      return ok(produce(ws, (d) => {
        d.projects.find((p) => p.id === cmd.projectId)?.sites.push({ id: cmd.id, name: name.value, notes: '', rooms: [] });
      }));
    }
    case 'site/rename': {
      const name = validateName(cmd.name, 'Site name');
      if (!name.ok) return name;
      if (!findSite(ws, cmd.siteId)) return gone('site', cmd.siteId);
      return ok(produce(ws, (d) => void (draftSite(d, cmd.siteId).name = name.value)));
    }
    case 'site/delete':
      if (!findSite(ws, cmd.siteId)) return gone('site', cmd.siteId);
      return ok(produce(ws, (d) => {
        for (const p of d.projects) p.sites = p.sites.filter((s) => s.id !== cmd.siteId);
      }));
    case 'room/create': {
      const name = validateName(cmd.name, 'Room name');
      if (!name.ok) return name;
      if (!findSite(ws, cmd.siteId)) return gone('site', cmd.siteId);
      if (idTaken(ws, cmd.id)) return err('invalid_value', 'That ID is already in use.', [cmd.id]);
      return ok(produce(ws, (d) => {
        draftSite(d, cmd.siteId).rooms.push(castDraft({ id: cmd.id, name: name.value, notes: '', plan: createPlan() }));
      }));
    }
    case 'room/rename': {
      const name = validateName(cmd.name, 'Room name');
      if (!name.ok) return name;
      if (!findRoom(ws, cmd.roomId)) return gone('room', cmd.roomId);
      return ok(produce(ws, (d) => void (draftRoom(d, cmd.roomId).name = name.value)));
    }
    case 'room/delete':
      if (!findRoom(ws, cmd.roomId)) return gone('room', cmd.roomId);
      return ok(produce(ws, (d) => {
        for (const p of d.projects) for (const s of p.sites) s.rooms = s.rooms.filter((r) => r.id !== cmd.roomId);
      }));
    case 'plan':
      return applyToPlan(ws, cmd.roomId, cmd.command);
  }
}
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './lookup';
export * from './commands/workspace';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): project, site and room hierarchy with draft-only plan routing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Placement and clearance checks

**Files:**
- Create: `packages/domain/src/checks/types.ts`, `packages/domain/src/checks/placement.ts`, `packages/domain/src/checks/index.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/checks/placement.test.ts`

**Interfaces:**
- Consumes: `footprintOf`, `isDisconnected`, `clearanceZones`, `placementPolygon`, `containedIn`, `overlaps`, `area`, `EPS_AREA`.
- Produces: `Severity = 'block' | 'needs_ack' | 'warn'`, `IssueCode`, `Issue { key; code; severity; message; hint; targets }`, `placementIssues(content)`, `checkPlan(content): Issue[]` (sorted: block, needs_ack, warn), `blockingIssues(issues)`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/checks/placement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyContent } from '../factories';
import type { PlanContent, Rack, RoomObject } from '../model/types';
import { createObject } from '../objects';
import { checkPlan } from './index';

const rackAt = (name: string, x: number, y: number, extra: Partial<Rack> = {}): Rack =>
  ({ ...(createObject('rack', { x, y }, []) as Rack), name, ...extra });
const obj = (type: 'existing_rack' | 'door' | 'mcb' | 'furniture', name: string, x: number, y: number, w?: number, d?: number): RoomObject => {
  const o = createObject(type, { x, y }, []);
  return { ...o, name, w: w ?? o.w, d: d ?? o.d };
};
const content = (objects: RoomObject[], survey: Partial<PlanContent['survey']> = {}): PlanContent => {
  const base = emptyContent();
  return { ...base, survey: { ...base.survey, width: 6, length: 4.8, floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 3 }, { id: 'b', x: 0, y: 3, w: 3.6, d: 1.8 }], ...survey }, objects };
};
const codes = (c: PlanContent) => checkPlan(c).map((i) => `${i.severity}:${i.code}`);

describe('placement checks', () => {
  it('blocks an empty footprint and warns on disconnected areas', () => {
    expect(codes(content([], { floorAreas: [] }))).toEqual(['block:footprint_empty']);
    expect(codes(content([], { floorAreas: [{ id: 'a', x: 0, y: 0, w: 1, d: 1 }, { id: 'b', x: 3, y: 0, w: 1, d: 1 }] }))).toEqual(['warn:footprint_disconnected']);
  });

  it('AC02: flags an object left in a cut-out instead of deleting it', () => {
    const c = content([rackAt('RK-01', 5.4, 0.6, { clearance: { front: 0, rear: 0 } })], { cutOuts: [{ id: 'c', x: 5.3, y: 1, w: 0.7, d: 0.6 }] });
    const issues = checkPlan(c);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'object_outside_footprint', severity: 'block', message: 'RK-01 is not fully on the floor.' });
  });

  it('exempts doors from footprint containment', () => {
    expect(codes(content([obj('door', 'D-01', 4, 3.0)]))).toEqual([]);
  });

  it('blocks overlap but allows edge contact', () => {
    const a = obj('furniture', 'F-01', 1, 3.5, 1, 0.6);
    expect(codes(content([a, obj('furniture', 'F-02', 2, 3.5, 1, 0.6)]))).toEqual([]);
    expect(codes(content([a, obj('furniture', 'F-02', 1.5, 3.5, 1, 0.6)]))).toEqual(['block:object_overlap']);
  });

  it('AC03: no false collision from bounding boxes of rotated objects', () => {
    const stick = { ...obj('furniture', 'F-01', 1, 0.5, 0.2, 2), angle: 37 };
    const box = obj('furniture', 'F-02', 1, 0.5, 0.2, 0.2);
    expect(codes(content([stick, box]))).toEqual([]);
  });
});

describe('clearance checks', () => {
  it('blocks a rear clearance that runs into the wall', () => {
    const issues = checkPlan(content([rackAt('RK-01', 1, 0)]));
    expect(issues.map((i) => i.message)).toEqual(['The rear clearance of RK-01 runs outside the floor.']);
  });

  it('AC11: an existing rack in the front zone blocks; a door only warns', () => {
    const rack = rackAt('RK-C1', 3.4, 0.6);
    const blocked = checkPlan(content([rack, obj('existing_rack', 'EX-01', 3.8, 2.2, 0.6, 0.8)]));
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ code: 'clearance_obstructed', severity: 'block', message: 'EX-01 sits inside the front clearance zone of RK-C1.', targets: [expect.any(String), rack.id] });
    const door = checkPlan(content([rack, obj('door', 'D-01', 3.3, 2.0, 0.9, 0.1)]));
    expect(door.map((i) => `${i.severity}:${i.code}`)).toEqual(['warn:clearance_door']);
  });

  it('allows racks sharing an aisle (overlapping zones)', () => {
    const top = rackAt('RK-01', 1, 0.6);
    const bottom = rackAt('RK-02', 1, 2.87, { angle: 180 });
    expect(codes(content([top, bottom], { floorAreas: [{ id: 'a', x: 0, y: 0, w: 6, d: 4.8 }] }))).toEqual([]);
  });

  it('skips a side with zero clearance and sorts blocks before warnings', () => {
    expect(codes(content([rackAt('RK-01', 1, 0, { clearance: { front: 1, rear: 0 } })]))).toEqual([]);
    const mixed = content([rackAt('RK-01', 1, 0), obj('door', 'D-01', 0.9, 1.9, 0.9, 0.1)]);
    expect(codes(mixed)).toEqual(['block:clearance_outside_footprint', 'warn:clearance_door']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Implement**

`packages/domain/src/checks/types.ts`:
```ts
import type { Id } from '../model/types';

export type Severity = 'block' | 'needs_ack' | 'warn';

export type IssueCode =
  | 'footprint_empty'
  | 'footprint_disconnected'
  | 'object_outside_footprint'
  | 'object_overlap'
  | 'clearance_outside_footprint'
  | 'clearance_obstructed'
  | 'clearance_door';

export interface Issue {
  key: string;
  code: IssueCode;
  severity: Severity;
  message: string;
  hint: string;
  targets: Id[];
}
```

`packages/domain/src/checks/placement.ts`:
```ts
import { clearanceZones } from '../clearance';
import { footprintOf, isDisconnected } from '../footprint';
import { area, containedIn, EPS_AREA, overlaps, placementPolygon, type Poly } from '../geometry/polygon';
import type { PlanContent, RoomObject } from '../model/types';
import type { Issue } from './types';

interface Shape {
  object: RoomObject;
  poly: Poly;
}

export function placementIssues(content: PlanContent): Issue[] {
  const fp = footprintOf(content.survey);
  const hasFloor = area(fp) > EPS_AREA;
  const issues: Issue[] = [];

  if (!hasFloor) {
    issues.push({
      key: 'footprint_empty',
      code: 'footprint_empty',
      severity: 'block',
      message: 'The room has no floor area.',
      hint: 'Add a floor area with the Add area tool.',
      targets: [],
    });
  } else if (isDisconnected(fp)) {
    issues.push({
      key: 'footprint_disconnected',
      code: 'footprint_disconnected',
      severity: 'warn',
      message: 'The floor has separate, unconnected areas.',
      hint: 'Check this matches the survey. Approval is still allowed.',
      targets: [],
    });
  }

  const shapes: Shape[] = content.objects.map((object) => ({ object, poly: placementPolygon(object) }));

  if (hasFloor) {
    for (const { object, poly } of shapes) {
      if (object.type === 'door' || containedIn(poly, fp)) continue;
      issues.push({
        key: `object_outside_footprint:${object.id}`,
        code: 'object_outside_footprint',
        severity: 'block',
        message: `${object.name} is not fully on the floor.`,
        hint: 'Move it onto the floor, or adjust the floor areas.',
        targets: [object.id],
      });
    }
  }

  shapes.forEach((a, i) => {
    for (const b of shapes.slice(i + 1)) {
      if (!overlaps(a.poly, b.poly)) continue;
      issues.push({
        key: `object_overlap:${a.object.id}:${b.object.id}`,
        code: 'object_overlap',
        severity: 'block',
        message: `${a.object.name} overlaps ${b.object.name}.`,
        hint: 'Move one of them. Touching edges is fine.',
        targets: [a.object.id, b.object.id],
      });
    }
  });

  for (const { object: rack } of shapes) {
    if (rack.type !== 'rack') continue;
    const zones = clearanceZones(rack);
    for (const side of ['front', 'rear'] as const) {
      const zone = zones[side];
      if (!zone) continue;
      if (hasFloor && !containedIn(zone, fp)) {
        issues.push({
          key: `clearance_outside_footprint:${rack.id}:${side}`,
          code: 'clearance_outside_footprint',
          severity: 'block',
          message: `The ${side} clearance of ${rack.name} runs outside the floor.`,
          hint: `Turn or move the rack, or reduce its ${side} clearance.`,
          targets: [rack.id],
        });
      }
      for (const other of shapes) {
        if (other.object.id === rack.id || !overlaps(zone, other.poly)) continue;
        const isDoor = other.object.type === 'door';
        issues.push({
          key: `clearance:${rack.id}:${side}:${other.object.id}`,
          code: isDoor ? 'clearance_door' : 'clearance_obstructed',
          severity: isDoor ? 'warn' : 'block',
          message: isDoor
            ? `${other.object.name} is inside the ${side} clearance of ${rack.name}.`
            : `${other.object.name} sits inside the ${side} clearance zone of ${rack.name}.`,
          hint: isDoor
            ? 'Usually fine for a doorway. Confirm the door swing does not hit the rack.'
            : `Move ${other.object.name}, or reduce ${rack.name}'s ${side} clearance if agreed.`,
          targets: [other.object.id, rack.id],
        });
      }
    }
  }
  return issues;
}
```

`packages/domain/src/checks/index.ts`:
```ts
import type { PlanContent } from '../model/types';
import { placementIssues } from './placement';
import type { Issue, Severity } from './types';

export * from './types';
export { placementIssues } from './placement';

const ORDER: Record<Severity, number> = { block: 0, needs_ack: 1, warn: 2 };

export function checkPlan(content: PlanContent): Issue[] {
  return [...placementIssues(content)].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export const blockingIssues = (issues: Issue[]): Issue[] => issues.filter((i) => i.severity === 'block');
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './checks/index';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): footprint, overlap and clearance zone checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Workspace schema and migrations

**Files:**
- Create: `packages/domain/src/schema.ts`, `packages/domain/src/migrations.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/schema.test.ts`

**Interfaces:**
- Consumes: types and `CURRENT_SCHEMA_VERSION`.
- Produces: `migrate(raw: unknown): Result<unknown>`, `workspaceSchema`, `parseWorkspace(raw: unknown): Result<Workspace>`.

- [ ] **Step 1: Write the failing test**

`packages/domain/src/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { apply } from './commands/workspace';
import { createWorkspace } from './factories';
import { migrate } from './migrations';
import { createObject } from './objects';
import { parseWorkspace } from './schema';

describe('workspace schema', () => {
  it('accepts a fresh and a populated workspace', () => {
    expect(parseWorkspace(createWorkspace()).ok).toBe(true);
    let ws = createWorkspace();
    for (const cmd of [
      { type: 'project/create', id: 'p', name: 'P' },
      { type: 'site/create', projectId: 'p', id: 's', name: 'S' },
      { type: 'room/create', siteId: 's', id: 'r', name: 'R' },
    ] as const) {
      const r = apply(ws, cmd);
      if (!r.ok) throw new Error(r.error.message);
      ws = r.value;
    }
    const withRack = apply(ws, { type: 'plan', roomId: 'r', command: { type: 'object/add', object: createObject('rack', { x: 1, y: 1 }, []) } });
    expect(withRack.ok && parseWorkspace(JSON.parse(JSON.stringify(withRack.value))).ok).toBe(true);
  });

  it('explains corrupted data instead of resetting', () => {
    const bad = { ...createWorkspace(), projects: [{ id: 'p' }] };
    const r = parseWorkspace(bad);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toMatch(/^Saved data is not a valid Glasshouse workspace/);
  });
});

describe('migrations', () => {
  it('rejects non-objects, missing versions and newer schemas', () => {
    expect(migrate(null).ok).toBe(false);
    expect(migrate({}).ok).toBe(false);
    expect(migrate({ schemaVersion: 99 })).toMatchObject({
      ok: false,
      error: { message: 'This data was saved by a newer Glasshouse (schema 99). Update the app to open it.' },
    });
  });

  it('passes current data through unchanged', () => {
    const ws = createWorkspace();
    expect(migrate(ws)).toEqual({ ok: true, value: ws });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/domain test`
Expected: FAIL, cannot resolve `./migrations`.

- [ ] **Step 3: Implement**

`packages/domain/src/migrations.ts`:
```ts
import { CURRENT_SCHEMA_VERSION } from './model/defaults';
import { err, ok, type Result } from './result';

type RawWorkspace = Record<string, unknown>;

/** MIGRATIONS[n] upgrades schema n to n + 1. Add an entry whenever CURRENT_SCHEMA_VERSION increases. */
const MIGRATIONS: Record<number, (raw: RawWorkspace) => RawWorkspace> = {};

export function migrate(raw: unknown): Result<unknown> {
  if (typeof raw !== 'object' || raw === null) return err('invalid_value', 'Saved data is not a Glasshouse workspace.');
  let current = raw as RawWorkspace;
  let version = current.schemaVersion;
  if (typeof version !== 'number') return err('invalid_value', 'Saved data is missing a schema version.');
  if (version > CURRENT_SCHEMA_VERSION) {
    return err('invalid_value', `This data was saved by a newer Glasshouse (schema ${version}). Update the app to open it.`);
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return err('invalid_value', `There is no upgrade path from schema ${version}.`);
    current = step(current);
    version = current.schemaVersion as number;
  }
  return ok(current);
}
```

`packages/domain/src/schema.ts`:
```ts
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
const category = z.enum(['compute', 'storage', 'network', 'power', 'chassis']);
const template = z.object({
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
const rect = z.object({ id, x: num, y: num, w: num, d: num });
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
const simpleObject = z.object({ ...objectBase, type: z.enum(['existing_rack', 'door', 'mcb', 'furniture']) });
const unverifiedName = z.object({ name: z.string(), at: z.string() });
const revision = z.object({
  number: int.positive(),
  state: z.enum(['draft', 'in_review', 'approved']),
  content: z.object({ survey, objects: z.array(z.union([rack, simpleObject])), templatesUsed: z.array(template) }),
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
  catalog: z.array(template),
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
```

Append to `packages/domain/src/index.ts`:
```ts
export * from './migrations';
export * from './schema';
```

- [ ] **Step 4: Run tests, typecheck and coverage**

Run: `pnpm --filter @glasshouse/domain test && pnpm --filter @glasshouse/domain typecheck && pnpm --filter @glasshouse/domain coverage`
Expected: PASS, with coverage at or above the thresholds (90/90/90/85). If `satisfies Workspace` fails because zod infers a wider type (e.g. `string` for `type`), the schema and types have drifted. Fix the schema, not the type.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): zod workspace schema and forward-only migrations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Web app scaffold, design tokens and routes

**Files:**
- Create: `apps/web/package.json`, `apps/web/index.html`, `apps/web/public/favicon.svg`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`
- Create: `apps/web/src/main.tsx`, `apps/web/src/test/setup.ts`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/base.css`
- Create: `apps/web/src/ui/icons.tsx`, `apps/web/src/ui/theme.ts`, `apps/web/src/app/routes.tsx`, `apps/web/src/app/Shell.tsx`, `apps/web/src/app/Home.tsx`, `apps/web/src/app/NotFound.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/app/shell.css`
- Test: `apps/web/src/app/App.test.tsx`

**Interfaces:**
- Consumes: `@glasshouse/domain` (workspace dependency).
- Produces: `routes: RouteObject[]`, `App`, `Shell`, `Home`, `NotFound({ message? })`. Icon components: `GlasshouseMark`, `IconSelect`, `IconPan`, `IconArea`, `IconCut`, `IconRack`, `IconDoor`, `IconMcb`, `IconExistingRack`, `IconFurniture`, `IconPlus`, `IconMinus`, `IconTrash`, `IconPencil`, `IconRotateCw`, `IconRotateCcw`, `IconBlock`, `IconWarn`. Theme helpers `ThemeChoice`, `readThemeChoice()`, `applyThemeChoice(choice)`. CSS tokens from `DESIGN.md`.

- [ ] **Step 1: Create the package and install dependencies**

`apps/web/package.json`:
```json
{
  "name": "@glasshouse/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  }
}
```

Run:
```bash
cd /Users/snatchanon/workspace/operations/development/glasshouse
pnpm --filter @glasshouse/web add @glasshouse/domain@workspace:* react react-dom react-router zustand idb-keyval @fontsource/barlow @fontsource/barlow-semi-condensed @fontsource/spline-sans-mono
pnpm --filter @glasshouse/web add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom fake-indexeddb @playwright/test
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client", "@testing-library/jest-dom/vitest"]
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`apps/web/vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Glasshouse — room survey and rack installation planning" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>Glasshouse</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><rect width="22" height="22" fill="#111720"/><rect x="3" y="3" width="16" height="16" fill="none" stroke="#fbfcfa" stroke-width="1.75"/><path d="M11 3v16M3 11h16" stroke="#fbfcfa" stroke-width="1.75"/></svg>
```

`apps/web/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

class FixedResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    const entry = { target, contentRect: { width: 1000, height: 700 } } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = FixedResizeObserver as unknown as typeof ResizeObserver;
```

- [ ] **Step 2: Write the failing test**

`apps/web/src/app/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { routes } from './routes';

it('renders the shell with the Glasshouse wordmark', () => {
  render(<RouterProvider router={createMemoryRouter(routes)} />);
  expect(screen.getByText('Glasshouse')).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./routes`.

- [ ] **Step 4: Implement tokens, base styles, icons, theme and the shell**

`apps/web/src/styles/tokens.css`:
```css
:root {
  color-scheme: light;
  --film: #f2f4f1;
  --sheet: #fbfcfa;
  --ink: #111720;
  --ink-2: #3b4552;
  --rule: #c9d0d4;
  --rule-2: #e1e6e8;
  --construct: #a9c8de;
  --construct-minor: #d6e5ef;
  --clearance: #2a6a9e;
  --clearance-fill: rgb(42 106 158 / 0.1);
  --block: #b3261e;
  --block-bg: #fbedeb;
  --warn: #9a5800;
  --warn-bg: #fbf2e3;
  --compute: #2c4ea6;
  --compute-bg: #e4eaf7;
  --storage: #0b7262;
  --storage-bg: #e0f1ee;
  --network: #6b3da6;
  --network-bg: #eee7f6;
  --power: #7a5718;
  --power-bg: #f3ecdf;
  --chassis: #3a4554;
  --chassis-bg: #e3e6ea;
  --hover: #e8ecec;
  --shadow-float: 0 6px 18px rgb(17 23 32 / 0.12);

  --font-ui: 'Barlow', system-ui, sans-serif;
  --font-cond: 'Barlow Semi Condensed', 'Barlow', sans-serif;
  --font-mono: 'Spline Sans Mono', ui-monospace, monospace;

  --radius: 2px;
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --film: #0d1218;
    --sheet: #131a22;
    --ink: #e8edf1;
    --ink-2: #aebac6;
    --rule: #2a3541;
    --rule-2: #1d2731;
    --construct: #2c4a63;
    --construct-minor: #18293a;
    --clearance: #6fa8d6;
    --clearance-fill: rgb(111 168 214 / 0.12);
    --block: #ff7a6e;
    --block-bg: #2a1513;
    --warn: #f2b154;
    --warn-bg: #2a1f0e;
    --compute: #7e9bea;
    --compute-bg: #1a2440;
    --storage: #4cc2ac;
    --storage-bg: #0f2a26;
    --network: #b48bea;
    --network-bg: #261b3a;
    --power: #d4ae62;
    --power-bg: #2a2210;
    --chassis: #9aa6b6;
    --chassis-bg: #1e2630;
    --hover: #1b2430;
    --shadow-float: 0 6px 18px rgb(0 0 0 / 0.4);
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --film: #0d1218;
  --sheet: #131a22;
  --ink: #e8edf1;
  --ink-2: #aebac6;
  --rule: #2a3541;
  --rule-2: #1d2731;
  --construct: #2c4a63;
  --construct-minor: #18293a;
  --clearance: #6fa8d6;
  --clearance-fill: rgb(111 168 214 / 0.12);
  --block: #ff7a6e;
  --block-bg: #2a1513;
  --warn: #f2b154;
  --warn-bg: #2a1f0e;
  --compute: #7e9bea;
  --compute-bg: #1a2440;
  --storage: #4cc2ac;
  --storage-bg: #0f2a26;
  --network: #b48bea;
  --network-bg: #261b3a;
  --power: #d4ae62;
  --power-bg: #2a2210;
  --chassis: #9aa6b6;
  --chassis-bg: #1e2630;
  --hover: #1b2430;
  --shadow-float: 0 6px 18px rgb(0 0 0 / 0.4);
}
```

`apps/web/src/styles/base.css`:
```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--film);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}

::selection {
  background: var(--ink);
  color: var(--sheet);
}

:focus-visible {
  outline: 2px solid var(--clearance);
  outline-offset: 2px;
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--rule) transparent;
}

h1,
h2,
h3,
p {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

a {
  color: inherit;
  text-underline-offset: 3px;
  text-decoration-thickness: 1.25px;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.lbl {
  font-family: var(--font-cond);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-2);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  border: 1.5px solid var(--ink);
  border-radius: var(--radius);
  background: var(--sheet);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  transition: background var(--duration-fast) ease-out;
}

.btn:hover:not(:disabled) {
  background: var(--hover);
}

.btn:active:not(:disabled) {
  transform: translateY(1px);
}

.btn--ink {
  background: var(--ink);
  color: var(--sheet);
}

.btn--ink:hover:not(:disabled) {
  background: var(--ink-2);
  border-color: var(--ink-2);
}

.btn--danger {
  border-color: var(--block);
  color: var(--block);
}

.btn--quiet {
  border-color: transparent;
  background: transparent;
}

.btn--sm {
  height: 30px;
  padding: 0 10px;
  font-size: 13px;
}

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1.25px solid var(--rule);
  border-radius: var(--radius);
  background: var(--sheet);
}

.icon-btn:hover:not(:disabled) {
  border-color: var(--ink);
}

.icon-btn--sm {
  width: 26px;
  height: 26px;
  border-color: transparent;
  background: transparent;
}

.stamp {
  font-family: var(--font-cond);
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border: 1.25px solid currentColor;
  border-radius: 1px;
  white-space: nowrap;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

`apps/web/src/ui/icons.tsx`:
```tsx
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const frame = (size: number) =>
  ({ width: size, height: size, viewBox: `0 0 ${size} ${size}`, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }) as const;

export const GlasshouseMark = (p: IconProps) => (
  <svg {...frame(22)} strokeWidth={1.75} {...p}>
    <rect x="1.5" y="1.5" width="19" height="19" />
    <path d="M11 1.5V20.5M1.5 11H20.5" />
    <path d="M4 8L8 4M14 18L18 14" strokeWidth={1} />
  </svg>
);
export const IconSelect = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M4 2.5L14 9L9.5 10L12 15L10 16L7.5 11L4 14Z" strokeLinejoin="round" />
  </svg>
);
export const IconPan = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M9 1.5V16.5M1.5 9H16.5M9 1.5L7 3.5M9 1.5L11 3.5M9 16.5L7 14.5M9 16.5L11 14.5M1.5 9L3.5 7M1.5 9L3.5 11M16.5 9L14.5 7M16.5 9L14.5 11" />
  </svg>
);
export const IconArea = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="2" y="2" width="14" height="14" />
    <path d="M9 5.5V12.5M5.5 9H12.5" />
  </svg>
);
export const IconCut = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="2" y="2" width="14" height="14" strokeDasharray="3 2" />
    <path d="M5.5 9H12.5" />
  </svg>
);
export const IconRack = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="4.5" y="1.5" width="9" height="15" />
    <path d="M4.5 16.5H13.5" strokeWidth={3} />
    <path d="M7 5H11M7 8H11M7 11H11" strokeWidth={1} />
  </svg>
);
export const IconDoor = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <path d="M3 16V3M3 3A13 13 0 0 1 16 16M2 16H16" />
  </svg>
);
export const IconMcb = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="3" y="2" width="12" height="14" />
    <path d="M10 4.5L7 9.5H11L8 13.5" />
  </svg>
);
export const IconExistingRack = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="4.5" y="1.5" width="9" height="15" />
    <path d="M4.5 1.5L13.5 16.5M13.5 1.5L4.5 16.5" strokeWidth={1} />
  </svg>
);
export const IconFurniture = (p: IconProps) => (
  <svg {...frame(18)} {...p}>
    <rect x="2" y="5" width="14" height="6" />
    <path d="M4 11V15M14 11V15" />
  </svg>
);
export const IconPlus = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M7 2V12M2 7H12" />
  </svg>
);
export const IconMinus = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M2 7H12" />
  </svg>
);
export const IconPencil = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M2 12L2.6 9.4L9.6 2.4L11.6 4.4L4.6 11.4Z" strokeLinejoin="round" />
  </svg>
);
export const IconTrash = (p: IconProps) => (
  <svg {...frame(14)} {...p}>
    <path d="M2 3.5H12M5.5 3.5V2H8.5V3.5M3.5 3.5L4 12H10L10.5 3.5" strokeLinejoin="round" />
  </svg>
);
export const IconRotateCw = (p: IconProps) => (
  <svg {...frame(16)} {...p}>
    <path d="M12.5 6A5 5 0 1 0 12 11" />
    <path d="M13.5 2.5V6.5H9.5" />
  </svg>
);
export const IconRotateCcw = (p: IconProps) => (
  <svg {...frame(16)} {...p}>
    <path d="M3.5 6A5 5 0 1 1 4 11" />
    <path d="M2.5 2.5V6.5H6.5" />
  </svg>
);
export const IconBlock = (p: IconProps) => (
  <svg {...frame(20)} strokeWidth={2} {...p}>
    <rect x="2" y="2" width="16" height="16" />
    <path d="M10 6V11.5M10 13.5V14.5" />
  </svg>
);
export const IconWarn = (p: IconProps) => (
  <svg {...frame(20)} strokeWidth={2} {...p}>
    <rect x="2" y="2" width="16" height="16" strokeDasharray="3 2" />
    <path d="M7.8 7.6A2.2 2.2 0 1 1 10 10.2V11.6M10 13.6V14.6" strokeWidth={1.75} />
  </svg>
);
```

`apps/web/src/ui/theme.ts`:
```ts
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'glasshouse.theme';

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Storage can be blocked (private mode); the theme is a per-viewer convenience, so fall back to the OS setting.
    return 'system';
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not persisting is acceptable: the choice still applies for this session.
  }
}
```

`apps/web/src/app/Shell.tsx`:
```tsx
import { Link, Outlet } from 'react-router';
import { GlasshouseMark } from '../ui/icons';
import './shell.css';

export function Shell() {
  return (
    <div className="shell">
      <header className="title-block">
        <Link to="/" className="title-block__mark">
          <GlasshouseMark />
          <span>Glasshouse</span>
        </Link>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
```

`apps/web/src/app/Home.tsx`:
```tsx
import { useWorkspaceStore } from '../store/workspaceStore';

export function Home() {
  const hasProjects = useWorkspaceStore((s) => s.workspace.projects.length > 0);
  return (
    <section className="home">
      <h1>{hasProjects ? 'Open a room to plan it' : 'Start with a project'}</h1>
      <p>
        {hasProjects
          ? 'Pick a room in the project tree, or add one to a site.'
          : 'Create a project in the tree, add a site, then add the room you are surveying.'}
      </p>
    </section>
  );
}
```

`apps/web/src/app/NotFound.tsx`:
```tsx
import { Link } from 'react-router';

export function NotFound({ message = "That page doesn't exist." }: { message?: string }) {
  return (
    <section className="home">
      <h1>Nothing here</h1>
      <p>{message}</p>
      <p>
        <Link to="/">Back to your projects</Link>
      </p>
    </section>
  );
}
```

`apps/web/src/app/routes.tsx`:
```tsx
import type { RouteObject } from 'react-router';
import { Home } from './Home';
import { NotFound } from './NotFound';
import { Shell } from './Shell';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
```

`apps/web/src/app/App.tsx`:
```tsx
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export function App() {
  return <RouterProvider router={router} />;
}
```

`apps/web/src/main.tsx`:
```tsx
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/spline-sans-mono/400.css';
import '@fontsource/spline-sans-mono/500.css';
import '@fontsource/spline-sans-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyThemeChoice, readThemeChoice } from './ui/theme';

applyThemeChoice(readThemeChoice());

const root = document.getElementById('root');
if (!root) throw new Error('Glasshouse could not find its #root element.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/web/src/app/shell.css`:
```css
.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.title-block {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  background: var(--sheet);
  border-bottom: 1.5px solid var(--ink);
}

.title-block__mark {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 0 20px;
  border-right: 1.5px solid var(--ink);
  color: var(--ink);
  text-decoration: none;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.01em;
}

.home {
  max-width: 62ch;
  margin: 72px auto 0;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.home h1 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.home p {
  color: var(--ink-2);
}
```

Note: `Home` imports the store created in Task 11. Until Task 11 lands, create a minimal `apps/web/src/store/workspaceStore.ts` exporting the store skeleton from Task 11 Step 3; Task 11 fills in the rest. Simpler: **do Task 10 Step 4 and Task 11 Step 3's `workspaceStore.ts` together**, then run the test.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): scaffold Vite React app with design tokens and shell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Workspace store, persistence and recovery

**Files:**
- Create: `apps/web/src/store/workspaceStore.ts`, `apps/web/src/store/persistence.ts`, `apps/web/src/store/hooks.ts`
- Create: `apps/web/src/storage/repository.ts`, `apps/web/src/storage/idbRepository.ts`, `apps/web/src/storage/memoryRepository.ts`
- Create: `apps/web/src/app/RecoveryScreen.tsx`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/shell.css`
- Test: `apps/web/src/store/workspaceStore.test.ts`, `apps/web/src/store/persistence.test.ts`

**Interfaces:**
- Consumes: `apply`, `createWorkspace`, `parseWorkspace`, `findRoom`, `WorkspaceCommand`, `DomainError`, `Workspace`, `RoomLocation`.
- Produces: `useWorkspaceStore` (zustand) with state `{ workspace; load: LoadState; save: SaveState; past; future; lastEdit; dispatch(cmd, { coalesceKey? }) => DomainError | null; undo(); redo(); replace(ws); setLoad(l); setSave(s) }`, `resetWorkspaceStore()`; types `LoadState`, `SaveState`, `DispatchOptions`; `hydrate(repo)`, `startPersistence(repo, delayMs?)`, `SAVE_DEBOUNCE_MS`; `Repository { load(): Promise<unknown | null>; save(ws): Promise<void> }`, `createIdbRepository(dbName?)`, `idbRepository`, `createMemoryRepository(initial?)` → `MemoryRepository`; `useRoomLocation(roomId)`; `App({ repository? })`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/store/workspaceStore.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWorkspaceStore, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();

describe('workspace store', () => {
  beforeEach(() => resetWorkspaceStore());

  it('applies commands and returns domain errors without changing state', () => {
    expect(store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' })).toBeNull();
    const before = store().workspace;
    expect(store().dispatch({ type: 'project/create', id: 'q', name: '' })?.message).toBe("Project name can't be empty.");
    expect(store().workspace).toBe(before);
  });

  it('undoes and redoes', () => {
    store().dispatch({ type: 'project/create', id: 'p', name: 'A' });
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'B' });
    store().undo();
    expect(store().workspace.projects[0]?.name).toBe('A');
    store().redo();
    expect(store().workspace.projects[0]?.name).toBe('B');
  });

  it('coalesces edits with the same key inside one second', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1000);
    store().dispatch({ type: 'project/create', id: 'p', name: 'A' });
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'AB' }, { coalesceKey: 'name' });
    now.mockReturnValue(1500);
    store().dispatch({ type: 'project/rename', projectId: 'p', name: 'ABC' }, { coalesceKey: 'name' });
    store().undo();
    expect(store().workspace.projects[0]?.name).toBe('A');
    now.mockRestore();
  });
});
```

`apps/web/src/store/persistence.test.ts`:
```ts
import { createWorkspace } from '@glasshouse/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRepository } from '../storage/memoryRepository';
import { hydrate, startPersistence } from './persistence';
import { resetWorkspaceStore, useWorkspaceStore } from './workspaceStore';

const store = () => useWorkspaceStore.getState();

describe('persistence', () => {
  beforeEach(() => {
    resetWorkspaceStore();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('starts a fresh workspace when nothing is stored', async () => {
    await hydrate(createMemoryRepository());
    expect(store().load).toEqual({ kind: 'ready' });
    expect(store().workspace.projects).toEqual([]);
  });

  it('keeps corrupted data and reports it instead of resetting', async () => {
    const raw = { schemaVersion: 1, projects: 'nope' };
    const repo = createMemoryRepository(raw);
    await hydrate(repo);
    expect(store().load).toMatchObject({ kind: 'failed', raw });
    expect(repo.saved).toBe(raw);
  });

  it('saves after the debounce and reports success', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    expect(store().save).toEqual({ kind: 'saving' });
    await vi.advanceTimersByTimeAsync(400);
    expect(store().save.kind).toBe('saved');
    expect((repo.saved as ReturnType<typeof createWorkspace>).projects[0]?.name).toBe('Northgate');
    stop();
  });

  it('reports a failed save with its reason', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    repo.failNextSave('Quota exceeded');
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    await vi.advanceTimersByTimeAsync(400);
    expect(store().save).toEqual({ kind: 'failed', reason: 'Quota exceeded' });
    stop();
  });

  it('flushes a pending save when stopped', async () => {
    const repo = createMemoryRepository();
    await hydrate(repo);
    const stop = startPersistence(repo, 400);
    store().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
    stop();
    await vi.runAllTimersAsync();
    expect((repo.saved as ReturnType<typeof createWorkspace>).projects).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `../storage/memoryRepository`.

- [ ] **Step 3: Implement**

`apps/web/src/store/workspaceStore.ts`:
```ts
import { apply, createWorkspace, type DomainError, type Workspace, type WorkspaceCommand } from '@glasshouse/domain';
import { create } from 'zustand';

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed'; reason: string };
export type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: string; raw: unknown };

export interface DispatchOptions {
  /** Consecutive edits with the same key inside COALESCE_WINDOW_MS become one undo step (e.g. typing in a field). */
  coalesceKey?: string;
}

const HISTORY_LIMIT = 100;
const COALESCE_WINDOW_MS = 1000;

interface Data {
  workspace: Workspace;
  load: LoadState;
  save: SaveState;
  past: Workspace[];
  future: Workspace[];
  lastEdit: { key: string; at: number } | null;
}

export interface WorkspaceState extends Data {
  dispatch: (command: WorkspaceCommand, options?: DispatchOptions) => DomainError | null;
  undo: () => void;
  redo: () => void;
  replace: (workspace: Workspace) => void;
  setLoad: (load: LoadState) => void;
  setSave: (save: SaveState) => void;
}

const initialData = (): Data => ({
  workspace: createWorkspace(),
  load: { kind: 'loading' },
  save: { kind: 'idle' },
  past: [],
  future: [],
  lastEdit: null,
});

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...initialData(),
  dispatch: (command, options = {}) => {
    const state = get();
    const result = apply(state.workspace, command);
    if (!result.ok) return result.error;
    const now = Date.now();
    const key = options.coalesceKey;
    const coalesce = key !== undefined && state.lastEdit?.key === key && now - state.lastEdit.at < COALESCE_WINDOW_MS;
    set({
      workspace: result.value,
      past: coalesce ? state.past : [...state.past, state.workspace].slice(-HISTORY_LIMIT),
      future: [],
      lastEdit: key === undefined ? null : { key, at: now },
    });
    return null;
  },
  undo: () => {
    const { past, workspace, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({ workspace: previous, past: past.slice(0, -1), future: [workspace, ...future], lastEdit: null });
  },
  redo: () => {
    const { past, workspace, future } = get();
    const [next, ...rest] = future;
    if (!next) return;
    set({ workspace: next, past: [...past, workspace], future: rest, lastEdit: null });
  },
  replace: (workspace) => set({ workspace, past: [], future: [], lastEdit: null }),
  setLoad: (load) => set({ load }),
  setSave: (save) => set({ save }),
}));

export const resetWorkspaceStore = (): void => useWorkspaceStore.setState(initialData());
```

`apps/web/src/store/hooks.ts`:
```ts
import { findRoom, type RoomLocation } from '@glasshouse/domain';
import { useMemo } from 'react';
import { useWorkspaceStore } from './workspaceStore';

export function useRoomLocation(roomId: string | null): RoomLocation | null {
  const workspace = useWorkspaceStore((s) => s.workspace);
  return useMemo(() => (roomId ? findRoom(workspace, roomId) : null), [workspace, roomId]);
}
```

`apps/web/src/storage/repository.ts`:
```ts
import type { Workspace } from '@glasshouse/domain';

/** The storage boundary. P1 replaces the browser implementation with an API client (ADR-0001). */
export interface Repository {
  load(): Promise<unknown | null>;
  save(workspace: Workspace): Promise<void>;
}
```

`apps/web/src/storage/idbRepository.ts`:
```ts
import { createStore, get, set } from 'idb-keyval';
import type { Repository } from './repository';

const KEY = 'current';

export function createIdbRepository(dbName = 'glasshouse'): Repository {
  const store = createStore(dbName, 'workspace');
  return {
    load: async () => (await get<unknown>(KEY, store)) ?? null,
    save: async (workspace) => {
      await set(KEY, workspace, store);
    },
  };
}

export const idbRepository = createIdbRepository();
```

`apps/web/src/storage/memoryRepository.ts`:
```ts
import type { Repository } from './repository';

export interface MemoryRepository extends Repository {
  saved: unknown | null;
  failNextSave(reason: string): void;
}

export function createMemoryRepository(initial: unknown | null = null): MemoryRepository {
  let failure: string | null = null;
  const repo: MemoryRepository = {
    saved: initial,
    load: () => Promise.resolve(repo.saved),
    save: (workspace) => {
      if (failure !== null) {
        const reason = failure;
        failure = null;
        return Promise.reject(new Error(reason));
      }
      repo.saved = workspace;
      return Promise.resolve();
    },
    failNextSave: (reason) => {
      failure = reason;
    },
  };
  return repo;
}
```

`apps/web/src/store/persistence.ts`:
```ts
import { createWorkspace, parseWorkspace } from '@glasshouse/domain';
import type { Repository } from '../storage/repository';
import { useWorkspaceStore } from './workspaceStore';

export const SAVE_DEBOUNCE_MS = 400;

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function hydrate(repo: Repository): Promise<void> {
  const store = useWorkspaceStore.getState();
  let raw: unknown;
  try {
    raw = await repo.load();
  } catch (error) {
    store.setLoad({ kind: 'failed', reason: `Couldn't read browser storage: ${describeError(error)}`, raw: null });
    return;
  }
  if (raw === null) {
    store.replace(createWorkspace());
    store.setLoad({ kind: 'ready' });
    return;
  }
  const parsed = parseWorkspace(raw);
  if (!parsed.ok) {
    store.setLoad({ kind: 'failed', reason: parsed.error.message, raw });
    return;
  }
  store.replace(parsed.value);
  store.setLoad({ kind: 'ready' });
}

export function startPersistence(repo: Repository, delayMs = SAVE_DEBOUNCE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = (): void => {
    timer = null;
    repo.save(useWorkspaceStore.getState().workspace).then(
      () => useWorkspaceStore.getState().setSave({ kind: 'saved', at: new Date() }),
      (error: unknown) => useWorkspaceStore.getState().setSave({ kind: 'failed', reason: describeError(error) }),
    );
  };
  const flush = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    save();
  };

  const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
    if (state.workspace === previous.workspace || state.load.kind !== 'ready') return;
    if (timer !== null) clearTimeout(timer);
    state.setSave({ kind: 'saving' });
    timer = setTimeout(save, delayMs);
  });
  window.addEventListener('pagehide', flush);

  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
```

`apps/web/src/app/RecoveryScreen.tsx`:
```tsx
import { createWorkspace } from '@glasshouse/domain';
import { useState } from 'react';
import type { Repository } from '../storage/repository';
import { useWorkspaceStore } from '../store/workspaceStore';

interface RecoveryScreenProps {
  reason: string;
  raw: unknown;
  repository: Repository;
}

export function RecoveryScreen({ reason, raw, repository }: RecoveryScreenProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = (): void => {
    const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `glasshouse-unreadable-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startFresh = async (): Promise<void> => {
    const fresh = createWorkspace();
    try {
      await repository.save(fresh);
    } catch (e) {
      setError(`Couldn't write a fresh workspace: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const store = useWorkspaceStore.getState();
    store.replace(fresh);
    store.setLoad({ kind: 'ready' });
  };

  return (
    <main className="recovery">
      <h1>Glasshouse couldn't open your saved workspace</h1>
      <p className="recovery__reason mono">{reason}</p>
      <p>Nothing has been deleted. Download the saved data first so it can be recovered, then start a fresh workspace if you need to keep working.</p>
      <div className="recovery__actions">
        <button type="button" className="btn" onClick={download} disabled={raw === null}>
          Download saved data
        </button>
        {confirming ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => void startFresh()}>
              Replace it with a fresh workspace
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Start a fresh workspace
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="recovery__error">
          {error}
        </p>
      ) : null}
    </main>
  );
}
```

Replace `apps/web/src/app/App.tsx`:
```tsx
import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { idbRepository } from '../storage/idbRepository';
import type { Repository } from '../storage/repository';
import { hydrate, startPersistence } from '../store/persistence';
import { useWorkspaceStore } from '../store/workspaceStore';
import { RecoveryScreen } from './RecoveryScreen';
import { routes } from './routes';

const router = createBrowserRouter(routes);

export function App({ repository = idbRepository }: { repository?: Repository }) {
  const load = useWorkspaceStore((s) => s.load);

  useEffect(() => {
    void hydrate(repository);
    return startPersistence(repository);
  }, [repository]);

  if (load.kind === 'loading') {
    return (
      <p className="app-loading" role="status">
        Opening your workspace…
      </p>
    );
  }
  if (load.kind === 'failed') return <RecoveryScreen reason={load.reason} raw={load.raw} repository={repository} />;
  return <RouterProvider router={router} />;
}
```

Append to `apps/web/src/app/shell.css`:
```css
.app-loading {
  margin: 72px auto;
  text-align: center;
  color: var(--ink-2);
}

.recovery {
  max-width: 64ch;
  margin: 72px auto;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.recovery h1 {
  font-size: 26px;
  font-weight: 700;
}

.recovery__reason {
  padding: 12px 14px;
  border: 1.5px solid var(--block);
  background: var(--block-bg);
  color: var(--block);
  font-size: 13px;
}

.recovery__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.recovery__error {
  color: var(--block);
  font-weight: 600;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): workspace store with undo, IndexedDB persistence and recovery screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Title block, project tree and room route

**Files:**
- Create: `apps/web/src/app/TitleBlock.tsx`, `apps/web/src/app/RoomScreen.tsx`, `apps/web/src/app/ViewTabs.tsx`, `apps/web/src/ui/ThemeToggle.tsx`, `apps/web/src/ui/StatusStamp.tsx`
- Create: `apps/web/src/features/tree/ProjectTree.tsx`, `apps/web/src/features/tree/TreeRow.tsx`, `apps/web/src/features/tree/InlineRename.tsx`, `apps/web/src/features/tree/tree.css`
- Modify: `apps/web/src/app/Shell.tsx`, `apps/web/src/app/routes.tsx`, `apps/web/src/app/shell.css`
- Test: `apps/web/src/features/tree/ProjectTree.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceStore`, `useRoomLocation`, `currentRevision`, `newId`, `WorkspaceCommand`, `RevisionState`.
- Produces: `routes` now include `rooms/:roomId` (redirects to `plan`) and `rooms/:roomId/:view` → `RoomScreen`. `ViewTabs({ roomId })`, `STATE_LABEL: Record<RevisionState, string>`, `StatusStamp({ state })`, `pad2(n)`. `RoomScreen` renders `<PlanView location={...} />` from Task 14; until then it renders an empty `section` labelled "Room plan".

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/tree/ProjectTree.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import { routes } from '../../app/routes';
import { resetWorkspaceStore, useWorkspaceStore } from '../../store/workspaceStore';

beforeEach(() => {
  resetWorkspaceStore();
  useWorkspaceStore.getState().setLoad({ kind: 'ready' });
});

it('creates Project → Site → Room and opens the room', async () => {
  const user = userEvent.setup();
  const router = createMemoryRouter(routes);
  render(<RouterProvider router={router} />);

  await user.click(screen.getByRole('button', { name: 'New project' }));
  expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
  await user.keyboard('Northgate{Enter}');
  await user.click(screen.getByRole('button', { name: 'Add site to Northgate' }));
  expect(screen.getByRole('textbox', { name: 'Site name' })).toHaveFocus();
  await user.keyboard('Site A{Enter}');
  await user.click(screen.getByRole('button', { name: 'Add room to Site A' }));
  expect(screen.getByRole('textbox', { name: 'Room name' })).toHaveFocus();
  await user.keyboard('MDF-1{Enter}');

  expect(router.state.location.pathname).toMatch(/^\/rooms\/.+\/plan$/);
  expect(screen.getByRole('link', { name: /MDF-1/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('R01 DRAFT')).toBeInTheDocument();
});

it('shows rename errors inline and deletes after confirmation', async () => {
  const user = userEvent.setup();
  useWorkspaceStore.getState().dispatch({ type: 'project/create', id: 'p', name: 'Northgate' });
  render(<RouterProvider router={createMemoryRouter(routes)} />);

  await user.click(screen.getByRole('button', { name: 'Rename Northgate' }));
  const input = screen.getByRole('textbox', { name: 'Project name' });
  await user.clear(input);
  await user.keyboard('{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent("Project name can't be empty.");
  await user.keyboard('{Escape}');

  await user.click(screen.getByRole('button', { name: 'Delete Northgate' }));
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.queryByText('Northgate')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, no "New project" button.

- [ ] **Step 3: Implement**

`apps/web/src/ui/StatusStamp.tsx`:
```tsx
import type { RevisionState } from '@glasshouse/domain';

export const STATE_LABEL: Record<RevisionState, string> = { draft: 'DRAFT', in_review: 'IN REVIEW', approved: 'APPROVED' };

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function StatusStamp({ state }: { state: RevisionState }) {
  return <span className={`status-stamp status-stamp--${state}`}>{STATE_LABEL[state]}</span>;
}
```

`apps/web/src/ui/ThemeToggle.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from './theme';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  useEffect(() => applyThemeChoice(choice), [choice]);
  return (
    <button type="button" className="btn btn--sm btn--quiet" onClick={() => setChoice(NEXT[choice])} aria-label={`Theme: ${LABEL[choice]}. Change theme`}>
      Theme · {LABEL[choice]}
    </button>
  );
}
```

`apps/web/src/app/TitleBlock.tsx`:
```tsx
import { currentRevision } from '@glasshouse/domain';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useRoomLocation } from '../store/hooks';
import { useWorkspaceStore, type SaveState } from '../store/workspaceStore';
import { GlasshouseMark } from '../ui/icons';
import { pad2, StatusStamp } from '../ui/StatusStamp';
import { ThemeToggle } from '../ui/ThemeToggle';

function Cell({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="title-block__cell">
      <dt className="lbl">{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{children}</dd>
    </div>
  );
}

const time = (d: Date): string => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function SaveStatus({ save }: { save: SaveState }) {
  switch (save.kind) {
    case 'idle':
      return <span className="save-status">Stored in this browser</span>;
    case 'saving':
      return <span className="save-status">Saving…</span>;
    case 'saved':
      return <span className="save-status">Saved in this browser · {time(save.at)}</span>;
    case 'failed':
      return (
        <span className="save-status save-status--failed" role="alert">
          Couldn't save: {save.reason}
        </span>
      );
  }
}

export function TitleBlock({ roomId }: { roomId: string | null }) {
  const location = useRoomLocation(roomId);
  const save = useWorkspaceStore((s) => s.save);
  const revision = location ? currentRevision(location.room.plan) : null;
  return (
    <header className="title-block">
      <Link to="/" className="title-block__mark">
        <GlasshouseMark />
        <span>Glasshouse</span>
      </Link>
      <dl className="title-block__cells">
        <Cell label="Project">
          {location?.project.name ?? '—'}
          {location?.project.isSample ? <span className="stamp">SAMPLE</span> : null}
        </Cell>
        <Cell label="Site">{location?.site.name ?? '—'}</Cell>
        <Cell label="Room">{location?.room.name ?? '—'}</Cell>
        <Cell label="Rev" mono>
          {revision ? pad2(revision.number) : '—'}
        </Cell>
        <Cell label="Status">{revision ? <StatusStamp state={revision.state} /> : '—'}</Cell>
      </dl>
      <div className="title-block__actions">
        <SaveStatus save={save} />
        <ThemeToggle />
      </div>
    </header>
  );
}
```

`apps/web/src/features/tree/InlineRename.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';

interface InlineRenameProps {
  label: string;
  initial: string;
  onCommit: (name: string) => string | null;
  onDone: () => void;
}

export function InlineRename({ label, initial, onCommit, onDone }: InlineRenameProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (): void => {
    finished.current = true;
    onDone();
  };
  const commit = (): void => {
    if (finished.current) return;
    const problem = onCommit(value);
    if (problem) {
      setError(problem);
      return;
    }
    finish();
  };

  return (
    <div className="inline-rename">
      <input
        ref={ref}
        aria-label={label}
        value={value}
        aria-invalid={error !== null}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish();
          }
        }}
        onBlur={commit}
      />
      {error ? (
        <p className="inline-rename__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`apps/web/src/features/tree/TreeRow.tsx`:
```tsx
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { IconPencil, IconPlus, IconTrash } from '../../ui/icons';
import { InlineRename } from './InlineRename';

const KIND_LABEL = { project: 'Project', site: 'Site', room: 'Room' } as const;

interface TreeRowProps {
  kind: keyof typeof KIND_LABEL;
  label: string;
  to?: string;
  active?: boolean;
  badge?: ReactNode;
  editing: boolean;
  onStartEdit: () => void;
  onRename: (name: string) => string | null;
  onStopEdit: () => void;
  onAdd?: () => void;
  addLabel?: string;
  onDelete: () => void;
  deleteWarning: string;
  children?: ReactNode;
}

export function TreeRow(props: TreeRowProps) {
  const { kind, label, to, active = false, badge, editing, onAdd, addLabel, children } = props;
  const [confirming, setConfirming] = useState(false);

  let line: ReactNode;
  if (editing) {
    line = <InlineRename label={`${KIND_LABEL[kind]} name`} initial={label} onCommit={props.onRename} onDone={props.onStopEdit} />;
  } else if (confirming) {
    line = (
      <div className="tree-row__confirm" role="group" aria-label={`Confirm deleting ${label}`}>
        <span>{props.deleteWarning}</span>
        <span className="tree-row__confirm-actions">
          <button type="button" className="btn btn--sm btn--danger" onClick={() => { setConfirming(false); props.onDelete(); }}>
            Delete
          </button>
          <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </span>
      </div>
    );
  } else {
    line = (
      <div className="tree-row__line">
        {to ? (
          <Link to={to} className={`tree-row__label${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <span className="tree-row__name">{label}</span>
            {badge}
          </Link>
        ) : (
          <span className="tree-row__label tree-row__label--group">
            <span className="tree-row__name">{label}</span>
          </span>
        )}
        <span className="tree-row__actions">
          {onAdd && addLabel ? (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={addLabel} title={addLabel} onClick={onAdd}>
              <IconPlus />
            </button>
          ) : null}
          <button type="button" className="icon-btn icon-btn--sm" aria-label={`Rename ${label}`} title="Rename" onClick={props.onStartEdit}>
            <IconPencil />
          </button>
          <button type="button" className="icon-btn icon-btn--sm" aria-label={`Delete ${label}`} title="Delete" onClick={() => setConfirming(true)}>
            <IconTrash />
          </button>
        </span>
      </div>
    );
  }

  return (
    <li className={`tree-row tree-row--${kind}`}>
      {line}
      {children}
    </li>
  );
}
```

`apps/web/src/features/tree/ProjectTree.tsx`:
```tsx
import { currentRevision, newId, type WorkspaceCommand } from '@glasshouse/domain';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { IconPlus } from '../../ui/icons';
import { pad2, STATE_LABEL } from '../../ui/StatusStamp';
import { TreeRow } from './TreeRow';
import './tree.css';

export function ProjectTree({ activeRoomId }: { activeRoomId: string | null }) {
  const projects = useWorkspaceStore((s) => s.workspace.projects);
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (command: WorkspaceCommand): boolean => {
    const problem = dispatch(command);
    setError(problem?.message ?? null);
    return problem === null;
  };
  const rename = (command: WorkspaceCommand): string | null => dispatch(command)?.message ?? null;
  const editing = (id: string) => ({
    editing: editingId === id,
    onStartEdit: () => setEditingId(id),
    onStopEdit: () => setEditingId(null),
  });

  const addProject = (): void => {
    const id = newId();
    if (run({ type: 'project/create', id, name: 'Untitled project' })) setEditingId(id);
  };

  return (
    <aside className="tree" aria-label="Projects">
      <div className="tree__head">
        <h2>Projects</h2>
        <button type="button" className="icon-btn" aria-label="New project" title="New project" onClick={addProject}>
          <IconPlus />
        </button>
      </div>
      {projects.length === 0 ? <p className="tree__empty">No projects yet.</p> : null}
      <ul className="tree__list">
        {projects.map((project) => (
          <TreeRow
            key={project.id}
            kind="project"
            label={project.name}
            {...editing(project.id)}
            onRename={(name) => rename({ type: 'project/rename', projectId: project.id, name })}
            onAdd={() => {
              const id = newId();
              if (run({ type: 'site/create', projectId: project.id, id, name: 'New site' })) setEditingId(id);
            }}
            addLabel={`Add site to ${project.name}`}
            onDelete={() => {
              const hadActive = project.sites.some((s) => s.rooms.some((r) => r.id === activeRoomId));
              if (run({ type: 'project/delete', projectId: project.id }) && hadActive) navigate('/');
            }}
            deleteWarning={`Delete ${project.name} and all its sites and rooms?`}
          >
            {project.sites.length > 0 ? (
              <ul className="tree__list">
                {project.sites.map((site) => (
                  <TreeRow
                    key={site.id}
                    kind="site"
                    label={site.name}
                    {...editing(site.id)}
                    onRename={(name) => rename({ type: 'site/rename', siteId: site.id, name })}
                    onAdd={() => {
                      const id = newId();
                      if (run({ type: 'room/create', siteId: site.id, id, name: 'New room' })) {
                        setEditingId(id);
                        navigate(`/rooms/${id}/plan`);
                      }
                    }}
                    addLabel={`Add room to ${site.name}`}
                    onDelete={() => {
                      const hadActive = site.rooms.some((r) => r.id === activeRoomId);
                      if (run({ type: 'site/delete', siteId: site.id }) && hadActive) navigate('/');
                    }}
                    deleteWarning={`Delete ${site.name} and its rooms?`}
                  >
                    {site.rooms.length > 0 ? (
                      <ul className="tree__list">
                        {site.rooms.map((room) => {
                          const revision = currentRevision(room.plan);
                          return (
                            <TreeRow
                              key={room.id}
                              kind="room"
                              label={room.name}
                              to={`/rooms/${room.id}/plan`}
                              active={room.id === activeRoomId}
                              badge={<span className="stamp">{`R${pad2(revision.number)} ${STATE_LABEL[revision.state]}`}</span>}
                              {...editing(room.id)}
                              onRename={(name) => rename({ type: 'room/rename', roomId: room.id, name })}
                              onDelete={() => {
                                if (run({ type: 'room/delete', roomId: room.id }) && room.id === activeRoomId) navigate('/');
                              }}
                              deleteWarning={`Delete ${room.name} and its plan?`}
                            />
                          );
                        })}
                      </ul>
                    ) : null}
                  </TreeRow>
                ))}
              </ul>
            ) : null}
          </TreeRow>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="tree__error">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
```

`apps/web/src/features/tree/tree.css`:
```css
.tree {
  flex: 0 0 272px;
  min-height: 0;
  overflow-y: auto;
  background: var(--sheet);
  border-right: 1px solid var(--rule);
  padding: 12px 8px 20px;
}

.tree__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 6px 10px 8px;
}

.tree__head h2 {
  font-size: 15px;
  font-weight: 700;
}

.tree__empty {
  padding: 4px 8px;
  font-size: 14px;
  color: var(--ink-2);
}

.tree__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree__list .tree__list {
  padding-left: 16px;
}

.tree-row__line {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 34px;
  border-radius: var(--radius);
}

.tree-row__line:hover {
  background: var(--hover);
}

.tree-row__label {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  border-radius: var(--radius);
  color: var(--ink);
  text-decoration: none;
  font-size: 14px;
}

.tree-row--project > .tree-row__line .tree-row__name {
  font-weight: 700;
}

.tree-row--site > .tree-row__line .tree-row__name {
  font-weight: 600;
}

.tree-row__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-row__label.is-active {
  background: var(--ink);
  color: var(--sheet);
}

.tree-row__label .stamp {
  color: var(--ink-2);
}

.tree-row__label.is-active .stamp {
  color: var(--sheet);
}

.tree-row__actions {
  display: flex;
  opacity: 0;
  transition: opacity var(--duration-fast) ease-out;
}

.tree-row__line:hover .tree-row__actions,
.tree-row__line:focus-within .tree-row__actions {
  opacity: 1;
}

.tree-row__confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
  padding: 10px;
  border: 1.25px solid var(--block);
  background: var(--block-bg);
  font-size: 13px;
}

.tree-row__confirm-actions {
  display: flex;
  gap: 6px;
}

.inline-rename input {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1.5px solid var(--ink);
  border-radius: var(--radius);
  background: var(--film);
  font-size: 14px;
}

.inline-rename__error,
.tree__error {
  margin: 4px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--block);
}
```

`apps/web/src/app/ViewTabs.tsx`:
```tsx
import { NavLink } from 'react-router';

const VIEWS = [{ id: 'plan', label: 'Plan' }] as const;

export function ViewTabs({ roomId }: { roomId: string }) {
  return (
    <nav className="view-tabs" aria-label="Room views">
      {VIEWS.map((v) => (
        <NavLink key={v.id} to={`/rooms/${roomId}/${v.id}`} className={({ isActive }) => `view-tab${isActive ? ' is-active' : ''}`}>
          {v.label}
        </NavLink>
      ))}
      <span className="view-tabs__meta">Grid 0.50 m · snap 0.10 m</span>
    </nav>
  );
}
```

`apps/web/src/app/RoomScreen.tsx`:
```tsx
import { useParams } from 'react-router';
import { useRoomLocation } from '../store/hooks';
import { NotFound } from './NotFound';
import { ViewTabs } from './ViewTabs';

export function RoomScreen() {
  const { roomId = '', view = 'plan' } = useParams();
  const location = useRoomLocation(roomId);
  if (!location) return <NotFound message="This room isn't in this browser's workspace." />;
  return (
    <div className="room-screen">
      <ViewTabs roomId={roomId} />
      {view === 'plan' ? (
        <section className="room-screen__body" aria-label="Room plan" />
      ) : (
        <NotFound message="That view doesn't exist for this room." />
      )}
    </div>
  );
}
```

Replace `apps/web/src/app/Shell.tsx`:
```tsx
import type { KeyboardEvent } from 'react';
import { Outlet, useMatch } from 'react-router';
import { ProjectTree } from '../features/tree/ProjectTree';
import { useWorkspaceStore } from '../store/workspaceStore';
import { TitleBlock } from './TitleBlock';
import './shell.css';

const isTextEntry = (target: EventTarget): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function Shell() {
  const match = useMatch('/rooms/:roomId/*');
  const roomId = match?.params.roomId ?? null;
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (isTextEntry(e.target) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  };

  return (
    <div className="shell" onKeyDown={onKeyDown}>
      <TitleBlock roomId={roomId} />
      <div className="shell__body">
        <ProjectTree activeRoomId={roomId} />
        <main className="shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

Replace `apps/web/src/app/routes.tsx`:
```tsx
import { Navigate, type RouteObject } from 'react-router';
import { Home } from './Home';
import { NotFound } from './NotFound';
import { RoomScreen } from './RoomScreen';
import { Shell } from './Shell';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'rooms/:roomId', element: <Navigate to="plan" replace /> },
      { path: 'rooms/:roomId/:view', element: <RoomScreen /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
```

Append to `apps/web/src/app/shell.css`:
```css
.title-block__cells {
  flex: 1 1 560px;
  display: flex;
  flex-wrap: wrap;
  margin: 0;
}

.title-block__cell {
  padding: 9px 16px;
  border-right: 1px solid var(--rule);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.title-block__cell dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
}

.title-block__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
}

.save-status {
  font-size: 13px;
  color: var(--ink-2);
}

.save-status--failed {
  color: var(--block);
  font-weight: 600;
}

.status-stamp {
  font-family: var(--font-cond);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.12em;
  padding: 1px 8px;
  border: 1.75px solid var(--ink);
}

.status-stamp--in_review {
  background: repeating-linear-gradient(45deg, transparent 0 4px, var(--rule) 4px 5px);
}

.status-stamp--approved {
  background: var(--ink);
  color: var(--sheet);
}

.room-screen {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.room-screen__body {
  flex: 1;
  min-height: 0;
}

.view-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 0 20px;
  background: var(--sheet);
  border-bottom: 1px solid var(--rule);
}

.view-tab {
  display: inline-flex;
  align-items: center;
  height: 44px;
  border-bottom: 2px solid transparent;
  color: var(--ink-2);
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
}

.view-tab:hover {
  color: var(--ink);
}

.view-tab.is-active {
  color: var(--ink);
  border-bottom-color: var(--ink);
}

.view-tabs__meta {
  margin-left: auto;
  font-size: 13px;
  color: var(--ink-2);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): title block, project tree and room route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Pointer-anchored viewport

**Files:**
- Create: `apps/web/src/viewport/math.ts`, `apps/web/src/viewport/useViewport.ts`
- Test: `apps/web/src/viewport/math.test.ts`

**Interfaces:**
- Consumes: `Point` from domain.
- Produces: `View { scale; tx; ty }` (screen = world × scale + t), `MIN_SCALE = 20`, `MAX_SCALE = 1200`, `toScreen(view, p)`, `toWorld(view, p)`, `zoomAt(view, factor, sx, sy)`, `pan(view, dx, dy)`, `fit(content, size, padding?)`, `wheelZoomFactor(deltaY, deltaMode)`; `useViewport(content: { w; d })` → `ViewportApi { svgRef; size; view; clientToWorld(clientX, clientY): Point; zoomBy(factor); fitToContent(); panBy(dx, dy) }`. Plain wheel pans (trackpad two-finger scroll); Ctrl/⌘ + wheel or pinch zooms around the pointer; a line-mode wheel (`deltaMode !== 0`, typical mouse) also zooms.

- [ ] **Step 1: Write the failing test**

`apps/web/src/viewport/math.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fit, MAX_SCALE, pan, toScreen, toWorld, wheelZoomFactor, zoomAt } from './math';

describe('viewport math', () => {
  const view = { scale: 100, tx: 50, ty: 20 };

  it('converts between world and screen', () => {
    expect(toScreen(view, [1, 2])).toEqual([150, 220]);
    expect(toWorld(view, [150, 220])).toEqual([1, 2]);
  });

  it('keeps the world point under the pointer while zooming', () => {
    const before = toWorld(view, [300, 200]);
    const zoomed = zoomAt(view, 1.8, 300, 200);
    const after = toWorld(zoomed, [300, 200]);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(zoomed.scale).toBeCloseTo(180);
  });

  it('clamps zoom', () => {
    expect(zoomAt(view, 1000, 0, 0).scale).toBe(MAX_SCALE);
  });

  it('pans and fits content centred with padding', () => {
    expect(pan(view, 10, -5)).toEqual({ scale: 100, tx: 60, ty: 15 });
    const f = fit({ w: 5, d: 4 }, { width: 1000, height: 700 }, 64);
    expect(f.scale).toBeCloseTo(143);
    expect(f.tx).toBeCloseTo((1000 - 5 * 143) / 2);
  });

  it('turns wheel deltas into zoom factors', () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(3, 1)).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./math`.

- [ ] **Step 3: Implement**

`apps/web/src/viewport/math.ts`:
```ts
import type { Point } from '@glasshouse/domain';

/** screen = world × scale + t, with scale in px per metre. */
export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_SCALE = 20;
export const MAX_SCALE = 1200;
const WHEEL_SENSITIVITY = 0.01;
const LINE_HEIGHT_PX = 16;

const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export const toScreen = (v: View, [x, y]: Point): Point => [x * v.scale + v.tx, y * v.scale + v.ty];
export const toWorld = (v: View, [sx, sy]: Point): Point => [(sx - v.tx) / v.scale, (sy - v.ty) / v.scale];

export function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const scale = clampScale(v.scale * factor);
  const k = scale / v.scale;
  return { scale, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k };
}

export const pan = (v: View, dx: number, dy: number): View => ({ ...v, tx: v.tx + dx, ty: v.ty + dy });

export function fit(content: { w: number; d: number }, size: { width: number; height: number }, padding = 64): View {
  const scale = clampScale(Math.min((size.width - 2 * padding) / content.w, (size.height - 2 * padding) / content.d));
  return { scale, tx: (size.width - content.w * scale) / 2, ty: (size.height - content.d * scale) / 2 };
}

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaY;
  return Math.exp(-px * WHEEL_SENSITIVITY);
}
```

`apps/web/src/viewport/useViewport.ts`:
```ts
import type { Point } from '@glasshouse/domain';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { fit, pan, toWorld, wheelZoomFactor, zoomAt, type View } from './math';

export interface ViewportApi {
  svgRef: RefObject<SVGSVGElement | null>;
  size: { width: number; height: number };
  view: View;
  clientToWorld: (clientX: number, clientY: number) => Point;
  zoomBy: (factor: number) => void;
  fitToContent: () => void;
  panBy: (dx: number, dy: number) => void;
}

export function useViewport(content: { w: number; d: number }): ViewportApi {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ scale: 100, tx: 0, ty: 0 });
  const fitted = useRef(false);
  const { w, d } = content;

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (fitted.current || size.width === 0 || size.height === 0) return;
    fitted.current = true;
    setView(fit({ w, d }, size));
  }, [size, w, d]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey || e.deltaMode !== 0) setView((v) => zoomAt(v, wheelZoomFactor(e.deltaY, e.deltaMode), sx, sy));
      else setView((v) => pan(v, -e.deltaX, -e.deltaY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      return toWorld(view, [clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0)]);
    },
    [view],
  );

  return {
    svgRef,
    size,
    view,
    clientToWorld,
    zoomBy: (factor) => setView((v) => zoomAt(v, factor, size.width / 2, size.height / 2)),
    fitToContent: () => setView(fit({ w, d }, size)),
    panBy: (dx, dy) => setView((v) => pan(v, dx, dy)),
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): pointer-anchored pan and zoom viewport with trackpad gestures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Plan canvas rendering

**Files:**
- Create: `apps/web/src/features/plan/svgPath.ts`, `apps/web/src/features/plan/layers.tsx`, `apps/web/src/features/plan/PlanCanvas.tsx`, `apps/web/src/features/plan/PlanView.tsx`, `apps/web/src/features/plan/ZoomControls.tsx`, `apps/web/src/features/plan/labels.ts`, `apps/web/src/features/plan/plan.css`
- Modify: `apps/web/src/app/RoomScreen.tsx`
- Test: `apps/web/src/features/plan/PlanCanvas.test.tsx`

**Interfaces:**
- Consumes: `footprintOf`, `placementPolygon`, `centerOf`, `clearanceZones`, `frontEdge`, `localToWorld`, `formatMetres`, `checkPlan`, `currentRevision`, `Issue`, `PlanContent`, `RoomObject`, `RoomLocation`; `ViewportApi`, `toScreen`.
- Produces: `TYPE_LABEL: Record<RoomObjectType, string>`; `polygonPath(poly, view)`, `multiPolygonPath(shape, view)`; layer components `HatchDefs`, `GridLayer`, `FootprintLayer`, `ClearanceLayer`, `ObjectsLayer`, `SelectionLayer`, `DimensionsLayer`, `FloorPreview`; `Preview` type (`{ kind: 'object'; id; patch: { x; y; w?; d? } } | { kind: 'rect'; mode: 'area' | 'cut'; x; y; w; d }`); `PlanCanvas` props `{ content; issues; selectedId; viewport; preview; cursor; svgHandlers?; onFocusObject }`; `PlanView({ location })`; `ZoomControls({ viewport })`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/plan/PlanCanvas.test.tsx`:
```tsx
import { createObject, emptyContent, type PlanContent, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';

function Harness({ content }: { content: PlanContent }) {
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length });
  return <PlanCanvas content={content} issues={[]} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />;
}

it('draws the footprint and labels racks with name and capacity', () => {
  const base = emptyContent();
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), name: 'RK-01' };
  render(<Harness content={{ ...base, objects: [rack] }} />);
  expect(screen.getByTestId('footprint').getAttribute('d')).toMatch(/^M/);
  expect(screen.getByRole('button', { name: 'RK-01, Rack' })).toBeInTheDocument();
  expect(screen.getByText('42U')).toBeInTheDocument();
  expect(screen.getByText('5.00')).toBeInTheDocument();
  expect(screen.getByText('4.00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./PlanCanvas`.

- [ ] **Step 3: Implement**

`apps/web/src/features/plan/labels.ts`:
```ts
import type { RoomObjectType } from '@glasshouse/domain';

export const TYPE_LABEL: Record<RoomObjectType, string> = {
  rack: 'Rack',
  existing_rack: 'Existing rack',
  door: 'Door',
  mcb: 'MCB panel',
  furniture: 'Furniture',
};
```

`apps/web/src/features/plan/svgPath.ts`:
```ts
import type { MultiPoly, Poly } from '@glasshouse/domain';
import { toScreen, type View } from '../../viewport/math';

export function polygonPath(poly: Poly, view: View): string {
  return poly
    .map(
      (ring) =>
        ring
          .map((pt, i) => {
            const [x, y] = toScreen(view, pt);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ') + ' Z',
    )
    .join(' ');
}

export const multiPolygonPath = (shape: MultiPoly, view: View): string => shape.map((p) => polygonPath(p, view)).join(' ');
```

`apps/web/src/features/plan/layers.tsx`:
```tsx
import {
  centerOf,
  clearanceZones,
  footprintOf,
  formatMetres,
  frontEdge,
  localToWorld,
  placementPolygon,
  type Point,
  type RoomObject,
  type Survey,
} from '@glasshouse/domain';
import { useMemo, type ReactElement } from 'react';
import { toScreen, type View } from '../../viewport/math';
import { TYPE_LABEL } from './labels';
import { polygonPath, multiPolygonPath } from './svgPath';

const GRID_STEP_M = 0.5;
const MIN_LABEL_PX = 34;
const DIM_OFFSET_PX = 28;

export type Preview =
  | { kind: 'object'; id: string; patch: { x: number; y: number; w?: number; d?: number } }
  | { kind: 'rect'; mode: 'area' | 'cut'; x: number; y: number; w: number; d: number };

export function HatchDefs() {
  return (
    <defs>
      <pattern id="gh-hatch-clearance" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" className="hatch-fill" />
        <path d="M0 0V7" className="hatch-line hatch-line--clearance" />
      </pattern>
      <pattern id="gh-hatch-cut" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <path d="M0 0V6" className="hatch-line" />
      </pattern>
    </defs>
  );
}

export function GridLayer({ survey, view }: { survey: Survey; view: View }) {
  const lines: ReactElement[] = [];
  const cols = Math.floor(survey.width / GRID_STEP_M + 1e-9);
  const rows = Math.floor(survey.length / GRID_STEP_M + 1e-9);
  const [x0, y0] = toScreen(view, [0, 0]);
  const [x1, y1] = toScreen(view, [survey.width, survey.length]);
  for (let i = 0; i <= cols; i += 1) {
    const [sx] = toScreen(view, [i * GRID_STEP_M, 0]);
    lines.push(<line key={`v${i}`} x1={sx} y1={y0} x2={sx} y2={y1} className={i % 2 === 0 ? 'grid grid--major' : 'grid'} />);
  }
  for (let j = 0; j <= rows; j += 1) {
    const [, sy] = toScreen(view, [0, j * GRID_STEP_M]);
    lines.push(<line key={`h${j}`} x1={x0} y1={sy} x2={x1} y2={sy} className={j % 2 === 0 ? 'grid grid--major' : 'grid'} />);
  }
  return (
    <g aria-hidden="true">
      {lines}
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="canvas-bounds" />
    </g>
  );
}

export function FootprintLayer({ survey, view }: { survey: Survey; view: View }) {
  const fp = useMemo(() => footprintOf(survey), [survey]);
  return (
    <g aria-hidden="true">
      <path data-testid="footprint" className="footprint" d={multiPolygonPath(fp, view)} fillRule="evenodd" />
      {survey.cutOuts.map((r) => {
        const [x, y] = toScreen(view, [r.x, r.y]);
        return <rect key={r.id} className="cut-out" x={x} y={y} width={r.w * view.scale} height={r.d * view.scale} />;
      })}
    </g>
  );
}

export function ClearanceLayer({ objects, view }: { objects: RoomObject[]; view: View }) {
  return (
    <g aria-hidden="true">
      {objects.flatMap((o) => {
        if (o.type !== 'rack') return [];
        const zones = clearanceZones(o);
        return (['front', 'rear'] as const).flatMap((side) => {
          const zone = zones[side];
          return zone ? [<path key={`${o.id}-${side}`} className="clearance" d={polygonPath(zone, view)} />] : [];
        });
      })}
    </g>
  );
}

function RackFront({ rack, view }: { rack: RoomObject; view: View }) {
  const [a, b] = frontEdge(rack).map((p) => toScreen(view, p)) as [Point, Point];
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const [ux, uy] = [ex / len, ey / len];
  const [nx, ny] = [-uy, ux];
  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const tip: Point = [mid[0] + nx * 8, mid[1] + ny * 8];
  const left: Point = [mid[0] + ux * 5 + nx * 2, mid[1] + uy * 5 + ny * 2];
  const right: Point = [mid[0] - ux * 5 + nx * 2, mid[1] - uy * 5 + ny * 2];
  return (
    <g aria-hidden="true">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="rack-front" />
      <path d={`M${left[0]} ${left[1]} L${tip[0]} ${tip[1]} L${right[0]} ${right[1]} Z`} className="rack-front-arrow" />
    </g>
  );
}

function crossPath(o: RoomObject, view: View): string {
  const [ring] = placementPolygon(o);
  if (!ring) return '';
  const [p0, p1, p2, p3] = ring.map((p) => toScreen(view, p));
  if (!p0 || !p1 || !p2 || !p3) return '';
  return `M${p0[0]} ${p0[1]} L${p2[0]} ${p2[1]} M${p1[0]} ${p1[1]} L${p3[0]} ${p3[1]}`;
}

interface ObjectsLayerProps {
  objects: RoomObject[];
  view: View;
  flagged: Set<string>;
  selectedId: string | null;
  onFocusObject: (id: string) => void;
}

export function ObjectsLayer({ objects, view, flagged, selectedId, onFocusObject }: ObjectsLayerProps) {
  return (
    <g>
      {objects.map((o) => {
        const [cx, cy] = toScreen(view, centerOf(o));
        const showLabel = Math.min(o.w, o.d) * view.scale >= MIN_LABEL_PX || Math.max(o.w, o.d) * view.scale >= MIN_LABEL_PX * 2;
        const classes = ['obj', `obj--${o.type}`, flagged.has(o.id) ? 'is-flagged' : '', o.id === selectedId ? 'is-selected' : ''].filter(Boolean).join(' ');
        return (
          <g
            key={o.id}
            role="button"
            tabIndex={0}
            aria-label={`${o.name}, ${TYPE_LABEL[o.type]}`}
            aria-pressed={o.id === selectedId}
            className={classes}
            data-object-id={o.id}
            onFocus={() => onFocusObject(o.id)}
          >
            <path className="obj__body" d={polygonPath(placementPolygon(o), view)} />
            {o.type === 'existing_rack' ? <path className="obj__cross" d={crossPath(o, view)} /> : null}
            {o.type === 'rack' ? <RackFront rack={o} view={view} /> : null}
            {showLabel ? (
              <text className="obj__label" x={cx} y={o.type === 'rack' ? cy - 7 : cy} textAnchor="middle" dominantBaseline="middle">
                {o.name}
              </text>
            ) : null}
            {showLabel && o.type === 'rack' ? (
              <text className="obj__sub" x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle">
                {o.owner === 'customer' ? 'CUST' : `${o.capacityU}U`}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

const HANDLE_POSITIONS = [
  ['nw', -1, -1],
  ['n', 0, -1],
  ['ne', 1, -1],
  ['e', 1, 0],
  ['se', 1, 1],
  ['s', 0, 1],
  ['sw', -1, 1],
  ['w', -1, 0],
] as const;

export function SelectionLayer({ object, view }: { object: RoomObject; view: View }) {
  return (
    <g>
      <path className="selection" d={polygonPath(placementPolygon(object), view)} />
      {HANDLE_POSITIONS.map(([handle, fx, fy]) => {
        const [sx, sy] = toScreen(view, localToWorld(object, [(fx * object.w) / 2, (fy * object.d) / 2]));
        return <rect key={handle} data-handle={handle} className={`handle handle--${handle}`} x={sx - 4.5} y={sy - 4.5} width={9} height={9} />;
      })}
    </g>
  );
}

export function DimensionsLayer({ survey, view }: { survey: Survey; view: View }) {
  const [x0, y0] = toScreen(view, [0, 0]);
  const [x1, y1] = toScreen(view, [survey.width, survey.length]);
  const top = y0 - DIM_OFFSET_PX;
  const left = x0 - DIM_OFFSET_PX;
  const tick = (x: number, y: number) => `M${x - 4} ${y + 4} L${x + 4} ${y - 4}`;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  return (
    <g aria-hidden="true">
      <path className="dim__ext" d={`M${x0} ${y0 - 4} V${top - 6} M${x1} ${y0 - 4} V${top - 6}`} />
      <path className="dim" d={`M${x0} ${top} H${x1} ${tick(x0, top)} ${tick(x1, top)}`} />
      <rect className="dim__bg" x={midX - 24} y={top - 9} width={48} height={18} />
      <text className="dim__label" x={midX} y={top} textAnchor="middle" dominantBaseline="middle">
        {formatMetres(survey.width)}
      </text>
      <path className="dim__ext" d={`M${x0 - 4} ${y0} H${left - 6} M${x0 - 4} ${y1} H${left - 6}`} />
      <path className="dim" d={`M${left} ${y0} V${y1} ${tick(left, y0)} ${tick(left, y1)}`} />
      <rect className="dim__bg" x={left - 9} y={midY - 24} width={18} height={48} />
      <text className="dim__label" x={left} y={midY} textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${left} ${midY})`}>
        {formatMetres(survey.length)}
      </text>
    </g>
  );
}

export function FloorPreview({ preview, view }: { preview: Extract<Preview, { kind: 'rect' }>; view: View }) {
  const [x, y] = toScreen(view, [preview.x, preview.y]);
  return (
    <g aria-hidden="true">
      <rect className={`preview preview--${preview.mode}`} x={x} y={y} width={preview.w * view.scale} height={preview.d * view.scale} />
      <text className="dim__label" x={x + (preview.w * view.scale) / 2} y={y - 10} textAnchor="middle">
        {`${formatMetres(preview.w)} × ${formatMetres(preview.d)}`}
      </text>
    </g>
  );
}
```

`apps/web/src/features/plan/PlanCanvas.tsx`:
```tsx
import type { Issue, PlanContent, RoomObject } from '@glasshouse/domain';
import { useMemo, type DOMAttributes } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import {
  ClearanceLayer,
  DimensionsLayer,
  FloorPreview,
  FootprintLayer,
  GridLayer,
  HatchDefs,
  ObjectsLayer,
  SelectionLayer,
  type Preview,
} from './layers';

export type SvgHandlers = Pick<
  DOMAttributes<SVGSVGElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onContextMenu'
>;

interface PlanCanvasProps {
  content: PlanContent;
  issues: Issue[];
  selectedId: string | null;
  viewport: ViewportApi;
  preview: Preview | null;
  cursor: string;
  svgHandlers?: SvgHandlers;
  onFocusObject: (id: string) => void;
}

const withPreview = (objects: RoomObject[], preview: Preview | null): RoomObject[] =>
  preview?.kind === 'object' ? objects.map((o) => (o.id === preview.id ? { ...o, ...preview.patch } : o)) : objects;

export function PlanCanvas({ content, issues, selectedId, viewport, preview, cursor, svgHandlers, onFocusObject }: PlanCanvasProps) {
  const { view } = viewport;
  const flagged = useMemo(() => new Set(issues.filter((i) => i.severity === 'block').flatMap((i) => i.targets)), [issues]);
  const objects = withPreview(content.objects, preview);
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  return (
    <svg
      ref={viewport.svgRef}
      className="plan-canvas"
      style={{ cursor }}
      tabIndex={0}
      aria-label="Room plan drawing. Tab moves between objects, arrow keys nudge, R rotates 45 degrees."
      {...svgHandlers}
    >
      <HatchDefs />
      <GridLayer survey={content.survey} view={view} />
      <FootprintLayer survey={content.survey} view={view} />
      <ClearanceLayer objects={objects} view={view} />
      <ObjectsLayer objects={objects} view={view} flagged={flagged} selectedId={selectedId} onFocusObject={onFocusObject} />
      {selected ? <SelectionLayer object={selected} view={view} /> : null}
      <DimensionsLayer survey={content.survey} view={view} />
      {preview?.kind === 'rect' ? <FloorPreview preview={preview} view={view} /> : null}
    </svg>
  );
}
```

`apps/web/src/features/plan/ZoomControls.tsx`:
```tsx
import type { ViewportApi } from '../../viewport/useViewport';
import { IconMinus, IconPlus } from '../../ui/icons';

const ZOOM_STEP = 1.25;

export function ZoomControls({ viewport }: { viewport: ViewportApi }) {
  return (
    <div className="zoom" role="group" aria-label="Zoom">
      <button type="button" className="tool" aria-label="Zoom out" onClick={() => viewport.zoomBy(1 / ZOOM_STEP)}>
        <IconMinus />
      </button>
      <span className="zoom__value mono" data-testid="zoom-value">
        {Math.round(viewport.view.scale)}%
      </span>
      <button type="button" className="tool" aria-label="Zoom in" onClick={() => viewport.zoomBy(ZOOM_STEP)}>
        <IconPlus />
      </button>
      <button type="button" className="zoom__fit" onClick={viewport.fitToContent}>
        Fit room
      </button>
    </div>
  );
}
```

`apps/web/src/features/plan/PlanView.tsx` (first version: rendering only; Task 15 adds tools and Task 17 adds checks):
```tsx
import { checkPlan, currentRevision, type RoomLocation } from '@glasshouse/domain';
import { useMemo } from 'react';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';
import { ZoomControls } from './ZoomControls';
import './plan.css';

export function PlanView({ location }: { location: RoomLocation }) {
  const content = currentRevision(location.room.plan).content;
  const issues = useMemo(() => checkPlan(content), [content]);
  const viewport = useViewport({ w: content.survey.width, d: content.survey.length });
  return (
    <div className="plan-view">
      <section className="plan-view__canvas" aria-label="Room plan">
        <PlanCanvas content={content} issues={issues} selectedId={null} viewport={viewport} preview={null} cursor="default" onFocusObject={() => {}} />
        <ZoomControls viewport={viewport} />
      </section>
    </div>
  );
}
```

In `apps/web/src/app/RoomScreen.tsx`, replace `<section className="room-screen__body" aria-label="Room plan" />` with `<PlanView location={location} />` and add `import { PlanView } from '../features/plan/PlanView';`.

`apps/web/src/features/plan/plan.css`:
```css
.plan-view {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  grid-template-rows: minmax(0, 1fr) auto;
}

.plan-view__canvas {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--film);
}

.plan-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  user-select: none;
  outline: none;
}

.hatch-fill {
  fill: var(--clearance-fill);
}

.hatch-line {
  stroke: var(--ink-2);
  stroke-width: 1;
}

.hatch-line--clearance {
  stroke: var(--clearance);
  opacity: 0.55;
}

.grid {
  stroke: var(--construct-minor);
  stroke-width: 1;
}

.grid--major {
  stroke: var(--construct);
}

.canvas-bounds {
  fill: none;
  stroke: var(--ink-2);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}

.footprint {
  fill: var(--sheet);
  fill-opacity: 0.72;
  stroke: var(--ink);
  stroke-width: 2.5;
  stroke-linejoin: miter;
}

.cut-out {
  fill: url(#gh-hatch-cut);
  stroke: var(--ink-2);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.clearance {
  fill: url(#gh-hatch-clearance);
  stroke: var(--clearance);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

.obj {
  cursor: pointer;
  outline: none;
}

.obj__body {
  fill: var(--sheet);
  stroke: var(--ink);
  stroke-width: 1.5;
  transition: fill var(--duration-fast) ease-out;
}

.obj:hover .obj__body {
  fill: var(--hover);
}

.obj--existing_rack .obj__body {
  stroke-dasharray: 6 2;
}

.obj--door .obj__body {
  fill: var(--film);
}

.obj__cross {
  stroke: var(--ink-2);
  stroke-width: 1;
}

.obj.is-flagged .obj__body {
  fill: var(--block-bg);
  stroke: var(--block);
  stroke-width: 2;
}

.obj:focus-visible .obj__body {
  stroke: var(--clearance);
  stroke-width: 2.5;
}

.obj__label,
.obj__sub {
  font-family: var(--font-mono);
  font-size: 12px;
  pointer-events: none;
}

.obj__label {
  font-weight: 600;
  fill: var(--ink);
}

.obj__sub {
  fill: var(--ink-2);
}

.obj.is-flagged .obj__label {
  fill: var(--block);
}

.rack-front {
  stroke: var(--ink);
  stroke-width: 4;
}

.rack-front-arrow {
  fill: var(--ink);
}

.selection {
  fill: none;
  stroke: var(--clearance);
  stroke-width: 1.25;
  stroke-dasharray: 5 3;
  pointer-events: none;
}

.handle {
  fill: var(--sheet);
  stroke: var(--clearance);
  stroke-width: 1.5;
}

.handle--n,
.handle--s {
  cursor: ns-resize;
}

.handle--e,
.handle--w {
  cursor: ew-resize;
}

.handle--ne,
.handle--sw {
  cursor: nesw-resize;
}

.handle--nw,
.handle--se {
  cursor: nwse-resize;
}

.dim {
  stroke: var(--ink);
  stroke-width: 1;
  fill: none;
}

.dim__ext {
  stroke: var(--ink-2);
  stroke-width: 0.75;
  fill: none;
}

.dim__bg {
  fill: var(--film);
}

.dim__label {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  fill: var(--ink);
}

.preview--area {
  fill: var(--clearance-fill);
  stroke: var(--ink);
  stroke-width: 1.5;
  stroke-dasharray: 6 3;
}

.preview--cut {
  fill: url(#gh-hatch-cut);
  stroke: var(--ink-2);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
}

.tool {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--ink);
}

.tool:hover {
  background: var(--hover);
}

.tool[aria-pressed='true'] {
  background: var(--ink);
  color: var(--sheet);
}

.zoom {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  background: var(--sheet);
  border: 1.25px solid var(--ink);
}

.zoom__value {
  min-width: 52px;
  text-align: center;
  font-size: 13px;
}

.zoom__fit {
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-left: 1px solid var(--rule);
  background: none;
  font-weight: 600;
  font-size: 13px;
}

.zoom__fit:hover {
  background: var(--hover);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Look at it**

Run: `pnpm dev`, create a Project → Site → Room, open `http://localhost:5173`. Confirm you see the footprint, the grid and the 5.00 / 4.00 dimension lines, that pinch and Ctrl+scroll zoom around the pointer, and that two-finger scroll pans.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): SVG plan canvas with footprint, clearance, objects and dimensions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Plan tools and gestures

**Files:**
- Create: `apps/web/src/features/plan/tools.ts`, `apps/web/src/features/plan/Toolbar.tsx`, `apps/web/src/features/plan/resize.ts`, `apps/web/src/features/plan/hitTest.ts`, `apps/web/src/features/plan/usePlanGestures.ts`
- Modify: `apps/web/src/features/plan/PlanView.tsx`, `apps/web/src/features/plan/plan.css`
- Test: `apps/web/src/features/plan/resize.test.ts`, `apps/web/src/features/plan/hitTest.test.ts`

**Interfaces:**
- Consumes: `createObject`, `newId`, `snapDrag`, `snapFloor`, `snapTyped`, `worldToLocal`, `localToWorld`, `topLeftForCenter`, `pointInPolygon`, `placementPolygon`, `PlanCommand`, `RoomObjectType`; `ViewportApi`; `Preview`.
- Produces: `Tool = 'select' | 'pan' | 'area' | 'cut' | RoomObjectType`, `TOOLS: ToolSpec[]`, `toolForKey(key)`; `Toolbar({ tool, onTool })`; `Handle`, `resizePlacement(p, handle, pointer, minSize?)`; `hitTest(objects, point)`; `usePlanGestures(args)` → `{ preview; cursor; message; svgHandlers; onKeyDown; onKeyUp }`; `CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/plan/resize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resizePlacement } from './resize';

describe('resizePlacement', () => {
  const square = { x: 1, y: 1, w: 1, d: 1, angle: 0 };

  it('drags the south-east corner', () => {
    expect(resizePlacement(square, 'se', [3, 2.5])).toEqual({ x: 1, y: 1, w: 2, d: 1.5 });
  });

  it('drags the west edge, keeping the east edge fixed', () => {
    expect(resizePlacement(square, 'w', [0.5, 1.5])).toEqual({ x: 0.5, y: 1, w: 1.5, d: 1 });
  });

  it('never collapses below the minimum size', () => {
    expect(resizePlacement(square, 'e', [0, 1.5]).w).toBe(0.1);
  });

  it('follows local axes on a rotated object', () => {
    const rotated = { x: 1, y: 1, w: 1, d: 2, angle: 90 };
    expect(resizePlacement(rotated, 'e', [2, 2.5])).toEqual({ x: 1, y: 1, w: 1.5, d: 2 });
  });
});
```

`apps/web/src/features/plan/hitTest.test.ts`:
```ts
import { createObject } from '@glasshouse/domain';
import { expect, it } from 'vitest';
import { hitTest } from './hitTest';

it('returns the topmost object under the point', () => {
  const below = { ...createObject('furniture', { x: 1, y: 1 }, []), name: 'below' };
  const above = { ...createObject('furniture', { x: 1.5, y: 1 }, []), name: 'above' };
  expect(hitTest([below, above], [1.8, 1.2])?.name).toBe('above');
  expect(hitTest([below, above], [1.1, 1.2])?.name).toBe('below');
  expect(hitTest([below, above], [4, 4])).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./resize`.

- [ ] **Step 3: Implement**

`apps/web/src/features/plan/resize.ts`:
```ts
import { localToWorld, snapDrag, snapTyped, topLeftForCenter, worldToLocal, type Placement, type Point } from '@glasshouse/domain';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_SIZE_M = 0.1;

export function resizePlacement(p: Placement, handle: Handle, pointer: Point, minSize = MIN_SIZE_M): { x: number; y: number; w: number; d: number } {
  const [lx, ly] = worldToLocal(p, pointer);
  let left = -p.w / 2;
  let right = p.w / 2;
  let top = -p.d / 2;
  let bottom = p.d / 2;
  if (handle.includes('e')) right = left + Math.max(minSize, snapDrag(lx - left));
  if (handle.includes('w')) left = right - Math.max(minSize, snapDrag(right - lx));
  if (handle.includes('s')) bottom = top + Math.max(minSize, snapDrag(ly - top));
  if (handle.includes('n')) top = bottom - Math.max(minSize, snapDrag(bottom - ly));
  const w = snapTyped(right - left);
  const d = snapTyped(bottom - top);
  const center = localToWorld(p, [(left + right) / 2, (top + bottom) / 2]);
  const [x, y] = topLeftForCenter(center, w, d, p.angle);
  return { x: snapTyped(x), y: snapTyped(y), w, d };
}
```

`apps/web/src/features/plan/hitTest.ts`:
```ts
import { placementPolygon, pointInPolygon, type Point, type RoomObject } from '@glasshouse/domain';

export function hitTest(objects: RoomObject[], point: Point): RoomObject | null {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const o = objects[i];
    if (o && pointInPolygon(point, placementPolygon(o))) return o;
  }
  return null;
}
```

`apps/web/src/features/plan/tools.ts`:
```ts
import type { RoomObjectType } from '@glasshouse/domain';
import type { ComponentType, SVGProps } from 'react';
import { IconArea, IconCut, IconDoor, IconExistingRack, IconFurniture, IconMcb, IconPan, IconRack, IconSelect } from '../../ui/icons';

export type Tool = 'select' | 'pan' | 'area' | 'cut' | RoomObjectType;

export interface ToolSpec {
  id: Tool;
  label: string;
  shortcut: string | null;
  group: 'navigate' | 'floor' | 'place';
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const TOOLS: ToolSpec[] = [
  { id: 'select', label: 'Select', shortcut: 'V', group: 'navigate', Icon: IconSelect },
  { id: 'pan', label: 'Pan', shortcut: 'H', group: 'navigate', Icon: IconPan },
  { id: 'area', label: 'Add floor area', shortcut: 'A', group: 'floor', Icon: IconArea },
  { id: 'cut', label: 'Cut out', shortcut: 'C', group: 'floor', Icon: IconCut },
  { id: 'rack', label: 'Place rack', shortcut: null, group: 'place', Icon: IconRack },
  { id: 'door', label: 'Place door', shortcut: null, group: 'place', Icon: IconDoor },
  { id: 'mcb', label: 'Place MCB panel', shortcut: null, group: 'place', Icon: IconMcb },
  { id: 'existing_rack', label: 'Place existing rack', shortcut: null, group: 'place', Icon: IconExistingRack },
  { id: 'furniture', label: 'Place furniture', shortcut: null, group: 'place', Icon: IconFurniture },
];

export const toolForKey = (key: string): Tool | null =>
  TOOLS.find((t) => t.shortcut !== null && t.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null;

export const isPlacementTool = (tool: Tool): tool is RoomObjectType =>
  tool !== 'select' && tool !== 'pan' && tool !== 'area' && tool !== 'cut';
```

`apps/web/src/features/plan/Toolbar.tsx`:
```tsx
import { Fragment } from 'react';
import { TOOLS, type Tool } from './tools';

export function Toolbar({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Plan tools" aria-orientation="vertical">
      {TOOLS.map((spec, i) => (
        <Fragment key={spec.id}>
          {i > 0 && TOOLS[i - 1]?.group !== spec.group ? <span className="toolbar__sep" aria-hidden="true" /> : null}
          <button
            type="button"
            className="tool"
            aria-pressed={tool === spec.id}
            aria-label={spec.label}
            title={spec.shortcut ? `${spec.label} (${spec.shortcut})` : spec.label}
            onClick={() => onTool(spec.id)}
          >
            <spec.Icon />
          </button>
        </Fragment>
      ))}
    </div>
  );
}
```

`apps/web/src/features/plan/usePlanGestures.ts`:
```ts
import { createObject, newId, snapDrag, snapFloor, type Id, type PlanCommand, type PlanContent, type Point } from '@glasshouse/domain';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ViewportApi } from '../../viewport/useViewport';
import { hitTest } from './hitTest';
import type { Preview } from './layers';
import type { SvgHandlers } from './PlanCanvas';
import { resizePlacement, type Handle } from './resize';
import { isPlacementTool, toolForKey, type Tool } from './tools';

export type CommitFn = (command: PlanCommand, coalesceKey?: string) => string | null;

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move'; id: Id; origin: Point; start: { x: number; y: number }; startClient: Point; dragging: boolean }
  | { kind: 'resize'; id: Id; handle: Handle }
  | { kind: 'rect'; mode: 'area' | 'cut'; origin: Point };

const DRAG_THRESHOLD_PX = 4;
const MESSAGE_MS = 4000;
const NUDGE_M = 0.1;
const FINE_NUDGE_M = 0.01;

interface Args {
  content: PlanContent;
  tool: Tool;
  setTool: (tool: Tool) => void;
  selectedId: Id | null;
  select: (id: Id | null) => void;
  viewport: ViewportApi;
  commit: CommitFn;
}

const snapPoint = ([x, y]: Point): Point => [snapFloor(x), snapFloor(y)];

function rectPreview(mode: 'area' | 'cut', a: Point, b: Point): Extract<Preview, { kind: 'rect' }> {
  return { kind: 'rect', mode, x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), d: Math.abs(a[1] - b[1]) };
}

export function usePlanGestures({ content, tool, setTool, selectedId, select, viewport, commit }: Args) {
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const setPreview = (next: Preview | null): void => {
    previewRef.current = next;
    setPreviewState(next);
  };
  const run = (command: PlanCommand, coalesceKey?: string): boolean => {
    const problem = commit(command, coalesceKey);
    setMessage(problem);
    return problem === null;
  };
  const cancel = (): void => {
    gesture.current = null;
    setPreview(null);
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>): void => {
    if (e.button === 2) return;
    const world = viewport.clientToWorld(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pan' || spaceHeld || e.button === 1) {
      gesture.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      return;
    }
    if (tool === 'area' || tool === 'cut') {
      const origin = snapPoint(world);
      gesture.current = { kind: 'rect', mode: tool, origin };
      setPreview(rectPreview(tool, origin, origin));
      return;
    }
    if (isPlacementTool(tool)) {
      const draft = createObject(tool, { x: 0, y: 0 }, content.objects);
      const [px, py] = snapPoint(world);
      const x = Math.min(Math.max(0, px), Math.max(0, content.survey.width - draft.w));
      const y = Math.min(Math.max(0, py), Math.max(0, content.survey.length - draft.d));
      const object = { ...draft, x: snapFloor(x), y: snapFloor(y) };
      if (run({ type: 'object/add', object })) {
        select(object.id);
        setTool('select');
      }
      return;
    }
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle') as Handle | null;
    if (handle && selectedId) {
      gesture.current = { kind: 'resize', id: selectedId, handle };
      return;
    }
    const hit = hitTest(content.objects, world);
    if (!hit) {
      select(null);
      return;
    }
    select(hit.id);
    gesture.current = { kind: 'move', id: hit.id, origin: world, start: { x: hit.x, y: hit.y }, startClient: [e.clientX, e.clientY], dragging: false };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>): void => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pan') {
      viewport.panBy(e.clientX - g.lastX, e.clientY - g.lastY);
      gesture.current = { ...g, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    const world = viewport.clientToWorld(e.clientX, e.clientY);
    if (g.kind === 'rect') {
      setPreview(rectPreview(g.mode, g.origin, snapPoint(world)));
      return;
    }
    if (g.kind === 'move') {
      const moved = Math.hypot(e.clientX - g.startClient[0], e.clientY - g.startClient[1]);
      if (!g.dragging && moved < DRAG_THRESHOLD_PX) return;
      gesture.current = { ...g, dragging: true };
      setPreview({
        kind: 'object',
        id: g.id,
        patch: { x: snapDrag(g.start.x + world[0] - g.origin[0]), y: snapDrag(g.start.y + world[1] - g.origin[1]) },
      });
      return;
    }
    const object = content.objects.find((o) => o.id === g.id);
    if (object) setPreview({ kind: 'object', id: g.id, patch: resizePlacement(object, g.handle, world) });
  };

  const onPointerUp = (): void => {
    const g = gesture.current;
    const p = previewRef.current;
    cancel();
    if (!g || g.kind === 'pan' || !p) return;
    if (g.kind === 'rect' && p.kind === 'rect') {
      if (p.w > 0 && p.d > 0) {
        run({ type: g.mode === 'area' ? 'floor/add' : 'floor/cut', rect: { id: newId(), x: p.x, y: p.y, w: p.w, d: p.d } });
      }
      return;
    }
    if (p.kind === 'object') run({ type: 'object/update', id: p.id, patch: p.patch });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === ' ') {
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    if (e.key === 'Escape') {
      if (gesture.current) cancel();
      else if (tool !== 'select') setTool('select');
      else select(null);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const nextTool = toolForKey(e.key);
    if (nextTool) {
      setTool(nextTool);
      return;
    }
    const selected = content.objects.find((o) => o.id === selectedId);
    if (!selected) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (run({ type: 'object/remove', id: selected.id })) select(null);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      run({ type: 'object/rotate', id: selected.id, by: e.shiftKey ? -45 : 45 });
      return;
    }
    const step = e.shiftKey ? FINE_NUDGE_M : NUDGE_M;
    const delta: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = delta[e.key];
    if (move) {
      e.preventDefault();
      run({ type: 'object/update', id: selected.id, patch: { x: selected.x + move[0], y: selected.y + move[1] } }, `nudge:${selected.id}`);
    }
  };

  const onKeyUp = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === ' ') setSpaceHeld(false);
  };

  const panning = tool === 'pan' || spaceHeld || gesture.current?.kind === 'pan';
  const cursor = panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const svgHandlers: SvgHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  };

  return { preview, cursor, message, svgHandlers, onKeyDown, onKeyUp };
}
```

Replace `apps/web/src/features/plan/PlanView.tsx`:
```tsx
import { checkPlan, currentRevision, type Id, type PlanCommand, type RoomLocation } from '@glasshouse/domain';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useViewport } from '../../viewport/useViewport';
import { PlanCanvas } from './PlanCanvas';
import { Toolbar } from './Toolbar';
import type { Tool } from './tools';
import { usePlanGestures } from './usePlanGestures';
import { ZoomControls } from './ZoomControls';
import './plan.css';

export function PlanView({ location }: { location: RoomLocation }) {
  const content = currentRevision(location.room.plan).content;
  const roomId = location.room.id;
  const dispatch = useWorkspaceStore((s) => s.dispatch);
  const [params, setParams] = useSearchParams();
  const [tool, setTool] = useState<Tool>('select');
  const selectedParam = params.get('sel');
  const selected = content.objects.find((o) => o.id === selectedParam) ?? null;

  const select = useCallback(
    (id: Id | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('sel', id);
          else next.delete('sel');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const commit = useCallback(
    (command: PlanCommand, coalesceKey?: string): string | null =>
      dispatch({ type: 'plan', roomId, command }, coalesceKey === undefined ? {} : { coalesceKey })?.message ?? null,
    [dispatch, roomId],
  );

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
    </div>
  );
}
```

Append to `apps/web/src/features/plan/plan.css`:
```css
.toolbar {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: var(--sheet);
  border: 1.25px solid var(--ink);
  box-shadow: var(--shadow-float);
}

.toolbar__sep {
  height: 1px;
  margin: 3px 4px;
  background: var(--rule);
}

.plan-view__message {
  position: absolute;
  left: 50%;
  bottom: 18px;
  max-width: min(560px, 80%);
  padding: 9px 14px;
  border-radius: var(--radius);
  background: var(--ink);
  color: var(--sheet);
  font-size: 14px;
  box-shadow: var(--shadow-float);
  transform: translateX(-50%);
  animation: message-in var(--duration-normal) var(--ease-out-expo);
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Look at it**

Run `pnpm dev`. In a room:
- Place a rack, drag it, and confirm it snaps to 0.10 m.
- Resize it from a corner, rotate it with `R`, and confirm `Escape` mid-drag restores it.
- Drag an *Add area* rectangle and a *Cut out* rectangle, and confirm the Footprint updates.
- Hold Space and drag to pan.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): plan tools for placing, moving, resizing, rotating and floor editing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Inspector and validated fields

**Files:**
- Create: `apps/web/src/ui/NumberField.tsx`, `apps/web/src/ui/TextField.tsx`, `apps/web/src/ui/fields.css`
- Create: `apps/web/src/features/plan/Inspector.tsx`, `apps/web/src/features/plan/SurveyPanel.tsx`, `apps/web/src/features/plan/FloorRectList.tsx`, `apps/web/src/features/plan/ObjectInspector.tsx`, `apps/web/src/features/plan/inspector.css`
- Modify: `apps/web/src/features/plan/PlanView.tsx`
- Test: `apps/web/src/ui/NumberField.test.tsx`, `apps/web/src/features/plan/ObjectInspector.test.tsx`

**Interfaces:**
- Consumes: `CommitFn` (Task 15), `rackAutoHeightM`, `formatMetres`, `Survey`, `Rect`, `RoomObject`, `SurveyPatch`, `ObjectPatch`; `TYPE_LABEL`.
- Produces: `parseNumber(text)` → `{ kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value }`; `NumberField({ id; label; value; onCommit(v: number | null): string | null; unit?; decimals?; allowEmpty?; placeholder? })`; `TextField({ id; label; value; onCommit(v: string): string | null; multiline?; rows? })`; `Inspector({ content; selected; commit; onDeleted })`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/ui/NumberField.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberField, parseNumber } from './NumberField';

describe('parseNumber', () => {
  it('accepts partial and comma-decimal input', () => {
    expect(parseNumber('')).toEqual({ kind: 'empty' });
    expect(parseNumber('1.')).toEqual({ kind: 'ok', value: 1 });
    expect(parseNumber('1,5')).toEqual({ kind: 'ok', value: 1.5 });
    expect(parseNumber('-')).toEqual({ kind: 'invalid' });
    expect(parseNumber('2m')).toEqual({ kind: 'invalid' });
  });
});

describe('NumberField', () => {
  it('AC12: keeps focus and text while the value is invalid, and explains why', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(v: number | null) => string | null>(() => null);
    render(<NumberField id="w" label="Width" unit="m" value={5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Width');
    await user.clear(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
    expect(screen.getByText('Enter a value.')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
    await user.type(input, '6.');
    expect(onCommit).toHaveBeenLastCalledWith(6);
    expect(input).toHaveValue('6.');
  });

  it('shows the domain error returned by onCommit', async () => {
    const user = userEvent.setup();
    render(<NumberField id="w" label="Width" value={5} onCommit={() => 'Room width must be between 1 and 50 m.'} />);
    await user.type(screen.getByLabelText('Width'), '0');
    expect(screen.getByText('Room width must be between 1 and 50 m.')).toBeInTheDocument();
    expect(screen.getByLabelText('Width')).toHaveAttribute('aria-invalid', 'true');
  });

  it('commits null when empty values are allowed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(() => null);
    render(<NumberField id="h" label="Height" value={2.1} allowEmpty onCommit={onCommit} />);
    await user.clear(screen.getByLabelText('Height'));
    expect(onCommit).toHaveBeenLastCalledWith(null);
  });
});
```

`apps/web/src/features/plan/ObjectInspector.test.tsx`:
```tsx
import { createObject, emptyContent, type Rack } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';

it('edits rack fields through plan commands and shows rejections', async () => {
  const user = userEvent.setup();
  const rack = { ...(createObject('rack', { x: 1, y: 1 }, []) as Rack), name: 'RK-01' };
  const commit = vi.fn<(command: unknown, coalesceKey?: string) => string | null>(() => null);
  render(<Inspector content={{ ...emptyContent(), objects: [rack] }} selected={rack} commit={commit} onDeleted={() => {}} />);

  expect(screen.getByRole('heading', { name: 'RK-01' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Customer' }));
  expect(commit).toHaveBeenLastCalledWith({ type: 'object/update', id: rack.id, patch: { owner: 'customer' } }, undefined);

  await user.click(screen.getByRole('button', { name: 'Rotate 45° clockwise' }));
  expect(commit.mock.lastCall?.[0]).toEqual({ type: 'object/rotate', id: rack.id, by: 45 });

  commit.mockReturnValue('Capacity must be a whole number from 1 to 60 U.');
  const capacity = screen.getByLabelText('Capacity');
  await user.clear(capacity);
  await user.type(capacity, '61');
  expect(screen.getByText('Capacity must be a whole number from 1 to 60 U.')).toBeInTheDocument();
  expect(capacity).toHaveValue('61');
});

it('shows the survey when nothing is selected', () => {
  render(<Inspector content={emptyContent()} selected={null} commit={() => null} onDeleted={() => {}} />);
  expect(screen.getByRole('heading', { name: 'Survey' })).toBeInTheDocument();
  expect(screen.getByLabelText('Width')).toHaveValue('5.00');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./NumberField`.

- [ ] **Step 3: Implement**

`apps/web/src/ui/NumberField.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import './fields.css';

export type ParsedNumber = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: number };

const NUMBER_PATTERN = /^-?(\d+\.?\d*|\.\d+)$/;

export function parseNumber(text: string): ParsedNumber {
  const t = text.trim().replace(',', '.');
  if (t === '') return { kind: 'empty' };
  if (!NUMBER_PATTERN.test(t)) return { kind: 'invalid' };
  const value = Number(t);
  return Number.isFinite(value) ? { kind: 'ok', value } : { kind: 'invalid' };
}

const format = (value: number | null, decimals: number): string => (value === null ? '' : value.toFixed(decimals));

interface NumberFieldProps {
  id: string;
  label: string;
  value: number | null;
  onCommit: (value: number | null) => string | null;
  unit?: string;
  decimals?: number;
  allowEmpty?: boolean;
  placeholder?: string;
}

export function NumberField({ id, label, value, onCommit, unit, decimals = 2, allowEmpty = false, placeholder }: NumberFieldProps) {
  const [text, setText] = useState(() => format(value, decimals));
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(format(value, decimals));
    setError(null);
  }, [value, decimals]);

  const handleChange = (next: string): void => {
    setText(next);
    const parsed = parseNumber(next);
    if (parsed.kind === 'empty') {
      setError(allowEmpty ? onCommit(null) : 'Enter a value.');
      return;
    }
    if (parsed.kind === 'invalid') {
      setError('Enter a number.');
      return;
    }
    setError(onCommit(parsed.value));
  };

  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className={`field__box${error ? ' field__box--error' : ''}`}>
        <input
          id={id}
          className="field__input mono"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            if (!error) setText(format(value, decimals));
          }}
          onChange={(e) => handleChange(e.target.value)}
        />
        {unit ? <span className="field__unit">{unit}</span> : null}
      </div>
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`apps/web/src/ui/TextField.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import './fields.css';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onCommit: (value: string) => string | null;
  multiline?: boolean;
  rows?: number;
}

export function TextField({ id, label, value, onCommit, multiline = false, rows = 3 }: TextFieldProps) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setText(value);
    setError(null);
  }, [value]);

  const props = {
    id,
    value: text,
    className: 'field__input',
    'aria-invalid': error !== null,
    'aria-describedby': error ? `${id}-error` : undefined,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (!error) setText(value);
    },
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      setError(onCommit(e.target.value));
    },
  };

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className={`field__box${multiline ? ' field__box--multiline' : ''}${error ? ' field__box--error' : ''}`}>
        {multiline ? <textarea rows={rows} {...props} /> : <input autoComplete="off" {...props} />}
      </div>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`apps/web/src/ui/fields.css`:
```css
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.field__label {
  font-size: 13px;
  color: var(--ink-2);
}

.field__box {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  border: 1.25px solid var(--rule);
  border-radius: var(--radius);
  background: var(--film);
  transition: border-color var(--duration-fast) ease-out;
}

.field__box:hover {
  border-color: var(--ink-2);
}

.field__box:focus-within {
  border-color: var(--ink);
  box-shadow: 0 0 0 2px var(--clearance-fill);
}

.field__box--multiline {
  height: auto;
  padding: 6px 8px;
}

.field__box--error,
.field__box--error:focus-within {
  border-color: var(--block);
  border-width: 1.75px;
}

.field__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font-size: 14px;
}

textarea.field__input {
  resize: vertical;
  line-height: 1.45;
}

.field__unit {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink-2);
}

.field__error {
  font-size: 12px;
  font-weight: 600;
  color: var(--block);
}
```

`apps/web/src/features/plan/FloorRectList.tsx`:
```tsx
import type { Rect } from '@glasshouse/domain';
import { IconTrash } from '../../ui/icons';
import { NumberField } from '../../ui/NumberField';
import type { CommitFn } from './usePlanGestures';

interface FloorRectListProps {
  title: string;
  itemLabel: string;
  rects: Rect[];
  commit: CommitFn;
  emptyText: string;
}

const FIELDS = [
  ['x', 'X'],
  ['y', 'Y'],
  ['w', 'W'],
  ['d', 'D'],
] as const;

export function FloorRectList({ title, itemLabel, rects, commit, emptyText }: FloorRectListProps) {
  return (
    <fieldset className="inspector__group">
      <legend className="lbl">{title}</legend>
      {rects.length === 0 ? <p className="inspector__empty">{emptyText}</p> : null}
      <ol className="rect-list">
        {rects.map((r, i) => (
          <li key={r.id} className="rect-list__item">
            <div className="rect-list__head">
              <span className="rect-list__name">{`${itemLabel} ${i + 1}`}</span>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}
                onClick={() => commit({ type: 'floor/remove', id: r.id })}
              >
                <IconTrash />
              </button>
            </div>
            <div className="field-quad">
              {FIELDS.map(([key, label]) => (
                <NumberField
                  key={key}
                  id={`${r.id}-${key}`}
                  label={label}
                  unit="m"
                  value={r[key]}
                  onCommit={(v) => (v === null ? null : commit({ type: 'floor/update', id: r.id, patch: { [key]: v } }, `floor:${r.id}:${key}`))}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
```

`apps/web/src/features/plan/SurveyPanel.tsx`:
```tsx
import type { Survey, SurveyPatch } from '@glasshouse/domain';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { FloorRectList } from './FloorRectList';
import type { CommitFn } from './usePlanGestures';

export function SurveyPanel({ survey, commit }: { survey: Survey; commit: CommitFn }) {
  const set = (patch: SurveyPatch, key: string): string | null => commit({ type: 'survey/update', patch }, `survey:${key}`);
  const num = (key: 'width' | 'length' | 'powerBudget' | 'designLimitPct') => (v: number | null) => (v === null ? null : set({ [key]: v }, key));
  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2>Survey</h2>
        <span className="inspector__hint">Changes save as you type</span>
      </header>
      <fieldset className="inspector__group">
        <legend className="lbl">Room bounds</legend>
        <div className="field-pair">
          <NumberField id="survey-width" label="Width" unit="m" value={survey.width} onCommit={num('width')} />
          <NumberField id="survey-length" label="Length" unit="m" value={survey.length} onCommit={num('length')} />
        </div>
      </fieldset>
      <fieldset className="inspector__group">
        <legend className="lbl">Power</legend>
        <div className="field-pair">
          <NumberField id="survey-power" label="Power budget" unit="W" decimals={0} value={survey.powerBudget} onCommit={num('powerBudget')} />
          <NumberField id="survey-limit" label="Design limit" unit="%" decimals={0} value={survey.designLimitPct} onCommit={num('designLimitPct')} />
        </div>
        <p className="inspector__note">The design limit is a planning rule, not an electrical rule.</p>
      </fieldset>
      <FloorRectList title="Floor areas" itemLabel="Area" rects={survey.floorAreas} commit={commit} emptyText="No floor yet. Drag a rectangle with Add floor area." />
      <FloorRectList title="Cut-outs" itemLabel="Cut-out" rects={survey.cutOuts} commit={commit} emptyText="No cut-outs. Use Cut out for columns and notches." />
      <fieldset className="inspector__group">
        <legend className="lbl">Notes</legend>
        <TextField id="survey-network" label="Network handoff" multiline value={survey.networkHandoff} onCommit={(v) => set({ networkHandoff: v }, 'network')} />
        <TextField id="survey-notes" label="Installation notes" multiline value={survey.notes} onCommit={(v) => set({ notes: v }, 'notes')} />
      </fieldset>
    </div>
  );
}
```

`apps/web/src/features/plan/ObjectInspector.tsx`:
```tsx
import { formatMetres, rackAutoHeightM, type ObjectPatch, type RoomObject } from '@glasshouse/domain';
import { useState } from 'react';
import { IconRotateCcw, IconRotateCw } from '../../ui/icons';
import { NumberField } from '../../ui/NumberField';
import { TextField } from '../../ui/TextField';
import { TYPE_LABEL } from './labels';
import type { CommitFn } from './usePlanGestures';

interface ObjectInspectorProps {
  object: RoomObject;
  commit: CommitFn;
  onDeleted: () => void;
}

export function ObjectInspector({ object, commit, onDeleted }: ObjectInspectorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const update = (patch: ObjectPatch, key?: string): string | null =>
    commit({ type: 'object/update', id: object.id, patch }, key === undefined ? undefined : `obj:${object.id}:${key}`);
  /** For buttons: a rejected command has no field to show its error next to, so surface it in the panel. */
  const act = (run: () => string | null): void => setActionError(run());
  const num = (key: 'x' | 'y' | 'w' | 'd' | 'angle') => (v: number | null) => (v === null ? null : update({ [key]: v }, key));
  const rack = object.type === 'rack' ? object : null;
  const autoHeight = rack ? rackAutoHeightM(rack.capacityU) : null;

  return (
    <div className="inspector__body">
      <header className="inspector__head">
        <h2 className="mono">{object.name}</h2>
        <span className="inspector__hint">
          {TYPE_LABEL[object.type]}
          {rack ? ` · ${rack.capacityU}U` : ''}
        </span>
      </header>

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Identity</legend>
        <TextField id={`${object.id}-name`} label="Name" value={object.name} onCommit={(v) => update({ name: v }, 'name')} />
        {rack ? (
          <div className="field">
            <span className="field__label">Owner</span>
            <div className="seg" role="group" aria-label="Rack owner">
              {(['oxygenai', 'customer'] as const).map((owner) => (
                <button key={owner} type="button" aria-pressed={rack.owner === owner} onClick={() => act(() => update({ owner }))}>
                  {owner === 'oxygenai' ? 'OxygenAI' : 'Customer'}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Placement</legend>
        <div className="field-pair">
          <NumberField id={`${object.id}-x`} label="X" unit="m" value={object.x} onCommit={num('x')} />
          <NumberField id={`${object.id}-y`} label="Y" unit="m" value={object.y} onCommit={num('y')} />
        </div>
        <div className="angle-row">
          <button type="button" className="icon-btn" aria-label="Rotate 45° counter-clockwise" onClick={() => act(() => commit({ type: 'object/rotate', id: object.id, by: -45 }))}>
            <IconRotateCcw />
          </button>
          <button type="button" className="icon-btn" aria-label="Rotate 45° clockwise" onClick={() => act(() => commit({ type: 'object/rotate', id: object.id, by: 45 }))}>
            <IconRotateCw />
          </button>
          <NumberField id={`${object.id}-angle`} label="Angle" unit="°" value={object.angle} onCommit={num('angle')} />
        </div>
        {actionError ? (
          <p role="alert" className="field__error">
            {actionError}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="inspector__group">
        <legend className="lbl">Size</legend>
        <div className="field-pair">
          <NumberField id={`${object.id}-w`} label="Width" unit="m" value={object.w} onCommit={num('w')} />
          <NumberField id={`${object.id}-d`} label="Depth" unit="m" value={object.d} onCommit={num('d')} />
        </div>
        <NumberField
          id={`${object.id}-height`}
          label="Height"
          unit="m"
          allowEmpty
          value={object.height}
          placeholder={autoHeight === null ? 'Default' : `${formatMetres(autoHeight)} from capacity`}
          onCommit={(v) => update({ height: v }, 'height')}
        />
      </fieldset>

      {rack ? (
        <>
          <fieldset className="inspector__group">
            <legend className="lbl">Capacity</legend>
            <div className="field-pair">
              <NumberField id={`${object.id}-u`} label="Capacity" unit="U" decimals={0} value={rack.capacityU} onCommit={(v) => (v === null ? null : update({ capacityU: v }, 'u'))} />
              <NumberField
                id={`${object.id}-depth`}
                label="Usable depth"
                unit="mm"
                decimals={0}
                value={rack.usableDepthMm}
                onCommit={(v) => (v === null ? null : update({ usableDepthMm: v }, 'usable'))}
              />
            </div>
          </fieldset>
          <fieldset className="inspector__group inspector__group--clearance">
            <legend className="lbl">Clearance</legend>
            <div className="field-pair">
              <NumberField
                id={`${object.id}-front`}
                label="Front"
                unit="m"
                value={rack.clearance.front}
                onCommit={(v) => (v === null ? null : update({ clearance: { front: v } }, 'front'))}
              />
              <NumberField
                id={`${object.id}-rear`}
                label="Rear"
                unit="m"
                value={rack.clearance.rear}
                onCommit={(v) => (v === null ? null : update({ clearance: { rear: v } }, 'rear'))}
              />
            </div>
          </fieldset>
        </>
      ) : null}

      <fieldset className="inspector__group">
        <legend className="visually-hidden">Notes</legend>
        <TextField id={`${object.id}-notes`} label="Notes" multiline value={object.notes} onCommit={(v) => update({ notes: v }, 'notes')} />
      </fieldset>

      <div className="inspector__danger">
        {confirmDelete ? (
          <>
            <span>Remove {object.name} from the plan?</span>
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                const problem = commit({ type: 'object/remove', id: object.id });
                setActionError(problem);
                if (problem === null) onDeleted();
              }}
            >
              Remove
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
            Remove {object.name}
          </button>
        )}
      </div>
    </div>
  );
}
```

`apps/web/src/features/plan/Inspector.tsx`:
```tsx
import type { PlanContent, RoomObject } from '@glasshouse/domain';
import { ObjectInspector } from './ObjectInspector';
import { SurveyPanel } from './SurveyPanel';
import type { CommitFn } from './usePlanGestures';
import './inspector.css';

interface InspectorProps {
  content: PlanContent;
  selected: RoomObject | null;
  commit: CommitFn;
  onDeleted: () => void;
}

export function Inspector({ content, selected, commit, onDeleted }: InspectorProps) {
  return (
    <aside className="inspector" aria-label={selected ? `${selected.name} details` : 'Survey'}>
      {selected ? (
        <ObjectInspector key={selected.id} object={selected} commit={commit} onDeleted={onDeleted} />
      ) : (
        <SurveyPanel survey={content.survey} commit={commit} />
      )}
    </aside>
  );
}
```

`apps/web/src/features/plan/inspector.css`:
```css
.inspector {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-height: 0;
  overflow-y: auto;
  background: var(--sheet);
  border-left: 1px solid var(--rule);
}

.inspector__body {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 18px 18px 28px;
}

.inspector__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.inspector__head h2 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.inspector__hint,
.inspector__note,
.inspector__empty {
  font-size: 13px;
  color: var(--ink-2);
}

.inspector__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.inspector__group > legend {
  margin-bottom: 6px;
  padding: 0;
}

.inspector__group--clearance > legend {
  color: var(--clearance);
}

.field-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.field-quad {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.angle-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: end;
  gap: 6px;
}

.angle-row .icon-btn {
  width: 34px;
  height: 34px;
}

.seg {
  display: flex;
  border: 1.25px solid var(--ink);
  border-radius: var(--radius);
  overflow: hidden;
}

.seg button {
  flex: 1;
  height: 32px;
  border: 0;
  background: var(--sheet);
  font-size: 13px;
  font-weight: 600;
}

.seg button[aria-pressed='true'] {
  background: var(--ink);
  color: var(--sheet);
}

.rect-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rect-list__item {
  padding-top: 10px;
  border-top: 1px solid var(--rule-2);
}

.rect-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.rect-list__name {
  font-size: 13px;
  font-weight: 600;
}

.inspector__danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--rule);
  font-size: 13px;
}
```

In `apps/web/src/features/plan/PlanView.tsx`, add `import { Inspector } from './Inspector';` and render it after the canvas `section`:
```tsx
      <Inspector content={content} selected={selected} commit={commit} onDeleted={() => select(null)} />
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @glasshouse/web test && pnpm --filter @glasshouse/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web): survey and object inspector with live validated fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Checks strip, end-to-end journeys and M1 verification

**Files:**
- Create: `apps/web/src/features/plan/ChecksStrip.tsx`, `apps/web/src/features/plan/checks.css`
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/survey.spec.ts`
- Modify: `apps/web/src/features/plan/PlanView.tsx`
- Test: `apps/web/src/features/plan/ChecksStrip.test.tsx`, `apps/web/e2e/survey.spec.ts`

**Interfaces:**
- Consumes: `Issue`, `RoomObject`, `IconBlock`, `IconWarn`.
- Produces: `ChecksStrip({ issues, objects, onSelect })`.

- [ ] **Step 1: Write the failing unit test**

`apps/web/src/features/plan/ChecksStrip.test.tsx`:
```tsx
import type { Issue } from '@glasshouse/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ChecksStrip } from './ChecksStrip';

const issue = (over: Partial<Issue>): Issue => ({
  key: 'k',
  code: 'clearance_obstructed',
  severity: 'block',
  message: 'EX-01 sits inside the front clearance zone of RK-C1.',
  hint: 'Move EX-01.',
  targets: ['ex'],
  ...over,
});

it('summarises counts and selects the target object', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <ChecksStrip
      issues={[issue({}), issue({ key: 'w', severity: 'warn', code: 'clearance_door', message: 'D-01 is inside the front clearance of RK-C1.', targets: ['d'] })]}
      objects={[{ id: 'ex', name: 'EX-01' }, { id: 'd', name: 'D-01' }] as never}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByText('1 blocks approval')).toBeInTheDocument();
  expect(screen.getByText('1 warning')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Select EX-01' }));
  expect(onSelect).toHaveBeenCalledWith('ex');
});

it('says so when there are no issues', () => {
  render(<ChecksStrip issues={[]} objects={[]} onSelect={() => {}} />);
  expect(screen.getByText('No issues found')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @glasshouse/web test`
Expected: FAIL, cannot resolve `./ChecksStrip`.

- [ ] **Step 3: Implement**

`apps/web/src/features/plan/ChecksStrip.tsx`:
```tsx
import type { Issue, RoomObject } from '@glasshouse/domain';
import { IconBlock, IconWarn } from '../../ui/icons';
import './checks.css';

interface ChecksStripProps {
  issues: Issue[];
  objects: Pick<RoomObject, 'id' | 'name'>[];
  onSelect: (id: string) => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function ChecksStrip({ issues, objects, onSelect }: ChecksStripProps) {
  const names = new Map(objects.map((o) => [o.id, o.name]));
  const blocks = issues.filter((i) => i.severity === 'block').length;
  const warnings = issues.length - blocks;
  return (
    <section className="checks" aria-labelledby="checks-heading">
      <header className="checks__head">
        <h2 id="checks-heading">Checks</h2>
        {issues.length === 0 ? <span className="checks__ok">No issues found</span> : null}
        {blocks > 0 ? <span className="checks__count checks__count--block">{plural(blocks, 'blocks approval', 'block approval')}</span> : null}
        {warnings > 0 ? <span className="checks__count checks__count--warn">{plural(warnings, 'warning', 'warnings')}</span> : null}
        {blocks > 0 ? <span className="checks__note">You can keep drafting; approval waits for these.</span> : null}
      </header>
      {issues.length > 0 ? (
        <ul className="checks__list">
          {issues.map((issue) => {
            const target = issue.targets.find((t) => names.has(t));
            return (
              <li key={issue.key} className={`checks__row checks__row--${issue.severity}`}>
                {issue.severity === 'block' ? <IconBlock role="img" aria-label="Blocks approval" aria-hidden={false} /> : <IconWarn role="img" aria-label="Warning" aria-hidden={false} />}
                <div>
                  <p className="checks__msg">{issue.message}</p>
                  <p className="checks__hint">{issue.hint}</p>
                </div>
                {target ? (
                  <button type="button" className="btn btn--sm" onClick={() => onSelect(target)}>
                    Select {names.get(target)}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
```

`apps/web/src/features/plan/checks.css`:
```css
.checks {
  grid-column: 1;
  grid-row: 2;
  max-height: 220px;
  overflow-y: auto;
  background: var(--sheet);
  border-top: 1.5px solid var(--ink);
}

.checks__head {
  position: sticky;
  top: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  padding: 10px 16px;
  background: var(--sheet);
}

.checks__head h2 {
  font-size: 15px;
  font-weight: 700;
}

.checks__ok,
.checks__note {
  font-size: 13px;
  color: var(--ink-2);
}

.checks__note {
  margin-left: auto;
}

.checks__count {
  font-size: 13px;
  font-weight: 600;
}

.checks__count--block {
  color: var(--block);
}

.checks__count--warn {
  color: var(--warn);
}

.checks__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.checks__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--rule-2);
}

.checks__row:hover {
  background: var(--hover);
}

.checks__row--block svg {
  color: var(--block);
}

.checks__row--warn svg,
.checks__row--needs_ack svg {
  color: var(--warn);
}

.checks__msg {
  font-size: 14px;
  line-height: 1.45;
}

.checks__hint {
  font-size: 13px;
  color: var(--ink-2);
}
```

In `apps/web/src/features/plan/PlanView.tsx`, add `import { ChecksStrip } from './ChecksStrip';` and render it after the canvas `section` (before `Inspector`):
```tsx
      <ChecksStrip issues={issues} objects={content.objects} onSelect={select} />
```

- [ ] **Step 4: Run unit tests**

Run: `pnpm --filter @glasshouse/web test`
Expected: PASS.

- [ ] **Step 5: Write the end-to-end journeys**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: { command: `pnpm vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
```

`apps/web/e2e/survey.spec.ts`:
```ts
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

async function placeRack(page: Page, fx: number, fy: number): Promise<void> {
  await page.getByRole('button', { name: 'Place rack' }).click();
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await expect(page.getByRole('heading', { name: 'RK-01' })).toBeVisible();
}

test('AC01: survey values persist without Save and the drawing keeps its proportion', async ({ page }) => {
  await createRoom(page);
  await page.getByLabel('Width', { exact: true }).fill('5');
  await page.getByLabel('Length', { exact: true }).fill('4');
  await expect(page.getByText(/Saved in this browser/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('5.00');
  const box = await page.getByTestId('footprint').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(1.25, 1);
});

test('AC04: a drag commits on release and Escape cancels it', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.3, 0.4);
  const x = page.getByLabel('X', { exact: true });
  const before = await x.inputValue();
  const rack = await page.getByRole('button', { name: 'RK-01, Rack' }).boundingBox();
  if (!rack) throw new Error('Rack not rendered');
  const cx = rack.x + rack.width / 2;
  const cy = rack.y + rack.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(x).toHaveValue(before);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy, { steps: 6 });
  await page.mouse.up();
  await expect(x).not.toHaveValue(before);
});

test('AC20: pinch zooms around the pointer and two-finger scroll pans', async ({ page }) => {
  await createRoom(page);
  const zoom = page.getByTestId('zoom-value');
  const startZoom = await zoom.textContent();
  const box = await page.getByTestId('footprint').boundingBox();
  if (!box) throw new Error('Footprint not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(zoom).not.toHaveText(startZoom ?? '');

  const zoomed = await zoom.textContent();
  const before = await page.getByTestId('footprint').boundingBox();
  await page.mouse.wheel(0, 80);
  await expect(zoom).toHaveText(zoomed ?? '');
  const after = await page.getByTestId('footprint').boundingBox();
  expect(after!.y).toBeLessThan(before!.y);
});

test('AC11: a rack against the wall shows a blocking rear-clearance check', async ({ page }) => {
  await createRoom(page);
  await placeRack(page, 0.2, 0.01);
  await expect(page.getByText('The rear clearance of RK-01 runs outside the floor.')).toBeVisible();
  await page.getByRole('button', { name: 'Rotate 45° clockwise' }).click();
  await expect(page.getByRole('alert')).toHaveText("There isn't room to turn RK-01 here. Move it away from the wall first.");
  await page.getByLabel('Y', { exact: true }).fill('0.6');
  await expect(page.getByText('No issues found')).toBeVisible();
});
```

Run:
```bash
cd /Users/snatchanon/workspace/operations/development/glasshouse
pnpm --filter @glasshouse/web exec playwright install chromium
pnpm e2e
```
Expected: 4 tests PASS. The AC11 journey also pins Review Focus 2 end-to-end: a rack flush against the wall cannot turn, and the inspector says why.

- [ ] **Step 6: Full verification**

Run:
```bash
pnpm test && pnpm typecheck && pnpm build && pnpm --filter @glasshouse/domain coverage && pnpm e2e
```
Expected: everything passes, domain coverage is at or above the thresholds, and `apps/web/dist` is built.

Then check the UI manually with `pnpm dev`, at 1280 and 1440 widths, in light and dark themes (via the Theme button):
- An L-shaped room with a cut-out
- Three racks, including one customer rack
- An existing rack inside a front clearance, which should show a red block
- A door inside a clearance, which should show an amber warning
- Undo and redo with ⌘Z / ⇧⌘Z
- A reload that keeps everything

Fix anything that looks broken before you commit.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(web): checks strip and M1 end-to-end journeys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After M1

- Run a whole-branch code review, then merge `feat/m1-domain-survey` per the team's flow.
- Write the M2 plan (`docs/superpowers/plans/YYYY-MM-DD-m2-racks-devices.md`) against the real M1 code: Catalog, elevation, Reserved ranges, Chassis/Slots/Nodes, Demand and Design limit, Usable depth check, BOM CSV.
