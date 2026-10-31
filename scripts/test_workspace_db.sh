#!/usr/bin/env bash
# This test creates its own isolated disposable PostgreSQL container.
# Never aim its Supabase auth shim at a real Supabase project.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
container_id=''
cleanup() {
  if [[ -n "$container_id" ]]; then docker rm -f "$container_id" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
container_id="$(docker run --rm -d --network none -e POSTGRES_PASSWORD=sli-local-test-only postgres:16-alpine)"
for attempt in {1..30}; do
  if docker exec "$container_id" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 30 ]]; then echo 'PostgreSQL did not become ready' >&2; exit 1; fi
  sleep 1
done
cat "$repo_root/tests/sql/workspace_setup.sql" \
    "$repo_root/supabase/migrations/20261101000100_workspace.sql" \
    "$repo_root/tests/sql/workspace_rls.sql" | docker exec -i "$container_id" psql -U postgres -v ON_ERROR_STOP=1
echo 'Disposable PostgreSQL workspace RLS checks passed.'
