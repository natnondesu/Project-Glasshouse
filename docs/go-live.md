# Glasshouse go-live runbook

Run every command from `deployment/` on the ops host unless it says otherwise. `docker compose` here always means the stack in `deployment/docker-compose.yml`.

**Prerequisite:** Docker Compose v2.24.4 or newer on the host (`docker compose version`). The files use `env_file` with `path`/`required` (needs 2.24) and `!reset`/`!override` in `docker-compose.smoke.yml` (needs 2.24.4). Older Compose fails with a parse error, not silently.

## 1. What runs where

Three containers in one compose project (`glasshouse`):

| Container | Image | Job |
| --- | --- | --- |
| `glasshouse-db` | `postgres:18-alpine` | The command log, snapshots, users, approvals |
| `glasshouse-web` | `oxygenai/glasshouse:<TAG>` | The app and the API, port 8787 on the `traefik-proxy` network only |
| `glasshouse-backup` | `postgres:18-alpine` | `pg_dump` every day at `BACKUP_AT` (03:00 Asia/Bangkok), keeping `BACKUP_KEEP_DAYS` (14) days |

- URL: `https://glasshouse.ops.oxygenci.com` (TLS ends in front of Traefik; Traefik's `web` entrypoint serves it over plain HTTP).
- Data: `/data/services/services-data/glasshouse/db-data` (Postgres 18 layout) and `/data/services/services-data/glasshouse/backups`.
- Config: `deployment/.env` (never in git). The template is `deployment/.env.example`.
- Single instance by design: a second `glasshouse-web` refuses to start ("Another Glasshouse server is already running").
- The Postgres password is an admin secret. The append-only rule on commands and approvals is enforced by database triggers, and whoever owns the database can switch those off.

## 2. Authelia client

The IT owner adds this to the `clients:` list in Authelia's `configuration.yml` and restarts Authelia. Generate the hash with `authelia crypto hash generate pbkdf2 --password '<secret>'`; the plain secret goes in `GLASSHOUSE_OIDC_CLIENT_SECRET`.

```yaml
      - client_id: glasshouse
        client_name: Glasshouse
        client_secret: '$pbkdf2-sha512$310000$...'   # authelia crypto hash generate pbkdf2 --password '<secret>'; the plain secret goes in GLASSHOUSE_OIDC_CLIENT_SECRET
        public: false
        authorization_policy: two_factor
        consent_mode: pre-configured
        pre_configured_consent_duration: 1w
        token_endpoint_auth_method: client_secret_basic
        userinfo_signed_response_alg: none
        require_pkce: true
        pkce_challenge_method: S256
        redirect_uris:
          - https://glasshouse.ops.oxygenci.com/auth/oidc/callback
        scopes: [openid, profile, email]
        response_types: [code]
        grant_types: [authorization_code]
```

The company directory maps the name claim to a first name, so company sign-in gives first names only. Admins set full names in Users; a name set there is kept on later sign-ins.

## 3. Before the first deploy

1. From a container on the ops host, Authelia's discovery document must be reachable and trusted without `-k`:

   ```sh
   docker run --rm --network traefik-proxy curlimages/curl:8.11.1 -fsS https://authelia.oxygenci.com/.well-known/openid-configuration
   ```

   It must print JSON. If it fails on the certificate, fix that first: the app does not skip certificate checks.
2. DNS for `GLASSHOUSE_HOST` points where the other `*.ops.oxygenci.com` apps do.
3. The `traefik-proxy` network exists (`docker network inspect traefik-proxy`). The app does not start without it.

## 4. Deploy

1. Get the image. Pull what the pipeline pushed, or build on the host from a checkout of the release commit (run this one from the repo root):

   ```sh
   docker pull oxygenai/glasshouse:<tag>
   docker build -f docker/Dockerfile -t oxygenai/glasshouse:<tag> .
   ```

2. Create the data folders and the config:

   ```sh
   sudo mkdir -p /data/services/services-data/glasshouse/db-data /data/services/services-data/glasshouse/backups
   cp .env.example .env
   chmod 600 .env
   ```

   Fill `.env` in. `TAG` is the image tag from step 1. Generate `POSTGRES_PASSWORD` and the OIDC client secret with `openssl rand -hex 24`. `GLASSHOUSE_BOOTSTRAP_ADMIN` is the email of the person who becomes Admin on their first company sign-in.
3. Start it and wait for the health checks:

   ```sh
   docker compose up -d --wait
   ```

4. Sign in as `GLASSHOUSE_BOOTSTRAP_ADMIN` through the company account.
5. Fallback if company sign-in is not working yet: create a local admin. It prints a temporary password once; they choose their own at first sign-in.

   ```sh
   docker compose exec web node dist/cli.js create-admin you@oxygenai.com "Your Name"
   ```

6. Recovery: if the only admin was demoted or switched off, restore the role from the host.

   ```sh
   docker compose exec web node dist/cli.js set-role you@oxygenai.com admin
   docker compose exec web node dist/cli.js reset-password you@oxygenai.com
   ```

## 5. Proxy and client addresses

`GLASSHOUSE_TRUST_PROXY=172.16.7.0/24` is the `traefik-proxy` subnet. Behind Traefik every request arrives from a Traefik address; with this setting the app believes `X-Forwarded-For` only when the connection comes from that subnet and otherwise ignores it, so a client who reaches the app by any other path cannot spoof an address. Without it every person looks like Traefik, and the password sign-in throttle (20 failures from one address lock that address for 15 minutes) counts everyone together.

Worst case, if a front proxy sits before Traefik and Traefik does not trust it: Traefik replaces the client address with the front proxy's, so every request still looks like one address. Password sign-in then shares one throttle (a few mistyped passwords across the team can block password sign-in for 15 minutes). Company sign-in does not use the throttle and is unaffected. Nothing else breaks.

Check during the pilot (step 9 below). If every sign-in shows one address, IT adds the front proxy's address to Traefik's `entryPoints.web.forwardedHeaders.trustedIPs`, then the check is repeated. Do not widen `GLASSHOUSE_TRUST_PROXY` to cover the front proxy instead: the app is only safe if it can be reached through Traefik alone.

## 6. Moving from the Vercel version

The plan, decided with the product owner on 2026-10-17:

> Until go-live the team keeps using Vercel, and the product owner's browser is the single master copy. Teammates send Project files to the product owner, who merges them with the existing keep / take / copy choice; the product owner's Catalog is canonical. At go-live only the projects that are live are exported as Project files (plus a Catalog file for unused Templates) and imported into the server with the existing *Import project file* action, which in server mode is an ordinary `project/import` command. Sample projects are not imported; imported approvals keep their unverified names as historical records.
>
> - Until then: a Workspace backup at least weekly, stored off the laptop (the master copy lives in one browser).
> - Version rule: on import day the server runs the same or newer code than the Vercel build (both deploy from `main`), because migrations only run forward.
> - Rehearsal: import the real Project files into a staging server first and compare a few rooms.
> - Cut-over: stop editing on Vercel, export, import, switch the team over.

**Rehearsal on a staging stack.** A second compose project with its own data folder and a throwaway password, published on this host's loopback only (no Traefik), reached through an SSH tunnel. The `docker-compose.smoke.yml` override replaces the web container's `env_file`, so the production `deployment/.env` is not read by the staging stack (staging takes its values from `.env.staging` only). This needs the Compose version in the prerequisite above.

```sh
mkdir -p /data/services/services-data/glasshouse-staging/db-data /data/services/services-data/glasshouse-staging/backups
cat > .env.staging <<EOF
TAG=<tag>
GLASSHOUSE_HOST=glasshouse-staging.localhost
GLASSHOUSE_PUBLIC_URL=http://localhost:18787
GLASSHOUSE_DATA_DIR=/data/services/services-data/glasshouse-staging
POSTGRES_PASSWORD=$(openssl rand -hex 24)
GLASSHOUSE_LOCAL_LOGIN=on
EOF
export GLASSHOUSE_ENV_FILE=.env.staging
STAGING="docker compose --env-file .env.staging -p glasshouse-staging -f docker-compose.yml -f docker-compose.smoke.yml"
$STAGING up -d --wait
$STAGING exec web node dist/cli.js create-admin you@oxygenai.com "Your Name"
```

From your laptop: `ssh -L 18787:127.0.0.1:18787 <ops-host>`, then open `http://localhost:18787`, sign in, import the Project files and compare a few rooms with Vercel. Tear it down with `$STAGING down -v` and remove `/data/services/services-data/glasshouse-staging` and `.env.staging`.

**Cut-over.** Stop editing on Vercel, export the live Projects (and the Catalog file), deploy (section 4), import them with *Import project file*, then switch the team over.

What to expect after the import:

- Imported approvals are historical records. An imported Project file can carry approved revisions; they show "(unverified)" names and get no row in the server's approvals table (only approvals made on this server are recorded there).
- An imported room is unclaimed: the first accepted edit claims it.

## 7. Backups and restore

- **Nightly dumps** by the `backup` container into `/data/services/services-data/glasshouse/backups/glasshouse-YYYY-MM-DD-HHMM.dump`, keeping 14 days. Check it weekly: `docker logs --tail 20 glasshouse-backup` must show a recent `backup: wrote ...` line. A failed dump is logged to stderr, leaves no file behind, and is retried every 30 seconds while the `BACKUP_AT` minute lasts; if that window passes it is retried the next day. `BACKUP_AT` must be `HH:MM`; the container refuses to start otherwise.
- **In-app download**: an admin chooses "Download workspace backup" in the account menu. It is the whole workspace as a file the app can import; use it before risky edits and for the weekly off-host copy before go-live.
- **Off the host**: ask IT for their standard off-host backup target and copy `backups/` there. The dumps on the same disk do not protect against losing the disk.
- **Restore** a dump into the running stack (this replaces everything in the database with the dump's contents):

  ```sh
  ./restore.sh /data/services/services-data/glasshouse/backups/glasshouse-YYYY-MM-DD-HHMM.dump
  ```

  It asks you to type `yes` first (`FORCE=1` skips the question; the smoke test uses that). It stops `web`, loads the dump into `db`, and starts `web`, which replays the restored log. If the load fails it exits non-zero and leaves `web` stopped on purpose: the previous data may be partly replaced, so restore an earlier dump with the same script, or ask for help with the output in hand, before starting `web` again. Then open the app and check a few rooms. Use `sudo ./restore.sh ...` if the backups folder is not readable by you.
- **Restore drill: before go-live and every quarter.** Take a backup now (`docker compose exec -T backup sh /backup.sh --once`), make a visible change, restore the backup, and confirm the change is gone and the rest is intact. Do it on the staging stack from section 6 if the real one already holds live work (`COMPOSE="$STAGING" ./restore.sh <dump>`). `pnpm smoke` from a laptop runs the same drill against a throwaway stack, including the second-instance refusal.

## 8. Releasing

The pipeline in `bitbucket-pipelines.yml` runs on Bitbucket only. While the repository is still on GitHub nothing here runs: build with `pnpm docker:build` (it tags the image `oxygenai/glasshouse:dev`), move the image to the host by hand and deploy it with `TAG=dev`, or move the repository first.

**One-time setup**

- The repository is on Bitbucket as `oxygenai/glasshouse` with Pipelines enabled.
- Repository variables, with the same names as `rtsp-viewer-next`: `DOCKER_HUB_USER`, `DOCKER_HUB_ACCESS_TOKEN` (secured), `SONAR_HOST_URL` and `SONAR_TOKEN` (secured).
- A deployment environment named `Production` (the Release stage uses it).
- The SonarQube project key `Glasshouse` (see `sonar-project.properties`) exists in the company SonarQube. The product owner creates it, or gives us the key IT assigns and we change the file.

**What runs when**

| Event | Steps |
| --- | --- |
| Pull request | Unit tests, types and build; browser tests (local, shared server, sign-in); Postgres tests |
| Push to `main` | The same three, then a SonarQube scan on the self-hosted runner |
| Tag `v*.*.*` | The same three again (a tag can come from a commit that never went through `main`), then the Release stage: build `oxygenai/glasshouse:<tag>` and `:latest` and push both |

**A release**

1. From an up-to-date `main` that has passed the pipeline:

   ```sh
   git tag v2026.10.20 && git push origin v2026.10.20
   ```

2. Wait for the Release stage to go green in Bitbucket.
3. On the host, from `deployment/`, take a backup and update (section 9):

   ```sh
   TAG=v2026.10.20 docker compose pull web && TAG=v2026.10.20 docker compose up -d --wait web
   ```

4. Set `TAG=v2026.10.20` in `deployment/.env`, so a later `docker compose up` does not go back.

Deploying to the host stays manual, as for `rtsp-viewer-next`. Pushing a version tag also moves `:latest` (as in `rtsp-viewer-next`), so always deploy by an explicit `TAG`, never `:latest`.

**Rollback.** Deploy the previous tag the same way, but only if no migration ran in between: migrations only run forward, so otherwise restore a dump from before the update first (section 7).

## 9. Updating

1. Take a backup first: rolling back needs a dump from before the update.

   ```sh
   docker compose exec -T backup sh /backup.sh --once
   ```

2. Start the new tag:

   ```sh
   TAG=<new> docker compose up -d --wait web
   ```

3. Set `TAG=<new>` in `.env` so a later `docker compose up` does not go back.

The old container gets SIGTERM and writes a final snapshot before it exits (it has 30 seconds). People in the app reconnect by themselves, and edit claims are cleared by the restart, so the next edit claims the room again.

Migrations only run forward. Never put an older image back on a database a newer one has opened: restore a dump from before the update first (section 7), then start the older tag.

## 10. Pilot checklist

One real site, one week.

- [ ] Two editors on different rooms, then on the same room: the claim strip, a takeover after 15 minutes without edits (or by an admin), and the "Download my version" copy for the person who lost the room.
- [ ] A submit, then an approval by a different reviewer; the fingerprint on the review panel matches the one on the Install sheet.
- [ ] A viewer's account: read-only, with the banner.
- [ ] A restart during the day (`docker compose restart web`): nothing lost.
- [ ] After the week, check client addresses on sign-in:

  ```sh
  docker compose logs web | grep -o '"remoteAddress":"[^"]*"' | sort | uniq -c
  ```

  If every sign-in shows one address, apply the proxy fix in section 5.
- [ ] The smoke test against the real Authelia: the email and the name arrive (from userinfo), the issuer string matches exactly (no trailing-slash difference), and the session cookie is `Secure`.
- [ ] A native Thai reader checks the sign-in, claims and Users strings.

## 11. Known limits

- A single instance. There is no failover; a second instance refuses to start.
- Claims are lost on restart, by design. The next edit claims the room.
- Whole-workspace validation per command is fine below about 5 MB of workspace; above that, validation will need to look at the touched room only (design doc).
- A dev database written before Plan A's final fixes must be reset (old `room/create` commands lack `floorAreaId`). This concerns developer machines, not a fresh production database.
- The local `docker-compose.dev.yml` runs Postgres 18 on a new volume (`glasshouse-db-18`); the old Postgres 17 dev volume is not opened and is left alone.
