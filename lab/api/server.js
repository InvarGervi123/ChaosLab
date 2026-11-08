"use strict";

const http = require("node:http");
const net = require("node:net");

const dbHost = process.env.DB_HOST || "db";
const dbPort = 5432;

// A real PostgreSQL protocol startup probe: SSLRequest -> reply N.
// It verifies connectivity to the actual database process without extra dependencies.
function checkDb() {
  return new Promise(resolve => {
    const client = net.createConnection({ host: dbHost, port: dbPort });
    let done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      client.destroy();
      resolve(ok);
    }
    client.setTimeout(1200, () => finish(false));
    client.once("error", () => finish(false));
    client.once("connect", () => {
      const request = Buffer.alloc(8);
      request.writeInt32BE(8, 0);
      request.writeInt32BE(80877103, 4);
      client.write(request);
    });
    client.once("data", data => finish(data.length > 0 && (data[0] === 0x4e || data[0] === 0x53)));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url !== "/" && req.url !== "/health") {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "Not Found" }));
  }
  const databaseReachable = await checkDb();
  res.writeHead(databaseReachable ? 200 : 503, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify({
    service: "chaoslab-lab-api",
    databaseConnection: databaseReachable ? "available" : "unavailable",
    status: databaseReachable ? "healthy" : "degraded"
  }));
});

server.listen(3000, "0.0.0.0", () => console.log("Sandbox API listening on port 3000"));
