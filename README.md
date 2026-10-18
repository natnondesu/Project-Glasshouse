<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/glasshouse-lockup-horizontal-dark.svg">
  <img src="apps/web/public/brand/glasshouse-lockup-horizontal-color.svg" alt="Glasshouse" width="320">
</picture>

### Survey the room. Plan every rack. Hand over the install sheet.

Glasshouse turns a site survey into an approved room and rack plan your onsite team can install from.<br>
Power, clearance and every device are checked before anyone lifts a rack.

<br>

![TypeScript](https://img.shields.io/badge/TypeScript-end%20to%20end-1C64C8?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-0E1824?style=flat-square&logo=react&logoColor=7FA2E8)
![three.js](https://img.shields.io/badge/three.js-room%203D-0E1824?style=flat-square&logo=threedotjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-API-0E1824?style=flat-square&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-1C64C8?style=flat-square&logo=postgresql&logoColor=white)
![EN / TH](https://img.shields.io/badge/UI-EN%20%C2%B7%20%E0%B9%84%E0%B8%97%E0%B8%A2-7FA2E8?style=flat-square)

<br>

<img src="docs/readme/hero.gif" alt="Dragging a rack on the plan: its clearance zone follows and the checks re-run" width="900">

<sub>Move a rack and its clearance zone moves with it. The checks re-run on every change.</sub>

</div>

---

## Why Glasshouse

A rack installation used to need a drawing, a spreadsheet, a power calculation and a chat thread, and they never agreed with each other. In Glasshouse there is **one record per room**. The 2D plan, rack elevation, room 3D, bill of materials and Install sheet are all views of that same record, so nothing can quietly disagree.

```mermaid
flowchart LR
    S["Survey<br/><sub>room, doors, MCB panels,<br/>existing gear, power budget</sub>"] --> P["Plan<br/><sub>racks, devices, chassis,<br/>feeds, network</sub>"]
    P --> R["Review<br/><sub>checks, notes,<br/>acknowledgements</sub>"]
    R --> A["Approved revision<br/><sub>frozen and fingerprinted</sub>"]
    A --> I["Install sheet<br/><sub>printed for install day</sub>"]
    R -. changes requested .-> P
```

## A quick tour

<table>
<tr>
<td width="50%" valign="top">

**Plan the room**<br>
<sub>Draw the survey to scale: walls, doors, partitions, MCB panels, ACs and display walls. Place racks, and the front and rear clearance zones and power feeds draw themselves.</sub>

<img src="docs/readme/plan.png" alt="Plan view with a selected rack, inspector and checks">

</td>
<td width="50%" valign="top">

**Walk through it in 3D**<br>
<sub>The same room in 3D, with racks, devices and the power runs from each panel. Orbit with the trackpad, or walk in at eye height.</sub>

<img src="docs/readme/room-3d.gif" alt="Orbiting the room in 3D">

</td>
</tr>
<tr>
<td valign="top">

**Fill every U**<br>
<sub>Rack elevations with real U occupancy, depth checks, chassis and their node slots. Demand you don't know yet stays "unknown", never zero.</sub>

<img src="docs/readme/elevation.png" alt="Rack elevation">

</td>
<td valign="top">

**MCB panels as built**<br>
<sub>One row, one column or two columns, numbered odd/even or in sequence, with an optional main breaker. Every feed lands on a breaker, and overloads are flagged per phase.</sub>

<img src="docs/readme/mcb-panel.png" alt="MCB panel manager showing a two-column panel with a main breaker">

</td>
</tr>
<tr>
<td valign="top">

**Review, then approve**<br>
<sub>Blocking checks must be fixed. Unknowns need a reviewer's acknowledgement with a reason. Approval freezes the revision and fingerprints it.</sub>

<img src="docs/readme/review.png" alt="Review tab with checks and approval">

</td>
<td valign="top">

**Hand over the Install sheet**<br>
<sub>A printable sheet from the approved revision: room drawing, rack elevations, cable and feed tables, and panel schedules drawn the way each panel is wired.</sub>

<img src="docs/readme/install-sheet.png" alt="Install sheet with panel schedule">

</td>
</tr>
</table>

## What gets checked

| Check | Example |
| --- | --- |
| **Clearance** | A cabinet in a rack's front clearance zone, a zone running outside the room, or a sliding door across it |
| **Placement** | Objects overlapping each other or standing outside the surveyed floor |
| **Rack fit** | A device deeper than its rack (two devices can't share a U in the first place) |
| **Power** | Room demand over the survey's power budget and design limit |
| **Feeds** | A feed with no breaker, a breaker smaller than its load, or a panel marked not in use |
| **Main breaker** | The busiest phase of a three-phase panel over its main breaker rating |
| **Room fittings** | An AC blowing or dripping onto racks, no service space for a precision AC, a display wall blocked from view |
| **Network** | Mismatched link media, LAG speeds and far ends, VLAN access, native and allowed lists |
| **Unknowns** | Unknown device demand, which a reviewer must acknowledge before approval |

Problems are flagged while you design. They only block at approval.

## Two ways to run it

| | **Browser mode** | **Server mode** |
| --- | --- | --- |
| Where the work lives | In your browser (IndexedDB) | One shared workspace in PostgreSQL |
| Sharing | Export and import a project file | Everyone sees the same rooms live |
| Sign-in | None; names are typed and marked *unverified* | Company SSO through Authelia (OIDC), or app accounts |
| Roles | — | Admin, editor, reviewer, viewer |
| Editing | One person per browser | Claim a room to edit; others watch live |
| History | Revisions in the file | Append-only command log, immutable approvals, daily backups |
| Hosting | Static site (Vercel) | Docker image behind Traefik |

Both modes run the same domain package, so the rules, checks and fingerprints are identical.

<div align="center">
<img src="docs/readme/signin.png" alt="The Glasshouse sign-in page" width="820">
<br>
<sub>Server mode signs in with your company account, or an app account an admin created.</sub>
</div>

## Quick start

**You need:** Node 22 or newer, pnpm 10, and Docker for server mode and its tests.

```sh
pnpm install
pnpm dev            # browser mode at http://localhost:5173, with sample projects to explore
```

**Server mode in development:**

```sh
docker compose -f docker-compose.dev.yml up -d                     # Postgres 18 on 127.0.0.1:5432

DATABASE_URL=postgres://glasshouse:glasshouse@127.0.0.1:5432/glasshouse \
GLASSHOUSE_AUTH=dev-insecure GLASSHOUSE_SEED_SAMPLE=1 \
pnpm dev:server                                                     # API on 127.0.0.1:8787

VITE_GLASSHOUSE_SERVER=1 pnpm dev                                   # web app, proxies /api and /auth to 8787
```

To try it without Postgres, swap `DATABASE_URL=…` for `GLASSHOUSE_STORE=memory` (everything is lost on restart). `dev-insecure` skips sign-in and is for your own machine only. A real deployment uses `GLASSHOUSE_AUTH=on`; see [`docs/go-live.md`](docs/go-live.md).

## Tests

| Command | What it runs |
| --- | --- |
| `pnpm test` | Unit tests: domain, server and web (Vitest) |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm e2e` | Browser mode end to end in Chromium, WebKit and Firefox (Playwright) |
| `pnpm e2e:server` | The web app against a real server |
| `pnpm e2e:auth` | Sign-in, roles and claims, with auth on |
| `pnpm test:db` | Server storage against a real Postgres (Docker) |

The gate before every merge is `pnpm test && pnpm typecheck && pnpm build && pnpm e2e && pnpm e2e:server && pnpm e2e:auth && pnpm test:db`.

## How it's built

```text
packages/domain   Pure TypeScript model: commands, checks, fingerprints, file formats. No I/O.
apps/web          React + zustand UI: SVG plan, three.js room 3D, Install sheet, EN/TH.
apps/server       Fastify API: command log in Postgres, OIDC sign-in, roles, room claims, backups.
docker/           Production image (web + API in one container).
deployment/       Compose stack, backup and restore scripts, smoke test.
docs/             Product spec, ADRs, design specs, go-live runbook.
```

Every change is a **command** applied by the domain package, whether it runs in the browser or on the server. The server keeps an append-only log of commands and replays it, so an approved revision can be proved unchanged by its fingerprint.

## Deploying

The production image is built by `bitbucket-pipelines.yml` (or `pnpm docker:build`) and runs as three containers: Postgres 18, the app, and a nightly `pg_dump` backup. The step-by-step runbook, covering the Authelia client, environment, first admin, smoke test, backups and restore, is in [`docs/go-live.md`](docs/go-live.md).

## Read more

- [`PRODUCT.md`](PRODUCT.md): who uses it and why
- [`CONTEXT.md`](CONTEXT.md): the glossary (Project, Site, Room, Plan, Revision…)
- [`DESIGN.md`](DESIGN.md): the visual system
- [`docs/product/Glasshouse-Product-Specification.md`](docs/product/Glasshouse-Product-Specification.md): the full specification
- [`docs/adr/`](docs/adr/): architecture decisions

<div align="center">
<br>
<img src="apps/web/public/brand/glasshouse-mark-color.svg" alt="" width="40">
<br>
<sub>Built by the OxygenAI Operations team. The sample projects and catalog are illustrative.</sub>
</div>
