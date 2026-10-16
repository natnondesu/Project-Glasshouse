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
| Maintenance | `--maint` | `#A64B00` | Equipment in maintenance; burnt orange, redder than the warning brown (4.9:1 on glass) |
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
- A frozen revision is said once, in the tab bar: a chip ("R01 Approved · read-only") beside Start new draft, never a banner over each view.
- Checks counts what holds approval the way the Review badge does: blocks, to acknowledge, open notes; plain warnings get a quieter chip. Its head stays one line.
- Frozen revisions read as a record, not a form: values sit as plain figures beside their units, remove buttons are hidden, and the panel says Read-only with a lock instead of "Changes save as you type".
- Approval is a stamp: APPROVED, revision, date and approver in a ruled green box, with the Install sheet as the next step.

## Plan drawing

- Walls are heavy rounded ink; objects are ink outlines on paper with mono labels; a Rack's Front is a heavier band with an ink tick.
- Clearance zones are hatched; blocking objects are filled red with a BLOCKING callout.
- Dimensions are drafting style (extension lines, 45° ticks). Power feeds are dashed coloured runs tagged A/B.
- Wall-mounted racks are drawn dashed, as overhead items are; their label adds 'wall'.
- Doors: a swing door draws its leaf open at 90° and the quarter-circle swing; a sliding door draws its track, the leaf parked beside the opening and an arrow for the direction, with no swing.
- The legend is on demand from the zoom bar, never left over the drawing.
- Below 1360px the inspector starts collapsed so the drawing gets the room (Plan, Elevation and Network alike); once someone opens or closes it, that choice is remembered, and selecting something new reopens it.
- Names and figures are never cut: a rack name too wide for the rack sits under it, and a fill count that doesn't fit is left out.

## Network diagram

- Generated from the cables, never hand-drawn. Switch-like gear (Network category, 4+ ports) forms the rows; single-cable devices hang under their switch in wrapped rows of up to six (fewer on the printed page).
- A core pair joined by a bundle sits side by side over the switches they share. Diagram labels are 13px so the 85% fit floor keeps them at 11px.
- Parallel cables draw as one line with a count (named after the LAG when they form one); copper solid, fibre dashed accent. Highlighting a VLAN fades what doesn't carry it.

## 3D

- Labels are sprites at a fixed screen size; the Labels menu picks which kinds are always labelled, the rest label on hover.
- A highlighted power path glows and carries arrowheads moving from source to load (still under reduced motion); everything else on the power layer fades.

## Home

- The project tree stays. Beside it, the last room opened leads: name, approval stamp, racks / devices / power, what still holds approval, Open room and the Install sheet, and the room live in 3D on paper.
- The 3D turns slowly (about one turn a minute). It stops under the pointer so a drag looks around from there, has a pause button, holds still under reduced motion, stops drawing when scrolled away, and never takes the scroll wheel. Clicking a rack opens it in the elevation.
- When the hero room has holds, the way to them leads: "Resolve 3 items" (to Review) is the primary button and Open room steps aside; each hold count is a link to where it is resolved. No small label above the room name; "Last opened" sits in the line under it.
- Rack names sit under the 3D as links (keyboard's way in); pointing at one lights its rack. The scene draws frames only while turning or when something changes. If the 3D fails to load, its panel says so and the rest of Home stays.
- A "Skip to main content" link is the first Tab stop on every page. Outside a room the title block shows the workspace (projects · rooms) instead of blank cells.
- Below, every room is a card per site: its plan drawn small at its real width so labels keep 11px (blocking objects in red); the room name is the card's link and the hold counts are links of their own, revision chip, facts, and its approval holds in the Review badge's terms. A dashed card adds a room to that site.

## Browser tab

- The document title names the place: "Server room A · Network · Glasshouse", in the interface language.

## Confirmations

- One popup in the middle of the screen for anything that removes or reshapes: the action button has focus (Delete then Enter), Escape cancels. Removals are red; growing the room is the ordinary primary button.

## Prohibitions

- No dark mode until it's designed deliberately.
- No glass without content behind it, and no glass on the drawings themselves.
- No gradient text or decorative glow.
- No colour as the only signal; no Unicode characters standing in for icons.
- No meaningful text below 11px, and no shrinking a drawing's text to make it fit.
- The page-wide construction grid behind the glass is intentional; it is what the glass refracts.
