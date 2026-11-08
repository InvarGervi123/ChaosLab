# ⚡ ChaosLab

[![ChaosLab CI](https://github.com/InvarGervi123/ChaosLab/actions/workflows/ci.yml/badge.svg)](https://github.com/InvarGervi123/ChaosLab/actions/workflows/ci.yml)

![ChaosLab dashboard](https://github.com/user-attachments/assets/25969d6d-0306-4cbc-b30f-d7c34af242bf)

A local Linux-based DevOps learning lab for Docker monitoring, failure simulation, automatic recovery, and incident tracking through a React dashboard.

## Features

- Docker container status and CPU/memory/network metrics
- React dashboard with recent performance charts and incident history
- Session-authenticated Docker stop/start controls
- Independent recovery monitor that checks every 3 seconds and restarts an exited container
- JSONL incident records (ALERT and RECOVERY)
- Optional local Kubernetes (kind) pod status and Terraform resources
- GitHub Actions CI for image scanning, self-healing verification, API security tests, and frontend builds
- Opt-in, pull-based local CD: approved CI image artifacts, periodic checks, HTTP health checks, and rollback

## Architecture

- React/Vite dashboard: `http://localhost:5173`
- Express API: `http://127.0.0.1:3001`
- Docker: demo Nginx container `chaos-web` at `http://localhost:8080`
- Independent `backend/recovery.js` monitor: Docker inspect/start → `backend/incidents.jsonl` → API → dashboard
- Optional: kind Kubernetes cluster and Terraform deployment/service configuration

## Infrastructure Control Center (experimental branch)

The existing dashboard now includes an **Infrastructure Map** for a separately deployed, disposable three-service stack: Nginx → Node.js API → PostgreSQL. Statuses come from Docker container state and image-defined health checks, not demo values. Dependency edges are explicitly defined from the included Compose setup.

The experiment affects only `chaoslab-lab-api`. The backend verifies the exact Compose project, service, sandbox label, and container name before running allowlisted Docker stop/start commands. It never targets `chaos-web` or the CI/CD deployment container.

Opt in to the isolated stack (from the repository root):

```bash
docker compose -f lab/compose.yaml -p chaoslab-lab up -d --build
curl -i http://127.0.0.1:18080/health
```

Then start the existing backend and frontend as documented below. Open `http://localhost:5173`, sign in, select **Backend API** and try Stop/Recover. Stop does not affect the other local demo containers. After experiments:

```bash
docker compose -f lab/compose.yaml -p chaoslab-lab down
```

The lab is **opt-in**, not started automatically. No database port is published. Its data is disposable. Currently the inspector shows measured CPU/RAM only after admin login; response-time and log details are marked unavailable, and recovery is manual. See [lab/README.md](lab/README.md) for constraints.

## Local setup

Requirements: Linux, Node.js 26, npm, Docker Engine, and permission to use the Docker CLI. Kubernetes tooling (kind, kubectl, Terraform) is optional for the Docker demo.

From the repository root:

```bash
docker build -f Dockerfile.secure -t chaos-nginx:secure .
docker run -d --name chaos-web -p 8080:80 chaos-nginx:secure
npm ci --prefix backend
npm ci --prefix frontend
```

Create `backend/.env` locally (never commit it):

```dotenv
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_PASSWORD=replace-with-a-strong-password
```

Start the three processes in **separate terminals** from the repository root:

```bash
node backend/server.js
```

```bash
cd backend && node recovery.js
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. The backend is bound to localhost. The dashboard uses session cookies; write requests require the exact Origin `http://localhost:5173`.

## Tests and CI

Run the backend integration tests locally (no Docker required; Docker CLI is stubbed):

```bash
npm test --prefix backend
```

These tests exercise actual HTTP requests to the Express server: status, metrics, incidents, unauthenticated management denial, invalid passwords, origin rejection, successful login, and authorized stop/start calls.

Run the self-healing integration test **only** with a disposable local `chaos-web` demo container running and Docker access:

```bash
bash tests/self-healing.sh
```

**Warning:** The self-healing test deliberately stops `chaos-web`; do not run it against a container that hosts important workloads.

On pushes and pull requests, GitHub Actions:

1. Builds `chaos-nginx:secure` from `Dockerfile.secure`.
2. Scans that exact image with Trivy for HIGH and CRITICAL vulnerabilities (`--exit-code 1`).
3. Starts a container from that same image and verifies recovery, HTTP 200, and new ALERT/RECOVERY records.
4. Exercises an isolated failed-promotion scenario and verifies rollback restores the previous Docker image and HTTP response.
5. Verifies failed, pending, and stale CI runs are rejected before Docker deployment commands.
6. Separately installs dependencies, checks backend syntax, runs HTTP/API security tests, and builds the frontend.

A failing scan or test fails the corresponding CI job and the overall workflow. The image build/scan/recovery steps share one runner; the application-checks job is independent.

## Local continuous deployment (opt-in)

On successful pushes to `main`, GitHub Actions uploads the scanned Docker image as a 7-day artifact. The local deployment downloads the image **only if the latest main push CI run completed successfully and matches the current main commit**. It verifies the archive SHA-256, loads the image, and deploys its immutable Docker image ID.

The deployment uses a separate `chaoslab-cd` container on `127.0.0.1:8082` (candidate: `127.0.0.1:18082`); it does not replace the dashboard's `chaos-web` container. Candidate and promoted versions must return HTTP 200. A failed promotion attempts to restore the previous image. This is a **local demonstration with brief replacement downtime**, not a zero-downtime production rollout.

Requirements: authenticated GitHub CLI (`gh auth login`), Docker CLI access, Bash, `curl`, `sha256sum`, `unzip`, `flock`, and systemd user services for automatic polling.

Manual approved deployment:

```bash
bash cd/deploy-approved.sh
curl -I http://127.0.0.1:8082
```

Opt-in automatic polling (assumes the repository is at `~/Projects/ChaosLab`):

```bash
mkdir -p ~/.config/systemd/user
cp cd/systemd/chaoslab-cd.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start chaoslab-cd.service
systemctl --user enable --now chaoslab-cd.timer
systemctl --user list-timers --all | grep chaoslab
journalctl --user -u chaoslab-cd.service -n 20 --no-pager
```

The timer checks about every five minutes while the user's systemd manager is running. `cd/deploy-if-new.sh` records the last successfully deployed commit under `${XDG_STATE_HOME:-~/.local/state}/chaoslab-cd/` and skips re-deployment if that commit is already running and healthy. It uses a lock to prevent overlapping runs. For another checkout path, edit `ExecStart` in the copied service file and run `systemctl --user daemon-reload`. To disable polling: `systemctl --user disable --now chaoslab-cd.timer`.

**The automated rollback test runs in a disposable GitHub Actions runner. Do not run `tests/cd-rollback.sh` on your working machine while `chaoslab-cd` exists; it deliberately replaces and removes that isolated test container.**

Rollback can also be exercised on disposable test images with `CHAOSLAB_TEST_FAIL_AFTER_PROMOTION=1 bash cd/deploy-local.sh chaos-nginx:cd-test` after creating the test image. This intentionally forces promotion failure; avoid using it on important workloads.

## Security and limitations

- This is a **local demonstration**, not a production-ready orchestration or security system.
- Session cookies are HTTP-only and SameSite=Strict; local HTTP is used, so cookies are not Secure.
- Session data uses the default in-memory store; no persistent sessions, rate limiting, or production hardening.
- The Origin check protects browser write requests but is not a substitute for authentication.
- Docker CLI access is highly privileged; do not expose the API publicly.
- The recovery monitor handles one existing Docker container and must remain running.
- Recovery logging records an attempted restart, not a full health or availability SLA.
- Kubernetes monitoring is separate from Docker self-healing.
- Automatic local CD is opt-in and depends on the local user session, Docker, network access, GitHub authentication, and unexpired CI artifacts; it is not a hosted deployment.
- The archive checksum detects transfer corruption but is not an independent cryptographic provenance attestation.
- No production alerts or persistent metrics store is implemented.

## Project status

Portfolio lab, initially released as `v1.0.0`. Further improvements are developed and validated through pull requests.
