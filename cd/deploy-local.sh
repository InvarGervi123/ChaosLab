#!/usr/bin/env bash
# Stage 1: manually deploy a locally built candidate to an isolated loopback-only lab.
# No GitHub CI trust gate or unattended scheduling is implemented yet.
set -Eeuo pipefail

IMAGE="${1:-}"
if [[ -z "$IMAGE" || "$IMAGE" != chaos-nginx:* ]]; then
  echo "Usage: bash cd/deploy-local.sh chaos-nginx:<version>" >&2
  exit 2
fi

LIVE="chaoslab-cd"
CANDIDATE="chaoslab-cd-candidate"
LIVE_PORT=8082
CANDIDATE_PORT=18082

docker image inspect "$IMAGE" >/dev/null
if docker container inspect "$CANDIDATE" >/dev/null 2>&1; then
  echo "Refusing to replace existing candidate container: $CANDIDATE" >&2
  exit 1
fi

previous_image=""
had_previous=false
if docker container inspect "$LIVE" >/dev/null 2>&1; then
  previous_image="$(docker inspect --format '{{.Image}}' "$LIVE")"
  had_previous=true
fi

check_http() {
  local port="$1"
  for _ in {1..15}; do
    if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "http://127.0.0.1:${port}/" || true)" == "200" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup_candidate() {
  docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

docker run -d --name "$CANDIDATE" --network bridge -p "127.0.0.1:${CANDIDATE_PORT}:80" "$IMAGE" >/dev/null
if ! check_http "$CANDIDATE_PORT"; then
  echo "Candidate failed HTTP health check; live container untouched." >&2
  exit 1
fi

# Promotion is intentionally non-zero-downtime. Keep the old immutable image for rollback.
# Test-only failure injection: CHAOSLAB_TEST_FAIL_AFTER_PROMOTION=1 simulates
# post-promotion verification failure after the new container passes HTTP health.
if [[ "$had_previous" == true ]]; then
  docker rm -f "$LIVE" >/dev/null
fi

if docker run -d --name "$LIVE" --network bridge -p "127.0.0.1:${LIVE_PORT}:80" "$IMAGE" >/dev/null && check_http "$LIVE_PORT" && [[ "${CHAOSLAB_TEST_FAIL_AFTER_PROMOTION:-0}" != "1" ]]; then
  echo "PASS: $LIVE deployed and healthy on http://127.0.0.1:${LIVE_PORT}"
  exit 0
fi

echo "FAIL: Promotion health check failed; attempting rollback." >&2
docker rm -f "$LIVE" >/dev/null 2>&1 || true
if [[ "$had_previous" == true ]]; then
  if docker run -d --name "$LIVE" --network bridge -p "127.0.0.1:${LIVE_PORT}:80" "$previous_image" >/dev/null && check_http "$LIVE_PORT"; then
    echo "ROLLBACK PASS: previous image restored and healthy." >&2
  else
    echo "ROLLBACK FAILED: manual intervention required." >&2
    exit 1
  fi
else
  echo "No previous deployment exists; candidate was removed." >&2
fi
exit 1
