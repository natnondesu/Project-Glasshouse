# Room objects: partition, air conditioning, display wall — Plan

> Execution: subagent per task with a task review after each, then one final review. Product owner approved scope 2026-10-18.

**Goal:** Let teams plan big rooms split by a partition with a door in it, place the two kinds of air conditioning found in Thai server/command rooms with the checks that matter, and place a display/LED wall in command rooms (draw only, no power).

**Approach:** Every new object is a placed, rotatable rectangle like the objects that exist today (`SimpleObject` in `packages/domain/src/model/types.ts`), so selection, move, rotate, resize, copy/paste, undo, the inspector, the 3D view and the Install sheet reuse their machinery. Follow the patterns of the closest existing object for each piece: **wall rack** (wall-mounted, height above floor, snaps to a wall), **door** (snaps to walls, sits in a wall), **furniture** (a plain obstacle).

## Decisions (product owner, 2026-10-18)
- Partition and both AC types now; the display wall is **draw only** (it does not take a power feed or count toward the room's power).
- No raised floors yet.
- Toolbar groups: **Walls & doors** (Door default, Sliding door, Partition) replaces "Doors"; **Furniture** becomes a group (Furniture default, Display wall); new **Cooling** group (Wall split AC default, Precision AC) placed after Furniture. Rail order: Select, Pan, Floor, Racks, Walls & doors, Furniture, Cooling, Measure, Power source.

## Global constraints
- Every new user-facing string in `apps/web/src/i18n/en.ts` **and** `th.ts` (the `Messages` type enforces the shape). Thai below is a first draft; a native read is on the pilot checklist.
- Server and web stay in lockstep (same image), so extending the object-type union in the schema needs no schema-version bump: older workspaces still parse. Check that `parseWorkspace` accepts old data and refuses unknown types as today.
- Units: metres, as everywhere in the model. Defaults below are in metres.
- Follow existing patterns; no unrelated refactors. Tests first (RED → GREEN). Full gate before each task is reported done: `pnpm test && pnpm typecheck && pnpm build && pnpm e2e && pnpm e2e:server && pnpm e2e:auth && pnpm test:db` (Docker running; ports 5199, 5299, 5398, 5399 free).
- Commits conventional, each ending with exactly:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WtB8tZhnramD69KN8qGBCk

## The objects

| Type id | Name (EN / TH) | Default size (w × d × height) | Mounting | What the planner checks |
| --- | --- | --- | --- | --- |
| `partition` | Partition / ผนังกั้นห้อง | length 2.00 × thickness 0.10 × 2.40 high | floor | An obstacle: nothing may overlap it (racks, existing racks, furniture, UPS/PDU, other partitions → the same overlap issue as today). A rack's clearance zone that crosses it is flagged exactly like a clearance zone crossing furniture today. |
| `wall_split_ac` | Wall split AC / แอร์ติดผนัง | 0.90 × 0.25 × 0.30 | wall, bottom at 2.20 m (editable like the wall rack's height) | **Drip warning**: a rack, existing rack or wall rack whose footprint overlaps the AC's footprint (plan view) → warning "RK-01 stands under the wall AC; condensate can drip on it." **Airflow warning**: a zone 1.00 m deep in front of the AC's long face; any rack/existing rack inside → warning "RK-01 blocks the airflow in front of the wall AC." Warnings, not approval blockers. |
| `precision_ac` | Precision AC / แอร์ Precision (ตั้งพื้น) | 0.80 × 0.80 × 1.95 | floor | **Service-access warning**: a zone 1.00 m deep in front of its front face; any object other than a door inside → warning "Keep 1.00 m clear in front of the precision AC for service; RK-01 is in the way." Overlap with other objects → the usual overlap issue. |
| `display_wall` | Display wall / จอแสดงผลขนาดใหญ่ (Video wall) | 3.00 × 0.15 × 1.70 | wall, bottom at 0.80 m (editable) | **Viewing-area warning**: a zone 1.50 m deep in front of the screen; a rack or existing rack inside → warning "RK-01 stands in front of the display wall." Furniture (desks) is allowed there. Draw only: no power, no feeds. |

All four: rotatable, movable, resizable (width/depth in the inspector; partition shows them as "Length" and "Thickness"), named on the plan like other objects (auto names e.g. `PT-01`, `AC-01`, `PAC-01`, `DW-01` following the existing naming helper), copy/paste and undo work, and they appear in search, the 3D view and the Install sheet like furniture does.

**Partition placement:** drag from one end to the other (like drawing a floor area, but along a line); the drag sets its length and angle, centred between the two points. Holding Shift snaps the angle to 0°/45°/90°. Ends snap to the room's walls and to other partitions within the existing snap distance. A plain click places the default 2.00 m partition along the X axis at that point.

**Door in a partition:** a door (swing or sliding) placed or moved near a partition snaps into it the way doors snap to the room's outer walls today: aligned with the partition's line, centred on its thickness, and its swing/slide drawn on the side the pointer is on. A door sitting in a partition is not reported as overlapping it.

**Wall-mounted items (split AC, display wall):** place and snap to the room's outer walls (and partitions) the way the wall rack does; their checks use their plan-view footprint. A floor rack under a wall-mounted display wall is allowed only if it doesn't trigger the viewing-area rule (it will, being in front); the drip rule applies to the split AC only.

---

### Task 1: Domain — types, defaults, snapping, checks
Files: `packages/domain/src/model/types.ts` (SimpleObjectType + any per-type fields, e.g. mounting height reused from the wall-rack pattern), `schema.ts`, `factories.ts` / object defaults, naming prefixes, `walls.ts` (snapToWall extended to partitions for doors and wall-mounted items), `checks/placement.ts` (or the module that owns overlap/clearance issues) plus new checks for drip, airflow, service access and viewing area (put them in a new `checks/environment.ts` if placement.ts would grow unwieldy), check codes and English issue wording in the domain if issues carry text, `sample.ts` only if a sample needs one (optional; don't change existing sample geometry).
Tests: domain unit tests for every rule in the table (inside/outside each zone, rotated objects, door-in-partition is not an overlap, old workspaces still parse, unknown type refused), snapping (door to partition, split AC to wall and partition).
Produces for Task 2/3: the type ids, defaults, the issue codes, and a helper the plan uses to compute partition geometry from two points (`partitionFromPoints(a, b, { snapAngle: boolean })` → {x, y, w, angle}) — name it as fits the codebase.

### Task 2: Web plan — toolbar, placement, drawing, inspector
Files: `apps/web/src/features/plan/tools.ts` (groups/order as decided; Walls & doors, Furniture group, Cooling), `Toolbar` tests and every e2e that opens "Doors tools" (rename), `placement.ts` (click-to-place for AC/display wall with wall snapping like the wall rack; drag-to-draw partition via Task 1's helper), plan canvas drawing (a partition as a solid thin wall with hatching consistent with the plan's line language; split AC and precision AC with a clear AC symbol and their zones drawn like clearance zones when selected or when a rule fires; display wall as a thick line with a screen mark and its viewing zone), legend entries, inspector fields (partition: Length/Thickness; wall items: Height above floor), icons in `apps/web/src/ui/icons.tsx` for partition, wall split AC, precision AC, display wall (same 18–20 px line style as the existing icons), EN/TH strings for names, hints, groups, inspector labels and the check messages shown in the UI.
Tests: unit tests for tools/groups and placement helpers; e2e: draw a partition by dragging, place a door into it (it snaps), place a wall split AC over a rack and see the drip warning, place a precision AC with a rack in its service area and see the warning, place a display wall.
Visual check: Playwright screenshots at 1440 px (EN/TH) of the rail, a room with a partition + door, both ACs with their zones, and a display wall; look at them.

### Task 3: 3D view, Install sheet, search, docs
Files: `apps/web/src/features/room3d/RoomModels.tsx` + `labels.ts` (partition as a full-height thin wall; split AC as a box high on the wall; precision AC floor cabinet; display wall as a dark screen panel at its height — simple, consistent with the existing low-poly look), the Install sheet's object schedule/legend (follow how furniture/doors appear), room search, `DESIGN.md` (one paragraph on the new symbols and zones) and the product spec's object list.
Tests: unit tests where the codebase tests 3D/sheet mapping; e2e: the 3D view renders with a partition and an AC without errors (canvas visible, no console errors), the Install sheet lists them.

---

## Follow-ups

Found by the whole-feature review and deliberately left for later:

- Doors move with their partition (today a door in a partition stays put when the partition is moved or resized).
- The fittings table: where it sits on the Install sheet.
- The "cold" search synonym for air conditioning.
