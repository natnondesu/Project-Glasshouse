# M5: First team feedback (2026-10-15)

Source: Few's team demo of the deployed MVP. Decisions taken with Few in session.

## Phases (each merged to `main` when green; `main` auto-deploys)

1. **Quick fixes**
   - Elevation text overflow: device names inside chassis blocks, reserved-range labels, check action buttons.
   - Elevation catalog panel collapsible (remembered per browser).
   - 3D: show/hide power feed lines.
   - Every icon-only button gets a hover hint (one shared hint layer, `data-hint`).
2. **Equipment state**: `planned | deployed | maintenance` per device, chassis and node.
   - Info only, stored on the plan outside revisions (like review notes), so it can change after approval.
   - Shown with colour and symbol in elevation, 3D, BOM (column and filter) and the Install sheet. All states count toward power.
3. **Drag devices** within a rack and across racks in the elevation, with a drop preview; the existing occupancy rules apply.
4. **Power chaining**: any power source may itself be fed from another source (a UPS from an MCB way, an MCB from a UPS, a plug from an MCB).
   - Feeds form a tree, and cycles are refused.
   - Load checks roll the downstream demand up to each upstream way.
   - Routes are drawn source to source, the same way rack feeds are.
5. **Port mapping**
   - Templates define ports (name, type RJ45/SFP/SFP+/QSFP, speed). Devices inherit them and can add, rename or remove ports.
   - A link joins any two ports, one link per port, with an optional cable label and type.
   - Network devices get a floating port manager (like the MCB manager). Servers list their interfaces; one NIC is the default.
   - Checks: media mismatch (RJ45↔SFP) and a port linked to itself.
   - Install sheet: cable schedule (from device:port → to device:port, label, type). BOM and search include ports and links.
6. **Thai (i18n)**
   - Framework plus English and Thai catalogues.
   - The domain returns message codes with parameters instead of English sentences (checks, errors).
   - The Install sheet prints in the chosen language. A switch in the title bar is remembered per browser.
   - Claude drafts Thai; the team reviews wording.

## Defaults decided
- Equipment state has three values; "decommissioned" is deferred until asked for.
- Voltage stays 230 V; each feed is sized for its full downstream load.
