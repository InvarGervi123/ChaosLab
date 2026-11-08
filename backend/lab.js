"use strict";

const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const PROJECT = "chaoslab-lab";
const EVENTS_FILE = path.join(__dirname, "lab-events.jsonl");
const DEFINITIONS = Object.freeze({
  proxy: { name: "Reverse Proxy", kind: "Nginx", role: "Routes HTTP requests to the lab API", container: "chaoslab-lab-proxy", port: "127.0.0.1:18080 → 80" },
  api: { name: "Backend API", kind: "Node.js", role: "Handles requests and queries the database", container: "chaoslab-lab-api", port: "3000 (Docker network only)" },
  db: { name: "Database", kind: "PostgreSQL", role: "Stores disposable lab visit counts", container: "chaoslab-lab-db", port: "5432 (Docker network only)" }
});
const EDGES = Object.freeze([
  { from: "proxy", to: "api", type: "configured", label: "HTTP requests" },
  { from: "api", to: "db", type: "configured", label: "SQL queries" }
]);

function docker(args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile("docker", args, { timeout, maxBuffer: 512 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

function isLabOwned(inspect, id) {
  const labels = inspect?.Config?.Labels || {};
  return labels["com.docker.compose.project"] === PROJECT &&
    labels["com.docker.compose.service"] === id &&
    labels["dev.chaoslab.sandbox"] === "true" &&
    inspect?.Name === "/" + DEFINITIONS[id]?.container;
}

async function readContainer(id) {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error("Service not allowlisted");
  try {
    const raw = await docker(["inspect", "--type", "container", "--format", "{{json .}}", definition.container]);
    const inspected = JSON.parse(raw);
    if (!isLabOwned(inspected, id)) return { error: "Container identity not verified" };
    return { inspected };
  } catch {
    return { error: "Lab container unavailable or Docker inaccessible" };
  }
}

function describe(id, result) {
  const definition = DEFINITIONS[id];
  const inspected = result?.inspected;
  if (!inspected) {
    return {
      id, ...definition, status: "unknown", containerStatus: "unknown",
      applicationHealth: "unknown", observed: false,
      detail: result?.error || "No reliable observation"
    };
  }
  const state = inspected.State || {};
  const containerStatus = state.Status || "unknown";
  const applicationHealth = state.Health?.Status || "unknown";
  let status = "unknown";
  if (containerStatus === "exited" || containerStatus === "dead" || containerStatus === "created") {
    status = "stopped";
  } else if (containerStatus === "running") {
    if (applicationHealth === "healthy") status = "healthy";
    else if (applicationHealth === "unhealthy") status = id === "proxy" ? "degraded" : "unhealthy";
  }
  return {
    id, ...definition, status, containerStatus, applicationHealth,
    observed: true,
    detail: "Docker state and image-defined health check",
    lastStarted: state.StartedAt && state.StartedAt !== "0001-01-01T00:00:00Z" ? state.StartedAt : null
  };
}

function potentiallyImpacted(id) {
  const visited = new Set([id]);
  const impacted = [];
  const queue = [id];
  while (queue.length) {
    const failed = queue.shift();
    for (const edge of EDGES) {
      if (edge.to === failed && !visited.has(edge.from)) {
        visited.add(edge.from);
        impacted.push(edge.from);
        queue.push(edge.from);
      }
    }
  }
  return impacted;
}

let latest = null;
let inFlight = null;
const previous = new Map();

async function writeEvent(event) {
  const line = JSON.stringify({
    id: randomUUID(), time: new Date().toISOString(), cause: "Unknown",
    ...event
  }) + "\n";
  try { await fs.appendFile(EVENTS_FILE, line, { flag: "a", mode: 0o600 }); }
  catch (error) { console.error("Lab event write failed:", error.message); }
}

async function sampleTopology() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const services = await Promise.all(Object.keys(DEFINITIONS).map(async id =>
      describe(id, await readContainer(id))
    ));
    const snapshot = {
      source: "Docker inspect + configured Compose dependencies",
      observedAt: new Date().toISOString(),
      services,
      edges: EDGES
    };
    for (const service of services) {
      const old = previous.get(service.id);
      if (service.observed && old && old !== service.status) {
        await writeEvent({
          type: "STATE_CHANGE", service: service.id, previous: old,
          current: service.status, observedFrom: "Docker inspect",
          potentiallyImpacted: potentiallyImpacted(service.id)
        });
      }
      if (service.observed) previous.set(service.id, service.status);
      else previous.delete(service.id);
    }
    latest = snapshot;
    return snapshot;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

async function loadEvents() {
  try {
    const content = await fs.readFile(EVENTS_FILE, "utf8");
    return content.split("\n").filter(Boolean).slice(-100).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }).reverse();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function registerLabRoutes(app, requireAuth, requireAllowedOrigin) {
  const timer = setInterval(() => sampleTopology().catch(error => {
    console.error("Lab observer error:", error.message);
  }), 3000);
  timer.unref();
  sampleTopology().catch(() => {});

  app.get("/api/lab/topology", async (_req, res) => {
    try { res.json(await sampleTopology()); }
    catch { res.status(503).json({ error: "Lab observation unavailable" }); }
  });

  app.get("/api/lab/events", async (_req, res) => {
    try { res.json(await loadEvents()); }
    catch { res.status(503).json({ error: "Lab event log unavailable" }); }
  });

  app.get("/api/lab/services/:id", requireAuth, async (req, res) => {
    const id = req.params.id;
    if (!Object.hasOwn(DEFINITIONS, id)) return res.status(404).json({ error: "Unknown lab service" });
    const service = describe(id, await readContainer(id));
    const details = { ...service, dependsOn: EDGES.filter(e => e.from === id).map(e => e.to),
      dependedOnBy: EDGES.filter(e => e.to === id).map(e => e.from),
      potentiallyImpacted: potentiallyImpacted(id), metrics: null, responseTimeMs: null,
      logs: null };
    if (service.observed && service.containerStatus === "running") {
      try {
        const raw = await docker(["stats", "--no-stream", "--format", "{{json .}}", DEFINITIONS[id].container], 7000);
        const stats = JSON.parse(raw);
        details.metrics = {
          cpuPercent: Number.parseFloat(stats.CPUPerc) || 0,
          memoryPercent: Number.parseFloat(stats.MemPerc) || 0,
          memoryUsage: stats.MemUsage || null,
          networkIO: stats.NetIO || null
        };
      } catch { /* Missing measurement remains null. */ }
    }
    res.json(details);
  });

  // Diagnostics are restricted to verified lab-owned containers; never accept a Docker name from the browser.
  app.get("/api/lab/services/:id/logs", requireAuth, async (req, res) => {
    const id = req.params.id;
    if (!Object.hasOwn(DEFINITIONS, id)) return res.status(404).json({ error: "Unknown lab service" });
    const observation = await readContainer(id);
    if (!observation.inspected) return res.status(409).json({ error: "Lab container identity not verified" });
    try {
      const output = await new Promise((resolve, reject) => execFile("docker", ["logs", "--tail", "60", "--timestamps", DEFINITIONS[id].container], { timeout: 5000, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => error ? reject(error) : resolve((stdout + "\n" + stderr).trim())));
      res.json({ service: id, source: "Docker logs", lines: output.split("\n").filter(Boolean).slice(-60) });
    } catch {
      res.status(503).json({ error: "Lab logs unavailable" });
    }
  });

  // Probe the same loopback-only Nginx entry point that a local browser would use.
  app.get("/api/lab/probe", async (_req, res) => {
    const started = performance.now();
    try {
      const response = await fetch("http://127.0.0.1:18080/health", { signal: AbortSignal.timeout(2500) });
      res.json({
        source: "HTTP GET 127.0.0.1:18080/health",
        observedAt: new Date().toISOString(),
        httpStatus: response.status,
        reachable: true,
        healthy: response.ok,
        responseTimeMs: Math.round(performance.now() - started)
      });
    } catch {
      res.json({
        source: "HTTP GET 127.0.0.1:18080/health",
        observedAt: new Date().toISOString(),
        httpStatus: null,
        reachable: false,
        healthy: false,
        responseTimeMs: null
      });
    }
  });

  async function perform(req, res, action) {
    const id = "api"; // Only a disposable service can be changed from the browser.
    const existing = await readContainer(id);
    if (!existing.inspected) return res.status(409).json({
      error: "Lab API identity not verified. Start the isolated Compose lab first."
    });
    const running = existing.inspected.State?.Running === true;
    if (action === "stop" && !running) return res.status(409).json({ error: "Lab API is not running" });
    if (action === "start" && running) return res.status(409).json({ error: "Lab API is already running" });
    try {
      await docker(action === "stop"
        ? ["stop", "--time", "2", DEFINITIONS[id].container]
        : ["start", DEFINITIONS[id].container], 20000);
      await writeEvent({
        type: "ADMIN_ACTION", service: id, action, result: "Docker command completed",
        observedFrom: "Authorized local administrator",
        potentiallyImpacted: potentiallyImpacted(id)
      });
      await sampleTopology();
      return res.json({ ok: true, action, service: id,
        note: "Docker command completed; application recovery must be checked separately" });
    } catch {
      await writeEvent({ type: "ADMIN_ACTION", service: id, action, result: "Docker command failed" });
      return res.status(503).json({ error: "Lab action failed" });
    }
  }

  app.post("/api/lab/experiments/stop-api", requireAllowedOrigin, requireAuth,
    (req, res) => perform(req, res, "stop"));
  app.post("/api/lab/experiments/recover-api", requireAllowedOrigin, requireAuth,
    (req, res) => perform(req, res, "start"));
}

module.exports = { registerLabRoutes, describe, potentiallyImpacted, isLabOwned, EDGES, DEFINITIONS };
