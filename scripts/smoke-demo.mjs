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
  assert(demoSource.includes('"inspect-files"'), "demo script does not register inspect-files action");
  assert(demoSource.includes('"summarize-files"'), "demo script does not register overlapping drop action");
  assert(demoSource.includes("async bootstrap()"), "static release demo does not demonstrate bootstrap");
  assert(demoSource.includes('case "/separator"'), "static release demo does not demonstrate separator blocks");
  assert(demoSource.includes('case "/download-auto"'), "static release demo does not demonstrate auto-download");
  assert(demoSource.includes('case "/replace"'), "static release demo does not demonstrate keyed replacement");
  assert(demoSource.includes('case "/indicators"'), "static release demo does not demonstrate indicator options");
  assert(demoSource.includes('case "/tones"'), "static release demo does not demonstrate semantic tones");
  assert(demoSource.includes('case "/error"'), "static release demo does not demonstrate unsuccessful responses");

  const releaseMetadata = await fetch(`${baseUrl}/release.json`);
  assert(releaseMetadata.status === 404, "local demo should not expose Pages release metadata");

  const manifestResponse = await fetch(`${baseUrl}/tui/manifest`);
  assert(manifestResponse.ok, "manifest endpoint failed");
  const manifest = await manifestResponse.json();
  assert(manifest.name === "PromptKit", "unexpected demo manifest");
  assert(manifest.bootstrap?.url === "/tui/bootstrap", "demo bootstrap source missing");
  assert(manifest.events?.url === "/tui/events", "demo SSE source missing");
  assert(Array.isArray(manifest.commands), "demo commands missing");
  for (const command of [
    "/table",
    "/download-auto",
    "/separator",
    "/replace",
    "/indicators",
    "/tones",
    "/clear",
    "/error",
  ]) {
    assert(manifest.commands.includes(command), `demo command missing: ${command}`);
  }
  assert(Array.isArray(manifest.actions) && manifest.actions.length >= 2, "demo action chooser inputs missing");
  assert(manifest.actions.some((action) => action.id === "inspect-files"), "inspect-files action missing");
  assert(manifest.actions.some((action) => action.id === "summarize-files"), "summarize-files action missing");

  const bootstrapResponse = await fetch(`${baseUrl}/tui/bootstrap`);
  assert(bootstrapResponse.ok, "bootstrap endpoint failed");
  const bootstrap = await bootstrapResponse.json();
  assert(bootstrap.state?.bootstrap === "loaded", "bootstrap state missing");
  assert(bootstrap.blocks?.[0]?.type === "status", "bootstrap block missing");
  assert(bootstrap.indicators?.[0]?.id === "bootstrap", "bootstrap indicators missing");

  const invalidBootstrapMethod = await fetch(`${baseUrl}/tui/bootstrap`, { method: "POST" });
  assert(invalidBootstrapMethod.status === 404, "bootstrap demo endpoint must remain GET-only");

  const status = await command("/status");
  assert(status.ok === true && Array.isArray(status.blocks), "invalid status response");
  assert(status.state?.backend === "healthy", "demo state update missing");
  assert(Array.isArray(status.indicators), "demo indicators missing");

  const table = await command("/table");
  const tableBlock = table.blocks?.find((block) => block.type === "table");
  assert(tableBlock?.rows?.some((row) => row.length === 1), "full-width single-cell table row missing");

  const separator = await command("/separator");
  assert(separator.blocks?.some((block) => block.type === "separator"), "separator block missing");

  const manualDownload = await command("/download");
  const manualDownloadBlock = manualDownload.blocks?.find((block) => block.type === "download");
  assert(manualDownloadBlock && manualDownloadBlock.behavior === undefined, "manual download behavior changed");

  const autoDownload = await command("/download-auto");
  const autoDownloadBlock = autoDownload.blocks?.find((block) => block.type === "download");
  assert(autoDownloadBlock?.behavior === "auto", "automatic download behavior missing");

  const firstReplacement = await command("/replace");
  const secondReplacement = await command("/replace");
  const firstReplacementBlock = firstReplacement.blocks?.[0];
  const secondReplacementBlock = secondReplacement.blocks?.[0];
  assert(firstReplacementBlock?.id === "replace-demo", "keyed replacement id missing");
  assert(firstReplacementBlock?.update === "replace", "keyed replacement mode missing");
  assert(secondReplacementBlock?.id === "replace-demo", "replacement id must remain stable");
  assert(firstReplacementBlock.text !== secondReplacementBlock.text, "replacement example must visibly update");

  const indicators = await command("/indicators");
  const pulsing = indicators.indicators?.find((indicator) => indicator.id === "pulse");
  const hidden = indicators.indicators?.find((indicator) => indicator.id === "hidden");
  assert(pulsing?.pulse === true, "pulsing indicator example missing");
  assert(pulsing?.action === "clear-indicators", "actionable indicator example missing");
  assert(hidden?.active === false, "inactive indicator example missing");

  const tones = await command("/tones");
  const renderedTones = tones.blocks?.map((block) => block.tone).filter(Boolean) ?? [];
  for (const tone of ["primary", "secondary", "success", "warning", "danger", "info", "special"]) {
    assert(renderedTones.includes(tone), `semantic tone missing from demo: ${tone}`);
  }

  const coolTheme = await command("/theme cool");
  assert(coolTheme.themeVariant === "cool", "theme variant example missing");
  const defaultTheme = await command("/theme default");
  assert(defaultTheme.themeVariant === null, "theme reset example missing");

  const cleared = await command("/clear");
  assert(cleared.clear === true && cleared.blocks?.length === 0, "clear update example missing");

  const error = await command("/error");
  assert(error.ok === false, "unsuccessful command example missing");
  assert(error.blocks?.[0]?.tone === "danger", "error tone example missing");

  const controller = new AbortController();
  const eventResponse = await fetch(`${baseUrl}/tui/events`, { signal: controller.signal });
  assert(eventResponse.ok && eventResponse.body, "event stream failed");
  const reader = eventResponse.body.getReader();
  const first = await reader.read();
  controller.abort();
  const payload = new TextDecoder().decode(first.value ?? new Uint8Array());
  const dataLine = payload.split("\n").find((line) => line.startsWith("data: "));
  assert(dataLine, "event stream did not emit an SSE data frame");
  const event = JSON.parse(dataLine.slice("data: ".length));
  assert(typeof event.id === "string" && event.id.length > 0, "SSE event id missing");
  assert(event.state?.realtime === true, "SSE state update missing");
  assert(event.blocks?.[0]?.id === "connection", "SSE keyed block id missing");
  assert(event.blocks?.[0]?.update === "replace", "SSE keyed replacement example missing");

  console.log("PromptKit demo smoke check passed");
} finally {
  child.kill("SIGTERM");
}

async function command(input) {
  const response = await fetch(`${baseUrl}/tui/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  assert(response.ok, `command endpoint failed for ${input}`);
  return response.json();
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
