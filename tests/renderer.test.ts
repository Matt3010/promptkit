import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptKitRenderer } from "../src/renderer.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PromptKitRenderer", () => {
  it("renders text, tables, code, status, progress and separators", () => {
    const renderer = new PromptKitRenderer({ document });
    const fragment = renderer.renderAll([
      { type: "text", text: "hello", tone: "primary" },
      { type: "table", columns: ["name", "state"], rows: [["db", "ok"]] },
      { type: "table", rows: [["plain"]], tone: "secondary" },
      { type: "code", code: "{\"ok\":true}", language: "json" },
      { type: "code", code: "plain" },
      { type: "status", label: "api", value: "healthy", tone: "success" },
      { type: "progress", label: "import", value: 7, max: 10 },
      { type: "progress", value: 150, max: 0, tone: "warning" },
      { type: "separator" },
    ]);

    const host = document.createElement("div");
    host.append(fragment);

    expect(host.querySelector(".pk-text")?.textContent).toBe("hello");
    expect(host.querySelector("table")?.textContent).toContain("db");
    expect(host.querySelector("code")?.dataset.language).toBe("json");
    expect(host.querySelectorAll("code")[1]?.dataset.language).toBeUndefined();
    expect(host.querySelector(".pk-status")?.textContent).toContain("healthy");

    const progresses = host.querySelectorAll("progress");
    expect((progresses[0] as HTMLProgressElement).value).toBe(7);
    expect((progresses[1] as HTMLProgressElement).max).toBe(1);
    expect((progresses[1] as HTMLProgressElement).value).toBe(1);
    expect(progresses[1]?.getAttribute("aria-label")).toBe("progress");
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

  it("supports the default browser download handler", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:promptkit");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const renderer = new PromptKitRenderer({ document });

    const button = renderer.render({
      type: "download",
      label: "save",
      filename: "data.txt",
      content: "hello",
    });
    button.click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:promptkit");
  });

  it("applies only supplied theme variables and accepts an empty theme", () => {
    const renderer = new PromptKitRenderer({ document });
    const host = document.createElement("div");
    renderer.applyTheme(host, undefined);
    renderer.applyTheme(host, { accent: "#fff", danger: "#f00" });

    expect(host.style.getPropertyValue("--pk-accent")).toBe("#fff");
    expect(host.style.getPropertyValue("--pk-danger")).toBe("#f00");
    expect(host.style.getPropertyValue("--pk-background")).toBe("");
  });
});
