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
});
