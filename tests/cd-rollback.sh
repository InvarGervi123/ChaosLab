#!/usr/bin/env bash
# Destructive to the isolated chaoslab-cd test container only.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
for cmd in docker curl; do command -v "$cmd" >/dev/null; done
test_name="chaos-nginx:rollback-qa-$$"
old_name="chaos-nginx:rollback-old-$$"
tmp="$(mktemp -d)"
cleanup() {
  docker rm -f chaoslab-cd-candidate chaoslab-cd >/dev/null 2>&1 || true
  docker image rm "$test_name" "$old_name" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
# CI runner is disposable. Never run this against an existing local CD deployment.
if docker container inspect chaoslab-cd >/dev/null 2>&1 || docker container inspect chaoslab-cd-candidate >/dev/null 2>&1; then
  echo "Refusing to run: CD containers already exist" >&2
  exit 1
fi
trap cleanup EXIT
printf 'FROM nginx:alpine\nRUN printf "QA-OLD\\n" > /usr/share/nginx/html/index.html\n' > "$tmp/old.Dockerfile"
printf 'FROM nginx:alpine\nRUN printf "QA-NEW\\n" > /usr/share/nginx/html/index.html\n' > "$tmp/new.Dockerfile"
docker build -q -f "$tmp/old.Dockerfile" -t "$old_name" "$tmp" >/dev/null
docker build -q -f "$tmp/new.Dockerfile" -t "$test_name" "$tmp" >/dev/null
bash cd/deploy-local.sh "$old_name"
old_id="$(docker inspect --format '{{.Image}}' chaoslab-cd)"
if CHAOSLAB_TEST_FAIL_AFTER_PROMOTION=1 bash cd/deploy-local.sh "$test_name"; then
  echo "FAIL: simulated failed promotion unexpectedly succeeded" >&2
  exit 1
fi
new_id="$(docker inspect --format '{{.Image}}' chaoslab-cd)"
[[ "$old_id" == "$new_id" ]] || { echo "FAIL: previous image not restored" >&2; exit 1; }
[[ "$(curl -fsS --max-time 3 http://127.0.0.1:8082/)" == "QA-OLD" ]] || { echo "FAIL: previous content not restored" >&2; exit 1; }
if docker container inspect chaoslab-cd-candidate >/dev/null 2>&1; then
  echo "FAIL: candidate container left behind" >&2
  exit 1
fi
echo "PASS: failed promotion returned nonzero and restored previous image/content"
