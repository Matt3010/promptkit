from pathlib import Path
import json


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(path: str, needle: str, replacement: str) -> None:
    source = read(path)
    if needle not in source:
        raise RuntimeError(f"missing replacement anchor in {path}: {needle[:100]!r}")
    updated = source.replace(needle, replacement, 1)
    if updated == source:
        raise RuntimeError(f"replacement did not change {path}")
    write(path, updated)


def append_once(path: str, marker: str, content: str) -> None:
    source = read(path)
    if marker in source:
        return
    write(path, source.rstrip() + "\n\n" + content.strip() + "\n")


# Protocol: additive URL-only remote declaration. Transport is deliberately POST-only.
replace_once(
    "src/protocol.ts",
    '''export interface PromptKitBootstrapSource {
  /** Idempotent GET endpoint returning the initial UI snapshot. */
  url: string;
}

export interface PromptKitCommandRequest {''',
    '''export interface PromptKitBootstrapSource {
  /** Idempotent GET endpoint returning the initial UI snapshot. */
  url: string;
}

export interface PromptKitRemoteAction {
  /** POST endpoint receiving the generic PromptKit action context. */
  url: string;
}

export interface PromptKitCommandRequest {''',
)
replace_once(
    "src/protocol.ts",
    '''  triggers?: PromptKitActionTrigger[];
  /** Declarative presentation feedback; action semantics stay in the handler. */
  feedback?: PromptKitActionFeedback;''',
    '''  triggers?: PromptKitActionTrigger[];
  /** Optional server-backed implementation. Remote actions always use POST. */
  remote?: PromptKitRemoteAction;
  /** Declarative presentation feedback; action semantics stay in the handler. */
  feedback?: PromptKitActionFeedback;''',
)
replace_once(
    "src/protocol.ts",
    '''  if (value.triggers !== undefined) {
    if (!Array.isArray(value.triggers) || !value.triggers.every(isActionTrigger)) return false;
  }
  if (value.feedback !== undefined && !isActionFeedback(value.feedback)) return false;''',
    '''  if (value.triggers !== undefined) {
    if (!Array.isArray(value.triggers) || !value.triggers.every(isActionTrigger)) return false;
  }
  if (value.remote !== undefined && !isRemoteAction(value.remote)) return false;
  if (value.feedback !== undefined && !isActionFeedback(value.feedback)) return false;''',
)
replace_once(
    "src/protocol.ts",
    '''function isEventSource(value: unknown): value is PromptKitEventSource {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    (value.transport === undefined || value.transport === "sse")
  );
}

function validBlockIdentity''',
    '''function isEventSource(value: unknown): value is PromptKitEventSource {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    (value.transport === undefined || value.transport === "sse")
  );
}

function isRemoteAction(value: unknown): value is PromptKitRemoteAction {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.length > 0 &&
    Object.keys(value).every((key) => key === "url")
  );
}

function validBlockIdentity''',
)

# Client: generic context transport + strict result validation.
replace_once(
    "src/client.ts",
    '''import {
  isPromptKitCommandResponse,''',
    '''import type { PromptKitActionContext, PromptKitActionResult } from "./actions.js";
import {
  isPromptKitCommandResponse,''',
)
replace_once(
    "src/client.ts",
    '''  type PromptKitManifest,
  type PromptKitSnapshot,''',
    '''  type PromptKitManifest,
  type PromptKitRemoteAction,
  type PromptKitSnapshot,''',
)
replace_once(
    "src/client.ts",
    '''  public async command(input: string, signal?: AbortSignal): Promise<PromptKitCommandResponse> {
    const value = await this.#json(
      this.#commandPath,
      withSignal(
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input }),
        },
        signal,
      ),
    );
    if (!isPromptKitCommandResponse(value)) {
      throw new PromptKitProtocolError("invalid PromptKit command response");
    }
    return value;
  }

  /** Open the manifest event channel. A string remains supported and means SSE. */''',
    '''  public async command(input: string, signal?: AbortSignal): Promise<PromptKitCommandResponse> {
    const value = await this.#json(
      this.#commandPath,
      withSignal(
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input }),
        },
        signal,
      ),
    );
    if (!isPromptKitCommandResponse(value)) {
      throw new PromptKitProtocolError("invalid PromptKit command response");
    }
    return value;
  }

  /** Execute a server-backed action. Mutating POST requests are never retried. */
  public async action(
    id: string,
    source: PromptKitRemoteAction,
    context: PromptKitActionContext,
    signal?: AbortSignal,
  ): Promise<PromptKitActionResult | undefined> {
    const response = await this.#fetch(
      this.#url(source.url),
      withSignal(remoteActionRequest(id, context), signal),
    );

    if (response.status === 204) return undefined;

    const value: unknown = await response.json().catch(() => {
      throw new PromptKitProtocolError(`PromptKit endpoint returned non-JSON (${response.status})`);
    });

    if (!response.ok) {
      const detail = extractError(value);
      throw new PromptKitProtocolError(detail ?? `PromptKit endpoint failed with HTTP ${response.status}`);
    }
    if (!isPromptKitSnapshot(value)) {
      throw new PromptKitProtocolError(`invalid PromptKit action result: ${id}`);
    }
    return value;
  }

  /** Open the manifest event channel. A string remains supported and means SSE. */''',
)
append_once(
    "src/client.ts",
    "function remoteActionRequest(",
    '''function remoteActionRequest(id: string, context: PromptKitActionContext): RequestInit {
  switch (context.trigger) {
    case "drop": {
      const body = new FormData();
      body.append("action", id);
      body.append("trigger", context.trigger);
      for (const file of context.files) body.append("files", file);
      return { method: "POST", body };
    }
    case "indicator":
      return jsonPost({ action: id, trigger: context.trigger, indicator: context.indicator });
    case "manual":
      return jsonPost({
        action: id,
        trigger: context.trigger,
        ...(context.payload === undefined ? {} : { payload: context.payload }),
      });
    default: {
      const unsupported: never = context;
      throw new PromptKitProtocolError(`unsupported PromptKit action context: ${String(unsupported)}`);
    }
  }
}

function jsonPost(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}''',
)

# Action orchestration: remote actions are runnable without consumer callbacks; ambiguity is rejected.
replace_once(
    "src/actions.ts",
    '''export type PromptKitActionHandler = (
  context: PromptKitActionContext,
) => PromptKitActionResult | undefined | Promise<PromptKitActionResult | undefined>;

export interface PromptKitActionsOptions {''',
    '''export type PromptKitActionHandler = (
  context: PromptKitActionContext,
) => PromptKitActionResult | undefined | Promise<PromptKitActionResult | undefined>;

export type PromptKitRemoteActionHandler = (
  definition: PromptKitActionDefinition,
  context: PromptKitActionContext,
) => Promise<PromptKitActionResult | undefined>;

export interface PromptKitActionsOptions {''',
)
replace_once(
    "src/actions.ts",
    '''  handlers?: Record<string, PromptKitActionHandler> | undefined;
  applyResult: (result: PromptKitActionResult) => void;''',
    '''  handlers?: Record<string, PromptKitActionHandler> | undefined;
  remoteHandler?: PromptKitRemoteActionHandler | undefined;
  applyResult: (result: PromptKitActionResult) => void;''',
)
replace_once(
    "src/actions.ts",
    '''  readonly #handlers: Record<string, PromptKitActionHandler>;
  readonly #applyResult: (result: PromptKitActionResult) => void;''',
    '''  readonly #handlers: Record<string, PromptKitActionHandler>;
  readonly #remoteHandler: PromptKitRemoteActionHandler | undefined;
  readonly #applyResult: (result: PromptKitActionResult) => void;''',
)
replace_once(
    "src/actions.ts",
    '''    this.#handlers = options.handlers ?? {};
    this.#applyResult = options.applyResult;''',
    '''    this.#handlers = options.handlers ?? {};
    this.#remoteHandler = options.remoteHandler;
    this.#applyResult = options.applyResult;''',
)
replace_once(
    "src/actions.ts",
    '''    this.#assertAlive();
    this.#definitions = [...definitions];
    this.#ui = { ...ui };''',
    '''    this.#assertAlive();
    for (const definition of definitions) {
      if (definition.remote !== undefined && this.#handlers[definition.id] !== undefined) {
        throw new Error(`PromptKit action cannot be both local and remote: ${definition.id}`);
      }
    }
    this.#definitions = [...definitions];
    this.#ui = { ...ui };''',
)
replace_once(
    "src/actions.ts",
    '''      const actionId = indicator.action;
      const actionable = actionId !== undefined && this.#handlers[actionId] !== undefined;''',
    '''      const actionId = indicator.action;
      const actionable = actionId !== undefined && this.#isRunnableId(actionId);''',
)
replace_once(
    "src/actions.ts",
    '''    this.#assertAlive();
    const handler = this.#handlers[id];
    if (!handler) throw new Error(`PromptKit action handler not found: ${id}`);

    const definition = this.#definitions.find((candidate) => candidate.id === id);

    try {''',
    '''    this.#assertAlive();
    const definition = this.#definitions.find((candidate) => candidate.id === id);
    const handler = this.#handlers[id];
    const remote = definition?.remote !== undefined ? this.#remoteHandler : undefined;
    if (!handler && !remote) throw new Error(`PromptKit action handler not found: ${id}`);

    try {''',
)
replace_once(
    "src/actions.ts",
    '''      const result = await handler(context);''',
    '''      const result = handler
        ? await handler(context)
        : await remote!(definition!, context);''',
)
replace_once(
    "src/actions.ts",
    '''    return this.#definitions.flatMap((definition) => {
      if (!this.#handlers[definition.id]) return [];''',
    '''    return this.#definitions.flatMap((definition) => {
      if (!this.#isRunnable(definition)) return [];''',
)
replace_once(
    "src/actions.ts",
    '''    return this.#definitions.some(
      (definition) =>
        this.#handlers[definition.id] !== undefined &&
        (definition.triggers ?? []).some((trigger) => trigger.type === "drop"),
    );
  }

  #showChooser''',
    '''    return this.#definitions.some(
      (definition) =>
        this.#isRunnable(definition) &&
        (definition.triggers ?? []).some((trigger) => trigger.type === "drop"),
    );
  }

  #isRunnable(definition: PromptKitActionDefinition): boolean {
    return (
      this.#handlers[definition.id] !== undefined ||
      (definition.remote !== undefined && this.#remoteHandler !== undefined)
    );
  }

  #isRunnableId(id: string): boolean {
    if (this.#handlers[id] !== undefined) return true;
    const definition = this.#definitions.find((candidate) => candidate.id === id);
    return definition?.remote !== undefined && this.#remoteHandler !== undefined;
  }

  #showChooser''',
)

# PromptKit owns standard remote transport, so consumer initialization remains unchanged.
replace_once(
    "src/promptkit.ts",
    '''      handlers: options.actions,
      applyResult: (result) => this.#applyUpdate(result),''',
    '''      handlers: options.actions,
      remoteHandler: (definition, context) => this.#client.action(definition.id, definition.remote!, context),
      applyResult: (result) => this.#applyUpdate(result),''',
)

# Public exports.
replace_once(
    "src/index.ts",
    '''  PromptKitActionResult,
  PromptKitActionsOptions,''',
    '''  PromptKitActionResult,
  PromptKitActionsOptions,
  PromptKitRemoteActionHandler,''',
)
replace_once(
    "src/index.ts",
    '''  PromptKitManifest,
  PromptKitSnapshot,''',
    '''  PromptKitManifest,
  PromptKitRemoteAction,
  PromptKitSnapshot,''',
)

# Runtime, transport, orchestration and TypeScript regression tests.
write("tests/remote-actions.test.ts", r'''import { afterEach, describe, expect, it, vi } from "vitest";
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
''')

write("tests/action-handler-types.test.ts", r'''import { describe, expect, it } from "vitest";
import type { PromptKitActionHandler } from "../src/actions.js";

const returnsUndefined: PromptKitActionHandler = () => undefined;
const returnsUndefinedAsync: PromptKitActionHandler = async () => undefined;

// @ts-expect-error Action handlers cannot return arbitrary strings.
const returnsString: PromptKitActionHandler = () => "ok";

// @ts-expect-error Action handlers cannot return objects outside PromptKitActionResult.
const returnsInventedObject: PromptKitActionHandler = () => ({ inventato: true });

describe("PromptKitActionHandler typing", () => {
  it("keeps undefined as the intentional no-result value", async () => {
    expect(returnsUndefined({ trigger: "manual" })).toBeUndefined();
    await expect(returnsUndefinedAsync({ trigger: "manual" })).resolves.toBeUndefined();
    expect(typeof returnsString).toBe("function");
    expect(typeof returnsInventedObject).toBe("function");
  });
});
''')

# Local HTTP demo: real manual/drop transport, success, error, invalid response and 204.
replace_once(
    "examples/demo/server.mjs",
    '''    {
      id: "reject-files",
      label: "fail with declarative feedback",
      tone: "danger",
      triggers: [{ type: "drop", accept: [".json", "application/json"], multiple: true }],
      feedback: {
        error: {
          blocks: [{
            type: "text",
            text: "demo failure: {{error.message}}",
            tone: "danger",
          }],
        },
      },
    },
  ],''',
    '''    {
      id: "reject-files",
      label: "fail with declarative feedback",
      tone: "danger",
      triggers: [{ type: "drop", accept: [".json", "application/json"], multiple: true }],
      feedback: {
        error: {
          blocks: [{
            type: "text",
            text: "demo failure: {{error.message}}",
            tone: "danger",
          }],
        },
      },
    },
    {
      id: "remote-manual",
      label: "remote manual",
      remote: { url: "/tui/actions/manual" },
      feedback: {
        before: {
          blocks: [{ type: "text", text: "calling remote manual action", tone: "secondary" }],
        },
      },
    },
    {
      id: "remote-import",
      label: "remote import",
      tone: "success",
      triggers: [{ type: "drop", accept: [".remote.json"], multiple: true }],
      remote: { url: "/tui/actions/import" },
      feedback: {
        before: {
          blocks: [{ type: "text", text: "uploading {{files.count}} file(s)", tone: "secondary" }],
        },
      },
    },
    {
      id: "remote-error",
      label: "remote error",
      tone: "danger",
      triggers: [{ type: "drop", accept: [".remote-error"] }],
      remote: { url: "/tui/actions/error" },
      feedback: {
        error: {
          blocks: [{ type: "text", text: "remote error: {{error.message}}", tone: "danger" }],
        },
      },
    },
    {
      id: "remote-invalid",
      label: "remote invalid result",
      tone: "warning",
      triggers: [{ type: "drop", accept: [".remote-invalid"] }],
      remote: { url: "/tui/actions/invalid" },
      feedback: {
        error: {
          blocks: [{ type: "text", text: "validation error: {{error.message}}", tone: "danger" }],
        },
      },
    },
    { id: "remote-no-content", remote: { url: "/tui/actions/no-content" } },
  ],''',
)
replace_once(
    "examples/demo/server.mjs",
    '''  if (request.method === "POST" && url.pathname === "/tui/command") {''',
    '''  if (request.method === "POST" && url.pathname === "/tui/actions/manual") {
    const body = await readJson(request);
    if (!body || body.action !== "remote-manual" || body.trigger !== "manual") {
      return json(response, 400, { error: "invalid remote manual action request" });
    }
    return json(response, 200, {
      blocks: [{
        type: "text",
        text: `remote manual success: ${JSON.stringify(body.payload ?? null)}`,
        tone: "success",
      }],
      state: { remoteManual: true },
    });
  }

  if (request.method === "POST" && url.pathname === "/tui/actions/import") {
    const contentType = String(request.headers["content-type"] ?? "");
    if (!contentType.startsWith("multipart/form-data; boundary=")) {
      return json(response, 400, { error: "expected multipart/form-data" });
    }
    const body = await readBuffer(request);
    if (
      !body.includes(Buffer.from('name="action"')) ||
      !body.includes(Buffer.from("remote-import")) ||
      !body.includes(Buffer.from('name="trigger"')) ||
      !body.includes(Buffer.from("drop")) ||
      !body.includes(Buffer.from('name="files"'))
    ) {
      return json(response, 400, { error: "missing generic action multipart fields" });
    }
    return json(response, 200, {
      blocks: [{ type: "text", text: "remote file upload success", tone: "success" }],
    });
  }

  if (request.method === "POST" && url.pathname === "/tui/actions/error") {
    await readBuffer(request);
    return json(response, 422, { error: "demo remote failure" });
  }

  if (request.method === "POST" && url.pathname === "/tui/actions/invalid") {
    await readBuffer(request);
    return json(response, 200, { invented: true });
  }

  if (request.method === "POST" && url.pathname === "/tui/actions/no-content") {
    await readBuffer(request);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/tui/command") {''',
)
append_once(
    "examples/demo/server.mjs",
    "async function readBuffer(request)",
    '''async function readBuffer(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}''',
)
replace_once(
    "examples/demo/demo.js",
    '''  await kit.start();
  kit.ready();''',
    '''  await kit.start();
  kit.ready();
  if (!release) {
    await kit.runAction("remote-manual", { source: "demo startup" });
    await kit.runAction("remote-no-content");
  }''',
)

write("scripts/smoke-remote-actions.mjs", r'''import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4279;
const server = spawn(process.execPath, ["examples/demo/server.mjs"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"],
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/tui/manifest`);
      if (probe.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(50);
  }
  if (!ready) throw new Error("PromptKit demo server did not start");

  const manifest = await (await fetch(`http://127.0.0.1:${port}/tui/manifest`)).json();
  const remote = new Map(
    manifest.actions.filter((action) => action.remote).map((action) => [action.id, action]),
  );
  for (const id of [
    "remote-manual",
    "remote-import",
    "remote-error",
    "remote-invalid",
    "remote-no-content",
  ]) {
    if (!remote.has(id)) throw new Error(`remote demo action missing: ${id}`);
  }

  const manual = await fetch(`http://127.0.0.1:${port}/tui/actions/manual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "remote-manual",
      trigger: "manual",
      payload: { smoke: true },
    }),
  });
  const manualBody = await manual.json();
  if (!manual.ok || manualBody.state?.remoteManual !== true) {
    throw new Error("remote manual demo failed");
  }

  const form = new FormData();
  form.append("action", "remote-import");
  form.append("trigger", "drop");
  form.append(
    "files",
    new Blob(["{}"], { type: "application/json" }),
    "config.remote.json",
  );
  const upload = await fetch(`http://127.0.0.1:${port}/tui/actions/import`, {
    method: "POST",
    body: form,
  });
  if (!upload.ok) throw new Error(`remote multipart demo failed: ${upload.status}`);

  const failure = await fetch(`http://127.0.0.1:${port}/tui/actions/error`, {
    method: "POST",
    body: "x",
  });
  if (failure.status !== 422 || (await failure.json()).error !== "demo remote failure") {
    throw new Error("remote error demo failed");
  }

  const invalid = await fetch(`http://127.0.0.1:${port}/tui/actions/invalid`, {
    method: "POST",
    body: "x",
  });
  if (!invalid.ok || (await invalid.json()).invented !== true) {
    throw new Error("remote invalid-result demo failed");
  }

  const noContent = await fetch(`http://127.0.0.1:${port}/tui/actions/no-content`, {
    method: "POST",
    body: "x",
  });
  if (noContent.status !== 204) throw new Error("remote no-content demo failed");

  console.log("Remote action demo smoke passed");
} finally {
  server.kill("SIGTERM");
}
''')

# Documentation keeps the minimal constructor first and moves transport detail to advanced sections.
append_once(
    "docs/actions.md",
    "## Remote actions",
    r'''## Remote actions

An action may be implemented by the browser host through the existing `actions` registry or declared as server-backed in the manifest:

```json
{
  "id": "import-config",
  "triggers": [{ "type": "drop", "accept": [".json"], "multiple": false }],
  "remote": { "url": "/tui/actions/import-config" }
}
```

Remote actions always use `POST`; the manifest intentionally has no HTTP-method field. PromptKit does not retry them automatically because actions may have side effects. A future transport extension can be added without changing this default.

For `manual` and `indicator` contexts PromptKit sends JSON containing `action`, `trigger`, and the relevant `payload` or `indicator`. Drop contexts use `multipart/form-data` with `action`, `trigger`, and repeated `files` fields containing the original browser `File` objects. PromptKit does not read or interpret file contents.

A successful response must be a valid `PromptKitActionResult`. `204 No Content` is the explicit no-result response and maps to `undefined`. Invalid JSON or an invalid result is a protocol error and flows through the normal declarative `feedback.error` path.

An action id cannot be both locally implemented and remote. PromptKit rejects that ambiguous configuration instead of applying hidden precedence.''',
)
append_once(
    "docs/protocol.md",
    "### Remote action transport",
    r'''### Remote action transport

`PromptKitActionDefinition.remote` is an optional object with exactly one field, `url`. Its transport is always HTTP `POST`; no protocol version or method field is added.

Manual request JSON:

```json
{ "action": "refresh", "trigger": "manual", "payload": { "force": true } }
```

Indicator request JSON includes the current indicator under `indicator`. Drop requests are `multipart/form-data` with string fields `action`, `trigger=drop`, and one or more repeated `files` parts.

The response contract is the same structured snapshot used by `PromptKitActionResult`. HTTP 204 means that the action intentionally produced no result. Every non-204 success response is decoded as JSON and validated at runtime before PromptKit applies it.''',
)
append_once(
    "README.md",
    "## Server-backed actions",
    r'''## Server-backed actions

The minimal initialization remains unchanged:

```js
const kit = new PromptKit({ root });
await kit.start();
kit.ready();
```

For application operations that belong on the backend, declare a remote action in the manifest instead of writing repeated browser transport glue:

```json
{
  "id": "import-config",
  "triggers": [{ "type": "drop", "accept": [".json"] }],
  "remote": { "url": "/tui/actions/import-config" }
}
```

PromptKit sends remote actions with POST, transports dropped files as multipart data, validates the returned `PromptKitActionResult`, and applies it through the normal update pipeline. Mutating actions are never retried automatically. See `docs/actions.md` for the wire shape and error semantics.

The local HTTP demo exercises the real remote transport. The static GitHub Pages demo cannot provide a server-backed POST endpoint, so that transport-specific part is intentionally local-only.''',
)

# Release candidate metadata + smoke gate.
package = json.loads(read("package.json"))
package["version"] = "0.9.0"
package["scripts"]["demo:smoke"] = (
    "node scripts/smoke-demo.mjs && "
    "node scripts/smoke-action-feedback.mjs && "
    "node scripts/smoke-remote-actions.mjs"
)
write("package.json", json.dumps(package, indent=2) + "\n")

lock = json.loads(read("package-lock.json"))
lock["version"] = "0.9.0"
if "" in lock.get("packages", {}):
    lock["packages"][""]["version"] = "0.9.0"
write("package-lock.json", json.dumps(lock, indent=2) + "\n")

# Temporary machinery must not survive into the feature commit/PR.
for temporary in [
    "scripts/remote-actions-migration.mjs",
    "scripts/remote-actions-migration.py",
    ".github/workflows/remote-actions-migration.yml",
]:
    Path(temporary).unlink(missing_ok=True)
