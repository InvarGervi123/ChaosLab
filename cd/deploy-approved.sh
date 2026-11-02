#!/usr/bin/env bash
# Manual CI-gated local deployment. Run only after this feature is merged to main.
set -Eeuo pipefail
repo="InvarGervi123/ChaosLab"
for command in gh docker sha256sum unzip curl; do
  command -v "$command" >/dev/null || { echo "Missing: $command" >&2; exit 2; }
done
gh auth status >/dev/null
run_id="$(gh api "repos/$repo/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=1" --jq '.workflow_runs[0].id // empty')"
[[ -n "$run_id" ]] || { echo "No main push CI run found" >&2; exit 1; }
read -r conclusion status head_sha < <(gh api "repos/$repo/actions/runs/$run_id" --jq '[.conclusion // "null", .status, .head_sha] | join(" ")')
if [[ "$status" != "completed" || "$conclusion" != "success" ]]; then
  echo "Latest main CI run $run_id not successful ($status/$conclusion); refusing deployment" >&2
  exit 1
fi
# Never deploy an older successful run if main has moved on.
latest_sha="$(gh api "repos/$repo/commits/main" --jq '.sha')"
[[ "$head_sha" == "$latest_sha" ]] || { echo "CI commit differs from current main; refusing deployment" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gh run download "$run_id" --repo "$repo" --name chaoslab-tested-image --dir "$tmp"
(cd "$tmp" && sha256sum -c chaos-nginx-secure.tar.sha256)
docker load -i "$tmp/chaos-nginx-secure.tar"
image_id="$(docker image inspect --format '{{.Id}}' chaos-nginx:secure)"
# Docker image ID is immutable and avoids a mutable tag changing between verification and deploy.
bash "$(dirname "$0")/deploy-local.sh" "$image_id"
printf 'Deployed CI run %s commit %s image %s\n' "$run_id" "$head_sha" "$image_id"
