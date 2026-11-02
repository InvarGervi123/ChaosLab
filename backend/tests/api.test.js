const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = 39011;
const base = `http://127.0.0.1:${port}`;
const origin = "http://localhost:5173";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "chaoslab-api-"));
const fakeDocker = path.join(temp, "docker");
fs.writeFileSync(fakeDocker, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "inspect") console.log("running");
else if (args[0] === "stats") console.log(JSON.stringify({ CPUPerc: "2.5%", MemUsage: "5MiB / 1GiB", MemPerc: "0.5%", NetIO: "1kB / 2kB" }));
else if (args[0] === "stop" || args[0] === "start") console.log("chaos-web");
else process.exit(1);
`);
fs.chmodSync(fakeDocker, 0o755);

let child;
let cookie;
async function request(route, options = {}) {
  return fetch(base + route, options);
}
async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await request("/api/status");
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("API did not start");
}

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PATH: temp + path.delimiter + process.env.PATH,
      SESSION_SECRET: "integration-test-session-secret-123456",
      ADMIN_PASSWORD: "integration-test-password",
      PORT: String(port) },
    stdio: "ignore"
  });
  await waitForServer();
});
test.after(() => {
  if (child) child.kill();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("public status returns the container state", async () => {
  const response = await request("/api/status");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { container: "chaos-web", status: "running" });
});

test("metrics API parses docker stats", async () => {
  const response = await request("/api/metrics");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.cpu, 2.5);
  assert.equal(data.memoryPercent, 0.5);
});

test("management without login is denied", async () => {
  for (const route of ["/api/chaos", "/api/recover"]) {
    const response = await request(route, { method: "POST", headers: { Origin: origin } });
    assert.equal(response.status, 401);
  }
});

test("wrong password is denied", async () => {
  const response = await request("/api/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "incorrect" })
  });
  assert.equal(response.status, 401);
});

test("untrusted origin is denied even with correct password", async () => {
  const response = await request("/api/login", {
    method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify({ password: "integration-test-password" })
  });
  assert.equal(response.status, 403);
});

test("successful login sets a session and authorizes management", async () => {
  const response = await request("/api/login", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "integration-test-password" })
  });
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("chaoslab.sid="));
  for (const route of ["/api/chaos", "/api/recover"]) {
    const result = await request(route, { method: "POST", headers: { Origin: origin, Cookie: cookie } });
    assert.equal(result.status, 200);
  }
});

test("authenticated requests from an untrusted origin are rejected", async () => {
  const response = await request("/api/chaos", {
    method: "POST", headers: { Origin: "https://attacker.example", Cookie: cookie }
  });
  assert.equal(response.status, 403);
});

test("incidents API returns an array", async () => {
  const response = await request("/api/incidents");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(await response.json()));
});
