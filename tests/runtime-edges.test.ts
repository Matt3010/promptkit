import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptKitActions } from "../src/actions.js";
import { PromptKitClient } from "../src/client.js";
import type { PromptKitCommandResponse } from "../src/protocol.js";
import { PromptKit } from "../src/promptkit.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function actionSurface() {
  const root = document.createElement("main");
  const screen = document.createElement("div");
  const line = document.createElement("div");
  screen.append(line);
  root.append(screen);
  document.body.append(root);
  return { root, screen, line };
}

describe("runtime edge coverage", () => {
  it("does not treat a registered manual-only action as a drop target", () => {
    const { root, screen, line } = actionSurface();
    const manual = vi.fn();
    const actions = new PromptKitActions({
      root,
      document,
      screen,
      line,
      handlers: { manual },
      applyResult: vi.fn(),
    });
    actions.configure([{ id: "manual" }]);

    const over = new Event("dragover", { bubbles: true, cancelable: true });
    document.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    expect(root.dataset.dragging).toBeUndefined();
    actions.destroy();
  });

  it("treats a drop without dataTransfer as an empty drop", () => {
    const { root, screen, line } = actionSurface();
    const imported = vi.fn();
    const actions = new PromptKitActions({
      root,
      document,
      screen,
      line,
      handlers: { imported },
      applyResult: vi.fn(),
    });
    actions.configure([{ id: "imported", triggers: [{ type: "drop" }] }]);

    const event = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(imported).not.toHaveBeenCalled();
    actions.destroy();
  });

  it("renders command failures without disabling the terminal", async () => {
    const client = {
      manifest: vi.fn().mockResolvedValue({ name: "demo" }),
      command: vi.fn().mockRejectedValue("network down"),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client });
    await kit.start();
    kit.ready();

    const input = root.querySelector(".pk-input") as HTMLInputElement;
    input.value = "/status";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await vi.waitFor(() => expect(root.textContent).toContain("network down"));
    expect(input.disabled).toBe(false);
    kit.destroy();
  });

  it("ignores a command response that arrives after destroy", async () => {
    let resolveCommand: ((value: PromptKitCommandResponse) => void) | undefined;
    const pending = new Promise<PromptKitCommandResponse>((resolve) => {
      resolveCommand = resolve;
    });
    const client = {
      manifest: vi.fn().mockResolvedValue({ name: "demo" }),
      command: vi.fn().mockReturnValue(pending),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client });
    await kit.start();
    kit.ready();

    const input = root.querySelector(".pk-input") as HTMLInputElement;
    input.value = "/status";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    kit.destroy();
    resolveCommand?.({ ok: true, blocks: [{ type: "text", text: "late" }] });
    await pending;
    await Promise.resolve();

    expect(root.textContent).toBe("");
  });

  it("ignores a command failure that arrives after destroy", async () => {
    let rejectCommand: ((reason?: unknown) => void) | undefined;
    const pending = new Promise<PromptKitCommandResponse>((_resolve, reject) => {
      rejectCommand = reject;
    });
    const client = {
      manifest: vi.fn().mockResolvedValue({ name: "demo" }),
      command: vi.fn().mockReturnValue(pending),
      events: vi.fn(),
    } as unknown as PromptKitClient;
    const root = document.createElement("main");
    document.body.append(root);
    const kit = new PromptKit({ root, client });
    await kit.start();
    kit.ready();

    const input = root.querySelector(".pk-input") as HTMLInputElement;
    input.value = "/status";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    kit.destroy();
    rejectCommand?.(new Error("late failure"));
    await pending.catch(() => undefined);
    await Promise.resolve();

    expect(root.textContent).toBe("");
  });
});
