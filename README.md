
# ⚡ ChaosLab

A local Docker infrastructure monitoring and self-healing project.

ChaosLab demonstrates container monitoring, controlled failure simulation, automatic recovery, and incident tracking through a React dashboard.

## Features

- Docker container status monitoring
- Start and stop container controls
- Live CPU, memory, and network metrics
- Performance history charts
- Automatic recovery of stopped containers
- Incident logging in JSONL format
- Incident history dashboard
- Recovery time measurements

## Tech Stack

- Docker
- Nginx
- Node.js
- Express
- React
- Vite
- Recharts

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
- This project monitors a single container and is not a production orchestration platform.

## Future Improvements

- Docker Compose configuration
- Automated testing
- Prometheus and Grafana integration
- CI/CD with GitHub Actions
- Container health checks
- Alert notifications

## Purpose

Built as a hands-on DevOps learning project to explore infrastructure monitoring, failure detection, automation, and recovery.
