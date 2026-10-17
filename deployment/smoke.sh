#!/bin/sh
# Local end-to-end check of the production stack: build the image, bring up the company compose with a
# throwaway env file, then exercise health, headers, sign-in, persistence across a restart, the
# single-instance lock, a backup and a restore drill. Exits 0 only when every check passes.
#   sh deployment/smoke.sh            build and test
#   SKIP_BUILD=1 sh deployment/smoke.sh   reuse oxygenai/glasshouse:smoke
set -eu
cd "$(dirname "$0")"

PORT=18787
BASE="http://localhost:$PORT"
IMAGE_TAG=smoke
ENV_FILE=.env.smoke
PROJECT=glasshouse-smoke
COMPOSE="docker compose --env-file $ENV_FILE -p $PROJECT -f docker-compose.yml -f docker-compose.smoke.yml"
export COMPOSE

data_dir=""
jar=""
made_network=0
started=0

cleanup() {
  status=$?
  set +e
  echo "smoke: cleaning up"
  if [ "$started" = 1 ]; then $COMPOSE down -v --remove-orphans >/dev/null 2>&1; fi
  # The database files may belong to another user inside the container; remove them from there if rm cannot.
  if [ -n "$data_dir" ]; then
    rm -rf "$data_dir" 2>/dev/null
    if [ -e "$data_dir" ]; then
      docker run --rm -v "$data_dir:/d" --entrypoint sh postgres:18-alpine -c 'rm -rf /d/* /d/.[!.]*' >/dev/null 2>&1
      rm -rf "$data_dir"
    fi
  fi
  [ -n "$jar" ] && rm -f "$jar"
  rm -f "$ENV_FILE"
  if [ "$made_network" = 1 ]; then docker network rm traefik-proxy >/dev/null 2>&1; fi
  if [ "$status" -ne 0 ]; then echo "smoke: FAILED" >&2; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  echo "smoke: FAIL: $1" >&2
  exit 1
}

step() { echo "smoke: $1"; }

# Print the body of a GET (cookie jar attached), failing the script on a non-2xx.
get() { curl -fsS -b "$jar" "$BASE$1"; }

# POST a JSON body as the browser would: custom header and our own origin.
post() {
  curl -fsS -b "$jar" -c "$jar" -X POST -H 'x-glasshouse: 1' -H "Origin: $BASE" -H 'content-type: application/json' --data "$2" -w '\n%{http_code}' "$BASE$1"
}

wait_ready() {
  n=0
  until curl -fsS "$BASE/api/ready" 2>/dev/null | grep -q '"ok":true'; do
    n=$((n + 1))
    [ "$n" -le 60 ] || fail "the app did not become ready within 60 seconds"
    sleep 1
  done
}

seq_now() { get /api/workspace | sed -n 's/^{"seq":\([0-9]*\).*/\1/p'; }

create_project() {
  out="$(post /api/commands "{\"clientId\":\"smoke\",\"commands\":[{\"commandId\":\"$1-cmd\",\"command\":{\"type\":\"project/create\",\"id\":\"$1\",\"name\":\"$2\"}}]}")" || fail "creating project $1 was refused: $out"
  echo "$out" | grep -q "\"seq\":$3" || fail "project $1 was not accepted at seq $3: $out"
}

docker info >/dev/null 2>&1 || fail "Docker is not running"

if [ "${SKIP_BUILD:-0}" = 1 ]; then
  docker image inspect "oxygenai/glasshouse:$IMAGE_TAG" >/dev/null 2>&1 || fail "SKIP_BUILD=1 but oxygenai/glasshouse:$IMAGE_TAG does not exist"
else
  step "building oxygenai/glasshouse:$IMAGE_TAG"
  docker build -q -f ../docker/Dockerfile -t "oxygenai/glasshouse:$IMAGE_TAG" .. >/dev/null || fail "image build failed"
fi

if ! docker network inspect traefik-proxy >/dev/null 2>&1; then
  docker network create traefik-proxy >/dev/null
  made_network=1
fi

data_dir="$(mktemp -d)"
# Created here, not by Docker: on Docker Desktop a missing bind source is created inside the VM, not on this Mac.
mkdir "$data_dir/db-data" "$data_dir/backups"
jar="$(mktemp)"
{
  echo "TAG=$IMAGE_TAG"
  echo "GLASSHOUSE_HOST=glasshouse.localhost"
  echo "GLASSHOUSE_PUBLIC_URL=$BASE"
  echo "GLASSHOUSE_DATA_DIR=$data_dir"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
  echo "GLASSHOUSE_LOCAL_LOGIN=on"
} > "$ENV_FILE"

step "starting the stack"
started=1
$COMPOSE up -d --wait || fail "the stack did not become healthy"

step "ready endpoint"
wait_ready

step "security headers"
curl -fsS -D - -o /dev/null "$BASE/" | grep -qi '^content-security-policy:' || fail "/ is served without a content-security-policy header"

step "create-admin and first sign-in"
created="$($COMPOSE exec -T web node dist/cli.js create-admin smoke@test.local "Smoke Admin")" || fail "create-admin failed: $created"
temp="$(echo "$created" | sed -n 's/^Temporary password: //p')"
[ -n "$temp" ] || fail "create-admin printed no temporary password: $created"
login="$(post /auth/login "{\"email\":\"smoke@test.local\",\"password\":\"$temp\"}")" || fail "sign-in was refused: $login"
echo "$login" | grep -q '"mustChangePassword":true' || fail "first sign-in did not demand a new password: $login"
echo "$login" | tail -n 1 | grep -q '^200$' || fail "sign-in did not answer 200: $login"

step "password change and first command"
newpw="$(openssl rand -hex 16)"
changed="$(post /auth/password "{\"current\":\"$temp\",\"next\":\"$newpw\"}")" || fail "password change failed: $changed"
create_project smoke-one "Smoke one" 1

step "restart keeps the workspace"
$COMPOSE restart web >/dev/null || fail "restart failed"
wait_ready
[ "$(seq_now)" = 1 ] || fail "after a restart the workspace is not at seq 1"
get /api/workspace | grep -q 'Smoke one' || fail "after a restart the project is gone"

step "a second instance refuses to start"
if second="$($COMPOSE run --rm --no-deps -T web 2>&1)"; then
  fail "a second instance started against the same database"
fi
echo "$second" | grep -q 'Another Glasshouse server is already running' || fail "second instance failed for the wrong reason: $second"
curl -fsS "$BASE/api/ready" | grep -q '"ok":true' || fail "the first instance stopped answering after the second one was refused"

step "backup"
$COMPOSE exec -T backup sh /backup.sh --once || fail "backup.sh --once failed"
dump="$(ls -t "$data_dir"/backups/glasshouse-*.dump 2>/dev/null | head -n 1)"
[ -n "$dump" ] && [ -s "$dump" ] || fail "no dump was written to $data_dir/backups"

step "restore drill"
create_project smoke-two "Smoke two" 2
[ "$(seq_now)" = 2 ] || fail "the second project did not reach seq 2"
sh ./restore.sh "$dump" || fail "restore.sh failed"
wait_ready
[ "$(seq_now)" = 1 ] || fail "after the restore the workspace is not back at seq 1"
get /api/workspace | grep -q 'Smoke two' && fail "after the restore the second project is still there"

echo "smoke: all checks passed"
