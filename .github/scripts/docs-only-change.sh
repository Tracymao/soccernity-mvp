#!/usr/bin/env bash
# Decides whether a change is DOCS-ONLY, so CI can skip the install, lint,
# unit tests, e2e tests and build.
#
# Reads changed file paths (one per line, repo-relative) on stdin.
# Prints "true" when every path is documentation, otherwise "false".
# An empty list prints "false" (fail safe: nothing known, run everything).
#
# A path is documentation when it is under docs/ or is a Markdown file
# anywhere. EXCEPT the files below, which code or tests read at build or
# test time, so a change to them can break the build and must run CI:
#   docs/legal-copy-draft-tos-privacy-policy.md   imported (?raw) by apps/web legalDocument.ts
#   docs/pending-copy-manifest.md                 read by apps/web pendingCopyManifest.test.ts
#   docs/admin-two-factor-recovery.md             read by services/api test/two-factor.e2e-spec.ts
#
# If a new test or build step starts reading another file under docs/ or
# another .md file, add it to PROTECTED here. The self-check
# (.github/scripts/docs-only-change.test.sh) keeps this list honest for the
# three files above.

set -euo pipefail

PROTECTED=(
  "docs/legal-copy-draft-tos-privacy-policy.md"
  "docs/pending-copy-manifest.md"
  "docs/admin-two-factor-recovery.md"
)

is_docs() {
  local path="$1" p
  for p in "${PROTECTED[@]}"; do
    [[ "$path" == "$p" ]] && return 1
  done
  [[ "$path" == docs/* ]] && return 0
  [[ "$path" == *.md ]] && return 0
  return 1
}

seen=0
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" ]] && continue
  seen=1
  if ! is_docs "$line"; then
    echo "false"
    exit 0
  fi
done

if [[ "$seen" -eq 1 ]]; then
  echo "true"
else
  echo "false"
fi
