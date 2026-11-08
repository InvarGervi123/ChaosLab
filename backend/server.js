const express = require("express");
const cors = require("cors");
const { execFile } = require("node:child_process");
const session = require("express-session");
const path = require("node:path");
const { timingSafeEqual } = require("node:crypto");

const fs = require("node:fs");
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing");
}

const app = express();
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(session({
  name: "chaoslab.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    maxAge: 30 * 60 * 1000
  }
}));

app.use(express.json());

function requireAuth(req, res, next) {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.post("/api/login", requireAllowedOrigin, (req, res) => {
  const supplied = Buffer.from(typeof req.body?.password === "string" ? req.body.password : "");
  const expected = Buffer.from(process.env.ADMIN_PASSWORD ?? "");

  if (
    expected.length === 0 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  req.session.regenerate((err) => {
    if (err) return res.sendStatus(500);
    req.session.authenticated = true;
    res.json({ message: "Logged in" });
  });
});
const allowedOrigin = "http://localhost:5173";

function requireAllowedOrigin(req, res, next) {
  if (req.get("Origin") !== allowedOrigin) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  next();
}

const container = "chaos-web";

function docker(args) {
  return new Promise((resolve, reject) => {
    execFile("docker", args, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

app.get("/api/status", async (req, res) => {
  try {
    const status = await docker([
      "inspect", "-f", "{{.State.Status}}", container
    ]);
    res.json({ container, status });
  } catch {
    res.status(500).json({ error: "Docker unavailable" });
  }
});

app.post("/api/chaos", requireAllowedOrigin, requireAuth, async (req, res) => {
  try {
    await docker(["stop", container]);
    res.json({ message: "Container stopped" });
  } catch {
    res.status(500).json({ error: "Failed to stop container" });
  }
});

app.post("/api/recover", requireAllowedOrigin, requireAuth, async (req, res) => {
  try {
    await docker(["start", container]);
    res.json({ message: "Container started" });
  } catch {
    res.status(500).json({ error: "Failed to start container" });
  }
});


app.get("/api/incidents", async (req, res) => {
  const fs = require("node:fs/promises");
  const path = require("node:path");

  try {
    const file = path.join(__dirname, "incidents.jsonl");
    const content = await fs.readFile(file, "utf8");

    const incidents = content
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line));

    res.json(incidents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.json([]);
    }

    res.status(500).json({
      error: "Failed to load incidents"
    });
  }
});


const { getPods } = require("./kubernetes");
app.get("/api/kubernetes/pods", getPods);

app.listen(Number(process.env.PORT || 3001), "127.0.0.1", () => {
  console.log("ChaosLab API: http://localhost:3001");
});

app.get("/api/metrics", async (req, res) => {
  try {
    const output = await docker([
      "stats",
      "--no-stream",
      "--format",
      "{{json .}}",
      container
    ]);

    const stats = JSON.parse(output);

    res.json({
      container,
      cpu: parseFloat(stats.CPUPerc) || 0,
      memory: stats.MemUsage,
      memoryPercent: parseFloat(stats.MemPerc) || 0,
      network: stats.NetIO
    });
  } catch (err) {
    res.status(503).json({
      error: "Metrics unavailable"
    });
  }
});

// The optional three-service sandbox is separate from chaos-web and CI/CD containers.
const { registerLabRoutes } = require("./lab");
registerLabRoutes(app, requireAuth, requireAllowedOrigin);
