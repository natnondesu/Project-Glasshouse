# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Onsite engineers** (OxygenAI Operations) survey a physical Room on a laptop with a trackpad: footprint, doors, MCB panels, existing racks and furniture, power budget and network handoff.
- **IT planners** fill Racks with Devices, configure Chassis and their Nodes, and check U, depth and power.
- **Reviewers** resolve Review notes and approve a frozen Revision before installation.
- The head of Operations demos the finished MVP to the team to gather feedback.

## Product Purpose

Glasshouse turns a site survey into a measured room and rack installation plan. It replaces separate drawings, spreadsheets and chat threads with one model, from which onsite can understand, IT can validate and a reviewer can approve the plan. Success means an Approved Revision and its printable Install sheet that the installation team can work from without rebuilding a spreadsheet or redrawing the room.

## Positioning

The room geometry, rack U occupancy, Chassis → Node containment, clearance and power demand all come from one set of records, and they are checked together before approval. Every view (2D plan, rack elevation, room 3D, BOM, Install sheet) shows the same records, never an independently edited drawing.

## Operating Context

- Workflow: onsite surveys → hands a Project file to IT → IT plans → submit → reviewer approves → Install sheet printed for install day.
- The hierarchy is Project → Site → Room, with one Plan per Room. Revisions are Draft, In review or Approved.
- The MVP is browser-local; work moves between people by exporting and importing a Project file. Hosted as a static app on Vercel.
- Used on laptops, often in bright server rooms or on a trolley next to a rack.

## Capabilities and Constraints

- See `Glasshouse-Product-Specification.md`, `CONTEXT.md` (glossary) and `docs/adr/`.
- No logins in the MVP. Names on submission and approval are typed and labelled unverified.
- Laptop and desktop only; trackpad-first controls (pinch zoom, two-finger pan). No tablet or phone support.
- Only the room 3D view ships; there is no detailed rack 3D.
- The sample Project and the seed Catalog are illustrative, generic hardware (network switch, 1U/2U/4U servers, a 6U Chassis with 5 Node slots).

## Brand Commitments

- The name is Glasshouse (formerly Rackspace).
- Visual direction pinned by the product owner: **glass and depth** (frosted panels floating over a full-bleed live plan, light only). It replaced the earlier technical-drawing direction on 2026-10-14; the layout and components were kept.

## Evidence on Hand

No real customer sites, hardware models or install photos are available yet. All sample content must be labelled illustrative.

## Product Principles

1. Practical over clever: every interaction serves real field work; spec'd gimmicks get cut.
2. One record, many views: no view owns state of its own.
3. Honest status: Draft never looks Approved; unknown is never zero; unverified is labelled.
4. Checks before approval: problems are flagged while designing and only block at approval.

## Accessibility & Inclusion

High contrast is mandatory: linework, labels and dimension text must stay readable on a laptop in a brightly lit room. Avoid faint hairlines for meaningful information. Never use colour alone for state; pair it with a pattern, icon or label.
