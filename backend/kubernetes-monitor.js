const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);
const fs = require("node:fs");
const path = require("node:path");

function logEvent(type, message) {
  const event = {
    time: new Date().toISOString(),
    type,
    message
  };

  fs.appendFileSync(
    path.join(__dirname, "incidents.jsonl"),
    JSON.stringify(event) + "\n"
  );

  console.log(`[${type}] ${message}`);
}

let previous = null;
let checking = false;

async function checkPods() {
  if (checking) return;
  checking = true;

  try {
    const { stdout } = await run("kubectl", [
      "--context", "kind-chaoslab",
      "-n", "default",
      "get", "pods",
      "-l", "app=chaos-nginx",
      "-o", "json"
    ], { timeout: 10000 });

    const items = JSON.parse(stdout).items;
    const current = new Map(items.map(p => [
      p.metadata.uid,
      {
        name: p.metadata.name,
        ready: p.status?.conditions?.some(
          c => c.type === "Ready" && c.status === "True"
        ) || false,
        restarts: (p.status?.containerStatuses || [])
          .reduce((n, c) => n + c.restartCount, 0)
      }
    ]));

    if (previous !== null) {
      for (const [uid, pod] of previous) {
        if (!current.has(uid)) {
          logEvent("K8S_REMOVED", `Pod disappeared: ${pod.name}`);
        }
      }

      for (const [uid, pod] of current) {
        if (!previous.has(uid)) {
          logEvent("K8S_CREATED", `New Pod: ${pod.name}`);
          if (pod.ready) {
            logEvent("K8S_READY", `Pod ready: ${pod.name}`);
          }
        } else {
          const old = previous.get(uid);

          if (!old.ready && pod.ready) {
            logEvent("K8S_READY", `Pod ready: ${pod.name}`);
          }

          if (pod.restarts > old.restarts) {
            logEvent("K8S_RESTART", `Container restarted: ${pod.name}`);
          }
        }
      }
    }

    previous = current;
  } catch (error) {
    console.error("[K8S ERROR]", error.message);
  } finally {
    checking = false;
  }
}

console.log("Kubernetes Monitor started");
checkPods();
setInterval(checkPods, 3000);
