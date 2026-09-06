import { describe, expect, it, vi } from "vitest";
import { PromptKitClient, PromptKitProtocolError } from "../src/client.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PromptKitClient", () => {
  it("loads the manifest and sends commands", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ name: "relay", commands: ["/status"] }))
      .mockResolvedValueOnce(response({ ok: true, blocks: [{ type: "text", text: "ok" }] }));

    const client = new PromptKitClient({
      baseUrl: "https://example.test/",
      fetch: fetchMock,
    });

    await expect(client.manifest()).resolves.toEqual({ name: "relay", commands: ["/status"] });
    await expect(client.command("/status")).resolves.toEqual({
      ok: true,
      blocks: [{ type: "text", text: "ok" }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.test/tui/manifest",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.test/tui/command",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ input: "/status" }),
      }),
    );
  });

  it("passes AbortSignal only when supplied", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ name: "demo" }));
    const client = new PromptKitClient({ fetch: fetchMock });
    const controller = new AbortController();

    await client.manifest(controller.signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "/tui/manifest",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("rejects invalid protocol responses", async () => {
    const invalidManifest = new PromptKitClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ name: 1 })) });
    await expect(invalidManifest.manifest()).rejects.toBeInstanceOf(PromptKitProtocolError);

    const invalidCommand = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ ok: true, blocks: [{ type: "wat" }] })),
    });
    await expect(invalidCommand.command("/x")).rejects.toBeInstanceOf(PromptKitProtocolError);
  });

  it("surfaces server errors, fallback HTTP errors and non-json responses", async () => {
    const failing = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ error: "denied" }, 403)),
    });
    await expect(failing.command("/secret")).rejects.toThrow("denied");

    const fallback = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ message: "nope" }, 503)),
    });
    await expect(fallback.manifest()).rejects.toThrow("HTTP 503");

    const nonJson = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 200 })),
    });
    await expect(nonJson.manifest()).rejects.toThrow("non-JSON");
  });

  it("consumes valid SSE messages, ignores malformed ones and closes the stream", () => {
    const listeners = new Map<string, EventListener[]>();
    const close = vi.fn();
    const source = {
      addEventListener(type: string, listener: EventListener): void {
        const existing = listeners.get(type) ?? [];
        existing.push(listener);
        listeners.set(type, existing);
      },
      close,
    } as unknown as EventSource;

    const onEvent = vi.fn();
    const onError = vi.fn();
    const client = new PromptKitClient({
      baseUrl: "https://relay.test",
      eventSourceFactory: (url) => {
        expect(url).toBe("https://relay.test/tui/events");
        return source;
      },
    });

    const stop = client.events("/tui/events", onEvent, onError);
    const messages = listeners.get("message") ?? [];
    const errors = listeners.get("error") ?? [];

    messages[0]?.(new MessageEvent("message", { data: "not-json" }));
    messages[0]?.(new MessageEvent("message", { data: JSON.stringify({ blocks: [{ type: "wat" }] }) }));
    messages[0]?.(new MessageEvent("message", { data: JSON.stringify({ id: "1", state: { live: true } }) }));
    errors[0]?.(new Event("error"));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ id: "1", state: { live: true } });
    expect(onError).toHaveBeenCalledTimes(1);

    stop();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
