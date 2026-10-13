# Glasshouse — Design System

Status: **glass and depth**, adopted 2026-10-14. It replaces the technical-drawing direction and keeps the component structure and placement. The reference is the "Glass and depth" page of the visual draft canvas. Exact values live in `apps/web/src/styles/tokens.css`.

## World

**Frosted glass floating over a live plan.** The room plan runs full-bleed on a cool grey-blue ground with a faint construction grid. The title block, project tree, tool palette, zoom, inspector and checks are panels of frosted glass layered above it. The drawing stays visible through them, so the editor always feels like it's *on* the room.

Depth carries meaning. The floor slab casts a soft shadow, walls are a heavy rounded ink line, and objects are solid, filled shapes rather than outlines. Light only, chosen for laptops in bright rooms; there is no theme toggle.

## Color (semantic)

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Ground | `--ground` | `#D3DBE1` | App background, plan surround |
| Floor | `--floor` | `#EEF2F5` | Footprint slab |
| Ink | `--ink` / `--ink-2` | `#0E1824` / `#3A4756` | Text, walls |
| Accent | `--acc` | `#1C64C8` | Selection, primary action, Clearance zones, measurements |
| Rack | `--rack` | `#333D49` | OxygenAI Rack body (white label) |
| Customer rack | `--rack-customer` | `#7A8794` | Rack with owner Customer |
| Existing rack | `--existing` | `#9AA6B2` | Obstacle rack, white cross |
| Column / cut-out | `--column` | `#CBD4DC` | Cut-outs |
| Furniture | `--desk` | `#E2D8CA` | Desks and furniture |
| Blocking | `--block` / `--block-fill` | `#B8322A` / `#C24A3F` | Objects and issues that block approval; the object is filled red |
| Warning | `--warn` | `#9A5A00` on `#FFF3DF` | Warnings, Draft status |
| OK | `--ok` | `#11795A` | Approved, "no issues" |

Colour never works alone. Blocking issues use a solid circle icon; warnings use a dashed circle with "?"; selection adds handles; flagged objects are also named in the checks panel.

## Glass

`.glass`: `rgb(247 249 251 / 0.56)` with `backdrop-filter: blur(13px) saturate(1.5)`, a 1px white border at 75% opacity and a 16px radius. The shadow is an inset top highlight plus a long soft drop (`0 18px 48px -12px rgb(14 24 36 / 0.22)`). Controls inside panels are translucent white (`--control-bg`) with 8–10px radii. Segmented controls use a sunken track with a white, raised selected item.

## Type

- **Geist Sans** for UI: 400, 500, 600 and 700.
- **Geist Mono** for every figure, ID, unit, chip and measurement, with tabular numerals.
- Labels are 11px semibold uppercase with +0.04em tracking. Nothing meaningful is set below 11px.

## Plan drawing

- **Room:** walls are 5px rounded ink; the floor slab has an offset blurred shadow; the grid is `--grid`, with a major line every metre.
- **Objects:** solid fills by type, with white mono labels on dark bodies. A Rack's Front is a 5px lighter band with an ink arrow.
- **Selection:** fills the object accent blue, with a 2px accent outline and white circular handles.
- **Clearance zones:** accent-tinted fill with a dashed accent outline.
- **Measure tool:** accent lines with white end dots. Results sit in white pill labels with the distance and ΔX/ΔY. Hovering an object shows its gaps to the walls, each labelled at the first spot clear of other objects.

## Prohibitions

- No dark mode until it's designed deliberately.
- No glass without content behind it. Panels float over the plan or the gridded ground, never over a flat colour block.
- No gradient text or decorative glow.
- No colour as the only signal.
- The page-wide construction grid is intentional; it's what the glass refracts. It is not a decorative template background.
