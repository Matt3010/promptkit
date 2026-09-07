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
  const commands = [
    "/help",
    "/status",
    "/table",
    "/code",
    "/progress",
    "/download",
    "/theme cool",
    "/theme warm",
    "/theme default",
    "/clear",
  ];

  return {
    async manifest() {
      return {
        name: "PromptKit",
        subtitle: `${releaseMetadata.tag} · static release demo`,
        prompt: ">",
        commands,
        actions: [
          {
            id: "inspect-files",
            label: "inspect JSON files",
            tone: "special",
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

    async command(input) {
      switch (input) {
        case "/help":
          return response([
            { type: "text", text: "Available commands", tone: "primary" },
            {
              type: "table",
              columns: ["Command", "Purpose"],
              rows: [
                ["/status", "Show release metadata"],
                ["/table", "Render a table block"],
                ["/code", "Render a code block"],
                ["/progress", "Render a progress block"],
                ["/download", "Render a download block"],
                ["/theme cool", "Switch to the cool theme"],
                ["/theme warm", "Switch to the warm theme"],
                ["/theme default", "Return to the default theme"],
                ["/clear", "Clear terminal output"],
                ["drop .json", "Run the generic inspect-files action"],
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
            indicators: [{ id: "release", label: releaseMetadata.tag, tone: "secondary" }],
          };
        case "/table":
          return response([
            {
              type: "table",
              columns: ["Id", "State"],
              rows: [["42", "ready"], ["43", "running"], ["44", "complete"]],
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
        case "/theme cool":
          return { ...response([{ type: "text", text: "Cool theme", tone: "primary" }]), themeVariant: "cool" };
        case "/theme warm":
          return { ...response([{ type: "text", text: "Warm theme", tone: "primary" }]), themeVariant: "warm" };
        case "/theme default":
          return { ...response([{ type: "text", text: "Default theme", tone: "primary" }]), themeVariant: null };
        case "/clear":
          return { ok: true, clear: true, blocks: [], indicators: [] };
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
