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

## Architecture

- React/Vite dashboard: `http://localhost:5173`
- Express API: `http://127.0.0.1:3001`
- Docker: demo Nginx container `chaos-web` at `http://localhost:8080`
- Independent `backend/recovery.js` monitor: Docker inspect/start → `backend/incidents.jsonl` → API → dashboard
- Optional: kind Kubernetes cluster and Terraform deployment/service configuration

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
4. Separately installs dependencies, checks backend syntax, runs HTTP/API security tests, and builds the frontend.

A failing scan or test fails the corresponding CI job and the overall workflow. The image build/scan/recovery steps share one runner; the application-checks job is independent.

## Security and limitations

- This is a **local demonstration**, not a production-ready orchestration or security system.
- Session cookies are HTTP-only and SameSite=Strict; local HTTP is used, so cookies are not Secure.
- Session data uses the default in-memory store; no persistent sessions, rate limiting, or production hardening.
- The Origin check protects browser write requests but is not a substitute for authentication.
- Docker CLI access is highly privileged; do not expose the API publicly.
- The recovery monitor handles one existing Docker container and must remain running.
- Recovery logging records an attempted restart, not a full health or availability SLA.
- Kubernetes monitoring is separate from Docker self-healing.
- No automatic deployment (CD), production alerts, or persistent metrics store is implemented.

## Project status

Portfolio lab, initially released as `v1.0.0`. Further improvements are developed and validated through pull requests.
