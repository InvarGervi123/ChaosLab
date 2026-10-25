
const { execFile } = require("node:child_process");

const fs = require("node:fs");

function logEvent(type, message) {
  const event = {
    time: new Date().toISOString(),
    type,
    message
  };

  fs.appendFileSync(
    "incidents.jsonl",
    JSON.stringify(event) + "\n"
  );

  console.log(`[${type}] ${message}`);
}

const container = "chaos-web";
let recovering = false;

function docker(args) {
  return new Promise((resolve, reject) => {
    execFile("docker", args, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

async function checkContainer() {
  if (recovering) return;

  recovering = true;

  try {
    const status = await docker([
      "inspect",
      "-f",
      "{{.State.Status}}",
      container
    ]);

    if (status === "exited") {
      logEvent("ALERT", "Container stopped");

      await docker(["start", container]);

      logEvent("RECOVERY", "Container recovered");
    }
  } catch (error) {
    console.error("[ERROR]", error.message);
  } finally {
    recovering = false;
  }
}

console.log("ChaosLab Self-Healing Monitor started");

checkContainer();
setInterval(checkContainer, 3000);
