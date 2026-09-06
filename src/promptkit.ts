import { PromptKitClient, type PromptKitClientOptions } from "./client.js";
import type { PromptKitBlock, PromptKitManifest } from "./protocol.js";
import { PromptKitRenderer, type PromptKitRendererOptions } from "./renderer.js";

export interface PromptKitOptions {
  root: HTMLElement;
  client?: PromptKitClient;
  clientOptions?: PromptKitClientOptions;
  renderer?: PromptKitRenderer;
  rendererOptions?: PromptKitRendererOptions;
  autofocus?: boolean;
}

export class PromptKit {
  readonly #root: HTMLElement;
  readonly #client: PromptKitClient;
  readonly #renderer: PromptKitRenderer;
  readonly #history: string[] = [];
  readonly #document: Document;
  readonly #screen: HTMLDivElement;
  readonly #input: HTMLInputElement;
  readonly #prompt: HTMLSpanElement;
  readonly #suggestion: HTMLSpanElement;
  readonly #measure: HTMLSpanElement;
  readonly #line: HTMLDivElement;
  readonly #autofocus: boolean;

  #manifest: PromptKitManifest | null = null;
  #historyIndex = 0;
  #closeEvents: (() => void) | null = null;
  #destroyed = false;

  public constructor(options: PromptKitOptions) {
    this.#root = options.root;
    this.#document = this.#root.ownerDocument;
    this.#client = options.client ?? new PromptKitClient(options.clientOptions);
    this.#renderer = options.renderer ?? new PromptKitRenderer({ document: this.#document, ...options.rendererOptions });
    this.#autofocus = options.autofocus ?? true;

    this.#root.classList.add("promptkit");
    this.#root.replaceChildren();

    this.#screen = this.#document.createElement("div");
    this.#screen.className = "pk-screen";
    this.#screen.setAttribute("role", "log");
    this.#screen.setAttribute("aria-live", "polite");

    this.#line = this.#document.createElement("div");
    this.#line.className = "pk-line";

    this.#prompt = this.#document.createElement("span");
    this.#prompt.className = "pk-prompt";
    this.#prompt.textContent = ">";

    this.#input = this.#document.createElement("input");
    this.#input.className = "pk-input";
    this.#input.autocomplete = "off";
    this.#input.autocapitalize = "none";
    this.#input.spellcheck = false;
    this.#input.enterKeyHint = "send";
    this.#input.setAttribute("aria-label", "command");

    this.#suggestion = this.#document.createElement("span");
    this.#suggestion.className = "pk-suggestion";
    this.#suggestion.setAttribute("aria-hidden", "true");

    this.#measure = this.#document.createElement("span");
    this.#measure.className = "pk-measure";
    this.#measure.setAttribute("aria-hidden", "true");

    this.#line.append(this.#prompt, this.#input, this.#suggestion, this.#measure);
    this.#screen.append(this.#line);
    this.#root.append(this.#screen);

    this.#input.addEventListener("keydown", this.#onKeyDown);
    this.#input.addEventListener("input", this.#refreshSuggestion);
    this.#input.addEventListener("click", this.#refreshSuggestion);
    this.#screen.addEventListener("click", this.#focusFromScreen);
  }

  public async start(): Promise<void> {
    this.#assertAlive();
    const manifest = await this.#client.manifest();
    if (this.#destroyed) return;

    this.#manifest = manifest;
    this.#prompt.textContent = manifest.prompt ?? ">";
    this.#renderer.applyTheme(this.#root, manifest.theme);
    this.#writeBanner(manifest);
    this.#refreshSuggestion();

    if (manifest.events) {
      this.#closeEvents = this.#client.events(
        manifest.events.url,
        (event) => {
          if (event.blocks) this.write(event.blocks);
          if (event.state) this.#applyState(event.state);
        },
        () => this.#root.dataset.connection = "degraded",
      );
      this.#root.dataset.connection = "connected";
    }

    if (this.#autofocus) this.#input.focus();
  }

  public write(blocks: PromptKitBlock[]): void {
    this.#assertAlive();
    if (blocks.length === 0) return;
    const pinned = this.#isPinnedToBottom();
    this.#screen.insertBefore(this.#renderer.renderAll(blocks), this.#line);
    if (pinned) this.#scrollToBottom();
  }

  public clear(): void {
    this.#assertAlive();
    while (this.#screen.firstChild && this.#screen.firstChild !== this.#line) {
      this.#screen.firstChild.remove();
    }
    if (this.#manifest) this.#writeBanner(this.#manifest);
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#closeEvents?.();
    this.#closeEvents = null;
    this.#input.removeEventListener("keydown", this.#onKeyDown);
    this.#input.removeEventListener("input", this.#refreshSuggestion);
    this.#input.removeEventListener("click", this.#refreshSuggestion);
    this.#screen.removeEventListener("click", this.#focusFromScreen);
    this.#root.replaceChildren();
    this.#root.classList.remove("promptkit");
  }

  async #execute(rawInput: string): Promise<void> {
    const input = rawInput.trim();
    if (!input) return;

    this.#writeEcho(rawInput);
    this.#history.push(rawInput);
    this.#historyIndex = this.#history.length;
    this.#input.value = "";
    this.#refreshSuggestion();
    this.#input.disabled = true;

    try {
      const response = await this.#client.command(input);
      if (this.#destroyed) return;
      this.write(response.blocks);
      if (response.state) this.#applyState(response.state);
    } catch (error) {
      if (this.#destroyed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.write([{ type: "text", text: message, tone: "danger" }]);
    } finally {
      if (!this.#destroyed) {
        this.#input.disabled = false;
        this.#input.focus();
      }
    }
  }

  #writeBanner(manifest: PromptKitManifest): void {
    this.write([{ type: "text", text: manifest.name, tone: "primary" }]);
    if (manifest.subtitle) this.write([{ type: "text", text: manifest.subtitle, tone: "secondary" }]);
  }

  #writeEcho(input: string): void {
    const element = this.#document.createElement("div");
    element.className = "pk-block pk-echo";
    element.textContent = `${this.#prompt.textContent ?? ">"} ${input}`;
    this.#screen.insertBefore(element, this.#line);
    this.#scrollToBottom();
  }

  #applyState(state: Record<string, string | number | boolean | null>): void {
    for (const [key, value] of Object.entries(state)) {
      const normalized = dataKey(key);
      if (value === null) delete this.#root.dataset[normalized];
      else this.#root.dataset[normalized] = String(value);
    }
  }

  #suggested(): string {
    const value = this.#input.value;
    if (!value || this.#input.selectionStart !== value.length) return "";
    const commands = this.#manifest?.commands ?? [];
    return commands.find((command) => command.startsWith(value) && command !== value) ?? "";
  }

  #complete(): boolean {
    const value = this.#suggested();
    if (!value) return false;
    this.#input.value = value;
    this.#refreshSuggestion();
    return true;
  }

  #refreshSuggestion = (): void => {
    this.#measure.textContent = this.#input.value || " ";
    const measured = Math.max(this.#measure.getBoundingClientRect().width, 8);
    this.#input.style.width = `${Math.ceil(measured)}px`;
    const whole = this.#suggested();
    this.#suggestion.textContent = whole ? whole.slice(this.#input.value.length) : "";
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Tab" || (event.key === "ArrowRight" && this.#suggested())) {
      if (this.#complete()) event.preventDefault();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (this.#historyIndex > 0) {
        this.#historyIndex -= 1;
        this.#input.value = this.#history[this.#historyIndex] ?? "";
        this.#refreshSuggestion();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.#historyIndex < this.#history.length - 1) {
        this.#historyIndex += 1;
        this.#input.value = this.#history[this.#historyIndex] ?? "";
      } else {
        this.#historyIndex = this.#history.length;
        this.#input.value = "";
      }
      this.#refreshSuggestion();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void this.#execute(this.#input.value);
    }
  };

  #focusFromScreen = (event: MouseEvent): void => {
    const selection = this.#document.getSelection();
    if (selection && !selection.isCollapsed) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    this.#input.focus();
  };

  #isPinnedToBottom(): boolean {
    return this.#screen.scrollHeight - this.#screen.scrollTop - this.#screen.clientHeight < 4;
  }

  #scrollToBottom(): void {
    this.#screen.scrollTop = this.#screen.scrollHeight;
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error("PromptKit instance has been destroyed");
  }
}

function dataKey(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_-]/gu, "-")
    .replace(/-([a-z])/gu, (_match, character: string) => character.toUpperCase());
}
