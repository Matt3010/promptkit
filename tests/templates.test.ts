import { describe, expect, it } from "vitest";
import type { PromptKitSnapshot } from "../src/protocol.js";
import {
  resolvePromptKitSnapshotTemplate,
  resolvePromptKitTextTemplate,
} from "../src/templates.js";

describe("PromptKit action feedback templates", () => {
  it("resolves every action, file and indicator token", () => {
    const files = [
      new File(["abc"], "one.json", { type: "application/json" }),
      new File(["hello"], "two.txt", { type: "text/plain" }),
    ];

    expect(
      resolvePromptKitTextTemplate(
        [
          "{{action.id}}",
          "{{action.label}}",
          "{{files.count}}",
          "{{files[0].name}}",
          "{{files[0].type}}",
          "{{files[1].size}}",
          "{{indicator.id}}",
          "{{indicator.label}}",
        ].join("|"),
        {
          action: { id: "inspect", label: "Inspect files" },
          files,
          indicator: { id: "sync", label: "Sync" },
        },
      ),
    ).toBe("inspect|Inspect files|2|one.json|application/json|5|sync|Sync");
  });

  it("uses safe empty values when an optional context is unavailable", () => {
    expect(
      resolvePromptKitTextTemplate(
        "{{action.id}}|{{action.label}}|{{files.count}}|{{files[4].name}}|{{indicator.id}}|{{indicator.label}}|{{error.message}}|{{payload}}",
        {},
      ),
    ).toBe("|||||||");

    expect(
      resolvePromptKitTextTemplate("{{action.label}}", { action: { id: "fallback-id" } }),
    ).toBe("fallback-id");
  });

  it("serializes manual payload primitives, strings and objects", () => {
    expect(resolvePromptKitTextTemplate("{{payload}}", { payload: "hello" })).toBe("hello");
    expect(resolvePromptKitTextTemplate("{{payload}}", { payload: 42 })).toBe("42");
    expect(resolvePromptKitTextTemplate("{{payload}}", { payload: false })).toBe("false");
    expect(resolvePromptKitTextTemplate("{{payload}}", { payload: null })).toBe("null");
    expect(resolvePromptKitTextTemplate("{{payload}}", { payload: { id: 7 } })).toBe('{"id":7}');
  });

  it("normalizes Error, non-Error and circular payload fallbacks", () => {
    expect(resolvePromptKitTextTemplate("{{error.message}}", { error: new Error("boom") })).toBe("boom");
    expect(resolvePromptKitTextTemplate("{{error.message}}", { error: "plain failure" })).toBe("plain failure");

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(resolvePromptKitTextTemplate("{{payload}}", { payload: circular })).toBe("[object Object]");
  });

  it("resolves templates recursively through snapshots without changing non-string values", () => {
    const template: PromptKitSnapshot = {
      blocks: [
        { type: "text", text: "file {{files[0].name}}" },
        {
          type: "table",
          columns: ["Action", "Bytes"],
          rows: [["{{action.id}}", "{{files[0].size}}"]],
        },
      ],
      state: { active: true, count: 3, missing: null },
      themeVariant: "{{action.id}}",
      clear: false,
    };

    expect(
      resolvePromptKitSnapshotTemplate(template, {
        action: { id: "import" },
        files: [new File(["abc"], "config.json")],
      }),
    ).toEqual({
      blocks: [
        { type: "text", text: "file config.json" },
        {
          type: "table",
          columns: ["Action", "Bytes"],
          rows: [["import", "3"]],
        },
      ],
      state: { active: true, count: 3, missing: null },
      themeVariant: "import",
      clear: false,
    });
  });

  it("rejects unsupported direct tokens and invalid resolved snapshots", () => {
    expect(() => resolvePromptKitTextTemplate("{{unknown.value}}", {})).toThrow("unsupported");

    const invalid = { blocks: [{ type: "missing" }] } as unknown as PromptKitSnapshot;
    expect(() => resolvePromptKitSnapshotTemplate(invalid, {})).toThrow("invalid snapshot");
  });
});
