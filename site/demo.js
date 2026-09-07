import { PromptKit } from "./dist/index.js";

const release = await fetch("./release.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error(`Unable to load release metadata (${response.status})`);
  return response.json();
});

document.title = `PromptKit ${release.tag}`;

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

const client = {
  async manifest() {
    return {
      name: "PromptKit",
      subtitle: `${release.tag} · static release demo`,
      prompt: ">",
      commands,
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
            ],
          },
        ]);
      case "/status":
        return response([
          { type: "status", label: "Release", value: release.tag, tone: "success" },
          { type: "status", label: "Source", value: "GitHub Release asset", tone: "info" },
          { type: "status", label: "Lifecycle", value: "ready", tone: "primary" },
        ]);
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
            content: `PromptKit ${release.tag}\n`,
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
        return { ok: true, clear: true, blocks: [] };
      default:
        return response([{ type: "text", text: `Unknown command: ${input}`, tone: "danger" }], false);
    }
  },

  events() {
    return () => {};
  },
};

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("PromptKit root element not found");

const kit = new PromptKit({ root, client, loading: { label: "PromptKit", text: "starting" } });
try {
  await kit.start();
  kit.ready();
} catch {
  // start() already exposes the failed lifecycle state.
}

function response(blocks, ok = true) {
  return { ok, blocks };
}
