import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content);
}

function replaceOnce(path, needle, replacement) {
  const source = read(path);
  if (!source.includes(needle)) throw new Error(`missing replacement anchor in ${path}: ${needle.slice(0, 80)}`);
  const updated = source.replace(needle, replacement);
  if (updated === source) throw new Error(`replacement did not change ${path}`);
  write(path, updated);
}

function appendOnce(path, marker, content) {
  const source = read(path);
  if (source.includes(marker)) return;
  write(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

// Protocol: additive remote declaration, POST-only by contract.
replaceOnce(
  "src/protocol.ts",
  `export interface PromptKitBootstrapSource {\n  /** Idempotent GET endpoint returning the initial UI snapshot. */\n  url: string;\n}\n\nexport interface PromptKitCommandRequest {`,
  `export interface PromptKitBootstrapSource {\n  /** Idempotent GET endpoint returning the initial UI snapshot. */\n  url: string;\n}\n\nexport interface PromptKitRemoteAction {\n  /** POST endpoint receiving the generic PromptKit action context. */\n  url: string;\n}\n\nexport interface PromptKitCommandRequest {`,
);

replaceOnce(
  "src/protocol.ts",
  `  triggers?: PromptKitActionTrigger[];\n  /** Declarative presentation feedback; action semantics stay in the handler. */\n  feedback?: PromptKitActionFeedback;`,
  `  triggers?: PromptKitActionTrigger[];\n  /** Optional server-backed implementation. Remote actions always use POST. */\n  remote?: PromptKitRemoteAction;\n  /** Declarative presentation feedback; action semantics stay in the handler. */\n  feedback?: PromptKitActionFeedback;`,
);

replaceOnce(
  "src/protocol.ts",
  `  if (value.triggers !== undefined) {\n    if (!Array.isArray(value.triggers) || !value.triggers.every(isActionTrigger)) return false;\n  }\n  if (value.feedback !== undefined && !isActionFeedback(value.feedback)) return false;`,
  `  if (value.triggers !== undefined) {\n    if (!Array.isArray(value.triggers) || !value.triggers.every(isActionTrigger)) return false;\n  }\n  if (value.remote !== undefined && !isRemoteAction(value.remote)) return false;\n  if (value.feedback !== undefined && !isActionFeedback(value.feedback)) return false;`,
);

replaceOnce(
  "src/protocol.ts",
  `function isEventSource(value: unknown): value is PromptKitEventSource {\n  return (\n    isRecord(value) &&\n    typeof value.url === "string" &&\n    (value.transport === undefined || value.transport === "sse")\n  );\n}\n\nfunction validBlockIdentity`,
  `function isEventSource(value: unknown): value is PromptKitEventSource {\n  return (\n    isRecord(value) &&\n    typeof value.url === "string" &&\n    (value.transport === undefined || value.transport === "sse")\n  );\n}\n\nfunction isRemoteAction(value: unknown): value is PromptKitRemoteAction {\n  return (\n    isRecord(value) &&\n    typeof value.url === "string" &&\n    value.url.length > 0 &&\n    Object.keys(value).every((key) => key === "url")\n  );\n}\n\nfunction validBlockIdentity`,
);

// Client: transport generic contexts and validate the server result.
replaceOnce(
  "src/client.ts",
  `import {\n  isPromptKitCommandResponse,`,
  `import type { PromptKitActionContext, PromptKitActionResult } from "./actions.js";\nimport {\n  isPromptKitCommandResponse,`,
);

replaceOnce(
  "src/client.ts",
  `  type PromptKitManifest,\n  type PromptKitSnapshot,`,
  `  type PromptKitManifest,\n  type PromptKitRemoteAction,\n  type PromptKitSnapshot,`,
);

replaceOnce(
  "src/client.ts",
  `  public async command(input: string, signal?: AbortSignal): Promise<PromptKitCommandResponse> {\n    const value = await this.#json(\n      this.#commandPath,\n      withSignal(\n        {\n          method: "POST",\n          headers: { "content-type": "application/json" },\n          body: JSON.stringify({ input }),\n        },\n        signal,\n      ),\n    );\n    if (!isPromptKitCommandResponse(value)) {\n      throw new PromptKitProtocolError("invalid PromptKit command response");\n    }\n    return value;\n  }\n\n  /** Open the manifest event channel. A string remains supported and means SSE. */`,
  `  public async command(input: string, signal?: AbortSignal): Promise<PromptKitCommandResponse> {\n    const value = await this.#json(\n      this.#commandPath,\n      withSignal(\n        {\n          method: "POST",\n          headers: { "content-type": "application/json" },\n          body: JSON.stringify({ input }),\n        },\n        signal,\n      ),\n    );\n    if (!isPromptKitCommandResponse(value)) {\n      throw new PromptKitProtocolError("invalid PromptKit command response");\n    }\n    return value;\n  }\n\n  /** Execute a server-backed action. Mutating POST requests are never retried. */\n  public async action(\n    id: string,\n    source: PromptKitRemoteAction,\n    context: PromptKitActionContext,\n    signal?: AbortSignal,\n  ): Promise<PromptKitActionResult | undefined> {\n    const response = await this.#fetch(\n      this.#url(source.url),\n      withSignal(remoteActionRequest(id, context), signal),\n    );\n\n    if (response.status === 204) {\n      if (!response.ok) throw new PromptKitProtocolError(`PromptKit endpoint failed with HTTP ${response.status}`);\n      return undefined;\n    }\n\n    const value: unknown = await response.json().catch(() => {\n      throw new PromptKitProtocolError(`PromptKit endpoint returned non-JSON (${response.status})`);\n    });\n\n    if (!response.ok) {\n      const detail = extractError(value);\n      throw new PromptKitProtocolError(detail ?? `PromptKit endpoint failed with HTTP ${response.status}`);\n    }\n    if (!isPromptKitSnapshot(value)) {\n      throw new PromptKitProtocolError(`invalid PromptKit action result: ${id}`);\n    }\n    return value;\n  }\n\n  /** Open the manifest event channel. A string remains supported and means SSE. */`,
);

appendOnce(
  "src/client.ts",
  "function remoteActionRequest(",
  `function remoteActionRequest(id: string, context: PromptKitActionContext): RequestInit {\n  switch (context.trigger) {\n    case "drop": {\n      const body = new FormData();\n      body.append("action", id);\n      body.append("trigger", context.trigger);\n      for (const file of context.files) body.append("files", file, file.name);\n      return { method: "POST", body };\n    }\n    case "indicator":\n      return jsonPost({ action: id, trigger: context.trigger, indicator: context.indicator });\n    case "manual":\n      return jsonPost({\n        action: id,\n        trigger: context.trigger,\n        ...(context.payload === undefined ? {} : { payload: context.payload }),\n      });\n    default:\n      return assertNever(context);\n  }\n}\n\nfunction jsonPost(value: unknown): RequestInit {\n  return {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify(value),\n  };\n}\n\nfunction assertNever(value: never): never {\n  throw new PromptKitProtocolError(`unsupported PromptKit action context: ${String(value)}`);\n}`,
);

// Action orchestration: local and remote are both runnable, but never ambiguous.
replaceOnce(
  "src/actions.ts",
  `export type PromptKitActionHandler = (\n  context: PromptKitActionContext,\n) => PromptKitActionResult | undefined | Promise<PromptKitActionResult | undefined>;\n\nexport interface PromptKitActionsOptions {`,
  `export type PromptKitActionHandler = (\n  context: PromptKitActionContext,\n) => PromptKitActionResult | undefined | Promise<PromptKitActionResult | undefined>;\n\nexport type PromptKitRemoteActionHandler = (\n  definition: PromptKitActionDefinition,\n  context: PromptKitActionContext,\n) => Promise<PromptKitActionResult | undefined>;\n\nexport interface PromptKitActionsOptions {`,
);

replaceOnce(
  "src/actions.ts",
  `  handlers?: Record<string, PromptKitActionHandler> | undefined;\n  applyResult: (result: PromptKitActionResult) => void;`,
  `  handlers?: Record<string, PromptKitActionHandler> | undefined;\n  remoteHandler?: PromptKitRemoteActionHandler | undefined;\n  applyResult: (result: PromptKitActionResult) => void;`,
);

replaceOnce(
  "src/actions.ts",
  `  readonly #handlers: Record<string, PromptKitActionHandler>;\n  readonly #applyResult: (result: PromptKitActionResult) => void;`,
  `  readonly #handlers: Record<string, PromptKitActionHandler>;\n  readonly #remoteHandler: PromptKitRemoteActionHandler | undefined;\n  readonly #applyResult: (result: PromptKitActionResult) => void;`,
);

replaceOnce(
  "src/actions.ts",
  `    this.#handlers = options.handlers ?? {};\n    this.#applyResult = options.applyResult;`,
  `    this.#handlers = options.handlers ?? {};\n    this.#remoteHandler = options.remoteHandler;\n    this.#applyResult = options.applyResult;`,
);

replaceOnce(
  "src/actions.ts",
  `    this.#assertAlive();\n    this.#definitions = [...definitions];\n    this.#ui = { ...ui };`,
  `    this.#assertAlive();\n    for (const definition of definitions) {\n      if (definition.remote !== undefined && this.#handlers[definition.id] !== undefined) {\n        throw new Error(`PromptKit action cannot be both local and remote: ${definition.id}`);\n      }\n    }\n    this.#definitions = [...definitions];\n    this.#ui = { ...ui };`,
);

replaceOnce(
  "src/actions.ts",
  `      const actionId = indicator.action;\n      const actionable = actionId !== undefined && this.#handlers[actionId] !== undefined;`,
  `      const actionId = indicator.action;\n      const actionable = actionId !== undefined && this.#isRunnableId(actionId);`,
);

replaceOnce(
  "src/actions.ts",
  `    this.#assertAlive();\n    const handler = this.#handlers[id];\n    if (!handler) throw new Error(`PromptKit action handler not found: ${id}`);\n\n    const definition = this.#definitions.find((candidate) => candidate.id === id);\n\n    try {`,
  `    this.#assertAlive();\n    const definition = this.#definitions.find((candidate) => candidate.id === id);\n    const handler = this.#handlers[id];\n    const remote = definition?.remote !== undefined ? this.#remoteHandler : undefined;\n    if (!handler && !remote) throw new Error(`PromptKit action handler not found: ${id}`);\n\n    try {`,
);

replaceOnce(
  "src/actions.ts",
  `      const result = await handler(context);`,
  `      const result = handler\n        ? await handler(context)\n        : await remote?.(definition as PromptKitActionDefinition, context);`,
);

replaceOnce(
  "src/actions.ts",
  `    return this.#definitions.flatMap((definition) => {\n      if (!this.#handlers[definition.id]) return [];`,
  `    return this.#definitions.flatMap((definition) => {\n      if (!this.#isRunnable(definition)) return [];`,
);

replaceOnce(
  "src/actions.ts",
  `    return this.#definitions.some(\n      (definition) =>\n        this.#handlers[definition.id] !== undefined &&\n        (definition.triggers ?? []).some((trigger) => trigger.type === "drop"),\n    );\n  }\n\n  #showChooser`,
  `    return this.#definitions.some(\n      (definition) =>\n        this.#isRunnable(definition) &&\n        (definition.triggers ?? []).some((trigger) => trigger.type === "drop"),\n    );\n  }\n\n  #isRunnable(definition: PromptKitActionDefinition): boolean {\n    return (\n      this.#handlers[definition.id] !== undefined ||\n      (definition.remote !== undefined && this.#remoteHandler !== undefined)\n    );\n  }\n\n  #isRunnableId(id: string): boolean {\n    if (this.#handlers[id] !== undefined) return true;\n    const definition = this.#definitions.find((candidate) => candidate.id === id);\n    return definition?.remote !== undefined && this.#remoteHandler !== undefined;\n  }\n\n  #showChooser`,
);

// PromptKit wires remote definitions to the existing client while keeping consumer setup minimal.
replaceOnce(
  "src/promptkit.ts",
  `      handlers: options.actions,\n      applyResult: (result) => this.#applyUpdate(result),`,
  `      handlers: options.actions,\n      remoteHandler: async (definition, context) => {\n        if (definition.remote === undefined) {\n          throw new Error(`PromptKit remote action is missing transport configuration: ${definition.id}`);\n        }\n        return this.#client.action(definition.id, definition.remote, context);\n      },\n      applyResult: (result) => this.#applyUpdate(result),`,
);

// Public exports.
replaceOnce(
  "src/index.ts",
  `  PromptKitActionResult,\n  PromptKitActionsOptions,`,
  `  PromptKitActionResult,\n  PromptKitActionsOptions,\n  PromptKitRemoteActionHandler,`,
);

replaceOnce(
  "src/index.ts",
  `  PromptKitManifest,\n  PromptKitSnapshot,`,
  `  PromptKitManifest,\n  PromptKitRemoteAction,\n  PromptKitSnapshot,`,
);

// Runtime + integration + transport tests.
write("tests/remote-actions.test.ts", `import { afterEach, describe, expect, it, vi } from "vitest";\nimport { PromptKitActions } from "../src/actions.js";\nimport { PromptKitClient, PromptKitProtocolError } from "../src/client.js";\nimport { isPromptKitManifest } from "../src/protocol.js";\nimport type { PromptKitActionDefinition } from "../src/protocol.js";\n\nfunction json(body: unknown, status = 200): Response {\n  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });\n}\n\nfunction setup(definitions: PromptKitActionDefinition[], remoteHandler = vi.fn()) {\n  const root = document.createElement("main");\n  const screen = document.createElement("div");\n  const line = document.createElement("div");\n  screen.append(line);\n  root.append(screen);\n  document.body.append(root);\n  const applied: unknown[] = [];\n  const actions = new PromptKitActions({\n    root, document, screen, line, remoteHandler,\n    applyResult: (result) => applied.push(result),\n  });\n  actions.configure(definitions);\n  return { actions, root, applied, remoteHandler };\n}\n\nafterEach(() => {\n  document.body.replaceChildren();\n  vi.restoreAllMocks();\n});\n\ndescribe("remote action protocol", () => {\n  it("accepts a URL-only remote declaration and rejects method or invalid URLs", () => {\n    expect(isPromptKitManifest({ name: "demo", actions: [{ id: "remote", remote: { url: "/actions/remote" } }] })).toBe(true);\n    expect(isPromptKitManifest({ name: "demo", actions: [{ id: "remote", remote: { url: "" } }] })).toBe(false);\n    expect(isPromptKitManifest({ name: "demo", actions: [{ id: "remote", remote: { url: "/x", method: "GET" } }] })).toBe(false);\n  });\n});\n\ndescribe("PromptKitClient remote actions", () => {\n  it("POSTs manual payloads as JSON and validates the result", async () => {\n    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ blocks: [{ type: "text", text: "done" }] }));\n    const client = new PromptKitClient({ baseUrl: "https://example.test/", fetch: fetchMock });\n\n    await expect(client.action("refresh", { url: "/actions/refresh" }, { trigger: "manual", payload: { force: true } })).resolves.toEqual({ blocks: [{ type: "text", text: "done" }] });\n    const [url, init] = fetchMock.mock.calls[0] ?? [];\n    expect(url).toBe("https://example.test/actions/refresh");\n    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });\n    expect(JSON.parse(String(init?.body))).toEqual({ action: "refresh", trigger: "manual", payload: { force: true } });\n  });\n\n  it("omits undefined manual payloads and serializes indicator context", async () => {\n    const fetchMock = vi.fn<typeof fetch>()\n      .mockResolvedValueOnce(json({ state: { manual: true } }))\n      .mockResolvedValueOnce(json({ indicators: [] }));\n    const client = new PromptKitClient({ fetch: fetchMock });\n\n    await client.action("noop", { url: "/noop" }, { trigger: "manual" });\n    await client.action("toggle", { url: "/toggle" }, { trigger: "indicator", indicator: { id: "record", label: "record", action: "toggle" } });\n\n    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ action: "noop", trigger: "manual" });\n    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({\n      action: "toggle",\n      trigger: "indicator",\n      indicator: { id: "record", label: "record", action: "toggle" },\n    });\n  });\n\n  it("POSTs dropped File objects as multipart/form-data without reading them", async () => {\n    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ clear: true }));\n    const client = new PromptKitClient({ fetch: fetchMock });\n    const file1 = new File(["one"], "one.json", { type: "application/json" });\n    const file2 = new File(["two"], "two.json", { type: "application/json" });\n\n    await client.action("import", { url: "/import" }, { trigger: "drop", files: [file1, file2] });\n    const init = fetchMock.mock.calls[0]?.[1];\n    expect(init?.method).toBe("POST");\n    expect(init?.headers).toBeUndefined();\n    expect(init?.body).toBeInstanceOf(FormData);\n    const body = init?.body as FormData;\n    expect(body.get("action")).toBe("import");\n    expect(body.get("trigger")).toBe("drop");\n    expect(body.getAll("files")).toEqual([file1, file2]);\n  });\n\n  it("maps 204 to undefined and propagates AbortSignal", async () => {\n    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));\n    const client = new PromptKitClient({ fetch: fetchMock });\n    const controller = new AbortController();\n    await expect(client.action("noop", { url: "/noop" }, { trigger: "manual" }, controller.signal)).resolves.toBeUndefined();\n    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);\n  });\n\n  it("rejects invalid results, server errors and non-JSON responses", async () => {\n    const invalid = new PromptKitClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(json({ invented: true })) });\n    await expect(invalid.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toBeInstanceOf(PromptKitProtocolError);\n\n    const failing = new PromptKitClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(json({ error: "denied" }, 422)) });\n    await expect(failing.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toThrow("denied");\n\n    const fallback = new PromptKitClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(json({ message: "nope" }, 503)) });\n    await expect(fallback.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toThrow("HTTP 503");\n\n    const nonJson = new PromptKitClient({ fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("oops", { status: 200 })) });\n    await expect(nonJson.action("bad", { url: "/bad" }, { trigger: "manual" })).rejects.toThrow("non-JSON");\n  });\n});\n\ndescribe("PromptKitActions remote orchestration", () => {\n  it("runs remote manual actions and applies valid results", async () => {\n    const remoteHandler = vi.fn().mockResolvedValue({ state: { remote: true } });\n    const definition = { id: "remote", remote: { url: "/remote" } } satisfies PromptKitActionDefinition;\n    const { actions, applied } = setup([definition], remoteHandler);\n    await actions.run("remote", { trigger: "manual", payload: 7 });\n    expect(remoteHandler).toHaveBeenCalledWith(definition, { trigger: "manual", payload: 7 });\n    expect(applied).toEqual([{ state: { remote: true } }]);\n    actions.destroy();\n  });\n\n  it("makes remote drop and indicator actions runnable without local callbacks", async () => {\n    const remoteHandler = vi.fn().mockResolvedValue(undefined);\n    const definition = { id: "remote", remote: { url: "/remote" }, triggers: [{ type: "drop" as const }] };\n    const { actions, root } = setup([definition], remoteHandler);\n    const file = new File(["x"], "x.bin");\n    const drop = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;\n    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });\n    document.dispatchEvent(drop);\n    await vi.waitFor(() => expect(remoteHandler).toHaveBeenCalledWith(definition, { trigger: "drop", files: [file] }));\n\n    actions.setIndicators([{ id: "remote-indicator", label: "remote", action: "remote" }]);\n    const button = root.querySelector('[data-indicator="remote-indicator"]') as HTMLButtonElement;\n    expect(button.tagName).toBe("BUTTON");\n    button.click();\n    await vi.waitFor(() => expect(remoteHandler).toHaveBeenCalledTimes(2));\n    expect(remoteHandler.mock.calls[1]?.[1]).toMatchObject({ trigger: "indicator" });\n    actions.destroy();\n  });\n\n  it("rejects ambiguous local plus remote configuration", () => {\n    const root = document.createElement("main");\n    const screen = document.createElement("div");\n    const line = document.createElement("div");\n    screen.append(line);\n    root.append(screen);\n    const actions = new PromptKitActions({\n      root, document, screen, line,\n      handlers: { same: () => undefined },\n      remoteHandler: vi.fn(),\n      applyResult: vi.fn(),\n    });\n    expect(() => actions.configure([{ id: "same", remote: { url: "/same" } }])).toThrow("both local and remote");\n    actions.destroy();\n  });\n\n  it("routes remote failures through declarative error feedback", async () => {\n    const remoteHandler = vi.fn().mockRejectedValue(new Error("remote boom"));\n    const { actions, applied } = setup([{\n      id: "remote",\n      remote: { url: "/remote" },\n      feedback: { error: { blocks: [{ type: "text", text: "failed: {{error.message}}", tone: "danger" }] } },\n    }], remoteHandler);\n    await actions.run("remote");\n    expect(applied).toEqual([{ blocks: [{ type: "text", text: "failed: remote boom", tone: "danger" }] }]);\n    actions.destroy();\n  });\n});\n`);

write("tests/action-handler-types.test.ts", `import { describe, expect, it } from "vitest";\nimport type { PromptKitActionHandler } from "../src/actions.js";\n\nconst returnsUndefined: PromptKitActionHandler = () => undefined;\nconst returnsUndefinedAsync: PromptKitActionHandler = async () => undefined;\n\n// @ts-expect-error Action handlers cannot return arbitrary strings.\nconst returnsString: PromptKitActionHandler = () => "ok";\n\n// @ts-expect-error Action handlers cannot return objects outside PromptKitActionResult.\nconst returnsInventedObject: PromptKitActionHandler = () => ({ inventato: true });\n\ndescribe("PromptKitActionHandler typing", () => {\n  it("keeps undefined as the intentional no-result value", async () => {\n    expect(returnsUndefined({ trigger: "manual" })).toBeUndefined();\n    await expect(returnsUndefinedAsync({ trigger: "manual" })).resolves.toBeUndefined();\n    expect(typeof returnsString).toBe("function");\n    expect(typeof returnsInventedObject).toBe("function");\n  });\n});\n`);

// Demo: real HTTP remote actions on the local server.
replaceOnce(
  "examples/demo/server.mjs",
  `    {\n      id: "reject-files",\n      label: "fail with declarative feedback",\n      tone: "danger",\n      triggers: [{ type: "drop", accept: [".json", "application/json"], multiple: true }],\n      feedback: {\n        error: {\n          blocks: [{\n            type: "text",\n            text: "demo failure: {{error.message}}",\n            tone: "danger",\n          }],\n        },\n      },\n    },\n  ],`,
  `    {\n      id: "reject-files",\n      label: "fail with declarative feedback",\n      tone: "danger",\n      triggers: [{ type: "drop", accept: [".json", "application/json"], multiple: true }],\n      feedback: {\n        error: {\n          blocks: [{\n            type: "text",\n            text: "demo failure: {{error.message}}",\n            tone: "danger",\n          }],\n        },\n      },\n    },\n    {\n      id: "remote-manual",\n      label: "remote manual",\n      remote: { url: "/tui/actions/manual" },\n      feedback: {\n        before: { blocks: [{ type: "text", text: "calling remote manual action", tone: "secondary" }] },\n      },\n    },\n    {\n      id: "remote-import",\n      label: "remote import",\n      tone: "success",\n      triggers: [{ type: "drop", accept: [".remote.json"], multiple: true }],\n      remote: { url: "/tui/actions/import" },\n      feedback: {\n        before: { blocks: [{ type: "text", text: "uploading {{files.count}} file(s)", tone: "secondary" }] },\n      },\n    },\n    {\n      id: "remote-error",\n      label: "remote error",\n      tone: "danger",\n      triggers: [{ type: "drop", accept: [".remote-error"] }],\n      remote: { url: "/tui/actions/error" },\n      feedback: {\n        error: { blocks: [{ type: "text", text: "remote error: {{error.message}}", tone: "danger" }] },\n      },\n    },\n    {\n      id: "remote-invalid",\n      label: "remote invalid result",\n      tone: "warning",\n      triggers: [{ type: "drop", accept: [".remote-invalid"] }],\n      remote: { url: "/tui/actions/invalid" },\n      feedback: {\n        error: { blocks: [{ type: "text", text: "validation error: {{error.message}}", tone: "danger" }] },\n      },\n    },\n    { id: "remote-no-content", remote: { url: "/tui/actions/no-content" } },\n  ],`,
);

replaceOnce(
  "examples/demo/server.mjs",
  `  if (request.method === "POST" && url.pathname === "/tui/command") {`,
  `  if (request.method === "POST" && url.pathname === "/tui/actions/manual") {\n    const body = await readJson(request);\n    if (!body || body.action !== "remote-manual" || body.trigger !== "manual") {\n      return json(response, 400, { error: "invalid remote manual action request" });\n    }\n    return json(response, 200, {\n      blocks: [{ type: "text", text: `remote manual success: ${JSON.stringify(body.payload ?? null)}`, tone: "success" }],\n      state: { remoteManual: true },\n    });\n  }\n\n  if (request.method === "POST" && url.pathname === "/tui/actions/import") {\n    const contentType = String(request.headers["content-type"] ?? "");\n    if (!contentType.startsWith("multipart/form-data; boundary=")) {\n      return json(response, 400, { error: "expected multipart/form-data" });\n    }\n    const body = await readBuffer(request);\n    if (!body.includes(Buffer.from('name="action"')) || !body.includes(Buffer.from("remote-import")) || !body.includes(Buffer.from('name="files"'))) {\n      return json(response, 400, { error: "missing generic action multipart fields" });\n    }\n    return json(response, 200, { blocks: [{ type: "text", text: "remote file upload success", tone: "success" }] });\n  }\n\n  if (request.method === "POST" && url.pathname === "/tui/actions/error") {\n    await readBuffer(request);\n    return json(response, 422, { error: "demo remote failure" });\n  }\n\n  if (request.method === "POST" && url.pathname === "/tui/actions/invalid") {\n    await readBuffer(request);\n    return json(response, 200, { invented: true });\n  }\n\n  if (request.method === "POST" && url.pathname === "/tui/actions/no-content") {\n    await readBuffer(request);\n    response.writeHead(204);\n    response.end();\n    return;\n  }\n\n  if (request.method === "POST" && url.pathname === "/tui/command") {`,
);

appendOnce(
  "examples/demo/server.mjs",
  "async function readBuffer(request)",
  `async function readBuffer(request) {\n  const chunks = [];\n  let size = 0;\n  for await (const chunk of request) {\n    size += chunk.length;\n    if (size > 2 * 1024 * 1024) throw new Error("request too large");\n    chunks.push(chunk);\n  }\n  return Buffer.concat(chunks);\n}`,
);

replaceOnce(
  "examples/demo/demo.js",
  `  await kit.start();\n  kit.ready();`,
  `  await kit.start();\n  kit.ready();\n  if (!release) {\n    await kit.runAction("remote-manual", { source: "demo startup" });\n    await kit.runAction("remote-no-content");\n  }`,
);

// Smoke the public demo contract at the HTTP boundary.
write("scripts/smoke-remote-actions.mjs", `import { spawn } from "node:child_process";\nimport { setTimeout as delay } from "node:timers/promises";\n\nconst port = 4279;\nconst server = spawn(process.execPath, ["examples/demo/server.mjs"], {\n  env: { ...process.env, PORT: String(port) },\n  stdio: ["ignore", "pipe", "inherit"],\n});\n\ntry {\n  for (let attempt = 0; attempt < 40; attempt += 1) {\n    try {\n      const response = await fetch(`http://127.0.0.1:${port}/tui/manifest`);\n      if (response.ok) break;\n    } catch {}\n    await delay(50);\n  }\n\n  const manifest = await (await fetch(`http://127.0.0.1:${port}/tui/manifest`)).json();\n  const remote = new Map(manifest.actions.filter((action) => action.remote).map((action) => [action.id, action]));\n  for (const id of ["remote-manual", "remote-import", "remote-error", "remote-invalid", "remote-no-content"]) {\n    if (!remote.has(id)) throw new Error(`remote demo action missing: ${id}`);\n  }\n\n  const manual = await fetch(`http://127.0.0.1:${port}/tui/actions/manual`, {\n    method: "POST",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({ action: "remote-manual", trigger: "manual", payload: { smoke: true } }),\n  });\n  const manualBody = await manual.json();\n  if (!manual.ok || manualBody.state?.remoteManual !== true) throw new Error("remote manual demo failed");\n\n  const form = new FormData();\n  form.append("action", "remote-import");\n  form.append("trigger", "drop");\n  form.append("files", new Blob(["{}"], { type: "application/json" }), "config.remote.json");\n  const upload = await fetch(`http://127.0.0.1:${port}/tui/actions/import`, { method: "POST", body: form });\n  if (!upload.ok) throw new Error(`remote multipart demo failed: ${upload.status}`);\n\n  const failure = await fetch(`http://127.0.0.1:${port}/tui/actions/error`, { method: "POST", body: "x" });\n  if (failure.status !== 422 || (await failure.json()).error !== "demo remote failure") throw new Error("remote error demo failed");\n\n  const invalid = await fetch(`http://127.0.0.1:${port}/tui/actions/invalid`, { method: "POST", body: "x" });\n  if (!invalid.ok || (await invalid.json()).invented !== true) throw new Error("remote invalid-result demo failed");\n\n  const noContent = await fetch(`http://127.0.0.1:${port}/tui/actions/no-content`, { method: "POST", body: "x" });\n  if (noContent.status !== 204) throw new Error("remote no-content demo failed");\n\n  console.log("Remote action demo smoke passed");\n} finally {\n  server.kill("SIGTERM");\n}\n`);

// Documentation.
appendOnce("docs/actions.md", "## Remote actions", `## Remote actions\n\nAn action may be implemented by the browser host through the existing \\`actions\\` registry or declared as server-backed in the manifest:\n\n\\`\\`\\`json\n{\n  "id": "import-config",\n  "triggers": [{ "type": "drop", "accept": [".json"], "multiple": false }],\n  "remote": { "url": "/tui/actions/import-config" }\n}\n\\`\\`\\`\n\nRemote actions always use \\`POST\\`; the manifest intentionally has no HTTP-method field. PromptKit does not retry them automatically because actions may have side effects. A future transport extension can be added without changing this default.\n\nFor \\`manual\\` and \\`indicator\\` contexts PromptKit sends JSON containing \\`action\\`, \\`trigger\\`, and the relevant \\`payload\\` or \\`indicator\\`. Drop contexts use \\`multipart/form-data\\` with \\`action\\`, \\`trigger\\`, and repeated \\`files\\` fields containing the original browser \\`File\\` objects. PromptKit does not read or interpret file contents.\n\nA successful response must be a valid \\`PromptKitActionResult\\`. \\`204 No Content\\` is the explicit no-result response and maps to \\`undefined\\`. Invalid JSON or an invalid result is a protocol error and flows through the normal declarative \\`feedback.error\\` path.\n\nAn action id cannot be both locally implemented and remote. PromptKit rejects that ambiguous configuration instead of applying hidden precedence.`);

appendOnce("docs/protocol.md", "### Remote action transport", `### Remote action transport\n\n\\`PromptKitActionDefinition.remote\\` is an optional object with exactly one field, \\`url\\`. Its transport is always HTTP \\`POST\\`; no protocol version or method field is added.\n\nManual request JSON:\n\n\\`\\`\\`json\n{ "action": "refresh", "trigger": "manual", "payload": { "force": true } }\n\\`\\`\\`\n\nIndicator request JSON includes the current indicator under \\`indicator\\`. Drop requests are \\`multipart/form-data\\` with string fields \\`action\\`, \\`trigger=drop\\`, and one or more repeated \\`files\\` parts.\n\nThe response contract is the same structured snapshot used by \\`PromptKitActionResult\\`. HTTP 204 means that the action intentionally produced no result. Every non-204 success response is decoded as JSON and validated at runtime before PromptKit applies it.`);

appendOnce("README.md", "## Server-backed actions", `## Server-backed actions\n\nThe minimal initialization remains unchanged:\n\n\\`\\`\\`js\nconst kit = new PromptKit({ root });\nawait kit.start();\nkit.ready();\n\\`\\`\\`\n\nFor application operations that belong on the backend, declare a remote action in the manifest instead of writing repeated browser transport glue:\n\n\\`\\`\\`json\n{\n  "id": "import-config",\n  "triggers": [{ "type": "drop", "accept": [".json"] }],\n  "remote": { "url": "/tui/actions/import-config" }\n}\n\\`\\`\\`\n\nPromptKit sends remote actions with POST, transports dropped files as multipart data, validates the returned \\`PromptKitActionResult\\`, and applies it through the normal update pipeline. Mutating actions are never retried automatically. See \\`docs/actions.md\\` for the wire shape and error semantics. The local HTTP demo exercises the real remote transport; the static GitHub Pages demo cannot provide a server-backed POST endpoint.`);

// Version and smoke command.
const packageJson = JSON.parse(read("package.json"));
packageJson.version = "0.9.0";
packageJson.scripts["demo:smoke"] = "node scripts/smoke-demo.mjs && node scripts/smoke-action-feedback.mjs && node scripts/smoke-remote-actions.mjs";
write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

const packageLock = JSON.parse(read("package-lock.json"));
packageLock.version = "0.9.0";
if (packageLock.packages?.[""]) packageLock.packages[""].version = "0.9.0";
write("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`);

// Remove temporary migration machinery before the generated feature commit.
unlinkSync("scripts/remote-actions-migration.mjs");
unlinkSync(".github/workflows/remote-actions-migration.yml");
