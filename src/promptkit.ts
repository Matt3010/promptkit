import { PromptKitClient, type PromptKitClientOptions } from "./client.js";
import type { PromptKitBlock, PromptKitManifest } from "./protocol.js";
import { PromptKitRenderer, type PromptKitRendererOptions } from "./renderer.js";

export type PromptKitFocusScope = "screen" | "document";
export type PromptKitPhase = "loading" | "ready" | "failed";

export interface PromptKitLoadingOptions {
  label?: string;
  text?: string;
}

export interface PromptKitOptions {
  root: HTMLElement;
  client?: PromptKitClient;
  clientOptions?: PromptKitClientOptions;
  renderer?: PromptKitRenderer;
  rendererOptions?: PromptKitRendererOptions;
  loading?: PromptKitLoadingOptions;
  focusScope?: PromptKitFocusScope;
}

export class PromptKit {
  readonly #root: HTMLElement;
  readonly #client: PromptKitClient;
  readonly #renderer: PromptKitRenderer;
  readonly #history: string[] = [];
  readonly #pendingBlocks: PromptKitBlock[] = [];
  readonly #document: Document;
  readonly #screen: HTMLDivElement;
  readonly #loading: HTMLDivElement;
  readonly #loadingSpinner: HTMLSpanElement;
  readonly #loadingText: HTMLSpanElement;
  readonly #input: HTMLInputElement;
  readonly #prompt: HTMLSpanElement;
  readonly #suggestion: HTMLSpanElement;
  readonly #measure: HTMLSpanElement;
  readonly #line: HTMLDivElement;
  readonly #focusScope: PromptKitFocusScope;
  readonly #visualViewport: VisualViewport | null;

  #manifest: PromptKitManifest | null = null;
  #historyIndex = 0;
  #closeEvents: (() => void) | null = null;
  #started = false;
  #phase: PromptKitPhase = "loading";
  #destroyed = false;

  public constructor(options: PromptKitOptions) {
    this.#root = options.root;
    this.#document = this.#root.ownerDocument;
    this.#client = options.client ?? new PromptKitClient(options.clientOptions);
    this.#renderer = options.renderer ?? new PromptKitRenderer({ document: this.#document, ...options.rendererOptions });
    this.#focusScope = options.focusScope ?? "document";
    this.#visualViewport = this.#document.defaultView?.visualViewport ?? null;

    this.#root.classList.add("promptkit");
    this.#root.replaceChildren();
    this.#root.dataset.phase = this.#phase;

    this.#screen = this.#document.createElement("div");
    this.#screen.className = "pk-screen";
    this.#screen.setAttribute("role", "log");
    this.#screen.setAttribute("aria-live", "polite");

    this.#loading = this.#document.createElement("div");
    this.#loading.className = "pk-loading";
    const loadingLabel = this.#document.createElement("span");
    loadingLabel.className = "pk-loading-label";
    loadingLabel.textContent = options.loading?.label ?? "PromptKit";
    this.#loadingSpinner = this.#document.createElement("span");
    this.#loadingSpinner.className = "pk-loading-spinner";
    this.#loadingSpinner.setAttribute("aria-hidden", "true");
    const spinnerTrack = this.#document.createElement("span");
    spinnerTrack.className = "pk-loading-spinner-track";
    spinnerTrack.textContent = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    this.#loadingSpinner.append(spinnerTrack);
    this.#loadingText = this.#document.createElement("span");
    this.#loadingText.className = "pk-loading-text";
    this.#loadingText.textContent = options.loading?.text ?? "loading";
    this.#loading.append(loadingLabel, this.#loadingSpinner, this.#loadingText);

    this.#line = this.#document.createElement("div");
    this.#line.className = "pk-line";
    this.#line.hidden = true;

    this.#prompt = this.#document.createElement("span");
    this.#prompt.className = "pk-prompt";
    this.#prompt.textContent = ">";

    this.#input = this.#document.createElement("input");
    this.#input.className = "pk-input";
    this.#input.autocomplete = "off";
    this.#input.autocapitalize = "none";
    this.#input.setAttribute("autocorrect", "off");
    this.#input.spellcheck = false;
    this.#input.enterKeyHint = "send";
    this.#input.disabled = true;
    this.#input.setAttribute("aria-label", "command");

    this.#suggestion = this.#document.createElement("span");
    this.#suggestion.className = "pk-suggestion";
    this.#suggestion.setAttribute("aria-hidden", "true");

    this.#measure = this.#document.createElement("span");
    this.#measure.className = "pk-measure";
    this.#measure.setAttribute("aria-hidden", "true");

    this.#line.append(this.#prompt, this.#input, this.#suggestion, this.#measure);
    this.#screen.append(this.#loading, this.#line);
    this.#root.append(this.#screen);

    this.#input.addEventListener("keydown", this.#onKeyDown);
    this.#input.addEventListener("keyup", this.#refreshSuggestion);
    this.#input.addEventListener("input", this.#refreshSuggestion);
    this.#input.addEventListener("click", this.#refreshSuggestion);
    this.#input.addEventListener("focus", this.#onInputFocus);
    this.#focusTarget().addEventListener("click", this.#focusFromSurface);
    this.#visualViewport?.addEventListener("resize", this.#onViewportResize);
  }

  public get phase(): PromptKitPhase {
    return this.#phase;
  }

  /** Load the manifest and optional event stream. The terminal remains in loading state until ready() is called. */
  public async start(): Promise<void> {
    this.#assertAlive();
    if (this.#started) throw new Error("PromptKit start() can only be called once");
    this.#started = true;

    try {
      const manifest = await this.#client.manifest();
      if (this.#destroyed) return;

      this.#manifest = manifest;
      this.#prompt.textContent = manifest.prompt ?? ">";
      this.#renderer.applyTheme(this.#root, manifest.theme);
      this.#refreshSuggestion();

      if (manifest.events) {
        this.#closeEvents = this.#client.events(
          manifest.events.url,
          (event) => {
            if (event.themeVariant !== undefined) this.setThemeVariant(event.themeVariant);
            if (event.state) this.#applyState(event.state);
            if (event.blocks) this.write(event.blocks);
          },
          () => this.#root.dataset.connection = "degraded",
        );
        this.#root.dataset.connection = "connected";
      }
    } catch (error) {
      if (!this.#destroyed) this.fail(error);
      throw error;
    }
  }

  /** Complete host initialization, replace the loader with the terminal banner and enable input. */
  public ready(): void {
    this.#assertAlive();
    if (!this.#started || this.#manifest === null) throw new Error("PromptKit must finish start() before ready()");
    if (this.#phase === "failed") throw new Error("PromptKit cannot become ready after fail()");
    if (this.#phase === "ready") return;

    this.#phase = "ready";
    this.#root.dataset.phase = this.#phase;
    this.#loading.remove();
    this.#line.hidden = false;
    this.#input.disabled = false;
    this.#writeBanner(this.#manifest);
    if (this.#pendingBlocks.length > 0) {
      const pending = this.#pendingBlocks.splice(0);
      this.write(pending);
    }
    this.#input.focus();
  }

  /** End initialization with a visible terminal-style error instead of leaving an endless loader. */
  public fail(error: unknown): void {
    this.#assertAlive();
    if (this.#phase === "ready") throw new Error("PromptKit fail() is only valid before ready()");
    this.#phase = "failed";
    this.#root.dataset.phase = this.#phase;
    this.#input.disabled = true;
    this.#line.hidden = true;
    this.#loading.classList.add("pk-loading-failed");
    this.#loadingSpinner.hidden = true;
    this.#loadingText.textContent = error instanceof Error ? error.message : String(error);
  }

  /** Apply a named manifest theme variant. Null or an unknown name returns to the default theme. */
  public setThemeVariant(variant: string | null): void {
    this.#assertAlive();
    if (this.#manifest === null) throw new Error("PromptKit theme is unavailable before start() finishes");
    const applied = this.#renderer.applyTheme(this.#root, this.#manifest.theme, variant);
    if (applied === null) delete this.#root.dataset.themeVariant;
    else this.#root.dataset.themeVariant = applied;
  }

  public write(blocks: PromptKitBlock[]): void {
    this.#assertAlive();
    if (blocks.length === 0) return;
    if (this.#phase !== "ready") {
      this.#pendingBlocks.push(...blocks);
      return;
    }
    const pinned = this.#isPinnedToBottom();
    this.#screen.insertBefore(this.#renderer.renderAll(blocks), this.#line);
    if (pinned) this.#scrollToBottom();
  }

  public clear(): void {
    this.#assertAlive();
    this.#pendingBlocks.length = 0;
    if (this.#phase !== "ready") return;
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
    this.#input.removeEventListener("keyup", this.#refreshSuggestion);
    this.#input.removeEventListener("input", this.#refreshSuggestion);
    this.#input.removeEventListener("click", this.#refreshSuggestion);
    this.#input.removeEventListener("focus", this.#onInputFocus);
    this.#focusTarget().removeEventListener("click", this.#focusFromSurface);
    this.#visualViewport?.removeEventListener("resize", this.#onViewportResize);
    this.#root.replaceChildren();
    this.#root.classList.remove("promptkit");
    delete this.#root.dataset.phase;
    delete this.#root.dataset.themeVariant;
  }

  async #execute(rawInput: string): Promise<void> {
    if (this.#phase !== "ready" || !rawInput.trim()) return;

    this.#writeEcho(rawInput);
    this.#history.push(rawInput);
    this.#historyIndex = this.#history.length;
    this.#input.value = "";
    this.#refreshSuggestion();

    try {
      const response = await this.#client.command(rawInput);
      if (this.#destroyed) return;
      if (response.themeVariant !== undefined) this.setThemeVariant(response.themeVariant);
      if (response.clear === true) this.clear();
      this.write(response.blocks);
      if (response.state) this.#applyState(response.state);
    } catch (error) {
      if (this.#destroyed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.write([{ type: "text", text: message, tone: "danger" }]);
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
    if (this.#phase !== "ready") return;
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

  #focusTarget(): HTMLDivElement | Document {
    return this.#focusScope === "document" ? this.#document : this.#screen;
  }

  #focusFromSurface = (event: Event): void => {
    if (this.#phase !== "ready") return;
    const selection = this.#document.getSelection();
    if (selection && !selection.isCollapsed) return;
    if (event.target === this.#input) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
    this.#input.focus();
  };

  #onViewportResize = (): void => {
    if (this.#phase === "ready" && this.#document.activeElement === this.#input) {
      this.#line.scrollIntoView({ block: "end" });
    }
  };

  #onInputFocus = (): void => {
    this.#document.defaultView?.setTimeout(() => {
      if (!this.#destroyed && this.#phase === "ready" && this.#document.activeElement === this.#input) {
        this.#line.scrollIntoView({ block: "end" });
      }
    }, 300);
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
