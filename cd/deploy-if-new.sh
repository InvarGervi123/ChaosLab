#!/usr/bin/env bash
# Poll main CI and deploy once per approved commit.
set -Eeuo pipefail
command -v flock >/dev/null || { echo "flock is required" >&2; exit 2; }
command -v gh >/dev/null || { echo "gh is required" >&2; exit 2; }
base="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/chaoslab-cd"
mkdir -p "$state_dir"
chmod 700 "$state_dir"
exec 9>"$state_dir/deploy.lock"
flock -n 9 || { echo "Another CD deployment is running; skipping."; exit 0; }
repo="InvarGervi123/ChaosLab"
run_id="$(gh api "repos/$repo/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=1" --jq '.workflow_runs[0].id // empty')"
[[ -n "$run_id" ]] || { echo "No main CI run; skipping."; exit 0; }
read -r status conclusion sha < <(gh api "repos/$repo/actions/runs/$run_id" --jq '[.status, .conclusion // "null", .head_sha] | join(" ")')
if [[ "$status" != "completed" || "$conclusion" != "success" ]]; then
  echo "Latest CI run not successful ($status/$conclusion); skipping."
  exit 0
fi
current_sha="$(gh api "repos/$repo/commits/main" --jq '.sha')"
[[ "$sha" == "$current_sha" ]] || { echo "CI commit does not match main; skipping."; exit 0; }
last="$(cat "$state_dir/last-successful-sha" 2>/dev/null || true)"
if [[ "$sha" == "$last" ]] && docker inspect -f '{{.State.Running}}' chaoslab-cd 2>/dev/null | grep -qx true && [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:8082/ || true)" == 200 ]]; then
  echo "Already deployed and healthy: $sha"
  exit 0
fi
bash "$base/deploy-approved.sh"
printf '%s\n' "$sha" > "$state_dir/last-successful-sha.tmp"
mv -f "$state_dir/last-successful-sha.tmp" "$state_dir/last-successful-sha"
echo "Recorded successful deployment: $sha"
