import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptKitClient } from "../src/client.js";
import type { PromptKitManifest } from "../src/protocol.js";
import { PromptKit } from "../src/promptkit.js";

function manifest(overrides: Partial<PromptKitManifest> = {}): PromptKitManifest {
  return {
    name: "demo",
    theme: {
      default: { accent: "#111" },
      variants: { active: { accent: "#222" } },
    },
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("PromptKit action integration", () => {
  it("applies indicators from command responses", async () => {
    const client = {
      manifest: vi.fn().mockResolvedValue(manifest()),
      command: vi.fn().mockResolvedValue({
        ok: true,
        blocks: [],
        indicators: [{ id: "live", label: "live", tone: "success" }],
      }),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client });
    await kit.start();
    kit.ready();

    const input = root.querySelector(".pk-input") as HTMLInputElement;
    input.value = "/status";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain("[live]"));
    expect(root.querySelector('[data-indicator="live"]')).not.toBeNull();
  });

  it("runs host actions manually and applies their presentation result", async () => {
    const handler = vi.fn().mockResolvedValue({
      blocks: [{ type: "text", text: "action done", tone: "success" }],
      state: { imported: true },
      themeVariant: "active",
      indicators: [{ id: "done", label: "done", tone: "success" }],
    });
    const root = document.createElement("main");
    const kit = new PromptKit({
      root,
      client: { manifest: vi.fn().mockResolvedValue(manifest()) } as unknown as PromptKitClient,
      actions: { import: handler },
    });

    await kit.start();
    await expect(kit.runAction("import")).rejects.toThrow("only available when ready");
    kit.ready();
    await kit.runAction("import", { source: "manual" });

    expect(handler).toHaveBeenCalledWith({ trigger: "manual", payload: { source: "manual" } });
    expect(root.textContent).toContain("action done");
    expect(root.textContent).toContain("[done]");
    expect(root.dataset.imported).toBe("true");
    expect(root.dataset.themeVariant).toBe("active");
    expect(root.style.getPropertyValue("--pk-accent")).toBe("#222");

    kit.setIndicators([]);
    expect(root.querySelector(".pk-indicator")).toBeNull();
  });

  it("uses manifest drop actions through the same host registry", async () => {
    const imported = vi.fn().mockResolvedValue({
      blocks: [{ type: "text", text: "dropped" }],
    });
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({
      root,
      client: {
        manifest: vi.fn().mockResolvedValue(manifest({
          actions: [
            {
              id: "import",
              label: "import",
              triggers: [{ type: "drop", accept: [".json"] }],
            },
          ],
        })),
      } as unknown as PromptKitClient,
      actions: { import: imported },
    });
    await kit.start();
    kit.ready();

    const file = new File(["{}"], "config.json", { type: "application/json" });
    const drop = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
    document.dispatchEvent(drop);

    await vi.waitFor(() => expect(imported).toHaveBeenCalledTimes(1));
    expect(root.textContent).toContain("dropped");
    kit.destroy();
  });
});
