const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const dockerfile = read("Dockerfile");
  const compose = read("compose.yml");
  const envExample = read(".env.example");
  const server = read("server.js");
  const timer = read("deploy/systemd/agendamiento-hun-reminders.timer");

  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(compose, /\/etc\/agendamiento-hun\/backend\.env/);
  assert.match(compose, /profiles:\s*\n\s+- jobs/);
  assert.doesNotMatch(compose, /WHATSAPP_TOKEN\s*:/);
  assert.doesNotMatch(compose, /SUPABASE_SERVICE_ROLE_KEY\s*:/);
  assert.doesNotMatch(envExample, /HospitalUniversitarioNacionaldeColombia/);
  assert.match(server, /\/health\/live/);
  assert.match(server, /\/health\/ready/);
  assert.match(server, /SIGTERM/);
  assert.match(timer, /OnCalendar=\*-\*-\* 08:00:00/);
  assert.match(timer, /Persistent=true/);

  console.log("Deployment checks passed.");
}

main();
