import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PromptKitActions,
  type PromptKitActionHandler,
  type PromptKitActionResult,
} from "../src/actions.js";
import type {
  PromptKitActionDefinition,
  PromptKitActionUi,
} from "../src/protocol.js";

function setup(
  definitions: PromptKitActionDefinition[],
  handlers: Record<string, PromptKitActionHandler>,
  ui: PromptKitActionUi = {},
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
  actions.configure(definitions, ui);
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

describe("typed action results and declarative feedback", () => {
  it("accepts undefined but rejects untyped present handler results at compile time", () => {
    const noResponse: PromptKitActionHandler = () => undefined;
    const response: PromptKitActionHandler = () => ({
      blocks: [{ type: "text", text: "ok" }],
    });

    // @ts-expect-error Present action results must satisfy PromptKitActionResult.
    const invalidResponse: PromptKitActionHandler = () => "not-a-promptkit-result";

    expect(noResponse({ trigger: "manual" })).toBeUndefined();
    expect(response({ trigger: "manual" })).toEqual({
      blocks: [{ type: "text", text: "ok" }],
    });
    void invalidResponse;
  });

  it("renders a custom before template without requiring a feedback callback", async () => {
    const handler = vi.fn<PromptKitActionHandler>(() => undefined);
    const { actions, applied } = setup(
      [
        {
          id: "import",
          label: "import config",
          triggers: [{ type: "drop", accept: [".json"] }],
          feedback: {
            before: {
              blocks: [
                {
                  type: "text",
                  text: "importing {{files[0].name}} via {{action.label}}",
                  tone: "secondary",
                },
              ],
            },
          },
        },
      ],
      { import: handler },
    );

    drop([new File(["{}"], "config.json", { type: "application/json" })]);

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(applied).toEqual([
      {
        blocks: [
          {
            type: "text",
            text: "importing config.json via import config",
            tone: "secondary",
          },
        ],
      },
    ]);
    actions.destroy();
  });

  it("customizes chooser presentation declaratively and resolves feedback after selection", async () => {
    const first = vi.fn<PromptKitActionHandler>(() => ({ state: { selected: "first" } }));
    const second = vi.fn<PromptKitActionHandler>(() => undefined);
    const { actions, root, applied } = setup(
      [
        {
          id: "first",
          label: "first action",
          triggers: [{ type: "drop", multiple: true }],
          feedback: {
            before: {
              blocks: [{ type: "text", text: "selected {{action.label}} for {{files.count}} files" }],
            },
          },
        },
        {
          id: "second",
          label: "second action",
          triggers: [{ type: "drop", multiple: true }],
        },
      ],
      { first, second },
      { chooserLabel: "choose what to do with {{files.count}} files" },
    );

    const files = [new File(["a"], "a.json"), new File(["b"], "b.json")];
    drop(files);

    expect(root.querySelector(".pk-action-chooser-label")?.textContent).toBe(
      "choose what to do with 2 files",
    );
    expect(applied).toEqual([]);

    (root.querySelector('[data-action="first"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(applied).toEqual([
      { blocks: [{ type: "text", text: "selected first action for 2 files" }] },
      { state: { selected: "first" } },
    ]);
    expect(second).not.toHaveBeenCalled();
    actions.destroy();
  });

  it("uses a language-neutral filename list as the default chooser label", () => {
    const noop: PromptKitActionHandler = () => undefined;
    const { actions, root } = setup(
      [
        { id: "a", triggers: [{ type: "drop", multiple: true }] },
        { id: "b", triggers: [{ type: "drop", multiple: true }] },
      ],
      { a: noop, b: noop },
    );

    drop([new File(["a"], "a.json"), new File(["b"], "b.json")]);
    expect(root.querySelector(".pk-action-chooser-label")?.textContent).toBe("a.json, b.json");
    actions.destroy();
  });

  it("renders custom no-match feedback with dropped-file context", () => {
    const noop: PromptKitActionHandler = () => undefined;
    const { actions, applied } = setup(
      [{ id: "json", triggers: [{ type: "drop", accept: [".json"] }] }],
      { json: noop },
      {
        noMatch: {
          blocks: [
            {
              type: "text",
              text: "unsupported file: {{files[0].name}}",
              tone: "warning",
            },
          ],
        },
      },
    );

    drop([new File(["x"], "notes.txt", { type: "text/plain" })]);
    expect(applied).toEqual([
      {
        blocks: [
          {
            type: "text",
            text: "unsupported file: notes.txt",
            tone: "warning",
          },
        ],
      },
    ]);
    actions.destroy();
  });

  it("renders custom error feedback for handler failures", async () => {
    const handler = vi.fn<PromptKitActionHandler>(() => {
      throw new Error("disk full");
    });
    const { actions, applied } = setup(
      [
        {
          id: "save",
          feedback: {
            error: {
              blocks: [
                {
                  type: "text",
                  text: "save failed: {{error.message}}",
                  tone: "danger",
                },
              ],
            },
          },
        },
      ],
      { save: handler },
    );

    await actions.run("save", { trigger: "manual", payload: { source: "demo" } });
    expect(applied).toEqual([
      {
        blocks: [
          {
            type: "text",
            text: "save failed: disk full",
            tone: "danger",
          },
        ],
      },
    ]);
    actions.destroy();
  });

  it("keeps a safe generic error fallback when no custom feedback is declared", async () => {
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
