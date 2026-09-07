import { describe, expect, it } from "vitest";
import {
  isPromptKitBlock,
  isPromptKitCommandResponse,
  isPromptKitEvent,
  isPromptKitManifest,
} from "../src/protocol.js";

describe("PromptKit protocol guards", () => {
  it("accepts a manifest with default and variant themes", () => {
    expect(
      isPromptKitManifest({
        name: "example",
        prompt: ">",
        subtitle: "/help for commands",
        commands: ["/start", "/stop"],
        theme: {
          default: { accent: "#123456", background: "#000" },
          variants: {
            warm: { accent: "#ff9900", accentMuted: "#996000" },
          },
        },
        events: { url: "/tui/events" },
      }),
    ).toBe(true);
  });

  it("rejects malformed manifests", () => {
    expect(isPromptKitManifest({ name: 42 })).toBe(false);
    expect(isPromptKitManifest({ name: "x", commands: ["/ok", 3] })).toBe(false);
    expect(isPromptKitManifest({ name: "x", events: {} })).toBe(false);
    expect(isPromptKitManifest({ name: "x", theme: { default: { accent: 3 } } })).toBe(false);
    expect(isPromptKitManifest({ name: "x", theme: { variants: { warm: null } } })).toBe(false);
  });

  it.each([
    { type: "text", text: "hello" },
    { type: "table", columns: ["name"], rows: [["example"]] },
    { type: "code", code: "{}", language: "json" },
    { type: "status", label: "db", value: "healthy", tone: "success" },
    { type: "progress", label: "import", value: 5, max: 10 },
    { type: "download", label: "save", filename: "x.json", content: "{}" },
    { type: "separator" },
  ])("accepts block %#", (block) => {
    expect(isPromptKitBlock(block)).toBe(true);
  });

  it("rejects invalid and unknown blocks", () => {
    expect(isPromptKitBlock({ type: "text", text: 10 })).toBe(false);
    expect(isPromptKitBlock({ type: "table", rows: [[1]] })).toBe(false);
    expect(isPromptKitBlock({ type: "progress", value: Number.NaN })).toBe(false);
    expect(isPromptKitBlock({ type: "widget", value: "x" })).toBe(false);
  });

  it("validates state and theme variants on responses and events", () => {
    expect(
      isPromptKitCommandResponse({
        ok: true,
        blocks: [{ type: "text", text: "done" }],
        state: { mode: "live", healthy: true, count: 2, optional: null },
        themeVariant: "warm",
      }),
    ).toBe(true);
    expect(isPromptKitCommandResponse({ ok: true, blocks: [], themeVariant: null, clear: true })).toBe(true);
    expect(isPromptKitCommandResponse({ ok: true, blocks: [], themeVariant: 3 })).toBe(false);
    expect(isPromptKitCommandResponse({ ok: true, blocks: [], state: { nested: {} } })).toBe(false);
    expect(isPromptKitCommandResponse({ ok: true, blocks: [], clear: "yes" })).toBe(false);
    expect(isPromptKitCommandResponse({ ok: true, blocks: [{ type: "unknown" }] })).toBe(false);

    expect(
      isPromptKitEvent({
        id: "10",
        state: { mode: "live", healthy: true },
        themeVariant: "warm",
        blocks: [{ type: "status", label: "db", value: "ok" }],
      }),
    ).toBe(true);
    expect(isPromptKitEvent({ themeVariant: null })).toBe(true);
    expect(isPromptKitEvent({ themeVariant: false })).toBe(false);
    expect(isPromptKitEvent({ state: { nested: {} } })).toBe(false);
  });
});
