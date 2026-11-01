
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

INCIDENTS="incidents.jsonl"
BEFORE=$(wc -l < "$INCIDENTS" 2>/dev/null || echo 0)

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

    EVENTS=$(tail -n +"$((BEFORE + 1))" "$INCIDENTS" 2>/dev/null || true)

    if [[ "$STATUS" == "running" && "$HTTP" == "200" ]]; then
        if printf '%s\n' "$EVENTS" | grep -q '"type":"ALERT"' &&
           printf '%s\n' "$EVENTS" | grep -q '"type":"RECOVERY"'; then
            echo "PASS: New ALERT and RECOVERY events, HTTP 200"
            exit 0
        fi
    fi

    sleep 1
done

echo "FAIL: Recovery or incident verification failed"
exit 1

