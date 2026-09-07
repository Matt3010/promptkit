import type {
  PromptKitActionDefinition,
  PromptKitBlock,
  PromptKitIndicator,
  PromptKitState,
} from "./protocol.js";

export type PromptKitActionContext =
  | { trigger: "drop"; files: File[] }
  | { trigger: "indicator"; indicator: PromptKitIndicator }
  | { trigger: "manual"; payload?: unknown };

export interface PromptKitActionResult {
  blocks?: PromptKitBlock[];
  state?: PromptKitState;
  themeVariant?: string | null;
  indicators?: PromptKitIndicator[];
  clear?: boolean;
}

export type PromptKitActionHandler = (
  context: PromptKitActionContext,
) => void | PromptKitActionResult | Promise<void | PromptKitActionResult>;

export interface PromptKitActionsOptions {
  root: HTMLElement;
  document: Document;
  screen: HTMLElement;
  line: HTMLElement;
  handlers?: Record<string, PromptKitActionHandler> | undefined;
  applyResult: (result: PromptKitActionResult) => void;
}

interface DropCandidate {
  definition: PromptKitActionDefinition;
}

export class PromptKitActions {
  readonly #root: HTMLElement;
  readonly #document: Document;
  readonly #screen: HTMLElement;
  readonly #line: HTMLElement;
  readonly #handlers: Record<string, PromptKitActionHandler>;
  readonly #applyResult: (result: PromptKitActionResult) => void;
  readonly #indicators: HTMLDivElement;

  #definitions: PromptKitActionDefinition[] = [];
  #chooser: HTMLDivElement | null = null;
  #destroyed = false;

  public constructor(options: PromptKitActionsOptions) {
    this.#root = options.root;
    this.#document = options.document;
    this.#screen = options.screen;
    this.#line = options.line;
    this.#handlers = options.handlers ?? {};
    this.#applyResult = options.applyResult;

    this.#indicators = this.#document.createElement("div");
    this.#indicators.className = "pk-indicators";
    this.#indicators.setAttribute("aria-label", "status indicators");
    this.#root.append(this.#indicators);

    this.#document.addEventListener("dragover", this.#onDragOver);
    this.#document.addEventListener("dragleave", this.#onDragLeave);
    this.#document.addEventListener("drop", this.#onDrop);
  }

  public configure(definitions: PromptKitActionDefinition[]): void {
    this.#assertAlive();
    this.#definitions = [...definitions];
  }

  public setIndicators(indicators: PromptKitIndicator[]): void {
    this.#assertAlive();
    this.#indicators.replaceChildren();

    for (const indicator of indicators) {
      if (indicator.active === false) continue;
      const actionId = indicator.action;
      const actionable = actionId !== undefined && this.#handlers[actionId] !== undefined;
      const element = actionable
        ? this.#document.createElement("button")
        : this.#document.createElement("span");
      element.className = `pk-indicator pk-tone-${indicator.tone ?? "primary"}`;
      element.dataset.indicator = indicator.id;
      if (indicator.pulse === true) element.classList.add("pk-indicator-pulse");
      element.textContent = `[${indicator.label}]`;

      if (element instanceof HTMLButtonElement && actionId !== undefined) {
        element.type = "button";
        element.dataset.action = actionId;
        element.addEventListener("click", () => {
          void this.run(actionId, { trigger: "indicator", indicator });
        });
      }

      this.#indicators.append(element);
    }
  }

  public async run(id: string, context: PromptKitActionContext = { trigger: "manual" }): Promise<void> {
    this.#assertAlive();
    const handler = this.#handlers[id];
    if (!handler) throw new Error(`PromptKit action handler not found: ${id}`);

    try {
      const result = await handler(context);
      if (result) this.#applyResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#applyResult({ blocks: [{ type: "text", text: message, tone: "danger" }] });
    }
  }

  public destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#document.removeEventListener("dragover", this.#onDragOver);
    this.#document.removeEventListener("dragleave", this.#onDragLeave);
    this.#document.removeEventListener("drop", this.#onDrop);
    this.#chooser?.remove();
    this.#chooser = null;
    this.#indicators.remove();
    delete this.#root.dataset.dragging;
  }

  #dropCandidates(files: File[]): DropCandidate[] {
    return this.#definitions.flatMap((definition) => {
      if (!this.#handlers[definition.id]) return [];
      const candidates: DropCandidate[] = [];
      for (const trigger of definition.triggers ?? []) {
        if (trigger.type !== "drop") continue;
        if (!(trigger.multiple ?? false) && files.length > 1) continue;
        if (!files.every((file) => matchesAccept(file, trigger.accept ?? []))) continue;
        candidates.push({ definition });
      }
      return candidates;
    });
  }

  #hasDropActions(): boolean {
    return this.#definitions.some(
      (definition) =>
        this.#handlers[definition.id] !== undefined &&
        (definition.triggers ?? []).some((trigger) => trigger.type === "drop"),
    );
  }

  #showChooser(candidates: DropCandidate[], files: File[]): void {
    this.#chooser?.remove();
    const chooser = this.#document.createElement("div");
    chooser.className = "pk-action-chooser";

    const label = this.#document.createElement("span");
    label.className = "pk-action-chooser-label";
    label.textContent = files.length === 1 ? `file: ${files[0]?.name ?? ""}` : `${files.length} files`;
    chooser.append(label);

    for (const candidate of candidates) {
      const button = this.#document.createElement("button");
      button.type = "button";
      button.className = `pk-action-choice pk-tone-${candidate.definition.tone ?? "primary"}`;
      button.textContent = `[${candidate.definition.label ?? candidate.definition.id}]`;
      button.dataset.action = candidate.definition.id;
      button.addEventListener("click", () => {
        chooser.remove();
        if (this.#chooser === chooser) this.#chooser = null;
        void this.run(candidate.definition.id, { trigger: "drop", files });
      });
      chooser.append(button);
    }

    this.#chooser = chooser;
    this.#screen.insertBefore(chooser, this.#line);
    this.#screen.scrollTop = this.#screen.scrollHeight;
  }

  #onDragOver = (event: DragEvent): void => {
    if (!this.#hasDropActions()) return;
    event.preventDefault();
    this.#root.dataset.dragging = "true";
  };

  #onDragLeave = (): void => {
    delete this.#root.dataset.dragging;
  };

  #onDrop = (event: DragEvent): void => {
    if (!this.#hasDropActions()) return;
    event.preventDefault();
    delete this.#root.dataset.dragging;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    const candidates = this.#dropCandidates(files);
    if (candidates.length === 0) {
      this.#applyResult({
        blocks: [{ type: "text", text: "nessuna azione disponibile per i file selezionati", tone: "warning" }],
      });
      return;
    }
    if (candidates.length === 1) {
      void this.run(candidates[0]?.definition.id ?? "", { trigger: "drop", files });
      return;
    }
    this.#showChooser(candidates, files);
  };

  #assertAlive(): void {
    if (this.#destroyed) throw new Error("PromptKit actions have been destroyed");
  }
}

function matchesAccept(file: File, accept: string[]): boolean {
  if (accept.length === 0) return true;
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  return accept.some((raw) => {
    const rule = raw.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return mime.startsWith(rule.slice(0, -1));
    if (rule.includes("/")) return mime === rule;
    return name === rule;
  });
}
