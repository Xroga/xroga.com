#!/usr/bin/env bash
# Re-runs every Phase 1 verification and writes timestamped logs next to this script.
# Real-Postgres tests need a DISPOSABLE server: export STORAGE_TEST_DATABASE_URL (superuser). They create and drop their own database.
set -u
cd "$(dirname "$0")/../../../.."
OUT="$(pwd)/docs/infra/batch-1.5/evidence/logs"; mkdir -p "$OUT"
SHA=$(git rev-parse HEAD); echo "source_sha=$SHA" | tee "$OUT/00-source.txt"
git status --porcelain | grep -v '^??' > "$OUT/00-dirty.txt" || true
node --version >> "$OUT/00-source.txt"; psql --version 2>/dev/null >> "$OUT/00-source.txt" || true
run() { name="$1"; shift; { echo "# cmd: $*"; "$@"; echo "# exit: $?"; } > "$OUT/$name.log" 2>&1; echo "$name: $(grep -E '^# (tests|pass|fail|skipped)' "$OUT/$name.log" | tr '\n' ' ') $(grep -E '^# exit' "$OUT/$name.log")"; }
cd backend
run 01-typecheck npx tsc --noEmit -p .
run 02-storage-unit npx tsx --test src/storage/storageService.test.ts src/storage/r2ObjectStore.test.ts src/storage/artifactSink.test.ts
run 03-migration-unit npx tsx --test src/storage/migration/engine.test.ts src/storage/migration/readCompat.test.ts src/storage/migration/cli.test.ts
run 04-routes-and-adapter npx tsx --test src/routes/drive.test.ts src/services/storage/projectFiles.canonical.test.ts
if [ -n "${STORAGE_TEST_DATABASE_URL:-}" ]; then
  run 05-postgres-integration npx tsx --test src/storage/postgresRepository.integration.test.ts src/storage/migration/postgresMigration.integration.test.ts
else echo "05-postgres-integration: SKIPPED (STORAGE_TEST_DATABASE_URL not set)" | tee "$OUT/05-postgres-integration.log"; fi
if [ -n "${STORAGE_TEST_S3_ENDPOINT:-}" ]; then
  run 05b-s3-wire-emulator npx tsx --test src/storage/r2ObjectStore.wire.integration.test.ts
else echo "05b-s3-wire-emulator: SKIPPED (STORAGE_TEST_S3_ENDPOINT not set)" | tee "$OUT/05b-s3-wire-emulator.log"; fi
run 06-full-backend-suite npm test
