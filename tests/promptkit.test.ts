import { describe, expect, it, vi } from "vitest";
import { PromptKitClient } from "../src/client.js";
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
  });

  it("supports history and clear", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ name: "demo", commands: ["/one"] }))
      .mockResolvedValueOnce(json({ ok: true, blocks: [{ type: "text", text: "done" }] }));

    const root = document.createElement("div");
    const kit = new PromptKit({ root, client: new PromptKitClient({ fetch: fetchMock }), autofocus: false });
    await kit.start();

    const input = root.querySelector("input") as HTMLInputElement;
    input.value = "/one";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(root.textContent).toContain("done"));

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(input.value).toBe("/one");

    kit.clear();
    expect(root.textContent).toContain("demo");
    expect(root.textContent).not.toContain("done");
  });
});
