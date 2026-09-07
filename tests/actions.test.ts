import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PromptKitActions,
  type PromptKitActionResult,
} from "../src/actions.js";
import type { PromptKitActionDefinition, PromptKitIndicator } from "../src/protocol.js";

function setup(
  definitions: PromptKitActionDefinition[],
  handlers: ConstructorParameters<typeof PromptKitActions>[0]["handlers"],
) {
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
    ...(handlers ? { handlers } : {}),
    applyResult: (result) => applied.push(result),
  });
  actions.configure(definitions);
  return { actions, root, screen, line, applied };
}

function drop(files: File[]): DragEvent {
  const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: { files } });
  document.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("PromptKitActions", () => {
  it("routes a matching drop to the registered action", async () => {
    const importConfig = vi.fn().mockResolvedValue({
      blocks: [{ type: "text", text: "imported" }],
    });
    const { root, actions, applied } = setup(
      [
        {
          id: "import-config",
          label: "import config",
          triggers: [{ type: "drop", accept: [".json"] }],
        },
      ],
      { "import-config": importConfig },
    );

    const over = new Event("dragover", { bubbles: true, cancelable: true });
    document.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(root.dataset.dragging).toBe("true");

    const file = new File(["{}"], "config.JSON", { type: "application/json" });
    const event = drop([file]);
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(importConfig).toHaveBeenCalledTimes(1));
    expect(importConfig).toHaveBeenCalledWith({ trigger: "drop", files: [file] });
    expect(applied).toEqual([{ blocks: [{ type: "text", text: "imported" }] }]);
    expect(root.dataset.dragging).toBeUndefined();

    actions.destroy();
  });

  it("supports MIME rules, multiple files and rejects unmatched drops", async () => {
    const upload = vi.fn();
    const { actions, applied } = setup(
      [
        {
          id: "upload-images",
          triggers: [{ type: "drop", accept: ["image/*"], multiple: true }],
        },
      ],
      { "upload-images": upload },
    );

    const one = new File(["a"], "a.png", { type: "image/png" });
    const two = new File(["b"], "b.webp", { type: "image/webp" });
    drop([one, two]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    drop([new File(["x"], "x.txt", { type: "text/plain" })]);
    expect(applied.at(-1)?.blocks?.[0]).toEqual({
      type: "text",
      text: "nessuna azione disponibile per i file selezionati",
      tone: "warning",
    });

    actions.destroy();
  });

  it("supports unconstrained, exact filename and exact MIME accept rules", async () => {
    const any = vi.fn();
    const exactName = vi.fn();
    const exactMime = vi.fn();

    const unrestricted = setup(
      [{ id: "any", triggers: [{ type: "drop" }] }],
      { any },
    );
    const arbitrary = new File(["x"], "anything.bin", { type: "application/octet-stream" });
    drop([arbitrary]);
    await vi.waitFor(() => expect(any).toHaveBeenCalledTimes(1));
    unrestricted.actions.destroy();

    const byName = setup(
      [{ id: "exact-name", triggers: [{ type: "drop", accept: ["CONFIG.JSON"] }] }],
      { "exact-name": exactName },
    );
    const named = new File(["{}"], "config.json", { type: "" });
    drop([named]);
    await vi.waitFor(() => expect(exactName).toHaveBeenCalledTimes(1));
    byName.actions.destroy();

    const byMime = setup(
      [{ id: "exact-mime", triggers: [{ type: "drop", accept: ["APPLICATION/JSON"] }] }],
      { "exact-mime": exactMime },
    );
    const typed = new File(["{}"], "payload.data", { type: "application/json" });
    drop([typed]);
    await vi.waitFor(() => expect(exactMime).toHaveBeenCalledTimes(1));
    byMime.actions.destroy();
  });

  it("rejects empty accept rules and multiple files when multiple is not enabled", () => {
    const emptyRuleHandler = vi.fn();
    const emptyRule = setup(
      [{ id: "empty-rule", triggers: [{ type: "drop", accept: ["   "] }] }],
      { "empty-rule": emptyRuleHandler },
    );
    drop([new File(["x"], "x.txt", { type: "text/plain" })]);
    expect(emptyRuleHandler).not.toHaveBeenCalled();
    expect(emptyRule.applied.at(-1)?.blocks?.[0]).toMatchObject({ tone: "warning" });
    emptyRule.actions.destroy();

    const singleHandler = vi.fn();
    const single = setup(
      [{ id: "single", triggers: [{ type: "drop", accept: [".json"] }] }],
      { single: singleHandler },
    );
    drop([
      new File(["{}"], "one.json", { type: "application/json" }),
      new File(["{}"], "two.json", { type: "application/json" }),
    ]);
    expect(singleHandler).not.toHaveBeenCalled();
    expect(single.applied.at(-1)?.blocks?.[0]).toMatchObject({ tone: "warning" });
    single.actions.destroy();
  });

  it("ignores drag and drop when there is no runnable drop action", () => {
    const { root, actions, applied } = setup(
      [
        { id: "missing-handler", triggers: [{ type: "drop", accept: [".json"] }] },
        { id: "manual-only" },
      ],
      undefined,
    );

    const over = new Event("dragover", { bubbles: true, cancelable: true });
    document.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    expect(root.dataset.dragging).toBeUndefined();

    const event = drop([new File(["{}"], "config.json", { type: "application/json" })]);
    expect(event.defaultPrevented).toBe(false);
    expect(applied).toEqual([]);

    actions.destroy();
  });

  it("ignores an empty drop even when drop actions are configured", () => {
    const handler = vi.fn();
    const { actions, applied } = setup(
      [{ id: "import", triggers: [{ type: "drop" }] }],
      { import: handler },
    );

    const event = drop([]);
    expect(event.defaultPrevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(applied).toEqual([]);
    actions.destroy();
  });

  it("shows a chooser when more than one drop action matches", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { root, actions } = setup(
      [
        { id: "first", label: "prima", triggers: [{ type: "drop", accept: [".json"] }] },
        { id: "second", label: "seconda", tone: "special", triggers: [{ type: "drop", accept: ["application/json"] }] },
      ],
      { first, second },
    );

    const file = new File(["{}"], "data.json", { type: "application/json" });
    drop([file]);
    const chooser = root.querySelector(".pk-action-chooser");
    expect(chooser?.textContent).toContain("file: data.json");
    expect(root.querySelectorAll(".pk-action-choice")).toHaveLength(2);

    (root.querySelector('[data-action="second"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
    expect(root.querySelector(".pk-action-chooser")).toBeNull();

    actions.destroy();
  });

  it("replaces an existing chooser and uses generic labels for multiple files", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { root, actions } = setup(
      [
        { id: "first", triggers: [{ type: "drop", multiple: true }] },
        { id: "second", triggers: [{ type: "drop", multiple: true }] },
      ],
      { first, second },
    );

    const files = [
      new File(["a"], "a.bin"),
      new File(["b"], "b.bin"),
    ];
    drop(files);
    const originalChooser = root.querySelector(".pk-action-chooser");
    expect(originalChooser?.textContent).toContain("2 files");
    expect(root.querySelector('[data-action="first"]')?.textContent).toBe("[first]");
    expect(root.querySelector('[data-action="first"]')?.classList).toContain("pk-tone-primary");

    drop(files);
    const replacementChooser = root.querySelector(".pk-action-chooser");
    expect(replacementChooser).not.toBe(originalChooser);
    expect(root.querySelectorAll(".pk-action-chooser")).toHaveLength(1);

    (root.querySelector('[data-action="first"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(second).not.toHaveBeenCalled();
    actions.destroy();
  });

  it("renders indicators as generic state and runs indicator actions", async () => {
    const toggle = vi.fn().mockResolvedValue({ indicators: [] });
    const { actions, root, applied } = setup([], { toggle });
    const indicators: PromptKitIndicator[] = [
      { id: "recording", label: "registra", tone: "special", pulse: true, action: "toggle" },
      { id: "idle", label: "idle", tone: "secondary" },
      { id: "hidden", label: "hidden", active: false },
    ];

    actions.setIndicators(indicators);
    expect(root.querySelectorAll(".pk-indicator")).toHaveLength(2);
    expect(root.textContent).toContain("[registra]");
    expect(root.textContent).toContain("[idle]");
    expect(root.textContent).not.toContain("hidden");
    expect(root.querySelector('[data-indicator="recording"]')?.classList).toContain("pk-indicator-pulse");

    (root.querySelector('[data-indicator="recording"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(toggle).toHaveBeenCalledTimes(1));
    expect(toggle).toHaveBeenCalledWith({ trigger: "indicator", indicator: indicators[0] });
    expect(applied.at(-1)).toEqual({ indicators: [] });

    actions.setIndicators([]);
    expect(root.querySelectorAll(".pk-indicator")).toHaveLength(0);
    actions.destroy();
  });

  it("keeps indicators non-actionable when their action has no host handler", () => {
    const { actions, root } = setup([], {});
    actions.setIndicators([
      { id: "unknown", label: "unknown", action: "missing" },
      { id: "plain", label: "plain" },
    ]);

    const unknown = root.querySelector('[data-indicator="unknown"]') as HTMLElement;
    expect(unknown.tagName).toBe("SPAN");
    expect(unknown.dataset.action).toBeUndefined();
    expect(unknown.classList).toContain("pk-tone-primary");
    expect(unknown.classList).not.toContain("pk-indicator-pulse");
    actions.destroy();
  });

  it("supports manual actions, errors and cleanup", async () => {
    const manual = vi.fn().mockImplementation(({ payload }) => ({
      state: { payload: String(payload) },
    }));
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const { actions, root, applied } = setup([], { manual, failing });

    await actions.run("manual", { trigger: "manual", payload: 7 });
    expect(applied.at(-1)).toEqual({ state: { payload: "7" } });

    await actions.run("failing");
    expect(applied.at(-1)).toEqual({
      blocks: [{ type: "text", text: "boom", tone: "danger" }],
    });

    await expect(actions.run("missing")).rejects.toThrow("handler not found");
    document.dispatchEvent(new Event("dragleave"));
    expect(root.dataset.dragging).toBeUndefined();

    actions.destroy();
    expect(root.querySelector(".pk-indicators")).toBeNull();
    await expect(actions.run("manual")).rejects.toThrow("destroyed");
    actions.destroy();
  });

  it("does not apply a result for void handlers and normalizes non-Error failures", async () => {
    const noop = vi.fn();
    const failing = vi.fn().mockRejectedValue("plain failure");
    const { actions, applied } = setup([], { noop, failing });

    await actions.run("noop");
    expect(applied).toEqual([]);

    await actions.run("failing");
    expect(applied).toEqual([
      { blocks: [{ type: "text", text: "plain failure", tone: "danger" }] },
    ]);
    actions.destroy();
  });
});
