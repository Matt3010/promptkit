import { describe, expect, it } from "vitest";
import {
  isPromptKitBlock,
  isPromptKitCommandResponse,
  isPromptKitEvent,
  isPromptKitManifest,
} from "../src/protocol.js";

describe("PromptKit protocol guards", () => {
  it("accepts a valid manifest", () => {
    expect(
      isPromptKitManifest({
        name: "scatto",
        prompt: ">",
        subtitle: "/help per i comandi",
        commands: ["/start", "/stop"],
        events: { url: "/tui/events" },
      }),
    ).toBe(true);
  });

  it("rejects malformed manifests", () => {
    expect(isPromptKitManifest({ name: 42 })).toBe(false);
    expect(isPromptKitManifest({ name: "x", commands: ["/ok", 3] })).toBe(false);
    expect(isPromptKitManifest({ name: "x", events: {} })).toBe(false);
  });

  it.each([
    { type: "text", text: "hello" },
    { type: "table", columns: ["name"], rows: [["relay"]] },
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

  it("validates command responses and events", () => {
    expect(
      isPromptKitCommandResponse({
        ok: true,
        blocks: [{ type: "text", text: "done" }],
      }),
    ).toBe(true);
    expect(isPromptKitCommandResponse({ ok: true, blocks: [{ type: "unknown" }] })).toBe(false);

    expect(
      isPromptKitEvent({
        id: "10",
        state: { mode: "live", healthy: true, count: 2, optional: null },
        blocks: [{ type: "status", label: "db", value: "ok" }],
      }),
    ).toBe(true);
    expect(isPromptKitEvent({ state: { nested: {} } })).toBe(false);
  });
});
