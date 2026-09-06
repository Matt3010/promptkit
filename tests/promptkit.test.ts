import { describe, expect, it, vi } from "vitest";
import { PromptKitClient } from "../src/client.js";
import type { PromptKitEvent } from "../src/protocol.js";
import { PromptKit } from "../src/promptkit.js";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("PromptKit", () => {
  it("loads a manifest, completes a command and renders its response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          name: "relay",
          subtitle: "/help for commands",
          prompt: "$",
          commands: ["/status", "/stop"],
          theme: { accent: "#123456" },
        }),
      )
      .mockResolvedValueOnce(json({ ok: true, blocks: [{ type: "status", label: "db", value: "healthy" }] }));

    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client: new PromptKitClient({ fetch: fetchMock }), autofocus: false });

    await kit.start();

    expect(root.textContent).toContain("relay");
    expect(root.textContent).toContain("/help for commands");
    expect(root.style.getPropertyValue("--pk-accent")).toBe("#123456");

    const input = root.querySelector("input") as HTMLInputElement;
    input.value = "/sta";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(input.value).toBe("/status");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("healthy"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    kit.destroy();
    expect(root.children).toHaveLength(0);
    kit.destroy();
    expect(() => kit.clear()).toThrow("destroyed");
  });

  it("supports history navigation, blank input and clear", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ name: "demo", commands: ["/one", "/only"] }))
      .mockResolvedValueOnce(json({ ok: true, blocks: [{ type: "text", text: "done" }] }))
      .mockResolvedValueOnce(json({ ok: true, blocks: [{ type: "text", text: "second" }] }));

    const root = document.createElement("div");
    const kit = new PromptKit({ root, client: new PromptKitClient({ fetch: fetchMock }), autofocus: false });
    await kit.start();

    const input = root.querySelector("input") as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    input.value = "/one";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("done"));

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

    kit.clear();
    expect(root.textContent).toContain("demo");
    expect(root.textContent).not.toContain("done");
  });

  it("applies command state and renders client failures", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ name: "demo", commands: ["/state", "/fail"] }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          blocks: [],
          state: { mode: "live", connected: true, count: 3, optional: null },
        }),
      )
      .mockRejectedValueOnce(new Error("backend down"));

    const root = document.createElement("div");
    const kit = new PromptKit({ root, client: new PromptKitClient({ fetch: fetchMock }), autofocus: false });
    await kit.start();

    const input = root.querySelector("input") as HTMLInputElement;
    input.value = "/state";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.dataset.mode).toBe("live"));
    expect(root.dataset.connected).toBe("true");
    expect(root.dataset.count).toBe("3");
    expect(root.dataset.optional).toBeUndefined();

    input.value = "/fail";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("backend down"));
    expect(root.querySelector(".pk-tone-danger")?.textContent).toContain("backend down");
  });

  it("subscribes to optional events, updates state and closes on destroy", async () => {
    const handlers: {
      event?: (event: PromptKitEvent) => void;
      error?: (event: Event) => void;
    } = {};
    const close = vi.fn();

    const client = {
      manifest: vi.fn().mockResolvedValue({
        name: "demo",
        events: { url: "/events" },
      }),
      command: vi.fn(),
      events: vi.fn((_path: string, onEvent: (event: PromptKitEvent) => void, onError?: (event: Event) => void) => {
        handlers.event = onEvent;
        if (onError) handlers.error = onError;
        return close;
      }),
    } as unknown as PromptKitClient;

    const root = document.createElement("div");
    const kit = new PromptKit({ root, client, autofocus: true });
    await kit.start();

    expect(root.dataset.connection).toBe("connected");
    expect(document.activeElement).toBe(root.querySelector("input"));

    handlers.event?.({ state: { syncState: "idle" } });
    expect(root.dataset.syncState).toBe("idle");
    handlers.error?.(new Event("error"));
    expect(root.dataset.connection).toBe("degraded");

    kit.destroy();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("supports ArrowRight completion only at the end of the input", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ name: "demo", commands: ["/status"] }));
    const root = document.createElement("div");
    const kit = new PromptKit({ root, client: new PromptKitClient({ fetch: fetchMock }), autofocus: false });
    await kit.start();

    const input = root.querySelector("input") as HTMLInputElement;
    input.value = "/sta";
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(input.value).toBe("/sta");

    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(input.value).toBe("/status");
  });
});
