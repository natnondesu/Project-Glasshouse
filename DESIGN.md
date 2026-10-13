# Glasshouse — Design System

Status: provisional (set by the first visual draft, 2026-10-13). Exact tokens settle in the first build.

## World

**Modern technical drawing on drafting film.** The app is a working drawing sheet, not a dashboard. Ink means committed geometry. Non-photo-blue construction lines show the measuring grid and clearance. Dimension lines, leader callouts and a **title block** carry the information, never decorative chrome. The same language runs from the screen to the printed Install sheet.

Use scene: engineers on laptops in bright server rooms and offices, so the design is **light-first**. Dark mode is a true inverse ("night sheet"), not an afterthought.

## Color (semantic only)

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| film | `#F2F4F1` | `#0D1218` | Canvas ground (drafting film) |
| sheet | `#FBFCFA` | `#131A22` | Panels, title block |
| ink | `#111720` | `#E8EDF1` | Committed linework, primary text |
| ink-2 | `#3B4552` | `#AEBAC6` | Secondary text (≥ 7:1 on film) |
| rule | `#C9D0D4` | `#26313C` | Panel dividers |
| construct | `#9CC0DA` / `#C9DDEB` | `#2C4A63` / `#1B2D3D` | Major / minor grid (non-photo blue) |
| clearance | `#2A6A9E` | `#6FA8D6` | Clearance hatch and outline |
| block | `#B3261E` | `#FF7A6E` | Blocking issues (always with icon + label) |
| warn | `#9A5800` | `#F2B154` | Warnings, unknown Demand (with "?" glyph) |
| compute / storage / network / power / chassis | `#2C4EA6` / `#0B7262` / `#6B3DA6` / `#7A5718` / `#3A4554` | lifted ~30% L | Device category fills, at low alpha on faces |

Colour is never the only signal: blocking items use a solid outline + icon, warnings a dashed outline + "?", and clearance zones use a 45° hatch.

## Type

- **Barlow** (UI): DIN-lineage grotesk, close to ISO technical lettering. 400/500/600/700.
- **Barlow Semi Condensed** (drawing annotations, title-block labels, U labels): 500/600.
- **Spline Sans Mono** (every measurement, U number, watt and ID): tabular figures, so units line up.
- Minimum size is 12 px for any meaningful label; title-block field labels are 11 px semibold caps, the only exception.

## Line weights

Walls are 2.25 px ink. Objects are 1.5 px ink. Dimension lines are 1 px ink with 45° tick terminators. Grid lines are 1 px construct. Selection is 1.5 px ink with square handles. No hairlines below 1 px for anything meaningful.

## Components

- **Title block**: the app header, a ruled grid of label/value cells (Project, Site, Room, Rev, Status, Drawn, Checked). Status shows as a stamp: `DRAFT` outlined, `IN REVIEW` hatched, `APPROVED` solid ink.
- **Inspector**: ruled field rows with a mono value and a unit suffix; numeric steppers; 45° rotation step buttons.
- **Checks strip**: one row per issue with severity glyph, plain-language problem, the object ID (selects it), and a fix hint.
- Corner radius is 2 px on controls and 0 on panels and the sheet. Depth comes from panel rules and one soft shadow on floating tool palettes only.

## Prohibitions

No gradients, glass or glow. No cards-as-layout. No faint hairlines carrying meaning. No mono as decoration; mono is for figures only.
