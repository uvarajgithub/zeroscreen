const http = require("http");
const fs = require("fs");

function discoverPort() {
  if (process.env.ZERO_SCREEN_PORT) return Number(process.env.ZERO_SCREEN_PORT);
  try {
    const processes = JSON.parse(fs.readFileSync("/root/.pm2/dump.pm2", "utf8"));
    const zeroScreen = processes.find((entry) => entry?.name === "zeroscreen");
    const configured = zeroScreen?.pm2_env?.env?.PORT ?? zeroScreen?.pm2_env?.PORT;
    if (configured) return Number(configured);
  } catch (_) {
    // Local runs and non-PM2 installations use the development default.
  }
  return 4000;
}

const port = discoverPort();
const body = JSON.stringify({ confirm: true });

const request = http.request({
  host: "127.0.0.1",
  port,
  path: "/api/tradeops/emergency-stop",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  },
}, (response) => {
  console.log(`HTTP_STATUS=${response.statusCode}`);
  console.log(`LOCATION=${response.headers.location || ""}`);
  response.resume();
  response.on("end", () => {
    if (response.statusCode !== 302 || !String(response.headers.location || "").startsWith("/login?next=")) {
      console.error("EMERGENCY_AUTH_GUARD=FAILED");
      process.exitCode = 1;
      return;
    }
    console.log("EMERGENCY_AUTH_GUARD=OK");
  });
});

request.on("error", (error) => {
  console.error(`REQUEST_ERROR=${error.message}`);
  process.exitCode = 1;
});

request.end(body);
