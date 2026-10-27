#!/usr/bin/env bash
# Is every change between a CI-tested commit and a later commit documentation only?
#
#   bash scripts/verify-source-equivalence.sh <tested-sha> [later-ref=HEAD]
#
# Exit 0: every changed path is documentation, so the later commit is source-equivalent to the tested one and the CI result carries over.
# Exit 1: something executable changed (listed), so the CI result does NOT carry over and a new run is needed.
#
# "Under docs/" is not enough to be documentation: CI executes some files that live there. These count as CODE:
#   - files directly in docs/infra/batch-1.5/evidence/ (the strict runner, the mutation script, the S3 emulator, baselines)
#   - everything in docs/infra/batch-1.5/rollback/ (the lease test applies the .down.sql files)
#   - any file that is not prose or evidence output: only *.md, *.txt, *.log and *.json under docs/ are documentation
# Everything outside docs/ is code.
set -eu
tested="${1:?usage: verify-source-equivalence.sh <tested-sha> [later-ref]}"
later="${2:-HEAD}"
git rev-parse --verify -q "$tested^{commit}" >/dev/null || { echo "unknown commit: $tested" >&2; exit 2; }
git rev-parse --verify -q "$later^{commit}" >/dev/null || { echo "unknown commit: $later" >&2; exit 2; }
code=0
changed=$(git diff --name-only --no-renames "$tested" "$later")
while IFS= read -r f; do
  [ -z "$f" ] && continue
  class=code
  case "$f" in
    docs/infra/batch-1.5/evidence/*/*) case "$f" in *.log|*.txt|*.json|*.md) class=doc;; esac ;;   # output under evidence/logs
    docs/infra/batch-1.5/evidence/*) class=code ;;
    docs/infra/batch-1.5/rollback/*) class=code ;;
    docs/*.md|docs/*/*.md|docs/*/*/*.md|docs/*/*/*/*.md|docs/*/*/*/*/*.md) class=doc ;;
    docs/*.txt|docs/*/*.txt|docs/*/*/*.txt|docs/*/*/*/*.txt|docs/*/*/*/*/*.txt|docs/*/*/*/*/*/*.txt) class=doc ;;
    docs/*.log|docs/*/*.log|docs/*/*/*.log|docs/*/*/*/*.log|docs/*/*/*/*/*.log|docs/*/*/*/*/*/*.log) class=doc ;;
    docs/*.json|docs/*/*.json|docs/*/*/*.json|docs/*/*/*/*.json|docs/*/*/*/*/*.json|docs/*/*/*/*/*/*.json) class=doc ;;
  esac
  printf '%-5s %s\n' "$class" "$f"
  [ "$class" = code ] && code=1
done <<< "$changed"
if [ "$code" -eq 0 ]; then echo "EQUIVALENT: $(git rev-parse --short "$later") differs from $(git rev-parse --short "$tested") only in documentation"; else echo "NOT EQUIVALENT: executable files changed (see 'code' lines)"; fi
exit $code
