# Sourced by the PROD helper scripts, on the VM. Reads only POSTGRES_USER / POSTGRES_DB from the VM's
# compose .env, on the VM side (no values pass through an SSH command line or a double-quoted string).
# The password is never read: `docker compose exec` talks to postgres over the container's local socket.
set -eu
REPO_DIR="${REPO_DIR:-$HOME/Platform}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/deploy/gcp-vm/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/deploy/gcp-vm/.env}"
envval() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
PGUSER_VM="$(envval POSTGRES_USER)"; PGDB_VM="$(envval POSTGRES_DB)"
[ -n "$PGUSER_VM" ] && [ -n "$PGDB_VM" ] || { echo "POSTGRES_USER/POSTGRES_DB not found in $ENV_FILE" >&2; exit 2; }
# NOTE: run from a directory with no docker-compose.override.yml (see deploy/gcp-vm/CLAUDE.md).
dc_pg() { docker compose -f "$COMPOSE_FILE" exec -T postgres "$@"; }
