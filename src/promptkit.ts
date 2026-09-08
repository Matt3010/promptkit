import {
  PromptKitActions,
  type PromptKitActionHandler,
  type PromptKitActionResult,
} from "./actions.js";
import { PromptKitClient, type PromptKitClientOptions } from "./client.js";
import type {
  PromptKitBlock,
  PromptKitCommandResponse,
  PromptKitEvent,
  PromptKitIndicator,
  PromptKitManifest,
  PromptKitSnapshot,
  PromptKitState,
} from "./protocol.js";
import { PromptKitRenderer, type PromptKitRendererOptions } from "./renderer.js";

export type PromptKitFocusScope = "screen" | "document";
export type PromptKitPhase = "loading" | "ready" | "failed";
export type PromptKitUpdate = PromptKitActionResult | PromptKitCommandResponse | PromptKitEvent | PromptKitSnapshot;

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
  /** Host-side implementations for action ids declared by the manifest or indicators. */
  actions?: Record<string, PromptKitActionHandler>;
  /** Called after any command, action, event or public apply() update has been applied. */
  onUpdate?: (update: PromptKitUpdate) => void;
}

export class PromptKit {
  readonly #root: HTMLElement;
  readonly #client: PromptKitClient;
  readonly #renderer: PromptKitRenderer;
  readonly #actions: PromptKitActions;
  readonly #history: string[] = [];
  readonly #pendingBlocks: PromptKitBlock[] = [];
  readonly #keyedBlocks = new Map<string, HTMLElement>();
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
  readonly #onUpdate: ((update: PromptKitUpdate) => void) | undefined;

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
    this.#onUpdate = options.onUpdate;

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

    this.#actions = new PromptKitActions({
      root: this.#root,
      document: this.#document,
      screen: this.#screen,
      line: this.#line,
      handlers: options.actions,
      applyResult: (result) => this.#applyUpdate(result),
    });

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

  /** Load manifest, optional bootstrap snapshot, then optional event stream. Remains loading until ready(). */
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
      this.#actions.configure(manifest.actions ?? [], manifest.actionUi);
      this.#refreshSuggestion();

      if (manifest.bootstrap) {
        const snapshot = await this.#client.bootstrap(manifest.bootstrap);
        if (this.#destroyed) return;
        this.#applyUpdate(snapshot);
      }

      if (manifest.events) {
        this.#closeEvents = this.#client.events(
          manifest.events,
          (event) => this.#applyUpdate(event),
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
    if (this.#phase === "failed") throw new Error("PromptKit cannot become ready after fail()");
    if (!this.#started || this.#manifest === null) throw new Error("PromptKit must finish start() before ready()");
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

  /** Replace the complete visible indicator set. */
  public setIndicators(indicators: PromptKitIndicator[]): void {
    this.#assertAlive();
    this.#actions.setIndicators(indicators);
  }

  /** Run an action directly. Manifest triggers and indicators call the same registry. */
  public async runAction(id: string, payload?: unknown): Promise<void> {
    this.#assertAlive();
    if (this.#phase !== "ready") throw new Error("PromptKit actions are only available when ready");
    await this.#actions.run(
      id,
      payload === undefined ? { trigger: "manual" } : { trigger: "manual", payload },
    );
  }

  /** Apply a structured update received from any host-defined source. */
  public apply(update: PromptKitUpdate): void {
    this.#assertAlive();
    this.#applyUpdate(update);
  }

  public write(blocks: PromptKitBlock[]): void {
    this.#assertAlive();
    if (blocks.length === 0) return;
    if (this.#phase !== "ready") {
      for (const block of blocks) this.#queueBlock(block);
      return;
    }

    const pinned = this.#isPinnedToBottom();
    for (const block of blocks) {
      const element = this.#renderer.render(block);
      const existing = block.id && block.update === "replace" ? this.#keyedBlocks.get(block.id) : undefined;
      if (existing?.parentNode === this.#screen) existing.replaceWith(element);
      else this.#screen.insertBefore(element, this.#line);
      if (block.id) this.#keyedBlocks.set(block.id, element);
    }
    if (pinned) this.#scrollToBottom();
  }

  public clear(): void {
    this.#assertAlive();
    this.#pendingBlocks.length = 0;
    this.#keyedBlocks.clear();
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
    this.#actions.destroy();
    this.#keyedBlocks.clear();
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
      this.#applyUpdate(response);
    } catch (error) {
      if (this.#destroyed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.write([{ type: "text", text: message, tone: "danger" }]);
    }
  }

  #applyUpdate(update: PromptKitUpdate): void {
    if (update.themeVariant !== undefined) this.setThemeVariant(update.themeVariant);
    if (update.clear === true) this.clear();
    if (update.blocks) this.write(update.blocks);
    if (update.state) this.#applyState(update.state);
    if (update.indicators) this.setIndicators(update.indicators);
    this.#onUpdate?.(update);
  }

  #queueBlock(block: PromptKitBlock): void {
    if (block.id && block.update === "replace") {
      for (let index = this.#pendingBlocks.length - 1; index >= 0; index -= 1) {
        if (this.#pendingBlocks[index]?.id === block.id) {
          this.#pendingBlocks[index] = block;
          return;
        }
      }
    }
    this.#pendingBlocks.push(block);
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

  #applyState(state: PromptKitState): void {
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
