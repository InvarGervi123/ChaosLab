# ChaosLab isolated sandbox

This is an opt-in three-service Docker Compose lab. It is **not** the existing `chaos-web` or `chaoslab-cd` stack.

## Run

From the repository root:

```bash
docker compose -f lab/compose.yaml -p chaoslab-lab up -d --build
curl -i http://127.0.0.1:18080/health
```

Start the existing backend/frontend as described in the root README. Open the dashboard and select **Infrastructure Map**. Log in to enable the deliberate API-stop experiment.

To end the lab:

```bash
docker compose -f lab/compose.yaml -p chaoslab-lab down
```

This intentionally **does not run** when starting the ordinary dashboard.

## Safety and limitations

- Names are prefixed `chaoslab-lab-`; controller actions allow **only** the API container, after verifying its Compose project/service and sandbox labels.
- Dedicated `internal` network; only Nginx publishes a port, bound to loopback `127.0.0.1:18080`. Database contents are ephemeral (`tmpfs`), so removing the lab destroys them.
- Configured dependency edges: proxy → api → db. A red dependency line means **potential** impact, not confirmed root cause.
- Container health is read from Docker health checks. A running container with a failed check is not shown as healthy. Missing Docker data is **Unknown**, never 0.
- The API performs a PostgreSQL wire-protocol connection probe. This proves PostgreSQL responds but is **not** a successful application query or complete end-to-end functionality check.
- There is **no automatic lab recovery** in this MVP: admins explicitly recover the stopped test API. The original `backend/recovery.js` continues to handle only `chaos-web`.
- Lab events are written to `backend/lab-events.jsonl` when the backend is running and observes a transition, with the root cause labeled Unknown.
- The backend Docker CLI is privileged; keep it loopback-only. Never expose it on a public interface. The existing login uses an in-memory session store suitable only for local demos.
- Port, CPU, and memory budgets are intentionally modest; increase only if your machine needs it.
