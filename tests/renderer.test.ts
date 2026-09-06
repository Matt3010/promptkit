import { describe, expect, it, vi } from "vitest";
import { PromptKitRenderer } from "../src/renderer.js";

describe("PromptKitRenderer", () => {
  it("renders text, tables, code, status, progress and separators", () => {
    const renderer = new PromptKitRenderer({ document });
    const fragment = renderer.renderAll([
      { type: "text", text: "hello", tone: "primary" },
      { type: "table", columns: ["name", "state"], rows: [["db", "ok"]] },
      { type: "code", code: "{\"ok\":true}", language: "json" },
      { type: "status", label: "api", value: "healthy", tone: "success" },
      { type: "progress", label: "import", value: 7, max: 10 },
      { type: "separator" },
    ]);

    const host = document.createElement("div");
    host.append(fragment);

    expect(host.querySelector(".pk-text")?.textContent).toBe("hello");
    expect(host.querySelector("table")?.textContent).toContain("db");
    expect(host.querySelector("code")?.dataset.language).toBe("json");
    expect(host.querySelector(".pk-status")?.textContent).toContain("healthy");
    expect((host.querySelector("progress") as HTMLProgressElement).value).toBe(7);
    expect(host.querySelector("hr.pk-separator")).not.toBeNull();
  });

  it("renders downloads through the injected handler", () => {
    const onDownload = vi.fn();
    const renderer = new PromptKitRenderer({ document, onDownload });
    const button = renderer.render({
      type: "download",
      label: "download",
      filename: "data.json",
      content: "{}",
      mediaType: "application/json",
    });

    button.click();
    expect(onDownload).toHaveBeenCalledWith("data.json", "{}", "application/json");
  });

  it("applies only supplied theme variables", () => {
    const renderer = new PromptKitRenderer({ document });
    const host = document.createElement("div");
    renderer.applyTheme(host, { accent: "#fff", danger: "#f00" });

    expect(host.style.getPropertyValue("--pk-accent")).toBe("#fff");
    expect(host.style.getPropertyValue("--pk-danger")).toBe("#f00");
    expect(host.style.getPropertyValue("--pk-background")).toBe("");
  });
});
