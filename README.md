
# ⚡ ChaosLab

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/25969d6d-0306-4cbc-b30f-d7c34af242bf" />


A local DevOps infrastructure monitoring, self-healing, and CI learning project.

ChaosLab demonstrates container monitoring, controlled failure simulation, automatic recovery, and incident tracking through a React dashboard. It also explores Kubernetes, Terraform, and automated CI with GitHub Actions.


## Features

- Docker container status monitoring
- Start and stop container controls
- Live CPU, memory, and network metrics
- Performance history charts
- Automatic recovery of stopped containers
- Incident logging in JSONL format
- Incident history dashboard
- Recovery time measurements
- Kubernetes workloads running in a local kind cluster
- Kubernetes incident monitoring and event tracking
- Terraform configuration for Kubernetes resources

## Tech Stack

- Docker
- Nginx
- Node.js
- Express
- React
- Vite
- Recharts
- Kubernetes (kind)
- Terraform

## Architecture

React Dashboard (Port 5173)
        |
        v
Express REST API (Port 3001)
        |
        v
Docker Engine
        |
        v
Nginx Container (Port 8080)

Independent Recovery Monitor
        |
        v
Docker Engine
        |
        v
Incident Log (JSONL)
        |
        v
Express API -> React Dashboard

Kubernetes (kind) -> Kubernetes Monitor -> Incident Log -> Dashboard

Terraform -> Kubernetes Deployment / Service

GitHub -> GitHub Actions -> Build -> Security Scan -> Self-Healing Tests


## Getting Started

### Requirements

- Node.js and npm
- Docker Engine
- Docker CLI access for the current user

### 1. Start the Docker container

docker run -d --name chaos-web -p 8080:80 nginx:alpine

### 2. Start the backend

cd backend
npm install
node server.js

### 3. Start the recovery monitor

cd backend
node recovery.js

### 4. Start the frontend

cd frontend
npm install
npm run dev

Open http://localhost:5173



1. Checkout from GitHub.
2. `npm ci` in `frontend/`.
3. `npm run build` in `frontend/`.



## Failure Simulation

To simulate a container failure:

docker stop chaos-web

The recovery monitor checks the container status every 3 seconds and attempts to restart it when it detects the stopped state.

Recovery events are recorded in backend/incidents.jsonl and displayed in the dashboard.

## Important Notes

- Designed for local development and demonstration.
- The backend controls Docker and should not be exposed publicly without authentication and proper security controls.
- The recovery monitor must remain running for automatic recovery to work.
- The reported recovery time measures the interval between incident detection and recovery logging, not total service downtime.
- Docker recovery targets a single demo container; Kubernetes monitoring is a separate lab component. This is not a production orchestration platform.

## Future Improvements

- Docker Compose configuration
- Automated testing
- Prometheus and Grafana integration
- Expand CI with linting and automated tests
- Add a CD deployment stage
- Container health checks
- Alert notifications

## Purpose

Built as a hands-on DevOps learning project to explore infrastructure monitoring, failure detection, automation, and recovery.

## Authentication and Security

The backend uses session-based authentication.

Create `backend/.env` with:

- `SESSION_SECRET`: a long random secret
- `ADMIN_PASSWORD`: a strong administrator password

Docker control endpoints require authentication. Session cookies are HTTP-only, and write requests are restricted to the configured frontend origin.

This configuration is intended for local development, not public deployment.

## Automated CI — GitHub Actions

The workflow runs on pushes and pull requests.

- Builds the hardened Nginx image from `Dockerfile.secure`.
- Scans it with Trivy for HIGH and CRITICAL vulnerabilities.
- Starts a test container and simulates a failure.
- Verifies automatic recovery, HTTP 200, and incident records.

Both CI jobs passed successfully.

## Self-Healing Tests

Run:

    bash tests/self-healing.sh

Five consecutive local tests passed.

## CI/CD Status

- GitHub Actions: automated image build, security scanning, and recovery testing.
- CD: automatic deployment has not been implemented.

## Limitations

- The recovery monitor targets one Docker container.
- The monitor must remain running.
- The system is designed for local demonstrations, not production hosting.
