#!/usr/bin/env bash
# Verify the approval gate rejects failed, pending, and stale CI without Docker side effects.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/gh" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$1" == auth && "$2" == status ]]; then exit 0; fi
if [[ "$1" != api ]]; then echo "unexpected gh call: $*" >&2; exit 99; fi
case "$2" in
  *"/actions/workflows/ci.yml/runs?"*) echo 123 ;;
  *"/actions/runs/123")
    case "$QA_CASE" in
      failed) echo "failure completed abc" ;;
      pending) echo "null in_progress abc" ;;
      stale) echo "success completed old" ;;
    esac ;;
  *"/commits/main") echo "abc" ;;
  *) echo "unexpected gh api: $*" >&2; exit 99 ;;
esac
MOCK
cat > "$tmp/docker" <<'MOCK'
#!/usr/bin/env bash
echo "SECURITY FAILURE: docker called" >&2
exit 99
MOCK
chmod +x "$tmp/gh" "$tmp/docker"
for scenario in failed pending stale; do
  if output="$(QA_CASE="$scenario" PATH="$tmp:$PATH" bash cd/deploy-approved.sh 2>&1)"; then
    echo "FAIL: $scenario CI was accepted" >&2
    exit 1
  fi
  [[ "$output" != *"SECURITY FAILURE"* ]] || { echo "FAIL: docker called on $scenario CI" >&2; exit 1; }
  [[ "$output" == *"refusing deployment"* ]] || { echo "FAIL: unexpected error for $scenario: $output" >&2; exit 1; }
  echo "PASS: $scenario CI rejected before Docker"
done
