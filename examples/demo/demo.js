import { PromptKit } from "./dist/index.js";

const release = await loadReleaseMetadata();
const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("PromptKit root element not found");

if (release) document.title = `PromptKit ${release.tag}`;

const actions = {
  "inspect-files": async ({ files }) => ({
    blocks: [
      {
        type: "text",
        text: `received ${files.length} file${files.length === 1 ? "" : "s"}: ${files.map((file) => file.name).join(", ")}`,
        tone: "success",
      },
    ],
    indicators: [
      {
        id: "last-drop",
        label: `${files.length} file${files.length === 1 ? "" : "s"}`,
        tone: "info",
        action: "clear-indicators",
      },
    ],
  }),
  "summarize-files": async ({ files }) => ({
    blocks: [
      {
        type: "table",
        columns: ["File", "Type", "Bytes"],
        rows: files.map((file) => [file.name, file.type || "unknown", String(file.size)]),
        tone: "secondary",
      },
    ],
  }),
  "clear-indicators": () => ({ indicators: [] }),
};

const kit = new PromptKit({
  root,
  ...(release ? { client: staticClient(release) } : {}),
  actions,
  loading: { label: "PromptKit", text: "starting" },
});

try {
  await kit.start();
  kit.ready();
} catch {
  // start() already exposes the failed lifecycle state.
}

async function loadReleaseMetadata() {
  try {
    const response = await fetch("./release.json", { cache: "no-store" });
    if (!response.ok) return null;
    const value = await response.json();
    if (!value || typeof value.tag !== "string" || typeof value.version !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

function staticClient(releaseMetadata) {
  let replacementCounter = 0;
  const commands = [
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
  ];

  return {
    async manifest() {
      return {
        name: "PromptKit",
        subtitle: `${releaseMetadata.tag} · static release demo`,
        prompt: ">",
        commands,
        bootstrap: { url: "/tui/bootstrap" },
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
            accent: "#8b949e",
            accentMuted: "#5c636b",
          },
          variants: {
            cool: {
              accent: "#79c0ff",
              accentMuted: "#587fa6",
            },
            warm: {
              accent: "#e8973a",
              accentMuted: "#ab7a44",
            },
          },
        },
      };
    },

    async bootstrap() {
      return {
        blocks: [{ type: "status", label: "Bootstrap", value: "loaded", tone: "success" }],
        state: { bootstrap: "loaded" },
        indicators: [{ id: "bootstrap", label: "bootstrapped", tone: "success" }],
      };
    },

    async command(input) {
      switch (input) {
        case "/help":
          return response([
            { type: "text", text: "Available commands", tone: "primary" },
            {
              type: "table",
              columns: ["Command", "Purpose"],
              rows: [
                ["/status", "Show release metadata, state and indicators"],
                ["/table", "Render a table including a full-width row"],
                ["/code", "Render a code block"],
                ["/progress", "Render a progress block"],
                ["/download", "Render a manual download block"],
                ["/download-auto", "Trigger an automatic download block"],
                ["/separator", "Render a separator block"],
                ["/replace", "Replace a keyed block in place"],
                ["/indicators", "Show pulse, hidden and actionable indicators"],
                ["/tones", "Render every semantic tone"],
                ["/theme cool", "Switch to the cool theme"],
                ["/theme warm", "Switch to the warm theme"],
                ["/theme default", "Return to the default theme"],
                ["/clear", "Clear terminal output"],
                ["/error", "Render an unsuccessful command response"],
                ["drop .json", "Open the generic action chooser and optional file echo"],
              ],
            },
          ]);
        case "/status":
          return {
            ...response([
              { type: "status", label: "Release", value: releaseMetadata.tag, tone: "success" },
              { type: "status", label: "Source", value: "GitHub Release asset", tone: "info" },
              { type: "status", label: "Lifecycle", value: "ready", tone: "primary" },
            ]),
            state: { source: "static-release" },
            indicators: [{ id: "release", label: releaseMetadata.tag, tone: "secondary" }],
          };
        case "/table":
          return response([
            {
              type: "table",
              columns: ["Id", "State"],
              rows: [["Example rows"], ["42", "ready"], ["43", "running"], ["44", "complete"]],
            },
          ]);
        case "/code":
          return response([
            {
              type: "code",
              language: "json",
              code: JSON.stringify({ ok: true, blocks: [{ type: "text", text: "Hello from PromptKit" }] }, null, 2),
            },
          ]);
        case "/progress":
          return response([{ type: "progress", label: "Example task", value: 72, max: 100, tone: "info" }]);
        case "/download":
          return response([
            {
              type: "download",
              label: "Download example.txt",
              filename: "example.txt",
              content: `PromptKit ${releaseMetadata.tag}\n`,
              mediaType: "text/plain",
            },
          ]);
        case "/download-auto":
          return response([
            {
              type: "download",
              label: "Automatic example download",
              filename: "promptkit-auto.txt",
              content: `PromptKit ${releaseMetadata.tag} automatic download\n`,
              mediaType: "text/plain",
              behavior: "auto",
            },
          ]);
        case "/separator":
          return response([
            { type: "text", text: "before separator", tone: "secondary" },
            { type: "separator" },
            { type: "text", text: "after separator", tone: "secondary" },
          ]);
        case "/replace":
          replacementCounter += 1;
          return response([
            {
              type: "text",
              id: "replace-demo",
              update: "replace",
              text: `keyed replacement #${replacementCounter}`,
              tone: "info",
            },
          ]);
        case "/indicators":
          return {
            ...response([{ type: "text", text: "Click the pulsing indicator to clear indicators.", tone: "info" }]),
            indicators: [
              { id: "pulse", label: "pulsing", tone: "special", pulse: true, action: "clear-indicators" },
              { id: "hidden", label: "hidden", tone: "secondary", active: false },
            ],
          };
        case "/tones":
          return response([
            { type: "text", text: "primary", tone: "primary" },
            { type: "text", text: "secondary", tone: "secondary" },
            { type: "text", text: "success", tone: "success" },
            { type: "text", text: "warning", tone: "warning" },
            { type: "text", text: "danger", tone: "danger" },
            { type: "text", text: "info", tone: "info" },
            { type: "text", text: "special", tone: "special" },
          ]);
        case "/theme cool":
          return { ...response([{ type: "text", text: "Cool theme", tone: "primary" }]), themeVariant: "cool" };
        case "/theme warm":
          return { ...response([{ type: "text", text: "Warm theme", tone: "primary" }]), themeVariant: "warm" };
        case "/theme default":
          return { ...response([{ type: "text", text: "Default theme", tone: "primary" }]), themeVariant: null };
        case "/clear":
          return { ok: true, clear: true, blocks: [], indicators: [] };
        case "/error":
          return response([{ type: "text", text: "This is a demo error block.", tone: "danger" }], false);
        default:
          return response([{ type: "text", text: `Unknown command: ${input}`, tone: "danger" }], false);
      }
    },

    events() {
      return () => {};
    },
  };
}

function response(blocks, ok = true) {
  return { ok, blocks };
}
