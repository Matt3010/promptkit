import type { PromptKitBlock, PromptKitTone, PromptKitTheme } from "./protocol.js";

export interface PromptKitRendererOptions {
  document?: Document;
  onDownload?: (filename: string, content: string, mediaType: string) => void;
}

export class PromptKitRenderer {
  readonly #document: Document;
  readonly #onDownload: (filename: string, content: string, mediaType: string) => void;

  public constructor(options: PromptKitRendererOptions = {}) {
    this.#document = options.document ?? document;
    this.#onDownload = options.onDownload ?? ((filename, content, mediaType) => download(this.#document, filename, content, mediaType));
  }

  public applyTheme(element: HTMLElement, theme: PromptKitTheme | undefined): void {
    if (!theme) return;
    const values: Array<[keyof PromptKitTheme, string]> = [
      ["accent", "--pk-accent"],
      ["accentMuted", "--pk-accent-muted"],
      ["background", "--pk-background"],
      ["foreground", "--pk-foreground"],
      ["muted", "--pk-muted"],
      ["danger", "--pk-danger"],
      ["warning", "--pk-warning"],
      ["success", "--pk-success"],
      ["info", "--pk-info"],
      ["special", "--pk-special"],
    ];
    for (const [key, variable] of values) {
      const value = theme[key];
      if (value !== undefined) element.style.setProperty(variable, value);
    }
  }

  public render(block: PromptKitBlock): HTMLElement {
    switch (block.type) {
      case "text":
        return this.#text(block.text, block.tone);
      case "table":
        return this.#table(block.columns ?? [], block.rows, block.tone);
      case "code":
        return this.#code(block.code, block.language, block.tone);
      case "status":
        return this.#status(block.label, block.value, block.tone);
      case "progress":
        return this.#progress(block.label, block.value, block.max ?? 100, block.tone);
      case "download":
        return this.#download(block.label, block.filename, block.content, block.mediaType ?? "application/octet-stream");
      case "separator":
        return this.#separator();
    }
  }

  public renderAll(blocks: PromptKitBlock[]): DocumentFragment {
    const fragment = this.#document.createDocumentFragment();
    for (const block of blocks) fragment.append(this.render(block));
    return fragment;
  }

  #text(text: string, tone: PromptKitTone | undefined): HTMLElement {
    const element = this.#document.createElement("div");
    element.className = classes("pk-block", "pk-text", toneClass(tone));
    element.textContent = text;
    return element;
  }

  #table(columns: string[], rows: string[][], tone: PromptKitTone | undefined): HTMLElement {
    const wrapper = this.#document.createElement("div");
    wrapper.className = classes("pk-block", "pk-table-wrap", toneClass(tone));

    const table = this.#document.createElement("table");
    table.className = "pk-table";
    const columnCount = Math.max(1, columns.length, ...rows.map((row) => row.length));

    if (columns.length > 0) {
      const head = this.#document.createElement("thead");
      const row = this.#document.createElement("tr");
      for (const column of columns) {
        const cell = this.#document.createElement("th");
        cell.scope = "col";
        cell.textContent = column;
        row.append(cell);
      }
      head.append(row);
      table.append(head);
    }

    const body = this.#document.createElement("tbody");
    for (const values of rows) {
      const row = this.#document.createElement("tr");
      for (const value of values) {
        const cell = this.#document.createElement("td");
        if (values.length === 1 && columnCount > 1) cell.colSpan = columnCount;
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    wrapper.append(table);
    return wrapper;
  }

  #code(code: string, language: string | undefined, tone: PromptKitTone | undefined): HTMLElement {
    const pre = this.#document.createElement("pre");
    pre.className = classes("pk-block", "pk-code", toneClass(tone));
    const child = this.#document.createElement("code");
    if (language) child.dataset.language = language;
    child.textContent = code;
    pre.append(child);
    return pre;
  }

  #status(label: string, value: string, tone: PromptKitTone | undefined): HTMLElement {
    const element = this.#document.createElement("div");
    element.className = classes("pk-block", "pk-status", toneClass(tone));
    const key = this.#document.createElement("span");
    key.className = "pk-status-label";
    key.textContent = label;
    const content = this.#document.createElement("span");
    content.className = "pk-status-value";
    content.textContent = value;
    element.append(key, content);
    return element;
  }

  #progress(label: string | undefined, value: number, max: number, tone: PromptKitTone | undefined): HTMLElement {
    const element = this.#document.createElement("div");
    element.className = classes("pk-block", "pk-progress", toneClass(tone));
    if (label) {
      const title = this.#document.createElement("div");
      title.className = "pk-progress-label";
      title.textContent = label;
      element.append(title);
    }

    const progress = this.#document.createElement("progress");
    progress.max = max > 0 ? max : 1;
    progress.value = Math.min(Math.max(value, 0), progress.max);
    progress.setAttribute("aria-label", label ?? "progress");
    element.append(progress);
    return element;
  }

  #download(label: string, filename: string, content: string, mediaType: string): HTMLElement {
    const button = this.#document.createElement("button");
    button.type = "button";
    button.className = "pk-block pk-download";
    button.textContent = label;
    button.addEventListener("click", () => this.#onDownload(filename, content, mediaType));
    return button;
  }

  #separator(): HTMLElement {
    const element = this.#document.createElement("hr");
    element.className = "pk-block pk-separator";
    return element;
  }
}

function toneClass(tone: PromptKitTone | undefined): string | undefined {
  return tone ? `pk-tone-${tone}` : undefined;
}

function classes(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => value !== undefined).join(" ");
}

function download(documentRef: Document, filename: string, content: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mediaType }));
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
