import { describe, expect, it } from "vitest";
import {
  isPromptKitBlock,
  isPromptKitCommandResponse,
  isPromptKitEvent,
  isPromptKitManifest,
} from "../src/protocol.js";

/**
 * Canonical PromptKit payloads for the current compatible release line.
 *
 * These are compatibility fixtures, not examples to freely rewrite. If one of
 * these must become invalid, that is a breaking change and AGENTS.md applies.
 */
describe("PromptKit protocol compatibility", () => {
  it("keeps the canonical manifest valid", () => {
    expect(
      isPromptKitManifest({
        name: "example-app",
        prompt: ">",
        subtitle: "/help for commands",
        commands: ["/help", "/status"],
        theme: {
          default: {
            accent: "#8b949e",
            accentMuted: "#5c636b",
            background: "#0d1117",
            foreground: "#c9d1d9",
            muted: "#6e7681",
            danger: "#f0836d",
            warning: "#e8973a",
            success: "#58d6a8",
            info: "#79c0ff",
            special: "#c58af9",
          },
          variants: {
            active: { accent: "#58d6a8", accentMuted: "#4a9781" },
          },
        },
        events: { url: "/tui/events" },
      }),
    ).toBe(true);
  });

  it("keeps every canonical block shape valid", () => {
    const blocks = [
      { type: "text", text: "hello", tone: "primary" },
      { type: "table", columns: ["name", "state"], rows: [["db", "healthy"]], tone: "secondary" },
      { type: "code", code: "{\"ok\":true}", language: "json", tone: "info" },
      { type: "status", label: "database", value: "healthy", tone: "success" },
      { type: "progress", label: "migration", value: 4, max: 10, tone: "warning" },
      {
        type: "download",
        label: "download config",
        filename: "config.json",
        content: "{}",
        mediaType: "application/json",
      },
      { type: "link", label: "open docs", href: "https://example.com/docs", tone: "info" },
      { type: "separator" },
    ];

    for (const block of blocks) expect(isPromptKitBlock(block)).toBe(true);
  });

  it("keeps canonical responses and events valid", () => {
    expect(
      isPromptKitCommandResponse({
        ok: true,
        blocks: [{ type: "text", text: "done" }],
        state: { mode: "active", running: true, count: 2, optional: null },
        themeVariant: "active",
      }),
    ).toBe(true);

    expect(
      isPromptKitEvent({
        id: "evt-1",
        blocks: [{ type: "status", label: "sync", value: "idle" }],
        state: { connected: true },
        themeVariant: null,
      }),
    ).toBe(true);
  });
});
