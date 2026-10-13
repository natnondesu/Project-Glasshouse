# Glasshouse Product Specification

**Organization:** OxygenAI Operations  
**Version:** 1.1  
**Date:** 13 October 2026  
**Status:** MVP baseline (revised after design grilling) and proposed production roadmap  
**Audience:** Product owner, IT planners, onsite engineers, reviewers, designers and implementation agents  
**Build:** New codebase built from scratch by Claude; the Operations team reviews before rollout. The earlier [Rackspace playground](https://oxygen-rackspace.oxygenai-3523.chatgpt.site) prototype is a behavioral reference only; no code is inherited.  
**Former name:** Rackspace  
**Companion documents:** `CONTEXT.md` (glossary, canonical terms), `docs/adr/` (architecture decisions), `PRODUCT.md` (product record), `DESIGN.md` (visual system), `design-draft/` (approved visual draft)

Glasshouse turns a site survey into a measured room and rack installation plan. Onsite engineers describe the physical environment; IT planners place and configure Devices; reviewers resolve open issues before approving a Revision; the installation team works from a printed Install sheet. The long-term goal is one shared planning workspace connected to an authoritative infrastructure system, with a clear distinction between proposed, approved and verified installation states.

Sections 1–10 describe the MVP and its acceptance criteria. Sections 11–14 define proposed production requirements, delivery stages and open decisions. Future requirements must not be presented as delivered features. Capitalised domain terms (Plan, Rack, Node, …) are defined in `CONTEXT.md` and must be used consistently in UI copy, exports and code.

## Changes from v1.0

| Area | v1.0 | v1.1 |
| --- | --- | --- |
| Hierarchy | One room per browser-local plan | Project → Site → Room, one Plan per Room, many Projects per workspace |
| Catalog | Embedded in each plan | One workspace-wide Catalog shared by all Projects |
| Terms | Equipment, device, item, internal computer | Device, Rack device, Chassis, Slot, Node |
| Racks | Own rack vs blackbox other rack | Rack (any owner, plannable) vs Existing rack (obstacle); Reserved ranges for unmodelled gear |
| Power | Any unknown demand blocks | Device unknowns block; Reserved-range unknowns need an Acknowledged unknown; Design limit configurable per Plan |
| Lifecycle | Draft → In review → Approved → demo publish | Draft → In review → Approved; demo publish and baseline removed; Unverified names recorded |
| Hand-off | Plan JSON export only, no import | Project file export/import with conflict choice; Workspace backup with reminder |
| Floor | 1 m painted cells | Footprint of rectangular Floor areas minus Cut-outs, 10 cm precision |
| Rotation | Free handle, 15° snap | 45° steps plus exact angle field |
| Clearance | Not modelled | Front/rear Clearance zones, checked before approval |
| 3D | Room 3D and detailed rack 3D, camera focus presets | Room 3D only; no rack 3D, no U1–5 focus; Usable depth check instead |
| Output | Plan JSON, equipment CSV | Install sheet (PDF via print), BOM CSV, Project file |
| Input devices | Mouse-centric | Laptop/desktop, trackpad-first; no tablet or phone |
| Stack | Unspecified | TypeScript end to end (ADR-0001) |

## 1. Problem and product outcome

Room surveys, equipment requirements and installation decisions often live in separate drawings, spreadsheets and conversations. This creates inconsistent rack positions, unclear equipment configurations, missed physical constraints and duplicated documentation when the final installation is recorded.

Glasshouse gives the Operations team one model that connects the room Footprint, Rack occupancy, Chassis → Node containment, clearance, estimated Demand and the BOM. Every view (2D plan, rack elevation, room 3D, BOM, Install sheet) represents the same records rather than an independently edited drawing.

The intended outcome is an installation plan that onsite engineers can understand, IT can validate, a reviewer can approve and the installation team can execute from the Install sheet, without reconstructing the design from separate documents.

### Product goals

1. Represent surveyed Rooms, including L-shapes, notches and columns, organised as Project → Site → Room.
2. Plan multiple Racks — OxygenAI- or customer-owned — with explicit dimensions, positions, facing, clearance and capacity.
3. Represent a Chassis and its Nodes without double-counting space or power.
4. Keep visual views, Device configuration, checks and outputs consistent.
5. Preserve Revision history and separate Draft work from approved intent.
6. Support install day with a printable, unambiguous Install sheet.
7. Provide a path to shared collaboration, authoritative publication and installation reconciliation.

### Assumptions and exclusions

- IT performs camera/workload sizing and server-count calculations outside Glasshouse, then records the selected configuration here.
- The MVP is browser-local. Work moves between people by Project file; one person edits a Plan at a time by convention.
- Generic Device geometry is sufficient. Manufacturer-accurate CAD models are not required.
- Footprints are rectilinear (rectangles added and cut out). Diagonal and curved walls are out of scope.
- Structured CPU/GPU/RAM inventories, cabling, PDU outlet assignment, procurement pricing and live monitoring are future scope. Configuration and network handoff fields are descriptive text.
- Default dimensions, heights, clearances and Demand values are illustrative until confirmed. Visual fit does not establish mechanical compatibility or electrical approval.

## 2. Users and responsibilities

| User | Primary responsibility | Typical task |
| --- | --- | --- |
| Onsite engineer | Record physical conditions and installation constraints | Build the Footprint, place doors, MCB panels, Existing racks and furniture; record the Power budget |
| IT planner | Design the proposed infrastructure | Place Racks, fill them with Devices, configure Chassis and Nodes, check U, depth, clearance and Demand |
| Reviewer | Resolve uncertainty and approve installation intent | Review the Revision, resolve Review notes, acknowledge unknown Reserved-range Demand, approve |
| Installation team | Install from approved intent | Work from the Install sheet on install day |
| Project owner | Coordinate scope and hand-off | Review BOM and approved intent |
| Administrator (production) | Manage access and integration policy | Assign project roles, maintain the shared Catalog, configure external systems |

These are product responsibilities, not enforced access roles. The MVP has no login; names on submission and approval are typed and labelled **unverified** (FR09). Authentication and role enforcement arrive in P1.

All team members work on laptops or desktops, mostly with trackpads. Tablets and phones are not supported in the MVP.

## 3. Release boundary

| Capability | MVP | Production extension |
| --- | --- | --- |
| Project → Site → Room hierarchy | Organising tree, browser-local | Shared, permissioned hierarchy |
| Room Footprint | Floor areas minus Cut-outs, 10 cm | Survey evidence and measurement provenance |
| Room objects | Racks, Existing racks, doors, MCB panels, furniture | Authoritative rack bindings |
| Racks in customer racks | Rack owner + Reserved ranges | External containment mapping |
| Clearance zones | Front/rear depths, checked | Configurable organisation standards |
| Rack elevation | Implemented, front/rear inspection | Dual-face mounting rules |
| Room 3D | Generic boxes with Device faces, view-only camera | Richer models where useful |
| Detailed rack 3D | Not in MVP (replaced by Usable depth check) | Reconsider after pilot feedback |
| Catalog | Workspace-wide, browser-local | Shared, versioned Catalog with structured components |
| Chassis and Nodes | Implemented | Verified external containment mapping |
| Space and power checks | U, Usable depth, Footprint, clearance, Slot capacity, Demand vs Design limit | Feeds, PDUs, ports, weight |
| Review and Revisions | Draft/In review/Approved, Unverified names | Named, authenticated reviewers; server-enforced Snapshots; audit |
| Persistence | Browser storage, Workspace backup file | Server storage, backups, multi-user access |
| Hand-off | Project file export/import | Real-time shared projects |
| Outputs | Install sheet, BOM CSV, Project file | Additional controlled outputs |
| NetBox integration | Not in MVP | Baseline import, conflict review, recoverable publishing (P2) |
| Installation verification | Not in MVP | Evidence, serials, deviations, reconciliation (P2) |
| Live health and utilization | Not in MVP | Read-only monitoring overlays (P3) |

Accepting the MVP does not make it ready for shared operational use. The production gates in Section 12 apply before replacing the team's existing authoritative records.

## 4. User journeys and navigation

### Primary planning journey

1. Onsite opens or creates a Project, Site and Room. Opening a Room opens its Plan.
2. Onsite enters the Survey (room name, Power budget, network handoff, notes) and builds the Footprint from Floor areas and Cut-outs.
3. Onsite places Racks (marking each Rack owner), Existing racks, doors, MCB panels and furniture, and sets each Rack's facing.
4. Onsite exports a Project file and sends it to IT.
5. IT imports the Project file, opens the Room's elevation, and adds Devices from the Catalog. For customer racks, IT records occupied U as Reserved ranges.
6. For a Chassis, IT fills Slots with Node templates and configures each Node.
7. IT and onsite inspect the plan, elevation, room 3D, BOM and checks.
8. The Plan is submitted for review (recording an unverified "designed by" name), which freezes a Snapshot.
9. The reviewer resolves Review notes, acknowledges unknown Reserved-range Demand with a reason, and approves (recording an unverified reviewer name).
10. The installation team prints the Install sheet from the Approved Revision. Later changes start a new Draft Revision.

### Product surfaces

| Surface | Purpose |
| --- | --- |
| Project tree | Browse Projects → Sites → Rooms; see each Plan's Revision and state; open the Sample Project |
| Plan | Edit the Survey, Footprint and room objects in 2D; place Racks; see Clearance zones and checks |
| Elevation | Select a Rack; place, move and configure Devices; manage Reserved ranges; fill Chassis Slots |
| Room 3D | Inspect the whole Room in 3D (view only); selecting a Rack opens its elevation |
| Devices & BOM | List every Device including Nodes; export BOM CSV |
| Catalog | Create, edit and remove workspace Templates |
| Review | Read checks, resolve Review notes, record Acknowledged unknowns, submit/approve, view Revision history |
| Install sheet | Print-ready document for an Approved Revision |

Selecting a Device in any view opens its inspector. Selecting a Node resolves through its Chassis to the correct Rack. Selection uses stable record IDs, not names or screen positions.

## 5. Functional requirements for the MVP

### FR01 Workspace, hierarchy and Survey

The workspace holds many **Projects**; each Project holds one or more **Sites**; each Site holds one or more **Rooms**; each Room has exactly one **Plan**. Projects, Sites and Rooms have a stable ID, name and optional notes, and can be created, renamed and deleted (deleting a non-empty node requires confirmation and offers a Project file export first).

The **Survey** belongs to the Plan and is frozen with each Revision. It stores room name, Footprint, Power budget in watts, descriptive network handoff and installation notes.

Valid Survey and room-object edits update the model, drawings and browser storage immediately. The focused input and cursor survive redraws. Incomplete or invalid input stays visible with an inline error while the model keeps its last valid value. Device and Catalog forms use explicit Save; the interface distinguishes autosaved fields from Save forms. Storage failure is shown; the app never implies browser storage is durable shared storage.

### FR02 Footprint builder

The Footprint is the union of **Floor areas** minus **Cut-outs**, each an axis-aligned rectangle snapped to **0.10 m**. Tools: *Add area* and *Cut out* (drag a rectangle), plus numeric editing of each rectangle's X, Y, width and depth. A new Room starts with one Floor area from the entered width and length.

A drag commits on release; Escape cancels and restores the prior state. Removing or shrinking areas never deletes room objects; objects that no longer fit are flagged and block approval. Disconnected Floor areas are allowed in the MVP and shown with a warning. At least one Floor area with positive area is required for approval.

### FR03 Room objects

Object types: **Rack**, **Existing rack**, access door, MCB panel, furniture. Each stores a stable ID, name, X/Y, width, depth, angle, optional physical height and notes. Racks additionally store capacity in U, **Usable depth** in mm, **Rack owner** (OxygenAI or Customer) and front/rear clearance depths.

Objects are selected, dragged and resized with edge/corner handles; drag and resize snap to 0.10 m, and numeric fields accept values to 0.01 m. Rotation uses **45° step** controls (buttons and keyboard) plus an exact angle field for any value, normalised to 0–360°. There is no free rotation handle. Rotation preserves the physical centre; resize handles follow the object's local axes.

Position is the top-left of the rotated object's axis-aligned bounding box. Actual rotated rectangles determine Footprint containment and overlap; bounding-box overlap alone is insufficient. Edge contact is allowed; footprint overlap is flagged and blocks approval. Overlap may exist temporarily while designing.

Every Rack shows its **Front** with a marker in 2D and 3D, so its facing is unambiguous.

### FR04 Clearance zones

Each Rack has a **Clearance zone** in front and behind, as wide as the Rack, with depths defaulting to **1.00 m front** and **0.60 m rear**, editable per Rack (0 disables that side).

| Condition | Result |
| --- | --- |
| Two Racks' Clearance zones overlap | Allowed (shared aisle) |
| A Clearance zone extends outside the Footprint | Flagged; blocks approval |
| Any Rack, Existing rack, MCB panel or furniture inside a Clearance zone | Flagged; blocks approval |
| A door inside a Clearance zone | Warning only |

Clearance zones render as a hatch in 2D and are hidden in room 3D by default. Door-swing simulation is excluded.

### FR05 Racks, Reserved ranges and occupancy

A **Rack** is any rack Devices are planned into, regardless of Rack owner. An **Existing rack** is a physical obstacle only and holds no Devices. U1 is at the bottom. A Rack device needs a whole-number bottom U and positive whole-number height; its span must fit capacity and not overlap another Rack device or Reserved range in that Rack. The same U range may be used independently in different Racks. Devices can move between Racks through the inspector, subject to destination validation.

A **Reserved range** is a labelled U span occupied by hardware Glasshouse does not model (typically existing customer gear). It stores label, bottom U, height, Demand (known or unknown) and notes. It occupies U like a Rack device and counts toward Demand when known.

Deleting a populated Rack requires confirmation and removes its Devices and Reserved ranges. A Plan may have zero Racks while drafting; approval requires at least one Device.

Front/rear viewing is visual inspection, not a dual-face occupancy model.

### FR06 Catalog and Devices

The **Catalog** is one workspace-wide set of **Templates** shared by every Project. A Template holds label, manufacturer/model text, category, mounting type, rack height, depth in mm, Demand, color and default configuration. Categories: Compute, Storage, Network, Power, Chassis.

Mounting distinguishes Rack devices from Nodes. Node Templates use Compute category and occupy no U.

Placing a Template creates a **Device** that copies its properties and records the Template ID and Template version. Editing or deleting a Template never changes or deletes placed Devices, in any Revision state.

The seed Catalog contains illustrative generic Templates, each labelled illustrative: Network switch (1U), Server 1U, Server 2U, Server 4U, Chassis 6U with 5 Slots, and Node server. Existing Catalogs and frozen Revisions survive app updates without being overwritten.

### FR07 Chassis and Nodes

A **Chassis** is a Rack device with Slot count, Slots per row and chassis-only overhead Demand. The Slot layout is schematic and does not certify mechanical fit.

IT places the Chassis first, then adds Node Templates by clicking an empty **Slot** or dragging a Template onto it. Each **Node** stores its own ID, name, Template reference, configuration, Demand, notes and Slot number; its Rack and U come from the Chassis.

One Slot holds at most one Node. Only Node Templates may be inserted; a Rack device cannot become a Node. Nodes cannot contain a Chassis.

Moving the Chassis moves the assembly, preserving Node identities and Slots. Reducing Slot count below an occupied Slot is rejected. Removing a Node frees its Slot. Deleting a populated Chassis requires confirmation and removes its Nodes.

The Slot map, rack elevation, room 3D and BOM show Nodes, and each Node is individually selectable.

**Reference example:** a 6U Chassis with five Nodes occupies 6U total. With 20 W overhead and five 150 W Nodes, assembly Demand is 770 W. Nodes add zero U. Empty Slots are allowed.

### FR08 Views and interaction

The 2D plan, rack elevation, room 3D, BOM and Install sheet read the same canonical records. Visual editing emits domain commands; no view keeps its own state.

**2D plan and elevation:** trackpad-first. Pinch or Ctrl/⌘+scroll zooms around the pointer; two-finger scroll pans; an explicit Pan tool and Space+drag also pan; Fit room resets the view. Mouse wheel zoom and middle-drag pan also work. A short click selects; a drag never accidentally selects.

**Room 3D:** view only. Orbit, pan and pointer-anchored zoom with the same trackpad and mouse gestures; Reset restores the default camera. Racks render as generic boxes with Front markers and colored Device faces; Chassis show schematic Slots. Clicking a Rack opens its elevation. Projection and depth ordering must never make Racks appear inverted or floating.

**Rack elevation:** readable fixed U spacing; tall Racks scroll rather than shrink labels. U numbers appear on both rails. There are no camera focus presets.

Every geometric value can also be edited through numeric fields; direct manipulation is never the only path.

### FR09 Space, depth and power accounting

Rack occupancy counts top-level Rack devices (each Chassis once) and Reserved ranges. Nodes consume Slots, not U.

A Rack device deeper than its Rack's Usable depth is flagged and blocks approval.

**Demand** is either a known value in watts or explicitly unknown; unknown is never treated as zero. Known room Demand sums each Rack device, each Chassis overhead, each Node and each known Reserved range exactly once. Unknown counts are shown separately.

The **Design limit** is a per-Plan percentage of the Power budget, default **80%**, labelled in the UI as a planning rule, not an electrical rule. Approval is blocked when known Demand exceeds the Design limit.

| Unknown Demand on | Approval |
| --- | --- |
| A Rack device or Node | Blocks |
| A Reserved range | Allowed only after a reviewer records an **Acknowledged unknown** with a reason |

There is no per-feed/PDU model, PSU failure scenario, cooling model or weight check in the MVP.

### FR10 Review and Revisions

A Plan has numbered **Revisions** in one of three states: **Draft**, **In review**, **Approved**. Only the Draft Revision is editable.

Submitting copies the Survey, Footprint, room objects, Racks, Devices, Nodes, Reserved ranges, referenced Template versions and Power settings into a frozen **Snapshot**, records an optional unverified "designed by" name, and moves the Revision to In review. Submission does not require checks to pass.

Review notes can be added and resolved in Draft or In review. Approval is available only when all blocking checks in Section 8 pass; it records a required unverified reviewer name and timestamp. When the designer and reviewer names match, the approval is visibly flagged as self-approved (not prevented).

Editing an Approved Plan starts a new Draft Revision with an incremented number; prior Snapshots never change. There is no publish step or baseline in the MVP, and no UI may use the word "Published".

Unverified names are labelled "unverified" everywhere they appear, including the Install sheet and exports. They are not audit records.

### FR11 Persistence, hand-off and backup

Browser storage keeps the whole workspace: hierarchy, Plans, Revisions, Snapshots, Review notes, Catalog and history. Storage sits behind one repository interface so P1 can replace it with a server API without changing domain or UI code (ADR-0001). Schema versions migrate forward without losing edits.

A **Project file** exports one Project's full tree with Revisions, Snapshots, Review notes and the Templates it uses. Importing never silently overwrites: when a Plan with the same ID exists locally, the user sees both Revision numbers and states and chooses *keep mine*, *take incoming* or *import as copy*. Imported Templates that already exist are matched by ID and version; differing versions are kept side by side.

A **Workspace backup** exports and restores the entire workspace. The app shows a non-blocking reminder when no backup has been made for 7 days.

### FR12 BOM and Install sheet

The **BOM** lists every Device as one row, including each Chassis and each Node, with Project, Site, Room, Rack, parent Chassis, Slot, name, Template/model, category, bottom U and height, depth, Demand (or "unknown"), configuration and notes. It exports as CSV. Configuration text does not generate procurement rows. Exports never show stale Node locations after a Chassis move.

The **Install sheet** is generated only from an **Approved** Revision and printed to PDF from the browser at A4. It contains:

1. A title block on every page: Project, Site, Room, Revision number, state, unverified designer and reviewer names, and print date.
2. The room plan with Racks, Front markers, Clearance zones and key dimensions from walls.
3. One elevation per Rack with U numbers, Device names and Reserved ranges.
4. A Slot map per Chassis.
5. The BOM table, with Acknowledged unknowns and their reasons.

The sheet has no edit controls or checkboxes. Recording installation progress is P2.

### FR13 Sample Project and first run

A clearly labelled **Sample Project** appears in the normal Project list for every new workspace. Users can open and edit it, delete it, and restore it with "Load sample". It contains one Site with two Rooms: a rectangular server room with an Approved Revision (so the Install sheet works immediately), and an L-shaped MDF with a column Cut-out, two OxygenAI Racks, one customer Rack with a Reserved range, an Existing rack, a populated 6U Chassis, one blocking issue and one open Review note. All sample hardware is generic and labelled illustrative.

## 6. Conceptual data model

| Entity | Core information | Relationship |
| --- | --- | --- |
| Workspace | Schema version, Projects, Catalog, backup timestamp | One per browser |
| Project | ID, name, notes | Owns Sites |
| Site | ID, name, notes | Belongs to one Project; owns Rooms |
| Room | ID, name, notes | Belongs to one Site; has exactly one Plan |
| Plan | Current Revision, Revisions, Review notes, history | Belongs to one Room |
| Revision | Number, state, Snapshot (when submitted), unverified names, timestamps | Belongs to one Plan |
| Survey | Room name, Footprint, Power budget, Design limit %, network text, notes | Part of a Revision |
| Footprint | Floor areas, Cut-outs (rectangles, metres) | Part of the Survey |
| Room object | ID, type, name, X/Y, width/depth, angle, optional height, notes | Placed on the Footprint |
| Rack | Room-object fields + capacity U, Usable depth mm, Rack owner, front/rear clearance m | Owns Rack devices and Reserved ranges |
| Reserved range | ID, label, bottom U, height U, Demand, notes | In one Rack |
| Template | ID, version, category, mounting, model, height U, depth mm, Demand, color, default config | In the workspace Catalog |
| Rack device | ID, Template ID + version, name, Rack ID, bottom U, height, depth, Demand, config, notes | In one Rack |
| Chassis | Rack-device fields + Slot count, Slots per row, overhead Demand, Nodes | A Rack device |
| Node | ID, Template ID + version, name, Chassis ID, Slot, Demand, config, notes | In one Chassis Slot; inherits Rack and U |
| Review note | ID, text, resolved flag | Belongs to a Plan's current Revision |
| Acknowledged unknown | Reserved range ID, reason, unverified name, timestamp | Belongs to a Revision |
| History event | Revision, action, timestamp | Plan history |

Names are user-visible labels; stable IDs establish relationships. Room geometry uses metres, Device and Usable depth use millimetres, Rack capacity uses U and Demand uses watts. Conversion is explicit at boundaries. Demand is modelled as `known(watts)` or `unknown`, never a nullable number interpreted as zero.

## 7. MVP defaults and limits

| Setting | Value |
| --- | --- |
| Room bounding size | 1–50 m each axis |
| Footprint precision | 0.10 m |
| Object drag/resize snap | 0.10 m; numeric entry to 0.01 m |
| Minimum object width/depth | 0.10 m |
| Rotation | 45° steps; exact angle field normalised to 0–360° |
| Rack capacity | 1–60 whole U |
| Rack Usable depth | 300–1500 mm, default 1000 mm |
| Clearance defaults | 1.00 m front, 0.60 m rear; 0–3.00 m |
| Physical height | Optional; positive values up to 10 m |
| Rack automatic height | Capacity × 0.04445 m + 0.18 m frame allowance |
| Existing rack default height | 2.0 m |
| Door, MCB panel, furniture default heights | 2.1 m, 1.4 m, 0.75 m |
| Chassis Slots | 1–64; Slots per row 1 to Slot count |
| Power budget | 100–100,000 W |
| Design limit | 50–100% of Power budget, default 80% |
| Backup reminder | After 7 days without a Workspace backup |

Defaults are rendering and planning assumptions, not manufacturer specifications. Production must label assumed and measured values separately.

## 8. Validation and lifecycle rules

| Condition | Draft behavior | Approval |
| --- | --- | --- |
| Blank/invalid numeric edit | Inline error; last valid model kept | Only valid values enter the Snapshot |
| Rack U overlap (Devices or Reserved ranges) or out-of-range position | Reject the placement | Block |
| Rack device deeper than Usable depth | Flag | Block |
| Object outside Footprint | Reject direct invalid edits; flag objects invalidated by Footprint edits | Block |
| Rotated footprint overlap between objects | Allow temporarily, flag | Block |
| Clearance zone outside Footprint, or obstacle inside a Clearance zone | Flag | Block |
| Door inside a Clearance zone | Warn | Allowed |
| Disconnected Floor areas | Warn | Allowed |
| Empty Footprint | Allowed while building | Block |
| Invalid Slot, Slot capacity or non-Node insert | Reject | Block |
| Unknown Demand on a Rack device or Node | Show unknown count | Block |
| Unknown Demand on a Reserved range | Show unknown count | Block until an Acknowledged unknown is recorded |
| Known Demand above Design limit | Show exceeded limit | Block |
| Unresolved Review note | Allowed | Block |
| Missing room name, no Devices, or missing reviewer name | Prompt | Block |
| Edit to a non-Draft Revision | Prevented | Requires a new Draft |

Production enforces the same rules on the server using the shared domain package (ADR-0001).

## 9. MVP acceptance scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| AC01 | Create Project → Site → Room and enter a 5 × 4 m room | Room appears in the tree; drawing keeps 5:4 proportion; valid values persist without Save |
| AC02 | Build an L-shape with a 0.60 × 0.60 m column Cut-out, then cut out an area under a Rack | Footprint matches to 0.10 m; the Rack remains, is flagged, and blocks approval |
| AC03 | Rotate a narrow object with the 45° control, then type 37° next to another object | Physical polygons decide fit and overlap; centre preserved; no bounding-box-only false collision |
| AC04 | Drag, resize and cancel a room gesture | Preview follows input; release commits; Escape restores prior placement |
| AC05 | Use U10–U15 in two different Racks; then overlap a Reserved range in one | Both placements valid; overlap within a Rack is rejected |
| AC06 | Add a 6U Chassis with five Nodes | Occupancy +6U, BOM +6 rows, Demand = overhead + five Nodes |
| AC07 | Insert into an occupied Slot, Slot 6 of a five-Slot Chassis, or a Rack device into a Slot | Rejected without replacing a Node |
| AC08 | Move a populated Chassis to another Rack | Every Node keeps ID, Slot and configuration; derived Rack location updates everywhere |
| AC09 | Edit and delete a Template | Placed Devices and their configuration are unchanged |
| AC10 | Place a 1070 mm-deep server in a Rack with 1000 mm Usable depth | Flagged; approval blocked with the reason shown |
| AC11 | Place an Existing rack inside a Rack's front Clearance zone; place a door there | Existing rack blocks approval; door warns only; two Racks sharing an aisle are allowed |
| AC12 | Clear a numeric input while typing | Input stays focused; last valid drawing persists; the error is explained |
| AC13 | Submit, approve, then edit | New Draft Revision with incremented number; earlier Snapshot unchanged |
| AC14 | Leave a Node's watts unknown; leave a Reserved range's watts unknown; exceed the Design limit | Node and limit block approval; Reserved range blocks until acknowledged with a reason |
| AC15 | Export a Project file, import it in another browser, then import a conflicting copy | Full tree, Snapshots and Templates restored; conflict offers keep / take / copy, nothing overwritten silently |
| AC16 | Approve with the same designer and reviewer name | Approval succeeds and is flagged self-approved; names show as unverified |
| AC17 | Print the Install sheet from an Approved Revision; try from a Draft | Approved: A4 sheet with title block, plan, elevations, Slot maps, BOM; Draft: not available |
| AC18 | Open a fresh workspace | Sample Project is listed and opens with working checks and an Approved Room |
| AC19 | Export BOM CSV with a populated Chassis | One row per Device including each Node, with parent Chassis and Slot |
| AC20 | Use a trackpad only on plan, elevation and room 3D | Pinch zoom anchors at the pointer; two-finger pan works; no action requires a middle button or right-drag |

Validation evidence must include automated tests on the domain package (geometry, occupancy, containment, power, lifecycle, import conflicts) and browser QA of the journeys above.

## 10. Pilot and team feedback

The finished MVP (M1–M4) is demonstrated to the Operations team for feedback. Afterwards, run a pilot using one real survey, at least two Racks (including one customer Rack) and one populated Chassis. Onsite and IT should complete the journey, including a Project file hand-off, without rebuilding a separate spreadsheet or redrawing the room.

Measure unassisted task completion, time to a reviewable plan, review rounds, missed assumptions, install-day questions answered by the Install sheet, and reconciliation effort. Compare with the team's current method before setting numeric targets.

Pilot completion requires a coherent Approved Revision, no blocking issues, a reconciled BOM, identified assumptions, and confirmation that the installation team can work from the Install sheet. Browser-local limitations must be understood before treating the pilot as a shared system.

## 11. Production requirements and authoritative data ownership

### Collaboration and access

Production supports authenticated users and project-scoped access over the existing Project → Site → Room hierarchy. Suggested roles: Viewer, Onsite editor, IT editor, Reviewer/publisher, Administrator; the product owner confirms the final matrix.

All writes and exports require authorisation. Concurrent stale edits return a conflict and preserve both proposals; they never silently overwrite. Autosave reports server acknowledgement and pending/failed states. Server-side persistence, backup and recovery are prerequisites for shared use. The backend is Node + Postgres and reuses the shared domain package for validation (ADR-0001).

### Revision and installation lifecycle

The production lifecycle is Draft → In review → Approved → Publishing → Published intended state → Installed pending verification → Verified. Return-to-draft creates a new editable Revision and requires fresh approval.

Approvals bind to an immutable Revision and content hash with named actor, role, decision and timestamp, replacing MVP Unverified names. Publication and verification reference that Snapshot without mutating it. Published means authoritative intended records were reconciled; Verified means required installation evidence and deviations were resolved.

Installation work captures actual Rack/Device positions, asset identifiers and serials, photos, connections and discrepancies. A deviation creates a reviewed change rather than silently replacing approved intent.

### Ownership and synchronization

| Data | Intended production authority |
| --- | --- |
| Drafts, room geometry, survey evidence, comments and approvals | Glasshouse |
| Published infrastructure identities and owned intended-state fields | Selected authoritative platform, provisionally NetBox |
| Installation observations and unreconciled deviations | Glasshouse verification records |
| Live health, throughput and utilization | Monitoring systems, optionally displayed in Glasshouse |

Drafts begin from an identified external baseline. Stable bindings map internal IDs to external records. Each field has an ownership policy; external changes update the baseline and raise conflicts with open drafts. Unrestricted automatic two-way writes are excluded.

### NetBox handoff contract

The NetBox version, supported entities and containment model must be verified before building the adapter. Sites/locations, Racks, Rack devices, Reserved ranges and Nodes need an explicit mapping; Nodes must not be flattened into independent rack occupancy to fit an external schema. Room geometry and annotations may remain Glasshouse-owned.

Before real publication, the service re-fetches owned fields, compares with the baseline, shows a per-field operation preview and confirms approval still matches the Revision. Operations have stable correlation IDs, dependency ordering and recorded results. A partially successful job stays Partial with applied and pending operations visible; retry reconciles ambiguous creates before creating again; owned fields are read back before success. Deletion is an explicit reviewed operation. Credentials stay server-side and never appear in browser storage, exports or agent logs.

## 12. Delivery stages and release gates

### MVP milestones

| Milestone | Deliverable | Usable outcome |
| --- | --- | --- |
| M1 Domain core + Room survey | Pure TS domain package (geometry, Footprint, rotation, Clearance zones, checks) with tests; Project/Site/Room tree; 2D plan editor; browser storage | Onsite can survey a real Room |
| M2 Racks & Devices | Catalog, rack elevation, U occupancy, Reserved ranges, Chassis/Slots/Nodes, Demand and Design limit, Usable depth check, BOM CSV | IT can plan a full Room |
| M3 Review & hand-off | Revisions and Snapshots, Review notes, Acknowledged unknowns, Unverified names, approval checks, Project file import/export, Workspace backup | Onsite → IT → reviewer loop works |
| M4 Room 3D + Install sheet | View-only room 3D, print-ready Install sheet, Sample Project polish | Install day supported; ready for team demo |

The MVP is built by Claude; the Operations team reviews it at the M4 demo. There is no fixed date. The app is deployed as a static site on Vercel; every viewer has their own browser-local workspace.

### Production stages

| Stage | Deliverable | Gate |
| --- | --- | --- |
| MVP (M1–M4) | Planning, containment, clearance, checks, local review, hand-off, Install sheet | AC01–AC20 plus browser QA |
| P1 Shared operations | Node + Postgres backend, identity, role enforcement, shared Catalog, concurrency, immutable approvals, backups | Two users can safely collaborate; unauthorised and stale writes fail; approved content is immutable |
| P2 Authoritative integration and installation | Baseline import, conflict preview, recoverable publish jobs, installation evidence and deviations | Bindings and containment verified; partial jobs recover without duplicates; installed changes reconciled |
| P3 Operational extensions | Structured components, cabling/power feeds, weight, optional monitoring overlays, reconsider rack 3D | Validated against real demand; new data has clear ownership |

P1 is the minimum release for replacing browser-local planning with a shared workflow. P2 is required before claiming authoritative synchronization or a verified installation record. Live metrics never change intended infrastructure automatically.

## 13. Engineering handoff and quality requirements

Implementers preserve the identity, placement, containment, clearance, power and Revision rules in this specification. Renderers read canonical records and emit domain commands; they never keep independent persistence.

| Work area | Responsibility | Contract to preserve |
| --- | --- | --- |
| Domain and validation | Geometry, Footprint, clearance, U occupancy, Slot containment, Demand, Revision rules | Pure TypeScript, no browser APIs; stable IDs; explicit units; deterministic checks; no double counting |
| Plan and visualization | Footprint builder, object editing, elevation, room 3D | Same records in every view; pointer-anchored zoom; trackpad-first; numeric alternatives |
| Catalog and BOM | Templates, Devices, Chassis UI, BOM, Install sheet | Template/Device independence; inherited Node placement; complete, current outputs |
| Storage and hand-off | Repository interface, browser storage, Project file, Workspace backup, migrations | No silent overwrite; Snapshot independence; forward migrations |
| Collaboration and review (P1) | Identity, durable edits, concurrency, approvals | No silent lost edits; immutable approval target; named actors |
| Integration and verification (P2) | Baselines, publication jobs, installation reconciliation | Owned fields, conflict detection, resumable operations |

Changes include regression tests for nested Devices, unknown Demand, rotated objects near Cut-outs, Clearance zones, Reserved ranges, import conflicts and stale Revisions. Visual QA covers a populated 6U Chassis, 24U/42U/60U Racks, narrow laptop viewports, overlapping labels, both rack faces, irregular Footprints, light and dark themes, and the printed Install sheet.

Save/reload, Project file round-trips and migrations preserve Device relationships and Snapshot independence. Destructive actions explain what is replaced and offer an export first. No release may describe browser-local storage or Unverified names as production collaboration or audit.

Visual design follows `DESIGN.md` (modern technical drawing direction, approved draft in `design-draft/`).

## 14. Decisions before production implementation

1. ~~Project/site/room hierarchy~~ — decided: Project → Site → Room, one Plan per Room. Still open: whether multiple survey alternatives per Room are needed.
2. Who can edit, review, approve and publish, including separation of duties.
3. The authoritative platform and its deployed version; validate Chassis → Node and Reserved-range mapping.
4. ~~Measurement precision and polygon drawing~~ — decided: rectangles at 0.10 m. Still open: whether disconnected Floor areas should block.
5. Measured/assumed/unknown provenance, mandatory survey evidence and installation verification fields.
6. The organisation's documented capacity, headroom and feed rules to replace the per-Plan Design limit.
7. Structured hardware attributes and compatibility checks beyond free text and schematic Slots.
8. Retention, backup/recovery, audit, deployment/network access and expected project size.
9. The organisation's standard front/rear clearance depths, to replace the 1.00/0.60 m defaults.

These decisions constrain production. They do not block building or evaluating the MVP.
