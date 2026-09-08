import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PromptKitActions,
  type PromptKitActionHandler,
  type PromptKitActionResult,
} from "../src/actions.js";
import type { PromptKitActionDefinition } from "../src/protocol.js";

function setup(
  definitions: PromptKitActionDefinition[],
  handlers: Record<string, PromptKitActionHandler>,
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
    handlers,
    applyResult: (result) => applied.push(result),
  });
  actions.configure(definitions);
  return { actions, root, applied };
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

describe("typed action results and echo", () => {
  it("accepts an explicit undefined result but rejects untyped return values at compile time", () => {
    const noResponse: PromptKitActionHandler = () => undefined;
    const response: PromptKitActionHandler = () => ({
      blocks: [{ type: "text", text: "ok" }],
    });

    // @ts-expect-error Action handlers may return undefined, but any present response must be typed.
    const invalidResponse: PromptKitActionHandler = () => "not-a-promptkit-result";

    expect(noResponse({ trigger: "manual" })).toBeUndefined();
    expect(response({ trigger: "manual" })).toEqual({
      blocks: [{ type: "text", text: "ok" }],
    });
    void invalidResponse;
  });

  it("echoes one dropped filename before running an action that returns no response", async () => {
    const handler = vi.fn<PromptKitActionHandler>(() => undefined);
    const { actions, applied } = setup(
      [
        {
          id: "import",
          triggers: [{ type: "drop", accept: [".json"] }],
          echo: { type: "drop-files" },
        },
      ],
      { import: handler },
    );

    const file = new File(["{}"], "config.json", { type: "application/json" });
    drop([file]);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(applied).toEqual([
      {
        blocks: [{ type: "text", text: "file: config.json", tone: "secondary" }],
      },
    ]);
    actions.destroy();
  });

  it("echoes all dropped filenames with the configured tone after chooser selection", async () => {
    const first = vi.fn<PromptKitActionHandler>(() => ({ state: { selected: "first" } }));
    const second = vi.fn<PromptKitActionHandler>(() => ({ state: { selected: "second" } }));
    const { actions, root, applied } = setup(
      [
        {
          id: "first",
          label: "first",
          triggers: [{ type: "drop", multiple: true }],
          echo: { type: "drop-files", tone: "info" },
        },
        {
          id: "second",
          label: "second",
          triggers: [{ type: "drop", multiple: true }],
        },
      ],
      { first, second },
    );

    const files = [new File(["a"], "a.json"), new File(["b"], "b.json")];
    drop(files);
    expect(applied).toEqual([]);

    (root.querySelector('[data-action="first"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(applied).toEqual([
      {
        blocks: [{ type: "text", text: "files: a.json, b.json", tone: "info" }],
      },
      { state: { selected: "first" } },
    ]);
    expect(second).not.toHaveBeenCalled();
    actions.destroy();
  });

  it("does not emit a drop-files echo for non-drop or empty drop contexts", async () => {
    const handler = vi.fn<PromptKitActionHandler>(() => undefined);
    const { actions, applied } = setup(
      [{ id: "manual", echo: { type: "drop-files" } }],
      { manual: handler },
    );

    await actions.run("manual", { trigger: "manual" });
    await actions.run("manual", { trigger: "drop", files: [] });
    expect(applied).toEqual([]);
    actions.destroy();
  });

  it("rejects malformed action results at runtime for JavaScript consumers", async () => {
    const malformed = (() => "wrong") as unknown as PromptKitActionHandler;
    const { actions, applied } = setup([], { malformed });

    await actions.run("malformed");
    expect(applied).toEqual([
      {
        blocks: [
          {
            type: "text",
            text: "PromptKit action handler returned an invalid result: malformed",
            tone: "danger",
          },
        ],
      },
    ]);
    actions.destroy();
  });
});
