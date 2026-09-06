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

  it("rejects invalid protocol responses", async () => {
    const invalidManifest = new PromptKitClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ name: 1 })) });
    await expect(invalidManifest.manifest()).rejects.toBeInstanceOf(PromptKitProtocolError);

    const invalidCommand = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ ok: true, blocks: [{ type: "wat" }] })),
    });
    await expect(invalidCommand.command("/x")).rejects.toBeInstanceOf(PromptKitProtocolError);
  });

  it("surfaces server errors and non-json responses", async () => {
    const failing = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ error: "denied" }, 403)),
    });
    await expect(failing.command("/secret")).rejects.toThrow("denied");

    const nonJson = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 200 })),
    });
    await expect(nonJson.manifest()).rejects.toThrow("non-JSON");
  });
});
