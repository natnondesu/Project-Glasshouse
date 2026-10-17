# P1 Shared server — design

Status: proposed 2026-10-17. Implements Product Specification §11 "Collaboration and access" and the P1 stage of §12, following ADR-0001 (Node + Postgres reusing `@glasshouse/domain`).

## Decisions taken with the product owner (2026-10-17)

- Glasshouse runs on company infrastructure, not Vercel. The Vercel build stays as a public demo until the switch.
- The whole team works in one shared workspace on the server; the server is the single source of truth.
- Sign-in through the company SSO, **Authelia** (OpenID Connect), **and** app-managed users (local accounts for people outside the SSO, plus role management for everyone).
- No offline mode. A short network blip must not lose edits; a longer outage makes the app read-only until it reconnects.
- Implementation choices (stack, protocol) are delegated to engineering — recorded here.

## Architecture

```
browser (React app, server mode)                    apps/server (Node, Fastify)                 Postgres
  store.dispatch(cmd)                                  POST /api/commands  ─► WorkspaceService ─► commands (append-only log)
    └─ SyncEngine: apply locally (optimistic) ──────►    validate with @glasshouse/domain          snapshots (every 200 commands,
       pending queue, batched POST                       order: seq = last + 1                      on boot and on shutdown)
  EventSource /api/events  ◄──────────────────────── broadcast {seq, clientId, commandId, command}
    └─ SyncEngine.remote(): confirmed state advances in seq order; local pending edits replay on top
```

- **Commands, not documents.** The client already expresses every edit as a `WorkspaceCommand` replayed through the pure `apply()`. The server accepts commands, applies them to its in-memory workspace with the same `apply()`, validates the result with `parseWorkspace` (1.5 ms for the 213 KB two-sample workspace, measured 2026-10-17), appends the command to the log, and broadcasts it. Every client applies the same commands in the same order, so all screens converge.
- **One ordered log.** `seq` is a single global sequence. Commands carry their own IDs and timestamps (already true in the domain), so replay is deterministic.
- **Idempotent submission.** Each command has a `(clientId, commandId)` pair, unique in the log; a retried POST after a network blip returns the original `seq` instead of applying twice.
- **Single server instance.** The workspace lives in memory, rebuilt on boot from the newest snapshot plus the log tail. A team-sized workload does not need more; horizontal scaling is out of scope and documented as a constraint.
- **Snapshots** are written every 200 commands, after boot replay, and on SIGTERM, so the replay window only spans a crash. A deploy that changes command shapes is safe because shutdown snapshots first.
- **Validation budget.** Whole-workspace validation per command is fine below ~5 MB. Above that, switch to validating only the touched room (tracked as a known limit, not built now).

### Conflicts ("never silently overwrite", spec §11)

- Commands reference stable IDs, so two people editing different rooms never conflict.
- A command that no longer applies on the server's newer state is **rejected** with the domain's reason; the client drops it from its pending queue and shows the reason. Nothing is overwritten.
- Undo/redo becomes a `draft/replace` command carrying `expected`: the draft as it was right after the user's own last edit (not what is on screen, which already includes other people's edits). If anyone changed that draft since, it is rejected as `stale` instead of overwriting their work.
- Plan C adds **room draft claiming**: one person edits a room's draft at a time; others see who is editing. A takeover (admin, or claim idle > 15 min) rejects the previous holder's queued edits and offers them as a downloadable project file — both proposals preserved.

## Identity and access (Plan B)

- **Authelia as OIDC provider**; the server is a confidential client (authorization code + PKCE, library `openid-client`). Users are provisioned on first sign-in by OIDC `sub`.
- **Local accounts**: created by an admin with a temporary password (scrypt, see below), changed on first sign-in. No email reset flow — an admin resets. `GLASSHOUSE_LOCAL_LOGIN=off` disables local sign-in entirely.
- **One users table** for both sources; roles are managed in the app (not from Authelia groups — YAGNI until asked).
- **Sessions** server-side in Postgres, cookie `gh_session` (HttpOnly, Secure, SameSite=Lax), 12 h idle / 7 d absolute. Mutating requests also require the `X-Glasshouse: 1` header and a same-origin `Origin`.
- **Bootstrap**: `GLASSHOUSE_BOOTSTRAP_ADMIN=<email>` makes that person admin on first sign-in; afterwards admins manage users in the app.
- **Server-stamped names and time**: on review commands the server overwrites `by`, `designedBy`, `reviewer` and `at` from the session, so names stop being "unverified". The UI drops the "(unverified)" label in server mode.

### Role matrix — confirmed by the product owner 2026-10-17

Each user has exactly **one** role. Roles are cumulative: each tier includes everything below it (Admin ⊃ Reviewer ⊃ Editor ⊃ Viewer), so a permission check is one comparison. If a need appears that tiers can't express (e.g. catalog admin who must not approve), add a single permission flag rather than multiple roles.

| Role | Read & export | Edit drafts, submit, notes, import project files | Approve (never own submission) | Catalog, users, claim override, restore |
| --- | --- | --- | --- | --- |
| Viewer | yes | – | – | – |
| Editor | yes | yes | – | – |
| Reviewer | yes | yes | yes | – |
| Admin | yes | yes | yes | yes |

The spec's "Onsite editor / IT editor" split is merged into Editor until there is a rule that differs between them. Access is global, not per project, for a single team; project membership is deferred until a second team uses the same server.

### Running with sign-in (Plan B, shipped)

Environment:

| Variable | Value |
| --- | --- |
| `GLASSHOUSE_AUTH` | `on` |
| `GLASSHOUSE_PUBLIC_URL` | `https://glasshouse.<company>` (the Origin check and the OIDC redirect are built from it) |
| `DATABASE_URL` | the Postgres connection string (`GLASSHOUSE_STORE=postgres`) |
| `GLASSHOUSE_OIDC_ISSUER` | `https://auth.<company>` |
| `GLASSHOUSE_OIDC_CLIENT_ID` | `glasshouse` |
| `GLASSHOUSE_OIDC_CLIENT_SECRET` | the plain secret (Authelia holds its hash) |
| `GLASSHOUSE_BOOTSTRAP_ADMIN` | your email: that person becomes Admin on first company sign-in |
| `GLASSHOUSE_DEFAULT_ROLE` | `viewer` (what a new company sign-in gets) |
| `GLASSHOUSE_LOCAL_LOGIN` | optional; `off` removes the email-and-password form |
| `GLASSHOUSE_TRUST_PROXY` | `off` (default), `on` (one proxy hop), or a comma list of proxy IPs/CIDRs; see below |

Authelia client, in Authelia's `configuration.yml`:

```yaml
identity_providers:
  oidc:
    clients:
      - client_id: 'glasshouse'
        client_name: 'Glasshouse'
        client_secret: '$pbkdf2-sha512$310000$...'   # hash of the plain secret; the plain one goes in GLASSHOUSE_OIDC_CLIENT_SECRET
        public: false
        authorization_policy: 'two_factor'
        require_pkce: true
        pkce_challenge_method: 'S256'
        redirect_uris:
          - 'https://glasshouse.<company>/auth/oidc/callback'
        scopes: ['openid', 'profile', 'email']
        token_endpoint_auth_method: 'client_secret_basic'
```

Generate the hash with `authelia crypto hash generate pbkdf2 --password '<secret>'`. The client must use `client_secret_basic` (the server authenticates that way). Email and name are read from the ID token and, when the token omits them, from the userinfo endpoint; both are supported.

Behind the company reverse proxy:

- **Set `GLASSHOUSE_TRUST_PROXY`.** Without it every client appears to come from the proxy's address, the sign-in rate limit counts them all together, and 20 failed sign-ins from anyone lock everyone out for 15 minutes. Use `on` for exactly one proxy in front, or list the proxy IPs/CIDRs.
- **With `on`, the app must be reachable only through the proxy** (firewall or private network). Otherwise a client can reach it directly and spoof `X-Forwarded-For` to dodge the limit or lock others out.
- **Sign-in state for company sign-in is held in memory**, which is fine for the single instance this design requires. Restarting the server in the middle of someone's sign-in means they try again.

First admin without SSO: `DATABASE_URL=… node dist/cli.js create-admin few@company.test "Few"` (prints a temporary password; the person must choose their own at first sign-in). `reset-password <email>` does the same for someone locked out.

Password storage: scrypt (`node:crypto`) rather than argon2id, so the image needs no native module; parameters N=32768, r=8, p=1.

Role defaults, now shipped: new company sign-ins are Viewers; deleting a project is Admin-only; accepting unknown demand is Reviewer-only; notes need Editor.

## Approvals, import, operations (Plan C)

- **Immutable approvals**: on `review/approve` the server stores `(room, revision, sha256 of canonical content, approver, at)` in an `approvals` table; the Install sheet shows the short hash. The command log is append-only (no UPDATE/DELETE grants for the app role).
- **Migration from the Vercel version** (decided with the product owner 2026-10-17): until go-live the team keeps using Vercel, and the product owner's browser is the single master copy. Teammates send Project files to the product owner, who merges them with the existing keep / take / copy choice; the product owner's Catalog is canonical. At go-live only the projects that are live are exported as Project files (plus a Catalog file for unused Templates) and imported into the server with the existing *Import project file* action, which in server mode is an ordinary `project/import` command. Sample projects are not imported; imported approvals keep their unverified names as historical records.
  - Until then: a Workspace backup at least weekly, stored off the laptop (the master copy lives in one browser).
  - Version rule: on import day the server runs the same or newer code than the Vercel build (both deploy from `main`), because migrations only run forward.
  - Rehearsal: import the real Project files into a staging server first and compare a few rooms.
  - Cut-over: stop editing on Vercel, export, import, switch the team over.
- **Deployment**: one Docker image (built web app + bundled server, non-root), Postgres alongside, TLS at the company reverse proxy. Config by environment variables. `/api/health` (liveness) and `/api/ready` (database reachable, workspace loaded).
- **Security headers** with `@fastify/helmet` and a CSP matching the app's actual origins; request body limit 25 MB (project files).
- **Logs** as JSON (pino) to stdout; every accepted command already lands in the audit log with actor and time.
- **Backup and recovery**: nightly `pg_dump`, a documented and rehearsed restore, and an admin "Download workspace backup" in the app.

## Delivery

| Plan | Scope | Gate |
| --- | --- | --- |
| **A — Shared workspace** (detailed: `plans/2026-10-17-p1a-shared-workspace.md`) | `apps/server`, Postgres log + snapshots, command API + live events, web server mode with optimistic sync, `draft/replace` undo, dev-only auth stub, local Postgres via compose | Two browsers edit the same workspace and see each other's changes; invalid and stale commands are refused with the reason; a server restart loses nothing |
| **B — Identity and roles** | Authelia OIDC, local accounts, sessions, user admin screen, role enforcement on every route and command, server-stamped names, approver ≠ submitter | Unauthorised writes fail; names on approvals are the signed-in users |
| **C — Claiming, approvals, go-live** | Room draft claiming and takeover, immutable approvals with hash, backup import, Docker image, headers, health/ready, backup + restore drill, pilot on one real site | Spec P1 gate: two users collaborate safely, unauthorised and stale writes fail, approved content is immutable |

Plans B and C are written in detail once Plan A lands, against the interfaces it actually ships.

Plan A shipped 2026-10-17 (branch `feat/p1a-shared-workspace`). Lessons carried forward: every command must carry the IDs it creates (a domain test enforces it; `sample/load` is browser-only); a lost connection is detected by an `event: ping` heartbeat within ~35 s (a half-open stream can't be seen sooner). Plan C hardening list adds: recover from an ambiguous log append (insert committed but the client saw an error) by re-reading the log tail instead of wedging; enforce the single-instance rule with a session-level Postgres advisory lock held for the process lifetime; a dev database written before Plan A's final fixes must be reset (old `room/create` commands lack `floorAreaId`).

Plan C also fixes a known import gap: a hand-edited Project file that moves a Room between Sites can duplicate the Room ID on merge; the server import must refuse it.

### Features queued with P1 (product owner, 2026-10-17)

| Order | Feature | Why here |
| --- | --- | --- |
| After B | **Weight and floor load** — Template weight (kg), Rack load limit and an optional floor load limit (kg/m²), with warnings in checks | Small, fits the existing checks; in place before the pilot |
| After B | **Measured / assumed values** — a flag on survey and object dimensions, shown on the plan and the Install sheet | Small; "honest status" for onsite data before the pilot |
| After C | **Install-day verification** — installers record serial and asset tag and mark each Device installed (using Equipment state), on the Install sheet or the Device inspector | Needs signed-in users (B) and the shared server; shaped by the pilot's real install days |

Stored text is already capped at 10,000 characters per field in the schema and at command entry (done before P1, 2026-10-17).

## Decisions (product owner, 2026-10-17)

1. Role matrix as above: one cumulative role per user.
2. Global access for now; per-project membership deferred until a second team shares the server.
3. The server starts without sample projects; an admin can add them from the tree.
4. The command log is kept forever as the audit trail.
