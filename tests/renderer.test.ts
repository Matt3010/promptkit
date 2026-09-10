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

  it("spans single-cell table rows across the widest row", () => {
    const renderer = new PromptKitRenderer({ document });
    const table = renderer.render({
      type: "table",
      rows: [["commands:"], ["/status", "show status", "extra"]],
    });

    const rows = table.querySelectorAll("tbody tr");
    const title = rows[0]?.querySelector("td") as HTMLTableCellElement;
    expect(title.textContent).toBe("commands:");
    expect(title.colSpan).toBe(3);
    expect(rows[1]?.querySelectorAll("td")).toHaveLength(3);
  });

  it("renders a link as an anchor that cannot reach back through the opener", () => {
    const renderer = new PromptKitRenderer({ document });
    const anchor = renderer.render({
      type: "link",
      label: "open the market",
      href: "https://example.com/market/1.24",
    }) as HTMLAnchorElement;

    expect(anchor.tagName).toBe("A");
    expect(anchor.className).toContain("pk-link");
    expect(anchor.textContent).toBe("open the market");
    expect(anchor.getAttribute("href")).toBe("https://example.com/market/1.24");
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
  });

  it("applies a tone class to a link", () => {
    const renderer = new PromptKitRenderer({ document });
    const anchor = renderer.render({
      type: "link",
      label: "docs",
      href: "https://example.com",
      tone: "info",
    });

    expect(anchor.className).toContain("pk-tone-info");
  });

  it("keeps a link addressable for in-place replacement", () => {
    const renderer = new PromptKitRenderer({ document });
    const anchor = renderer.render({
      type: "link",
      id: "market",
      update: "replace",
      label: "docs",
      href: "https://example.com",
    });

    expect(anchor.dataset.pkBlockId).toBe("market");
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

  it("merges variants over defaults and resets stale variant values", () => {
    const renderer = new PromptKitRenderer({ document });
    const host = document.createElement("div");
    const theme = {
      default: { accent: "#fff", accentMuted: "#aaa", danger: "#f00" },
      variants: {
        warm: { accent: "#f90", warning: "#fc0" },
        cool: { accent: "#09f" },
      },
    };

    expect(renderer.applyTheme(host, theme, "warm")).toBe("warm");
    expect(host.style.getPropertyValue("--pk-accent")).toBe("#f90");
    expect(host.style.getPropertyValue("--pk-accent-muted")).toBe("#aaa");
    expect(host.style.getPropertyValue("--pk-warning")).toBe("#fc0");

    expect(renderer.applyTheme(host, theme, "cool")).toBe("cool");
    expect(host.style.getPropertyValue("--pk-accent")).toBe("#09f");
    expect(host.style.getPropertyValue("--pk-warning")).toBe("");
    expect(host.style.getPropertyValue("--pk-danger")).toBe("#f00");

    expect(renderer.applyTheme(host, theme, "missing")).toBeNull();
    expect(host.style.getPropertyValue("--pk-accent")).toBe("#fff");
    expect(host.style.getPropertyValue("--pk-warning")).toBe("");

    expect(renderer.applyTheme(host, undefined)).toBeNull();
    expect(host.style.getPropertyValue("--pk-accent")).toBe("");
    expect(host.style.getPropertyValue("--pk-danger")).toBe("");
  });
});
