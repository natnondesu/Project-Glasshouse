# M4 Room 3D, Install sheet and Sample Project: Implementation Plan

> **For agentic workers:** execute task by task with TDD (failing test → minimal code → green → commit). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make install day possible. The team can open the Sample Project on first run, look at any Room in 3D, and print an A4 Install sheet from an Approved Revision.

**Architecture:**
- The domain gains a Sample Project builder, which is made only from existing commands so it is always valid, plus revision-aware BOM and sheet selectors.
- The web gains a lazy-loaded `3d` room view (three + @react-three/fiber, with its own camera controller), a top-level `/rooms/:roomId/install-sheet` print route outside the Shell, and first-run seeding.

**Tech:**
- three 0.186, @react-three/fiber 9.8, @types/three 0.186.
- No drei: the camera controller is ~100 lines of tested math, which gives AC20 trackpad behaviour exactly.

**Spec:** FR08 (room 3D), FR12 (Install sheet), FR13 (Sample Project), AC17, AC18, AC20.

## Decisions

1. **Which Revision the sheet prints.**
   - It prints the newest **Approved** Revision, not the current one. After "Start new draft", R01's sheet still prints.
   - With no Approved Revision, the route explains why and links to Review (AC17 "Draft: not available").
2. **The sheet route lives outside the Shell.**
   - `/rooms/:roomId/install-sheet` renders a plain white document on screen, with a screen-only toolbar (Back, Print).
   - `print.css` sets `@page { size: A4; margin: 12mm }`.
   - Every page is an explicit `<section class="sheet-page">` with its own title block and `break-after: page`.
   - BOM pages repeat the title block through `<thead>`, which Chromium, WebKit and Firefox all repeat across printed pages.
3. **Sheet contents (FR12).** Pages in order:
   1. Plan, drawn by the same layer components through a static `View` from `fit()`. It shows Racks with Front markers and Clearance zones, plus wall-gap dimensions for every Rack from `wallGaps`.
   2. Elevations, drawn by `RackElevation` with no-op handlers, two per page. A Rack taller than 48U gets a page to itself.
   3. Slot maps, as a static table per Chassis.
   4. The BOM, plus Acknowledged unknowns with reasons and unverified names.
   - The sheet has no inputs or checkboxes.
4. **Room 3D is view-only, with a custom camera.** Orbit is around a target point.
   - Pointer drag orbits. Shift+drag or right-drag pans.
   - Two-finger scroll (wheel without ctrlKey) pans.
   - Pinch or ⌘/Ctrl+wheel dollies toward the floor point under the pointer.
   - Elevation is clamped to 8°–85°, so the camera never goes under the floor or flips. Racks always sit on y=0 (FR08: never inverted or floating).
   - "Reset view" restores the default camera.
5. **3D scene model is pure data.**
   - `buildScene(content)` returns the floor polygons (footprint minus cut-outs), boxes for objects (centre, size, yaw from `localToWorld`, height from `effectiveHeight`), Device faces per Rack, Chassis slot cells, and the Front marker.
   - It is unit-tested.
   - Its components only map that data to meshes, so a jsdom test of WebGL isn't needed.
6. **Rack selection in 3D.** Clicking a Rack box opens `/rooms/:id/elevation?sel=<rackId>`. An accessible "Racks" list overlay does the same with keyboard and screen readers, which is the non-pointer path that FR08 requires.
7. **Sample Project (FR13).**
   - `createSampleProject(catalog, at)` builds a Project with `isSample: true` by applying ordinary workspace commands to a scratch workspace with new ids.
   - **Server room A:** rectangular, 6.0 × 4.8 m. Two populated OxygenAI Racks. Approved R01.
   - **MDF-1:** L-shaped, with a column Cut-out. It holds:
     - two OxygenAI Racks, one of them with a 6U Chassis holding five Nodes;
     - one customer Rack with a Reserved range of unknown demand;
     - an Existing rack inside the customer Rack's front clearance (the one blocking issue);
     - one open Review note.
   - First run (no stored workspace) seeds it.
   - The tree offers "Load sample" when no sample Project exists.
   - `{ type: 'sample/load', at }` appends a fresh copy.
8. **Deploy.** `vercel.json` with SPA rewrites only. The actual deploy needs Few's Vercel account, so it is not run here.
9. **Cross-browser E2E.** WebKit and Firefox are added as Playwright projects for the M4 journeys and for the existing ones.

## Tasks

### Task 1: Domain: approved Revision selector, revision-aware BOM, Sample Project
- `latestApproved(plan): Revision | null`. `bomRowsFor(loc, revision)`, with `bomRows(loc)` delegating to it.
- `sample.ts`: `createSampleProject(catalog, at)` and `withSample(ws, at)`; plus the `sample/load` command.
- Tests:
  - The sample has 1 Site and 2 Rooms.
  - Server room A's current Revision is Approved and `approvalBlockers` is empty.
  - MDF-1 has two floor areas and one cut-out, 3 Racks (2 OxygenAI, 1 customer with a Reserved range) and an existing rack. It has exactly one `block` issue (`clearance_obstructed`) and one unresolved note. A Chassis has 5 Nodes.
  - Loading twice gives distinct ids.
  - `latestApproved` survives a new draft.

### Task 2: Web: first-run seeding and Load sample
- `persistence.ts` seeds `withSample(createWorkspace(), now)` when storage is empty.
- The tree shows a "Load sample" button when no Project has `isSample`.
- Sample Projects show a SAMPLE stamp in the tree.
- Tests: the persistence first-run test, and a tree test.

### Task 3: Web: Install sheet route
- `features/sheet/`: `InstallSheet`, `SheetTitleBlock`, `SheetPlan`, `SheetElevations`, `SheetSlotMaps`, `SheetBom`, `print.css`.
- Links: "Install sheet" in the Review view and the view tabs, enabled only when `latestApproved` exists. The link opens in the same tab.
- Tests:
  - Approved → the title block shows R01, APPROVED and both unverified names.
  - One elevation per Rack; a slot map per Chassis; BOM rows; acknowledged reasons.
  - No input or checkbox elements.
  - Draft-only → "not available" with a link to Review.

### Task 4: Web: room 3D
- `features/room3d/scene.ts` (pure) and `camera.ts` (pure orbit, pan and dolly maths).
- `Room3DView.tsx`, lazy-loaded through `React.lazy` in `RoomScreen`, with view tab "3D".
- Tests:
  - scene: a rotated Rack's yaw matches its plan Front.
  - scene: Devices produce faces at the right heights.
  - scene: Chassis slot cells.
  - camera: pinch dolly keeps the floor point under the pointer; elevation clamps; pan moves the target in the camera plane.
  - The view renders the Racks list, and clicking a Rack navigates. WebGL isn't available in jsdom, so the canvas is stubbed.

### Task 5: Deploy config and cross-browser E2E
- `vercel.json`.
- Playwright `webkit` and `firefox` projects.
- `e2e/m4.spec.ts`:
  - AC18 (fresh workspace lists the Sample Project and opens it; the checks show the blocking issue);
  - AC17 (print route from the approved sample room shows all sections; from a Draft-only room, it isn't available);
  - AC20 smoke (3D canvas renders; pinch via ctrl+wheel changes the zoom read-out; the Racks list opens the elevation).

### Task 6: Verification and visual QA
- Full suite, build, and bundle check (the 3D chunk is split from the main chunk).
- Screenshots at 1280 and 1440: 3D, the Install sheet screen view, and the sample MDF.
- Print the sheet to PDF via Playwright `page.pdf({ format: 'A4' })` and inspect the pages.
