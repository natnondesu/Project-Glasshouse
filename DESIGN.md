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
- Checks counts what holds approval the way the Review badge does: blocks and to acknowledge; plain warnings get a quieter chip. Notes on the revision on screen show as a quiet link to Review ("2 notes"), never as a hold. Its head stays one line.
- Review notes are revision notes: written on a revision (approved ones too), read by anyone who opens it later, with an optional unverified name and the time. No resolving; they never hold approval. Earlier revisions' notes fold away under the current one.
- Revisions and history shows the latest 5 revisions (Show all for the rest) and pages events 20 at a time, newest first, with Newer / Older.
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
- A selected node fills its slot in accent with a heavy outline; its chassis gets a dashed accent outline.
- ⌘/Ctrl+C and V copy a plan object (a rack with its devices). The copy takes the next free name (Neopolis-01 → Neopolis-05) and lands beside the original, else on the nearest spot clear of objects, cut-outs and clearance zones; pasting again builds a row. Cables, feeds and on-site state stay with the original.

## Elevation

- A switch joins a stack (or starts one, named after itself without the trailing number) from its inspector: member number 1–9, the other members as links, Leave stack. Members wear an "S1" tag before their name in the rack, on screen and on paper. Only network gear in a rack can stack; a switch is in one stack at most.

- Racks read in plan order: rows from the top of the drawing down, each left to right. Drag a rack by its name (or Alt+←/→) to reorder; the order is kept on the room beside the revisions, so it holds on an approved plan, travels in the file and orders the Install sheet. "Reset to plan order" appears once there is one.

## Network diagram

- Generated from the cables, never hand-drawn. Switch-like gear (Network category, 4+ ports) forms the rows; single-cable devices hang under their switch in wrapped rows of up to six (fewer on the printed page).
- A core pair joined by a bundle sits side by side over the switches they share. Diagram labels are 13px so the 85% fit floor keeps them at 11px.
- Parallel cables draw as one line with a count (named after the LAG when they form one); copper solid, fibre dashed accent. Highlighting a VLAN fades what doesn't carry it.
- Every box in a diagram is one size, grown to the longest name; past 26 characters a name wraps at a hyphen or space, never cut. Leaves wrap to the canvas's shape, so a big room is a block that scrolls a little both ways, not a strip many screens wide.
- A port with no VLAN of its own carries the VLAN of the port at the other end of its cable: shown with a dashed underline and "from SW port", and counted when a VLAN is highlighted. Nothing is copied; setting this end overrides it.
- A switch stack is one box: "STACK name", a line per member ("1  ICON-CS-B10-01"), and its stack ring (cables between members) as a count, drawn as two offset outlines. Cables to any member reach the box; only the stack's row grows taller. Any member in maintenance marks the stack. Selecting it lists each member with its own ports, and its port tags start with the member ("S2 GE1/0/3 ⇄ eth0"), since members often share port names.
- The Network bar has the room search: picking a device selects its box (its stack's, or its chassis's), scrolls to it and rings it for a moment; a rack goes to its first device in the diagram; a device without cables says it's under Not cabled.
- Gear in maintenance: burnt-orange box with an "In maintenance" tab, its cables orange. In the port panel, a jack whose far end is in maintenance gets an orange ring and the triangle, and the link line says so.

## 3D

- Labels are sprites at a fixed screen size; the Labels menu picks which kinds are always labelled, the rest label on hover.
- Walk puts you in the room at eye height (1.6 m, a wider 65° view), first asking where to start, like Street View: a pin follows the pointer on the floor (green where you can stand, red where you can't) and a click drops you there facing into the room; a spot too close to a rack moves to the nearest free floor. Start at the door is one click; Esc or Cancel goes back. Click the floor to glide there; drag to look; W/S or ↑/↓ walk, A/D step aside, ←/→ turn, Shift hurries; two-finger scroll walks too. Walls, racks, other objects and columns stop you, sliding along them. The rack list (and search) stands you in front of a rack's Front, looking at it. Esc or Back to overview returns to the orbit view; clicking a rack still selects it.
- A highlighted power path glows and carries arrowheads moving from source to load (still under reduced motion); everything else on the power layer fades.

## Catalog

- Its own page: the template list (each with its port mix) beside a wide editor whose top is the template's front panel, drawn as placed devices will show it and redrawn as you edit.
- Each port group sets its layout: one row, or two rows with odd numbers on top (how most switches number) or left to right. Groups draw as labelled blocks; jacks come in modules of six columns that wrap to fit.
- Duplicate starts a variant from a template; the editor says how many placed devices use it (they keep the version they were placed from).

## Port panel

- The faceplate follows the template's layout (the catalog's current version, matched by port name, so a layout set later reaches placed gear). A port removed on a device leaves its place empty; ports a device gained sit in blocks of their own.

- Stays inside the screen wherever it's dragged; below the faceplate it scrolls (a div: a fieldset won't scroll), with edge shadows while there's more. A grip in the header and a "Drag to move" tip say it moves; the panel manager works the same way.
- Link to device is a type-to-filter list (any words of the device or rack name), each option with its rack and free-port count.
- Shift-click picks a range of jacks, ⌘/Ctrl-click adds one. Several picked show a group form: every field starts on "Leave as is" (with the shared value, or "mixed"), and Apply changes only what was filled in, in one undo step. A LAG's members outside the selection are named before their shared VLAN changes.

## Uplinks between rooms

- A port can be an uplink to a port in another room of the same site instead of a cable in its room: Link to another room… picks the room, the device (same search) and a free port there, and by default sets the far end to point back, while that room is a draft. Each room keeps its own end and approves on its own.
- The jack gets a dashed accent ring; the port reads "uplink to IDF-SW Gi1 in IDF" with whether the far end points back. Unlink clears both ends while the far room is a draft.
- Checks warn (never block) when the far end doesn't point back, no longer exists, or is cabled inside its room.
- The network diagram draws the far device as a dashed box "In IDF", on a dotted accent line; it links to that room's network. Cable schedule and CSV list uplinks with the far room as the rack.

## Install sheet

- Cable schedule: seven columns, each end one cell (device over its rack), so 70 cables fit A4 portrait.
- The BOM prints on A4 landscape with fixed column shares; names wrap at hyphens.
- The network page prints the full diagram on portrait, else on landscape; a room too big for either prints its network gear only, each switch counting the devices on it (the cable schedule lists them). Never below the 11px floor.

## Home

- The project tree's header (Projects and its actions) and the backup panel stay put; only the tree scrolls between them.
- Server mode (shared server, P1): the title block says "Connected to the Glasshouse server" / "Saved to the server · time"; the browser-backup panel is hidden. When the connection is lost (no events or heartbeat for 35 s, or the stream closes) the app goes read-only after 3 s with the banner "Lost the connection… Edits you already made are kept and will be sent", and recovers by itself. An edit the server refuses shows a closable notice "A change didn't go through: <reason>"; closing the tab while edits are unsent asks first.
- Catalog lives at the far right of the title block, past a divider, on every page (icon only below 1360 px wide); that corner is where user settings join later.
- The project tree stays. Beside it, the last room opened leads: name, approval stamp, racks / devices / power, what still holds approval, Open room and the Install sheet, and the room live in 3D on paper.
- The 3D turns slowly (about one turn a minute). It stops under the pointer so a drag looks around from there, has a pause button, holds still under reduced motion, stops drawing when scrolled away, and never takes the scroll wheel. Clicking a rack opens it in the elevation.
- When the hero room has holds, the way to them leads: "Resolve 2 items" (to Review) is the primary button and Open room steps aside; each hold count is a link to where it is resolved. No small label above the room name; "Last opened" sits in the line under it.
- Rack names sit under the 3D as links (keyboard's way in); pointing at one lights its rack. The scene draws frames only while turning or when something changes. If the 3D fails to load, its panel says so and the rest of Home stays.
- A "Skip to main content" link is the first Tab stop on every page. Outside a room the title block shows the workspace (projects · rooms) instead of blank cells.
- Below, every room is a card per site: its plan drawn small at its real width so labels keep 11px (blocking objects in red); the room name is the card's link and the hold counts are links of their own, revision chip, facts, and its approval holds in the Review badge's terms. A dashed card adds a room to that site.

## Sign-in and accounts

- **Sign-in screen**: a glass card centred on the grid ground. "Sign in with your company account" comes first; below an "or" rule sits the email-and-password form. A wrong password is explained in an alert; a first-time local user is taken to "Choose your own password" before anything else.
- **User menu**: lives in the title block's tools corner, after Catalog. The button reads the person's name; the menu shows name, email, a role stamp, Users (admins only) and Sign out.
- **View-only banner**: for Viewers, the app is read-only and the same banner slot that reports a lost connection says "You can view this workspace. Ask an admin for edit access."
- **Users screen** (`/admin/users`, admins only): a table of everyone with access (name, email, role, how they sign in, status, last sign-in) and an Add user form. A new local person's temporary password appears once, in a box with the code in mono type, and is never shown again.

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
