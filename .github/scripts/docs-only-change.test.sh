#!/usr/bin/env bash
# Self-check for docs-only-change.sh. Run: bash .github/scripts/docs-only-change.test.sh
set -uo pipefail
cd "$(dirname "$0")"

fail=0
check() {
  local expected="$1" label="$2" input="$3" got
  got="$(printf '%s' "$input" | bash ./docs-only-change.sh)"
  if [[ "$got" == "$expected" ]]; then
    echo "ok    $label"
  else
    echo "FAIL  $label (expected $expected, got $got)"
    fail=1
  fi
}

check true  "docs docx + register + CLAUDE.md"   $'docs/Soccernity_MVP_Build_Plan_v1.7.docx\ndocs/build-register.md\nCLAUDE.md\n'
check true  "a module README"                    $'services/api/src/modules/moderation/README.md\n'
check true  "a docs image"                       $'docs/figma-pass-screens/01.png\n'
check true  "CRLF input"                         $'docs/build-register.md\r\nCLAUDE.md\r\n'
check false "code file"                          $'services/api/src/main.ts\n'
check false "docs + code mixed"                  $'docs/build-register.md\nservices/api/src/main.ts\n'
check false "workflow change"                   $'.github/workflows/ci.yml\n'
check false "package-lock"                       $'package-lock.json\n'
check false "e2e test file"                      $'e2e/tests/01-x.spec.ts\n'
check false "legal draft is read by apps/web"    $'docs/legal-copy-draft-tos-privacy-policy.md\n'
check false "pending-copy manifest is read by a test" $'docs/pending-copy-manifest.md\n'
check false "2FA recovery doc is read by an e2e test" $'docs/admin-two-factor-recovery.md\n'
check false "protected doc among other docs"     $'docs/build-register.md\ndocs/pending-copy-manifest.md\n'
check false "empty list runs everything"         ''
check false "blank lines only"                   $'\n\n'
check false "similar name is not protected-safe" $'src/docs-other.ts\n'

# Every file the code reads from docs/ must be protected. Fails if a new
# reader appears without an entry in PROTECTED.
root="$(cd ../.. && pwd)"
for f in docs/legal-copy-draft-tos-privacy-policy.md docs/pending-copy-manifest.md docs/admin-two-factor-recovery.md; do
  if [[ ! -f "$root/$f" ]]; then
    echo "FAIL  protected file no longer exists: $f (remove it from PROTECTED if it is gone on purpose)"
    fail=1
  fi
done

exit "$fail"
