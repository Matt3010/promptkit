import { PromptKit } from "./dist/index.js";

const release = await fetch("./release.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error(`Unable to load release metadata (${response.status})`);
  return response.json();
});

document.title = `PromptKit ${release.tag}`;

const commands = ["/help", "/status", "/table", "/code", "/progress", "/download", "/clear"];

const client = {
  async manifest() {
    return {
      name: "PromptKit",
      subtitle: `${release.tag} · static release demo`,
      prompt: ">",
      commands,
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
              ["/clear", "Clear terminal output"],
            ],
          },
        ]);
      case "/status":
        return response([
          { type: "status", label: "Release", value: release.tag, tone: "success" },
          { type: "status", label: "Source", value: "GitHub Release asset", tone: "info" },
          { type: "status", label: "Protocol", value: "V1", tone: "primary" },
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

const kit = new PromptKit({ root, client });
await kit.start();

function response(blocks, ok = true) {
  return { ok, blocks };
}
