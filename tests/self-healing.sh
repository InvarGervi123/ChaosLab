#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

node recovery.js &
MONITOR_PID=$!

cleanup() {
    kill "$MONITOR_PID" 2>/dev/null || true
    wait "$MONITOR_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 2
docker stop chaos-web >/dev/null

for attempt in {1..15}; do
    STATUS=$(docker inspect -f '{{.State.Status}}' chaos-web)
    HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8080 || true)

    if [[ "$STATUS" == "running" && "$HTTP" == "200" ]]; then
        echo "PASS: Container recovered and HTTP 200"
        exit 0
    fi

    sleep 1
done

echo "FAIL: Service did not recover within timeout"
exit 1
