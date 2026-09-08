import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const clients = new Set();
let progress = 20;
let replacementCounter = 0;

const manifest = {
  name: "PromptKit",
  subtitle: "/help for demo commands",
  prompt: ">",
  commands: [
    "/help",
    "/status",
    "/table",
    "/code",
    "/progress",
    "/download",
    "/download-auto",
    "/separator",
    "/replace",
    "/indicators",
    "/tones",
    "/theme cool",
    "/theme warm",
    "/theme default",
    "/clear",
    "/error",
  ],
  actions: [
    {
      id: "inspect-files",
      label: "inspect JSON files",
      tone: "special",
      triggers: [{ type: "drop", accept: [".json", "application/json"], multiple: true }],
      echo: { type: "drop-files", tone: "secondary" },
    },
    {
      id: "summarize-files",
      label: "summarize JSON files",
      tone: "info",
      triggers: [{ type: "drop", accept: [".json", "application/json"], multiple: true }],
    },
  ],
  theme: {
    default: {
      accent: "#58d6a8",
      accentMuted: "#4a9781",
      background: "#0d1117",
      foreground: "#c9d1d9",
      muted: "#6e7681",
      danger: "#f0836d",
      warning: "#e8973a",
      success: "#58d6a8",
      info: "#79c0ff",
      special: "#c58af9",
    },
    variants: {
      cool: { accent: "#79c0ff", accentMuted: "#587fa6" },
      warm: { accent: "#e8973a", accentMuted: "#ab7a44" },
    },
  },
  bootstrap: { url: "/tui/bootstrap" },
  events: { url: "/tui/events" },
};

const commandHandlers = new Map([
  ["/help", () => ({
    ok: true,
    blocks: [
      {
        type: "table",
        columns: ["command", "purpose"],
        rows: [
          ["/status", "status blocks and state"],
          ["/table", "structured table and full-width row"],
          ["/code", "code block"],
          ["/progress", "bounded progress"],
          ["/download", "manual browser download"],
          ["/download-auto", "automatic browser download"],
          ["/separator", "separator block"],
          ["/replace", "keyed in-place replacement"],
          ["/indicators", "pulse, hidden and actionable indicators"],
          ["/tones", "all semantic tones"],
          ["/theme cool", "switch to the cool theme variant"],
          ["/theme warm", "switch to the warm theme variant"],
          ["/theme default", "return to the default theme"],
          ["/clear", "clear terminal output"],
          ["/error", "unsuccessful command response"],
          ["drop .json", "open the generic action chooser and optional file echo"],
        ],
      },
    ],
  })],
  ["/status", () => ({
    ok: true,
    blocks: [
      { type: "status", label: "backend", value: "healthy", tone: "success" },
      { type: "status", label: "events", value: `${clients.size} client(s)`, tone: "secondary" },
    ],
    state: { backend: "healthy" },
    indicators: [{ id: "backend", label: "backend", tone: "success" }],
  })],
  ["/table", () => ({
    ok: true,
    blocks: [
      {
        type: "table",
        columns: ["service", "state", "latency"],
        rows: [
          ["Core services"],
          ["database", "healthy", "3 ms"],
          ["cache", "healthy", "1 ms"],
          ["events", "connected", "live"],
        ],
      },
    ],
  })],
  ["/code", () => ({
    ok: true,
    blocks: [{ type: "code", language: "json", code: JSON.stringify({ promptkit: true, realtime: true }, null, 2) }],
  })],
  ["/progress", () => {
    progress = progress >= 100 ? 10 : progress + 10;
    return {
      ok: true,
      blocks: [{ type: "progress", label: "demo operation", value: progress, max: 100, tone: "special" }],
      state: { progress },
    };
  }],
  ["/download", () => ({
    ok: true,
    blocks: [{
      type: "download",
      label: "download demo.json",
      filename: "promptkit-demo.json",
      content: JSON.stringify({ generatedBy: "PromptKit" }, null, 2),
      mediaType: "application/json",
    }],
  })],
  ["/download-auto", () => ({
    ok: true,
    blocks: [{
      type: "download",
      label: "automatic demo download",
      filename: "promptkit-auto.json",
      content: JSON.stringify({ generatedBy: "PromptKit", behavior: "auto" }, null, 2),
      mediaType: "application/json",
      behavior: "auto",
    }],
  })],
  ["/separator", () => ({
    ok: true,
    blocks: [
      { type: "text", text: "before separator", tone: "secondary" },
      { type: "separator" },
      { type: "text", text: "after separator", tone: "secondary" },
    ],
  })],
  ["/replace", () => {
    replacementCounter += 1;
    return {
      ok: true,
      blocks: [{
        type: "text",
        id: "replace-demo",
        update: "replace",
        text: `keyed replacement #${replacementCounter}`,
        tone: "info",
      }],
    };
  }],
  ["/indicators", () => ({
    ok: true,
    blocks: [{ type: "text", text: "Click the pulsing indicator to clear indicators.", tone: "info" }],
    indicators: [
      { id: "pulse", label: "pulsing", tone: "special", pulse: true, action: "clear-indicators" },
      { id: "hidden", label: "hidden", tone: "secondary", active: false },
    ],
  })],
  ["/tones", () => ({
    ok: true,
    blocks: [
      { type: "text", text: "primary", tone: "primary" },
      { type: "text", text: "secondary", tone: "secondary" },
      { type: "text", text: "success", tone: "success" },
      { type: "text", text: "warning", tone: "warning" },
      { type: "text", text: "danger", tone: "danger" },
      { type: "text", text: "info", tone: "info" },
      { type: "text", text: "special", tone: "special" },
    ],
  })],
  ["/theme cool", () => ({
    ok: true,
    blocks: [{ type: "text", text: "cool theme", tone: "primary" }],
    themeVariant: "cool",
  })],
  ["/theme warm", () => ({
    ok: true,
    blocks: [{ type: "text", text: "warm theme", tone: "primary" }],
    themeVariant: "warm",
  })],
  ["/theme default", () => ({
    ok: true,
    blocks: [{ type: "text", text: "default theme", tone: "primary" }],
    themeVariant: null,
  })],
  ["/clear", () => ({ ok: true, clear: true, blocks: [], indicators: [] })],
  ["/error", () => ({
    ok: false,
    blocks: [{ type: "text", text: "This is a demo error block.", tone: "danger" }],
  })],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/tui/manifest") {
    return json(response, 200, manifest);
  }

  if (request.method === "GET" && url.pathname === "/tui/bootstrap") {
    return json(response, 200, {
      blocks: [{ type: "status", label: "bootstrap", value: "loaded", tone: "success" }],
      state: { bootstrap: "loaded" },
      indicators: [{ id: "bootstrap", label: "bootstrapped", tone: "success" }],
    });
  }

  if (request.method === "POST" && url.pathname === "/tui/command") {
    const body = await readJson(request);
    if (!body || typeof body.input !== "string") return json(response, 400, { error: "expected { input: string }" });
    const handler = commandHandlers.get(body.input.trim());
    if (!handler) {
      return json(response, 200, {
        ok: false,
        blocks: [{ type: "text", text: `unknown command: ${body.input}`, tone: "danger" }],
      });
    }
    return json(response, 200, handler());
  }

  if (request.method === "GET" && url.pathname === "/tui/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(`data: ${JSON.stringify({
      id: crypto.randomUUID(),
      blocks: [{
        type: "status",
        id: "connection",
        update: "replace",
        label: "live events",
        value: "connected",
        tone: "success",
      }],
      state: { realtime: true },
    })}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (request.method === "GET") return serveStatic(url.pathname, response);
  json(response, 404, { error: "not found" });
});

setInterval(() => {
  if (clients.size === 0) return;
  const payload = `data: ${JSON.stringify({
    id: crypto.randomUUID(),
    blocks: [{
      type: "status",
      id: "heartbeat",
      update: "replace",
      label: "heartbeat",
      value: new Date().toISOString(),
      tone: "secondary",
    }],
  })}\n\n`;
  for (const client of clients) client.write(payload);
}, 15_000).unref();

server.listen(port, "127.0.0.1", () => {
  console.log(`PromptKit demo: http://127.0.0.1:${port}`);
});

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function serveStatic(pathname, response) {
  const requested = pathname === "/"
    ? "/examples/demo/index.html"
    : pathname.startsWith("/dist/")
      ? pathname
      : `/examples/demo${pathname}`;
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = join(root, safe);

  if (!file.startsWith(root) || !existsSync(file)) {
    return json(response, 404, { error: "not found" });
  }

  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
  };
  response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}
