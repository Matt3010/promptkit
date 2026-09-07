import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptKitClient, PromptKitProtocolError } from "../src/client.js";
import { PromptKit } from "../src/promptkit.js";
import { isPromptKitBlock, isPromptKitManifest } from "../src/protocol.js";
import { PromptKitRenderer } from "../src/renderer.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("live updates", () => {
  it("keeps SSE explicit but optional in the manifest", () => {
    expect(isPromptKitManifest({ name: "demo", events: { url: "/events" } })).toBe(true);
    expect(isPromptKitManifest({ name: "demo", events: { url: "/events", transport: "sse" } })).toBe(true);
    expect(isPromptKitManifest({ name: "demo", events: { url: "/events", transport: "websocket" } })).toBe(false);
    expect(isPromptKitManifest({ name: "demo", events: { transport: "sse" } })).toBe(false);
  });

  it("validates keyed block metadata and download behavior", () => {
    expect(isPromptKitBlock({ type: "text", id: "live", update: "replace", text: "ok" })).toBe(true);
    expect(isPromptKitBlock({ type: "text", id: "", text: "no" })).toBe(false);
    expect(isPromptKitBlock({ type: "text", update: "merge", text: "no" })).toBe(false);
    expect(
      isPromptKitBlock({
        type: "download",
        label: "report",
        filename: "report.txt",
        content: "ok",
        behavior: "auto",
      }),
    ).toBe(true);
    expect(
      isPromptKitBlock({
        type: "download",
        label: "report",
        filename: "report.txt",
        content: "ok",
        behavior: "later",
      }),
    ).toBe(false);
  });

  it("opens SSE from an event source config while keeping string compatibility", () => {
    const urls: string[] = [];
    const close = vi.fn();
    const source = {
      addEventListener: vi.fn(),
      close,
    } as unknown as EventSource;
    const client = new PromptKitClient({
      baseUrl: "https://example.test",
      eventSourceFactory: (url) => {
        urls.push(url);
        return source;
      },
    });

    client.events({ url: "/events", transport: "sse" }, vi.fn())();
    client.events("/legacy-events", vi.fn())();

    expect(urls).toEqual(["https://example.test/events", "https://example.test/legacy-events"]);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("rejects an unsupported event transport at runtime", () => {
    const client = new PromptKitClient({ eventSourceFactory: vi.fn() });
    expect(() =>
      client.events({ url: "/events", transport: "websocket" } as never, vi.fn()),
    ).toThrow(PromptKitProtocolError);
  });

  it("replaces keyed blocks in place and notifies the host after applying updates", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    const onUpdate = vi.fn();
    const client = {
      manifest: vi.fn().mockResolvedValue({ name: "demo" }),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const kit = new PromptKit({ root, client, onUpdate });

    await kit.start();
    kit.ready();
    kit.apply({ blocks: [{ type: "text", id: "live", update: "replace", text: "first" }] });
    kit.apply({
      blocks: [{ type: "text", id: "live", update: "replace", text: "second", tone: "success" }],
      state: { running: true },
      indicators: [{ id: "online", label: "online", tone: "success" }],
    });

    const live = root.querySelectorAll('[data-pk-block-id="live"]');
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe("second");
    expect(live[0]?.classList.contains("pk-tone-success")).toBe(true);
    expect(root.dataset.running).toBe("true");
    expect(root.querySelector('[data-indicator="online"]')).not.toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("collapses pending keyed replacements before ready and resets identities on clear", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({
      root,
      client: { manifest: vi.fn().mockResolvedValue({ name: "demo" }), events: vi.fn() } as unknown as PromptKitClient,
    });

    await kit.start();
    kit.apply({ blocks: [{ type: "text", id: "live", update: "replace", text: "old" }] });
    kit.apply({ blocks: [{ type: "text", id: "live", update: "replace", text: "new" }] });
    kit.ready();
    expect(root.querySelectorAll('[data-pk-block-id="live"]')).toHaveLength(1);
    expect(root.querySelector('[data-pk-block-id="live"]')?.textContent).toBe("new");

    kit.clear();
    kit.apply({ blocks: [{ type: "text", id: "live", update: "replace", text: "after clear" }] });
    expect(root.querySelectorAll('[data-pk-block-id="live"]')).toHaveLength(1);
    expect(root.querySelector('[data-pk-block-id="live"]')?.textContent).toBe("after clear");
  });

  it("auto-downloads without rendering a visible control and keeps manual downloads clickable", () => {
    const onDownload = vi.fn();
    const renderer = new PromptKitRenderer({ document, onDownload });

    const automatic = renderer.render({
      type: "download",
      label: "auto",
      filename: "auto.txt",
      content: "a",
      behavior: "auto",
      id: "download",
    });
    expect(automatic.hidden).toBe(true);
    expect(automatic.dataset.pkBlockId).toBe("download");
    expect(onDownload).toHaveBeenCalledWith("auto.txt", "a", "application/octet-stream");

    const manual = renderer.render({
      type: "download",
      label: "manual",
      filename: "manual.txt",
      content: "m",
      mediaType: "text/plain",
    });
    expect(manual).toBeInstanceOf(HTMLButtonElement);
    manual.click();
    expect(onDownload).toHaveBeenLastCalledWith("manual.txt", "m", "text/plain");
  });
});
