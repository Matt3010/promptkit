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
  assert((await page.text()).includes("/dist/index.js"), "demo page does not load PromptKit build");

  const manifestResponse = await fetch(`${baseUrl}/tui/manifest`);
  assert(manifestResponse.ok, "manifest endpoint failed");
  const manifest = await manifestResponse.json();
  assert(manifest.name === "PromptKit", "unexpected demo manifest");
  assert(Array.isArray(manifest.commands) && manifest.commands.includes("/table"), "demo commands missing");

  const commandResponse = await fetch(`${baseUrl}/tui/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "/status" }),
  });
  assert(commandResponse.ok, "command endpoint failed");
  const command = await commandResponse.json();
  assert(command.ok === true && Array.isArray(command.blocks), "invalid command response");

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
