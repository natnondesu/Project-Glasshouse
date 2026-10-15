# Glasshouse — Design System

Status: **glass shell over paper-and-ink drawings**, as shipped 2026-10-15. The app shell is "glass and depth" (adopted 2026-10-14); the drawing canvases (plan, Install sheet, network diagram) use the technical-drawing look the product owner asked for afterwards. Exact values live in `apps/web/src/styles/tokens.css`.

## World

**Frosted glass floating over working drawings.** The title block, project tree, view tabs, tools, inspector, checks and side panels are frosted glass on a cool grey-blue ground with a faint construction grid. The drawings they serve — the room plan, the rack elevations, the network diagram and every Install sheet page — are paper and ink: hatched clearance zones, ink outlines, dimension lines and callouts. Glass is the tool; paper is the record.

Light only, chosen for laptops in bright server rooms; there is no theme toggle. The interface works in English and Thai.

## Color (semantic)

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Ground | `--ground` | `#D3DBE1` | App background behind the glass |
| Floor | `--floor` | `#EEF2F5` | Footprint slab (3D, glass surfaces) |
| Paper | `--paper` | `#FBFCFA` | Drawing canvases: plan, sheet, network |
| Drafting ink | `--d-ink` / `--d-ink-2` / `--d-rule` | `#111720` / `#3B4552` / `#C9D0D4` | Linework and labels on paper |
| Ink | `--ink` / `--ink-2` / `--ink-3` | `#0E1824` / `#3A4756` / `#5B6672` | Text; `--ink-3` is placeholders and quiet hints (4.9:1 on glass) |
| Accent | `--acc` | `#1C64C8` | Selection, primary action, focus, clearance, fibre |
| Blocking | `--block` / `--block-fill` | `#B8322A` / `#C24A3F` | Issues that block approval |
| Warning | `--warn` | `#9A5A00` on `#FFF3DF` | Warnings, Draft status |
| OK | `--ok` | `#0B6449` | Approved, deployed, "no issues" (5.1:1 on its own tint) |
| Maintenance | `--maint` | `#C77700` | Equipment in maintenance |
| State tints | `--ok-bg`, `--ok-border`, `--warn-border`, `--block-border`, `--block-ring`, `--acc-border`, `--acc-tint` | | Chips, stamps, banners, field errors |
| Racks | `--rack`, `--rack-customer`, `--existing` | | OxygenAI, customer and existing racks |

Colour never works alone. Blocking issues use a solid circle icon, warnings a dashed circle with "?", equipment state a drawn icon (dashed circle planned, check deployed, triangle in maintenance), cables a solid (copper) or dashed (fibre) line.

## Glass

`.glass` is the only glass recipe: `rgb(247 249 251 / 0.56)` with `backdrop-filter: blur(13px) saturate(1.5)`, a 1px white border at 75% and a 16px radius, with an inset top highlight and a long soft drop. Controls inside are translucent white (`--control-bg`) with 8–10px radii; segmented controls use a sunken track with a raised selected item.

## Type

- **Geist Sans** for UI; **Geist Mono** for figures, IDs, units, port names and measurements. **IBM Plex Sans Thai** (Thai subset) sits behind both for Thai text.
- Scale tokens: `--text-2xs` 11 · `--text-xs` 12 · `--text-sm` 13 · `--text-md` 14 · `--text-lg` 16 · `--text-xl` 20; display headings above that are set per screen.
- **11px is the floor** for anything meaningful. The printed sheet uses `--text-print` (12px); its 13-column BOM prints at the 11px floor.
- Drawings keep text at full size when they change scale: the rack elevation fits whole racks by shrinking the unit height (13–16px per U), never the type; the network diagram never fits below 85%.

## Focus and states

- One focus treatment: a solid 2px accent ring (`--focus-ring`, or `--focus-ring-inset` where an outline would be clipped). SVG items show focus by thickening their own line in accent.
- Freezing actions confirm in place: Submit and Approve show what will freeze and the check status before they act. A disabled Approve says what it waits for.
- Approval is a stamp: APPROVED, revision, date and approver in a ruled green box, with the Install sheet as the next step.

## Plan drawing

- Walls are heavy rounded ink; objects are ink outlines on paper with mono labels; a Rack's Front is a heavier band with an ink tick.
- Clearance zones are hatched; blocking objects are filled red with a BLOCKING callout.
- Dimensions are drafting style (extension lines, 45° ticks). Power feeds are dashed coloured runs tagged A/B.
- The legend is on demand from the zoom bar, never left over the drawing.

## Network diagram

- Generated from the cables, never hand-drawn. Switch-like gear (Network category, 4+ ports) forms the rows; single-cable devices hang under their switch in wrapped rows of up to six (fewer on the printed page).
- Parallel cables draw as one line with a count; copper solid, fibre dashed accent. Highlighting a VLAN fades what doesn't carry it.

## Prohibitions

- No dark mode until it's designed deliberately.
- No glass without content behind it, and no glass on the drawings themselves.
- No gradient text or decorative glow.
- No colour as the only signal; no Unicode characters standing in for icons.
- No meaningful text below 11px, and no shrinking a drawing's text to make it fit.
- The page-wide construction grid behind the glass is intentional; it is what the glass refracts.
