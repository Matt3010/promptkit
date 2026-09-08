import { describe, expect, it } from "vitest";
import { isPromptKitManifest } from "../src/protocol.js";

describe("PromptKit action echo protocol", () => {
  it("accepts typed drop-files echo definitions", () => {
    expect(
      isPromptKitManifest({
        name: "example",
        actions: [
          {
            id: "import",
            triggers: [{ type: "drop", accept: [".json"] }],
            echo: { type: "drop-files" },
          },
          {
            id: "inspect",
            triggers: [{ type: "drop", multiple: true }],
            echo: { type: "drop-files", tone: "info" },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects malformed or unknown action echo definitions", () => {
    expect(isPromptKitManifest({ name: "x", actions: [{ id: "a", echo: "yes" }] })).toBe(false);
    expect(isPromptKitManifest({ name: "x", actions: [{ id: "a", echo: {} }] })).toBe(false);
    expect(isPromptKitManifest({ name: "x", actions: [{ id: "a", echo: { type: "files" } }] })).toBe(false);
    expect(
      isPromptKitManifest({
        name: "x",
        actions: [{ id: "a", echo: { type: "drop-files", tone: "unknown" } }],
      }),
    ).toBe(false);
  });
});
