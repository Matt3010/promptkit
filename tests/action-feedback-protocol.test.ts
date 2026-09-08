import { describe, expect, it } from "vitest";
import { isPromptKitManifest } from "../src/protocol.js";

describe("PromptKit declarative action feedback protocol", () => {
  it("accepts typed action feedback and generic action UI templates", () => {
    expect(
      isPromptKitManifest({
        name: "example",
        actions: [
          {
            id: "import",
            label: "import config",
            triggers: [{ type: "drop", accept: [".json"] }],
            feedback: {
              before: {
                blocks: [
                  {
                    type: "text",
                    text: "importing {{files[0].name}} with {{action.label}}",
                    tone: "secondary",
                  },
                ],
              },
              error: {
                blocks: [
                  {
                    type: "text",
                    text: "failed: {{error.message}}",
                    tone: "danger",
                  },
                ],
              },
            },
          },
        ],
        actionUi: {
          chooserLabel: "choose for {{files.count}} files",
          noMatch: {
            blocks: [
              {
                type: "text",
                text: "unsupported: {{files[0].name}}",
                tone: "warning",
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts every supported context placeholder", () => {
    expect(
      isPromptKitManifest({
        name: "example",
        actions: [
          {
            id: "inspect",
            feedback: {
              before: {
                blocks: [
                  {
                    type: "text",
                    text: [
                      "{{action.id}}",
                      "{{action.label}}",
                      "{{files.count}}",
                      "{{files[0].name}}",
                      "{{files[1].type}}",
                      "{{files[2].size}}",
                      "{{indicator.id}}",
                      "{{indicator.label}}",
                      "{{payload}}",
                    ].join(" "),
                  },
                ],
              },
              error: {
                blocks: [{ type: "text", text: "{{error.message}}" }],
              },
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects unknown, malformed and legacy echo templates", () => {
    expect(
      isPromptKitManifest({
        name: "x",
        actions: [{ id: "a", feedback: { before: "yes" } }],
      }),
    ).toBe(false);
    expect(
      isPromptKitManifest({
        name: "x",
        actions: [
          {
            id: "a",
            feedback: {
              before: { blocks: [{ type: "text", text: "{{unknown.value}}" }] },
            },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isPromptKitManifest({
        name: "x",
        actionUi: { chooserLabel: "{{files[0].missing}}" },
      }),
    ).toBe(false);
    expect(
      isPromptKitManifest({
        name: "x",
        actionUi: { chooserLabel: "broken {{files.count" },
      }),
    ).toBe(false);
    expect(
      isPromptKitManifest({
        name: "x",
        actions: [{ id: "a", echo: { type: "drop-files" } }],
      }),
    ).toBe(false);
  });
});
