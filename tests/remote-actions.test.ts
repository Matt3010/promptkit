import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptKitActions } from "../src/actions.js";
import { PromptKitClient, PromptKitProtocolError } from "../src/client.js";
import { PromptKit } from "../src/promptkit.js";
import { isPromptKitManifest } from "../src/protocol.js";
import type { PromptKitActionContext, PromptKitActionResult } from "../src/actions.js";
import type { PromptKitActionDefinition } from "../src/protocol.js";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(definitions: PromptKitActionDefinition[], remoteHandler = vi.fn()) {
  const root = document.createElement("main");
  const screen = document.createElement("div");
  const line = document.createElement("div");
  screen.append(line);
  root.append(screen);
  document.body.append(root);
  const applied: PromptKitActionResult[] = [];
  const actions = new PromptKitActions({
    root,
    document,
    screen,
    line,
    remoteHandler,
    applyResult: (result) => applied.push(result),
  });
  actions.configure(definitions);
  return { actions, root, applied, remoteHandler };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("remote action protocol", () => {
  it("accepts URL-only remote declarations and rejects method or invalid URLs", () => {
    expect(
      isPromptKitManifest({
        name: "demo",
        actions: [{ id: "remote", remote: { url: "/actions/remote" } }],
      }),
    ).toBe(true);
    expect(isPromptKitManifest({ name: "demo", actions: [{ id: "remote", remote: { url: "" } }] })).toBe(false);
    expect(
      isPromptKitManifest({
        name: "demo",
        actions: [{ id: "remote", remote: { url: "/x", method: "GET" } }],
      }),
    ).toBe(false);
  });
});

describe("PromptKitClient remote actions", () => {
  it("POSTs manual payloads as JSON and validates the result", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({ blocks: [{ type: "text", text: "done" }] }),
    );
    const client = new PromptKitClient({ baseUrl: "https://example.test/", fetch: fetchMock });

    await expect(
      client.action(
        "refresh",
        { url: "/actions/refresh" },
        { trigger: "manual", payload: { force: true } },
      ),
    ).resolves.toEqual({ blocks: [{ type: "text", text: "done" }] });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://example.test/actions/refresh");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({
      action: "refresh",
      trigger: "manual",
      payload: { force: true },
    });
  });

  it("omits undefined manual payloads and serializes indicator context", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ state: { manual: true } }))
      .mockResolvedValueOnce(response({ indicators: [] }));
    const client = new PromptKitClient({ fetch: fetchMock });

    await client.action("noop", { url: "/noop" }, { trigger: "manual" });
    await client.action(
      "toggle",
      { url: "/toggle" },
      {
        trigger: "indicator",
        indicator: { id: "record", label: "record", action: "toggle" },
      },
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      action: "noop",
      trigger: "manual",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "toggle",
      trigger: "indicator",
      indicator: { id: "record", label: "record", action: "toggle" },
    });
  });

  it("POSTs original File objects as multipart/form-data without setting content-type", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ clear: true }));
    const client = new PromptKitClient({ fetch: fetchMock });
    const file1 = new File(["one"], "one.json", { type: "application/json" });
    const file2 = new File(["two"], "two.json", { type: "application/json" });

    await client.action("import", { url: "/import" }, { trigger: "drop", files: [file1, file2] });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.get("action")).toBe("import");
    expect(body.get("trigger")).toBe("drop");
    expect(body.getAll("files")).toEqual([file1, file2]);
  });

  it("maps 204 to undefined and propagates AbortSignal", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new PromptKitClient({ fetch: fetchMock });
    const controller = new AbortController();

    await expect(
      client.action("noop", { url: "/noop" }, { trigger: "manual" }, controller.signal),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("rejects invalid results, HTTP errors, non-JSON and invalid runtime contexts", async () => {
    const invalid = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ invented: true })),
    });
    await expect(invalid.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toBeInstanceOf(
      PromptKitProtocolError,
    );

    const failing = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ error: "denied" }, 422)),
    });
    await expect(failing.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toThrow("denied");

    const fallback = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ message: "nope" }, 503)),
    });
    await expect(fallback.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toThrow("HTTP 503");

    const nonJson = new PromptKitClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 200 })),
    });
    await expect(nonJson.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toThrow("non-JSON");

    const noFetch = vi.fn<typeof fetch>();
    const invalidContext = new PromptKitClient({ fetch: noFetch });
    await expect(
      invalidContext.action(
        "bad",
        { url: "/bad" },
        { trigger: "unsupported" } as unknown as PromptKitActionContext,
      ),
    ).rejects.toThrow("unsupported PromptKit action context");
    expect(noFetch).not.toHaveBeenCalled();
  });
});

describe("PromptKitActions remote orchestration", () => {
  it("runs remote manual actions and applies valid results", async () => {
    const remoteHandler = vi.fn().mockResolvedValue({ state: { remote: true } });
    const definition = {
      id: "remote",
      remote: { url: "/remote" },
    } satisfies PromptKitActionDefinition;
    const { actions, applied } = setup([definition], remoteHandler);

    await actions.run("remote", { trigger: "manual", payload: 7 });

    expect(remoteHandler).toHaveBeenCalledWith(definition, { trigger: "manual", payload: 7 });
    expect(applied).toEqual([{ state: { remote: true } }]);
    actions.destroy();
  });

  it("makes remote drop and indicator actions runnable without local callbacks", async () => {
    const remoteHandler = vi.fn().mockResolvedValue(undefined);
    const definition = {
      id: "remote",
      remote: { url: "/remote" },
      triggers: [{ type: "drop" as const }],
    };
    const { actions, root } = setup([definition], remoteHandler);
    const file = new File(["x"], "x.bin");
    const drop = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
    document.dispatchEvent(drop);
    await vi.waitFor(() =>
      expect(remoteHandler).toHaveBeenCalledWith(definition, { trigger: "drop", files: [file] }),
    );

    actions.setIndicators([{ id: "remote-indicator", label: "remote", action: "remote" }]);
    const button = root.querySelector('[data-indicator="remote-indicator"]') as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    button.click();
    await vi.waitFor(() => expect(remoteHandler).toHaveBeenCalledTimes(2));
    expect(remoteHandler.mock.calls[1]?.[1]).toMatchObject({ trigger: "indicator" });
    actions.destroy();
  });

  it("rejects ambiguous local plus remote configuration", () => {
    const root = document.createElement("main");
    const screen = document.createElement("div");
    const line = document.createElement("div");
    screen.append(line);
    root.append(screen);
    const actions = new PromptKitActions({
      root,
      document,
      screen,
      line,
      handlers: { same: () => undefined },
      remoteHandler: vi.fn(),
      applyResult: vi.fn(),
    });

    expect(() => actions.configure([{ id: "same", remote: { url: "/same" } }])).toThrow(
      "both local and remote",
    );
    actions.destroy();
  });

  it("routes remote failures and invalid custom results through action error handling", async () => {
    const remoteHandler = vi.fn().mockRejectedValueOnce(new Error("remote boom")).mockResolvedValueOnce({ invented: true });
    const { actions, applied } = setup(
      [
        {
          id: "remote",
          remote: { url: "/remote" },
          feedback: {
            error: {
              blocks: [{ type: "text", text: "failed: {{error.message}}", tone: "danger" }],
            },
          },
        },
      ],
      remoteHandler,
    );

    await actions.run("remote");
    expect(applied.at(-1)).toEqual({
      blocks: [{ type: "text", text: "failed: remote boom", tone: "danger" }],
    });
    await actions.run("remote");
    expect(applied.at(-1)?.blocks?.[0]).toMatchObject({ type: "text", tone: "danger" });
    actions.destroy();
  });
});

describe("PromptKit remote integration", () => {
  it("uses the client remote transport for manifest actions without consumer handlers", async () => {
    const action = vi.fn().mockResolvedValue({
      blocks: [{ type: "text", text: "server result", tone: "success" }],
      state: { imported: true },
    });
    const client = {
      manifest: vi.fn().mockResolvedValue({
        name: "demo",
        actions: [{ id: "remote", remote: { url: "/remote" } }],
      }),
      action,
    } as unknown as PromptKitClient;
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client });

    await kit.start();
    kit.ready();
    await kit.runAction("remote", { source: "manual" });

    expect(action).toHaveBeenCalledWith(
      "remote",
      { url: "/remote" },
      { trigger: "manual", payload: { source: "manual" } },
    );
    expect(root.textContent).toContain("server result");
    expect(root.dataset.imported).toBe("true");
    kit.destroy();
  });
});
