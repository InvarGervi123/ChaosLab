const express = require("express");
const cors = require("cors");
const { execFile } = require("node:child_process");

const app = express();
app.use(cors());

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

app.post("/api/chaos", async (req, res) => {
  try {
    await docker(["stop", container]);
    res.json({ message: "Container stopped" });
  } catch {
    res.status(500).json({ error: "Failed to stop container" });
  }
});

app.post("/api/recover", async (req, res) => {
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


app.listen(3001, "127.0.0.1", () => {
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
