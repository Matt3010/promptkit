import { spawn } from "node:child_process";
import process from "node:process";

const port = 42731;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["examples/demo/server.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
  await waitUntilReady();

  const page = await fetch(`${baseUrl}/`);
  assert(page.ok, "demo page did not load");
  const pageHtml = await page.text();
  assert(pageHtml.includes("./demo.js"), "demo page does not load the shared demo script");
  assert(pageHtml.includes("./dist/styles.css"), "demo page does not load PromptKit styles");

  const demoScript = await fetch(`${baseUrl}/demo.js`);
  assert(demoScript.ok, "shared demo script did not load");
  const demoSource = await demoScript.text();
  assert(demoSource.includes('from "./dist/index.js"'), "demo script does not load PromptKit build");
  assert(demoSource.includes('"inspect-files"'), "demo script does not register generic actions");

  const releaseMetadata = await fetch(`${baseUrl}/release.json`);
  assert(releaseMetadata.status === 404, "local demo should not expose Pages release metadata");

  const manifestResponse = await fetch(`${baseUrl}/tui/manifest`);
  assert(manifestResponse.ok, "manifest endpoint failed");
  const manifest = await manifestResponse.json();
  assert(manifest.name === "PromptKit", "unexpected demo manifest");
  assert(Array.isArray(manifest.commands) && manifest.commands.includes("/table"), "demo commands missing");
  assert(
    Array.isArray(manifest.actions) && manifest.actions.some((action) => action.id === "inspect-files"),
    "demo actions missing",
  );

  const commandResponse = await fetch(`${baseUrl}/tui/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "/status" }),
  });
  assert(commandResponse.ok, "command endpoint failed");
  const command = await commandResponse.json();
  assert(command.ok === true && Array.isArray(command.blocks), "invalid command response");
  assert(Array.isArray(command.indicators), "demo indicators missing");

  const controller = new AbortController();
  const eventResponse = await fetch(`${baseUrl}/tui/events`, { signal: controller.signal });
  assert(eventResponse.ok && eventResponse.body, "event stream failed");
  const reader = eventResponse.body.getReader();
  const first = await reader.read();
  controller.abort();
  const payload = new TextDecoder().decode(first.value ?? new Uint8Array());
  assert(payload.includes("data:"), "event stream did not emit an SSE frame");

  console.log("PromptKit demo smoke check passed");
} finally {
  child.kill("SIGTERM");
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`demo server exited early (${child.exitCode})\n${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/tui/manifest`);
      if (response.ok) return;
    } catch {
      // The child may still be binding the local socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`demo server did not become ready\n${stderr}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
