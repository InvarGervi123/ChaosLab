const test = require("node:test");
const assert = require("node:assert/strict");
const { isLabOwned, describe, potentiallyImpacted, EDGES } = require("../lab");

test("lab controller trusts only exact sandbox container + Compose identity", () => {
  const valid = {
    Name: "/chaoslab-lab-api",
    Config: { Labels: {
      "com.docker.compose.project": "chaoslab-lab",
      "com.docker.compose.service": "api",
      "dev.chaoslab.sandbox": "true"
    }}
  };
  assert.equal(isLabOwned(valid, "api"), true);
  assert.equal(isLabOwned({ ...valid, Name: "/other-api" }, "api"), false);
  assert.equal(isLabOwned({ ...valid, Config: { Labels: { ...valid.Config.Labels, "com.docker.compose.project": "another-project" } } }, "api"), false);
  assert.equal(isLabOwned(valid, "db"), false);
});

test("running without a health check is never called healthy", () => {
  const service = describe("api", { inspected: { State: { Status: "running" } } });
  assert.equal(service.status, "unknown");
  assert.equal(service.applicationHealth, "unknown");
});

test("health observations are distinct from Docker running status", () => {
  assert.equal(describe("api", { inspected: { State: { Status: "running", Health: { Status: "healthy" } } } }).status, "healthy");
  assert.equal(describe("api", { inspected: { State: { Status: "running", Health: { Status: "unhealthy" } } } }).status, "unhealthy");
  assert.equal(describe("db", { inspected: { State: { Status: "exited" } } }).status, "stopped");
  assert.equal(describe("api", { error: "Docker unavailable" }).status, "unknown");
});

test("dependencies have explicit direction and describe potential impact", () => {
  assert.deepEqual(EDGES.map(e => e.from + "->" + e.to), ["proxy->api", "api->db"]);
  assert.deepEqual(potentiallyImpacted("db"), ["api", "proxy"]);
  assert.deepEqual(potentiallyImpacted("api"), ["proxy"]);
  assert.deepEqual(potentiallyImpacted("proxy"), []);
});
