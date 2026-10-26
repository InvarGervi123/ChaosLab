const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);

async function getPods(req, res) {
  try {
    const { stdout } = await run("kubectl", [
      "--context", "kind-chaoslab",
      "-n", "default",
      "get", "pods",
      "-l", "app=chaos-nginx",
      "-o", "json"
    ], { timeout: 10000, maxBuffer: 1024 * 1024 });

    const data = JSON.parse(stdout);

    const pods = data.items.map(pod => {
      const containers = pod.status?.containerStatuses || [];

      return {
        name: pod.metadata.name,
        status: pod.status?.phase || "Unknown",
        ready: containers.length > 0 && containers.every(c => c.ready),
        restarts: containers.reduce((sum, c) => sum + c.restartCount, 0)
      };
    });

    res.json({
      total: pods.length,
      ready: pods.filter(p => p.ready).length,
      restarts: pods.reduce((sum, p) => sum + p.restarts, 0),
      pods
    });
  } catch {
    res.status(503).json({ error: "Kubernetes unavailable" });
  }
}

module.exports = { getPods };
