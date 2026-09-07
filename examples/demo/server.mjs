import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const clients = new Set();
let progress = 20;

const manifest = {
  protocol: 2,
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
    "/theme cool",
    "/theme warm",
    "/theme default",
    "/error",
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
          ["/table", "structured table"],
          ["/code", "code block"],
          ["/progress", "bounded progress"],
          ["/download", "browser download"],
          ["/theme cool", "switch to the cool theme variant"],
          ["/theme warm", "switch to the warm theme variant"],
          ["/theme default", "return to the default theme"],
          ["/error", "danger output"],
        ],
      },
    ],
  })],
  ["/status", () => ({
    ok: true,
    blocks: [
      { type: "status", label: "protocol", value: "v2", tone: "info" },
      { type: "status", label: "backend", value: "healthy", tone: "success" },
      { type: "status", label: "events", value: `${clients.size} client(s)`, tone: "secondary" },
    ],
    state: { backend: "healthy" },
  })],
  ["/table", () => ({
    ok: true,
    blocks: [
      {
        type: "table",
        columns: ["service", "state", "latency"],
        rows: [["database", "healthy", "3 ms"], ["cache", "healthy", "1 ms"], ["events", "connected", "live"]],
      },
    ],
  })],
  ["/code", () => ({
    ok: true,
    blocks: [{ type: "code", language: "json", code: JSON.stringify({ promptkit: "v2", realtime: true }, null, 2) }],
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
      content: JSON.stringify({ generatedBy: "PromptKit", protocol: 2 }, null, 2),
      mediaType: "application/json",
    }],
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
    response.write(`data: ${JSON.stringify({ id: crypto.randomUUID(), state: { realtime: true } })}\n\n`);
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
    blocks: [{ type: "status", label: "heartbeat", value: new Date().toISOString(), tone: "secondary" }],
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
  const requested = pathname === "/" ? "/examples/demo/index.html" : pathname;
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
