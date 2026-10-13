# Glasshouse MVP — Technical Design

**Date:** 2026-10-13 · **Scope:** MVP milestones M1–M4 · **Source of requirements:** `docs/product/Glasshouse-Product-Specification.md` (v1.1) · **Terms:** `CONTEXT.md` · **Decisions:** `docs/adr/` · **Visual system:** `DESIGN.md`

## 1. Goals and constraints

- Deliver FR01–FR13 and AC01–AC20 as a static, browser-local web app on Vercel.
- One rule engine: every placement, containment, clearance, power and lifecycle rule lives in a pure TypeScript domain package that the P1 Node backend will import unchanged (ADR-0001).
- Views never own state. They read the workspace and dispatch domain commands.
- Laptop/desktop only, trackpad-first.
- Immutable data: domain functions return new objects and never mutate their inputs.

## 2. Repository layout

pnpm workspace monorepo:

```text
glasshouse/
├── CONTEXT.md  PRODUCT.md  DESIGN.md
├── docs/{adr,product,superpowers}/
├── packages/
│   └── domain/                 # pure TS, no DOM; vitest
│       └── src/
│           ├── model/          # types: workspace, plan, revision, room objects, devices, demand
│           ├── units.ts        # metre/mm/U helpers, snapping, rounding
│           ├── geometry/       # rect, polygon, rotated footprint, boolean ops wrapper
│           ├── footprint.ts    # Floor areas − Cut-outs → polygon set
│           ├── commands/       # command union + per-area handlers (survey, objects, racks, devices, chassis, review, hierarchy, catalog)
│           ├── checks/         # issue detectors (placement, clearance, occupancy, depth, power, review)
│           ├── power.ts        # Demand aggregation
│           ├── lifecycle.ts    # submit / approve / new draft / snapshot
│           ├── bom.ts          # BOM rows + CSV
│           ├── project-file/   # zod schemas, export, import + conflict detection
│           ├── migrations.ts   # schema version upgrades
│           ├── sample.ts       # Sample Project + seed Catalog
│           └── index.ts
└── apps/
    └── web/                    # React + Vite
        └── src/
            ├── app/            # routes, shell, title block, providers
            ├── store/          # workspace store (zustand), undo/redo, persistence wiring
            ├── storage/        # Repository interface + IndexedDB adapter
            ├── features/
            │   ├── tree/       # Project/Site/Room navigation
            │   ├── plan/       # 2D SVG plan editor, tools, inspector
            │   ├── elevation/  # rack elevation, Reserved ranges, slot map
            │   ├── room3d/     # react-three-fiber view (lazy-loaded)
            │   ├── catalog/
            │   ├── bom/
            │   ├── review/     # checks, notes, submit/approve, history
            │   └── install-sheet/
            ├── ui/             # buttons, fields, segmented, title-block cells, icons
            ├── viewport/       # shared pan/zoom (pointer-anchored, trackpad gestures)
            └── styles/         # tokens.css (from DESIGN.md), base.css, print.css
```

The Repository interface lives in `apps/web/src/storage` for the MVP and moves into a shared package when P1 adds the API client. That move is YAGNI until then.

## 3. Key libraries

| Need | Choice | Why |
| --- | --- | --- |
| UI | React 19 + Vite + TypeScript strict | ADR-0001 |
| Routing (URL as state) | React Router | `/rooms/:roomId/:view` (room IDs are globally unique) and the selected object in `?sel=` |
| Client store | zustand | Small; the store holds the workspace value and dispatches domain commands |
| Immutability helper | immer (inside domain handlers) | Readable immutable updates; runs on server too |
| Boundary validation | zod | Project file import, storage reads, schema migrations |
| Polygon boolean ops | `polygon-clipping` | Robust union/difference/intersection for Footprint containment, rotated overlap and clearance checks |
| 3D | three + @react-three/fiber + @react-three/drei | Room 3D only; lazy-loaded route chunk |
| Storage | IndexedDB via `idb-keyval` | localStorage's ~5 MB cap is too small for many Projects with Snapshots |
| IDs | `crypto.randomUUID()` | Stable IDs; human labels (RK-01) are separate names |
| Fonts | @fontsource Barlow, Barlow Semi Condensed, Spline Sans Mono | Self-hosted, no runtime CDN |
| Tests | vitest (domain + components), Testing Library, Playwright (E2E + screenshots) | 80%+ domain coverage; AC journeys in E2E |

Drawing technology: **SVG** for the plan, elevation, slot map and Install sheet. It gives crisp ink-weight lines, prints cleanly to PDF, supports accessible names, and one renderer serves both screen and print. **WebGL** is used only for room 3D.

## 4. Domain model (TypeScript shape)

```ts
type Id = string;                                   // UUID
type Metres = number; type Millimetres = number; type Units = number; type Watts = number;
type Demand = { kind: 'known'; watts: Watts } | { kind: 'unknown' };

interface Workspace { schemaVersion: number; projects: Project[]; catalog: Template[]; lastBackupAt: string | null }
interface Project { id: Id; name: string; notes: string; isSample: boolean; sites: Site[] }
interface Site    { id: Id; name: string; notes: string; rooms: Room[] }
interface Room    { id: Id; name: string; notes: string; plan: Plan }
interface Plan    { revisions: Revision[]; notes: ReviewNote[]; history: HistoryEvent[] }  // last revision = current

type RevisionState = 'draft' | 'in_review' | 'approved';
interface Revision {
  number: number; state: RevisionState;
  content: PlanContent;                              // editable only when draft; frozen copy once submitted
  designedBy: UnverifiedName | null; approvedBy: UnverifiedName | null;
  submittedAt: string | null; approvedAt: string | null;
  acknowledgements: AcknowledgedUnknown[];
}
interface PlanContent {
  survey: Survey; objects: RoomObject[];           // racks, existing racks, doors, mcb, furniture
  templatesUsed: Template[];                        // frozen Template versions referenced by Devices
}
interface Survey { width: Metres; length: Metres; floorAreas: Rect[]; cutOuts: Rect[]; powerBudget: Watts; designLimitPct: number; networkHandoff: string; notes: string }
// width/length = the room's bounding canvas (1–50 m); the room's name lives on Room, not the Survey
interface Rect { id: Id; x: Metres; y: Metres; w: Metres; d: Metres }

interface ObjectBase { id: Id; name: string; x: Metres; y: Metres; w: Metres; d: Metres; angle: number; height: Metres | null; notes: string }
type RoomObject =
  | (ObjectBase & { type: 'rack'; capacityU: Units; usableDepthMm: Millimetres; owner: 'oxygenai' | 'customer';
                    clearance: { front: Metres; rear: Metres }; devices: RackDevice[]; reserved: ReservedRange[] })
  | (ObjectBase & { type: 'existing_rack' | 'door' | 'mcb' | 'furniture' });

interface DeviceBase { id: Id; templateId: Id; templateVersion: number; name: string; demand: Demand; config: string; notes: string }
type RackDevice =
  | (DeviceBase & { kind: 'device'; category: Category; bottomU: Units; heightU: Units; depthMm: Millimetres })
  | (DeviceBase & { kind: 'chassis'; bottomU: Units; heightU: Units; depthMm: Millimetres; slotCount: number; slotsPerRow: number; nodes: Node[] });
interface Node extends DeviceBase { slot: number }   // rack + U derived from the parent chassis
interface ReservedRange { id: Id; label: string; bottomU: Units; heightU: Units; demand: Demand; notes: string }
```

This shape follows the product's containment directly: a Plan holds its Revisions, a Rack holds its Devices, a Chassis holds its Nodes. Reads stay simple, and a Snapshot is "the content of a non-draft Revision", so there is no separate snapshot store. Derived views (BOM rows, Node → Rack lookup, issue lists) are computed, never stored.

The editable state is the current Draft Revision's `content`. Submitting freezes it. Starting a new Draft deep-copies the Approved content into a new Revision with `number + 1`.

## 5. Commands and the store

```ts
type Command =
  | { type: 'survey/update'; patch: Partial<Survey> }
  | { type: 'floor/add' | 'floor/cut'; rect: Rect } | { type: 'floor/update'; id: Id; patch: Partial<Rect> } | { type: 'floor/remove'; id: Id }
  | { type: 'object/add'; object: RoomObject } | { type: 'object/update'; id: Id; patch: Partial<ObjectBase> } | { type: 'object/rotate'; id: Id; by: 45 | -45 } | { type: 'object/remove'; id: Id }
  | { type: 'device/place'; rackId: Id; templateId: Id; bottomU: Units } | { type: 'device/move'; id: Id; rackId: Id; bottomU: Units } | …
  | { type: 'node/insert'; chassisId: Id; slot: number; templateId: Id } | …
  | { type: 'review/submit'; designedBy?: string } | { type: 'review/approve'; reviewer: string } | { type: 'review/new-draft' } | …;

function apply(ws: Workspace, at: PlanAddress, cmd: Command): Result<Workspace, DomainError>;
function checks(content: PlanContent, revision: Revision): Issue[];
interface Issue { code: IssueCode; severity: 'block' | 'warn' | 'needs_ack'; message: string; targets: Id[] }
```

- **Hard rules reject** (`Result.err`): U overlap, U out of range, invalid Slot, non-Node insert, Slot count below an occupied Slot, edits to a non-Draft Revision, room bounds below placed objects.
- **Soft rules flag** through `checks()`: Footprint containment, object overlap, clearance, depth, Demand, Review notes, missing fields. They never prevent an edit, but every `block` issue disables approval. `review/approve` re-runs `checks()` and rejects if any blocking issue remains. The UI's disabled button is a convenience, not the guard.
- **Store:** zustand holds `{ workspace, past: Workspace[], future: Workspace[] }`; consecutive edits of the same field within 1 s coalesce into one undo step. Because state is immutable, undo/redo is a stack of prior workspace values, scoped to Draft content edits and capped at 100. A practical addition for an editor, beyond the product spec.
- **Gestures:** a drag previews in local component state and dispatches one command on release, so one gesture is one undo step. Escape discards the preview.

## 6. Geometry

- An object's polygon is its rectangle rotated around its centre. Position is the top-left of the rotated axis-aligned bounding box, per FR03.
- The Footprint polygon set is `union(floorAreas) − union(cutOuts)`, computed with `polygon-clipping`.
- **Containment:** `area(difference(objectPoly, footprint)) ≤ ε`.
- **Overlap:** `area(intersection(a, b)) > ε`, so edge contact passes.
- **Clearance zone:** the polygon in front of or behind the rack, rotated with it. Checked against the Footprint (must be contained) and against other objects (overlap). Doors produce a warning; zone-to-zone overlap is ignored.
- **Disconnected areas:** the Footprint union has more than one outer ring, which produces a warning.
- Doors sit in walls, so they are exempt from Footprint containment. They must still be inside the canvas and must not overlap other objects.
- ε = 1e-6 m². Values are snapped and rounded at the command boundary: 0.10 m for drags, 0.01 m for typed values. No float drift accumulates, because every command stores rounded numbers.

## 7. Persistence, migrations, hand-off

- **Repository:** `load(): Promise<Workspace | null>` and `save(ws): Promise<void>`. The IndexedDB adapter is debounced at 400 ms; the title block shows *Saving…*, *Saved in this browser · HH:MM* or *Couldn't save: <reason>*.
- **Load path:** read raw, then `migrate(raw)`, then zod-validate. If invalid, the app shows a recovery screen offering a raw download; data is never silently reset.
- **Project file:** `{ format: 'glasshouse.project', schemaVersion, exportedAt, project, templates }`, saved as `.glasshouse.json`.
- **Import:** parse, migrate, validate, then detect conflicts per Plan by Room ID. The UI shows a dialog with both Revision numbers and states and the choices *keep mine*, *take incoming* or *import as copy* (new IDs throughout). Templates merge by `(id, version)`.
- **Workspace backup:** the same envelope with `format: 'glasshouse.workspace'`. Restoring replaces the workspace after a confirmation that offers to back up the current one first.

## 8. Views

| View | Rendering | Notes |
| --- | --- | --- |
| Plan | SVG in a shared `Viewport` (pointer-anchored zoom; pinch, Ctrl/⌘+wheel, two-finger pan, Space+drag, Pan tool) | Tool palette: select, pan, add area, cut out, rack, door, MCB, existing rack, furniture. Grid 0.5/1 m. Dimension lines for the bounding box and the selected object |
| Elevation | SVG, fixed 16 px/U, scrolls | Racks side by side; catalog drag onto free U; Reserved range creation by dragging over free U; Front/Rear toggle |
| Slot map | HTML grid | Click or drop a Node Template into a Slot |
| Room 3D | r3f, lazy route | Boxes, Front marker, device faces as a texture-free coloured plane per Device, schematic Slots; OrbitControls tuned for trackpad; click a Rack to open its elevation |
| BOM | HTML table | CSV download |
| Review | Checks list, notes, acknowledgement form, submit/approve dialogs, Revision history | |
| Install sheet | `/print` route, the same SVG renderers, `print.css` with A4 pages and `@page` margins | Shows only for Approved Revisions; title block repeats per page |

Accessibility: every SVG drawing has a role, a label and keyboard-reachable selection (Tab through objects, arrow keys nudge 0.10 m, `R`/`Shift+R` rotate 45°). Every geometric value is editable in the inspector. Colour is never the only signal (DESIGN.md).

## 9. Error handling

Domain errors are typed (`DomainError { code, message, targets }`) and shown inline next to the control or in the checks strip, in plain language with a recovery hint. Storage and import failures appear in a persistent banner with the reason and a next step. Nothing is silently swallowed: unexpected exceptions go to an error boundary per feature view, which shows the error and a "download workspace" escape hatch.

## 10. Testing

- **Domain (vitest):** unit tests per module, plus a scenario test per acceptance criterion where it is domain-level (AC02, AC03, AC05–AC11, AC13–AC16, AC19). Coverage target is at least 90% for `packages/domain`, above the 80% floor, because this package is the product's correctness.
- **Web (vitest + Testing Library):** store wiring, inspector forms (AC12 focus retention), import dialog.
- **E2E (Playwright, Chromium + WebKit + Firefox):** journeys for AC01, AC04, AC15, AC17, AC18 and AC20; screenshot checks of the plan, elevation and Install sheet at 1280 and 1440 widths in both themes.
- TDD order: domain tests first, then the implementation (red → green → refactor).

## 11. Milestone mapping

| Milestone | Domain | Web |
| --- | --- | --- |
| M1 | model, units, geometry, footprint, survey/floor/object commands, placement + clearance checks, migrations, repository | shell + title block, tree, plan editor, inspector, checks strip, IndexedDB save |
| M2 | catalog, devices, reserved ranges, chassis/nodes, occupancy, depth, power, BOM | elevation, catalog panel, slot map, BOM view + CSV |
| M3 | lifecycle, snapshots, review notes, acknowledgements, project file, workspace backup | review surface, import/export, conflict dialog, backup reminder |
| M4 | sample project | room 3D, Install sheet, sample polish, Vercel deploy, E2E + visual QA |

## 12. Out of scope here

Server, auth, NetBox, verification, detailed rack 3D, touch, cabling/PDUs and weight, as listed in the product spec's release boundary.
