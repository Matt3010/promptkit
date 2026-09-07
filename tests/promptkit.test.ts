import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptKitClient } from "../src/client.js";
import type { PromptKitCommandResponse, PromptKitEvent, PromptKitManifest } from "../src/protocol.js";
import { PromptKit } from "../src/promptkit.js";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function manifest(overrides: Partial<PromptKitManifest> = {}): PromptKitManifest {
  return {
    name: "demo",
    subtitle: "/help",
    commands: ["/one", "/only", "/status", "/clear"],
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("PromptKit", () => {
  it("owns loading -> ready lifecycle and focuses only when ready", async () => {
    const client = {
      manifest: vi.fn().mockResolvedValue(manifest({
        prompt: "$",
        theme: { default: { accent: "#123456" } },
      })),
      command: vi.fn(),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client, loading: { label: "demo", text: "starting" } });

    expect(kit.phase).toBe("loading");
    expect(root.dataset.phase).toBe("loading");
    expect(root.querySelector(".pk-loading")?.textContent).toContain("demo");
    expect(root.querySelector(".pk-loading")?.textContent).toContain("starting");
    expect((root.querySelector(".pk-input") as HTMLInputElement).disabled).toBe(true);
    expect(() => kit.ready()).toThrow("finish start() before ready()");
    expect(() => kit.setThemeVariant("missing")).toThrow("unavailable before start() finishes");

    await kit.start();
    expect(root.textContent).not.toContain("/help");
    expect(root.style.getPropertyValue("--pk-accent")).toBe("#123456");
    expect(document.activeElement).not.toBe(root.querySelector(".pk-input"));

    kit.ready();
    const input = root.querySelector(".pk-input") as HTMLInputElement;
    expect(kit.phase).toBe("ready");
    expect(root.dataset.phase).toBe("ready");
    expect(root.querySelector(".pk-loading")).toBeNull();
    expect(root.textContent).toContain("demo");
    expect(root.textContent).toContain("/help");
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(root.querySelector(".pk-prompt")?.textContent).toBe("$");

    kit.ready();
    await expect(kit.start()).rejects.toThrow("only be called once");
  });

  it("shows initialization failures and blocks ready after failure", async () => {
    const client = {
      manifest: vi.fn().mockRejectedValue(new Error("backend down")),
      command: vi.fn(),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("div");
    const kit = new PromptKit({ root, client });

    await expect(kit.start()).rejects.toThrow("backend down");
    expect(kit.phase).toBe("failed");
    expect(root.dataset.phase).toBe("failed");
    expect(root.querySelector(".pk-loading-failed")?.textContent).toContain("backend down");
    expect((root.querySelector(".pk-loading-spinner") as HTMLElement).hidden).toBe(true);
    expect(() => kit.ready()).toThrow("cannot become ready");

    kit.fail("still down");
    expect(root.querySelector(".pk-loading-text")?.textContent).toBe("still down");
  });

  it("preserves raw spacing, keeps input available and applies response state and theme", async () => {
    let resolveCommand: ((response: PromptKitCommandResponse) => void) | undefined;
    const pending = new Promise<PromptKitCommandResponse>((resolve) => {
      resolveCommand = resolve;
    });
    const command = vi.fn().mockReturnValue(pending);
    const client = {
      manifest: vi.fn().mockResolvedValue(manifest({
        theme: {
          default: { accent: "#999", accentMuted: "#777" },
          variants: { warm: { accent: "#f90" } },
        },
      })),
      command,
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("div");
    document.body.append(root);
    const kit = new PromptKit({ root, client });
    await kit.start();
    kit.ready();

    const input = root.querySelector(".pk-input") as HTMLInputElement;
    input.value = "  /status  ";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(command).toHaveBeenCalledWith("  /status  ");
    expect(input.disabled).toBe(false);
    expect(root.textContent).toContain(">   /status  ");

    resolveCommand?.({
      ok: true,
      blocks: [{ type: "status", label: "db", value: "healthy" }],
      state: { mode: "live", connected: true, count: 3, optional: null },
      themeVariant: "warm",
    });
    await vi.waitFor(() => expect(root.textContent).toContain("healthy"));
    expect(root.dataset.mode).toBe("live");
    expect(root.dataset.connected).toBe("true");
    expect(root.dataset.count).toBe("3");
    expect(root.dataset.optional).toBeUndefined();
    expect(root.dataset.themeVariant).toBe("warm");
    expect(root.style.getPropertyValue("--pk-accent")).toBe("#f90");
    expect(root.style.getPropertyValue("--pk-accent-muted")).toBe("#777");
  });

  it("supports default, named and unknown theme variants", async () => {
    const client = {
      manifest: vi.fn().mockResolvedValue(manifest({
        theme: {
          default: { accent: "#111", warning: "#222" },
          variants: { active: { accent: "#333", warning: "#444" } },
        },
      })),
      command: vi.fn(),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("div");
    const kit = new PromptKit({ root, client });
    await kit.start();

    kit.setThemeVariant("active");
    expect(root.dataset.themeVariant).toBe("active");
    expect(root.style.getPropertyValue("--pk-accent")).toBe("#333");

    kit.setThemeVariant("missing");
    expect(root.dataset.themeVariant).toBeUndefined();
    expect(root.style.getPropertyValue("--pk-accent")).toBe("#111");

    kit.setThemeVariant(null);
    expect(root.dataset.themeVariant).toBeUndefined();
    expect(root.style.getPropertyValue("--pk-warning")).toBe("#222");
  });

  it("queues event blocks until ready and closes the stream on destroy", async () => {
    const handlers: { event?: (event: PromptKitEvent) => void; error?: (event: Event) => void } = {};
    const close = vi.fn();
    const client = {
      manifest: vi.fn().mockResolvedValue(manifest({
        theme: { default: { accent: "#111" }, variants: { live: { accent: "#0f0" } } },
        events: { url: "/events" },
      })),
      command: vi.fn(),
      events: vi.fn((_path: string, onEvent: (event: PromptKitEvent) => void, onError?: (event: Event) => void) => {
        handlers.event = onEvent;
        if (onError) handlers.error = onError;
        return close;
      }),
    } as unknown as PromptKitClient;
    const root = document.createElement("div");
    const kit = new PromptKit({ root, client });
    await kit.start();

    handlers.event?.({
      themeVariant: "live",
      state: { syncState: "idle" },
      blocks: [{ type: "text", text: "event arrived" }],
    });
    expect(root.dataset.connection).toBe("connected");
    expect(root.dataset.syncState).toBe("idle");
    expect(root.dataset.themeVariant).toBe("live");
    expect(root.textContent).not.toContain("event arrived");

    kit.ready();
    expect(root.textContent).toContain("event arrived");
    handlers.error?.(new Event("error"));
    expect(root.dataset.connection).toBe("degraded");

    kit.destroy();
    expect(close).toHaveBeenCalledTimes(1);
    expect(root.children).toHaveLength(0);
    expect(root.dataset.phase).toBeUndefined();
    expect(root.dataset.themeVariant).toBeUndefined();
    kit.destroy();
    expect(() => kit.clear()).toThrow("destroyed");
  });

  it("supports completion, caret refresh, history, blank input and clear", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(manifest()))
      .mockResolvedValueOnce(json({ ok: true, blocks: [{ type: "text", text: "first" }] }))
      .mockResolvedValueOnce(json({ ok: true, blocks: [{ type: "text", text: "second" }] }))
      .mockResolvedValueOnce(json({ ok: true, blocks: [], clear: true }));
    const root = document.createElement("div");
    const kit = new PromptKit({ root, client: new PromptKitClient({ fetch: fetchMock }) });
    await kit.start();
    kit.ready();

    const input = root.querySelector(".pk-input") as HTMLInputElement;
    const suggestion = root.querySelector(".pk-suggestion") as HTMLSpanElement;
    expect(input.getAttribute("autocorrect")).toBe("off");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    input.value = "/o";
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event("input"));
    expect(suggestion.textContent).toBe("ne");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(input.value).toBe("/one");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("first"));

    input.value = "/only";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("second"));

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(input.value).toBe("/only");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(input.value).toBe("/one");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(input.value).toBe("/only");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(input.value).toBe("");

    input.value = "/sta";
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(input.value).toBe("/sta");
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "End", bubbles: true }));
    expect(suggestion.textContent).toBe("tus");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(input.value).toBe("/status");

    input.value = "/clear";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).not.toContain("second"));
    expect(root.textContent).toContain("demo");
    expect(root.textContent).toContain("/help");
    expect(root.textContent).not.toContain("> /clear");
  });

  it("focuses from the document without stealing button focus or text selection", async () => {
    const root = document.createElement("div");
    const outside = document.createElement("div");
    const button = document.createElement("button");
    document.body.append(root, outside, button);
    const kit = new PromptKit({
      root,
      client: { manifest: vi.fn().mockResolvedValue(manifest()) } as unknown as PromptKitClient,
    });
    await kit.start();
    kit.ready();
    const input = root.querySelector(".pk-input") as HTMLInputElement;

    input.blur();
    outside.click();
    expect(document.activeElement).toBe(input);

    input.blur();
    button.click();
    expect(document.activeElement).not.toBe(input);

    const getSelection = vi.spyOn(document, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);
    outside.click();
    expect(document.activeElement).not.toBe(input);
    getSelection.mockRestore();
  });

  it("can keep focus handling scoped to the terminal screen", async () => {
    const root = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(root, outside);
    const kit = new PromptKit({
      root,
      focusScope: "screen",
      client: { manifest: vi.fn().mockResolvedValue(manifest()) } as unknown as PromptKitClient,
    });
    await kit.start();
    kit.ready();
    const input = root.querySelector(".pk-input") as HTMLInputElement;
    input.blur();
    outside.click();
    expect(document.activeElement).not.toBe(input);
    (root.querySelector(".pk-screen") as HTMLElement).click();
    expect(document.activeElement).toBe(input);
  });

  it("uses fail() only during initialization and queues explicit writes before ready", async () => {
    const root = document.createElement("div");
    const kit = new PromptKit({
      root,
      client: { manifest: vi.fn().mockResolvedValue(manifest()) } as unknown as PromptKitClient,
    });
    kit.write([{ type: "text", text: "queued" }]);
    kit.clear();
    kit.write([{ type: "text", text: "after clear" }]);
    await kit.start();
    kit.ready();
    expect(root.textContent).not.toContain("queued");
    expect(root.textContent).toContain("after clear");
    expect(() => kit.fail("too late")).toThrow("only valid before ready()");
  });
});
