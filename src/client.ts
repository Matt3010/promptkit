import {
  isPromptKitCommandResponse,
  isPromptKitEvent,
  isPromptKitManifest,
  isPromptKitSnapshot,
  type PromptKitBootstrapSource,
  type PromptKitCommandResponse,
  type PromptKitEvent,
  type PromptKitEventSource,
  type PromptKitManifest,
  type PromptKitSnapshot,
} from "./protocol.js";

export interface PromptKitClientOptions {
  baseUrl?: string;
  manifestPath?: string;
  commandPath?: string;
  fetch?: typeof fetch;
  eventSourceFactory?: (url: string) => EventSource;
}

export class PromptKitProtocolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PromptKitProtocolError";
  }
}

export class PromptKitClient {
  readonly #baseUrl: string;
  readonly #manifestPath: string;
  readonly #commandPath: string;
  readonly #fetch: typeof fetch;
  readonly #eventSourceFactory: (url: string) => EventSource;

  public constructor(options: PromptKitClientOptions = {}) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? "");
    this.#manifestPath = options.manifestPath ?? "/tui/manifest";
    this.#commandPath = options.commandPath ?? "/tui/command";
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#eventSourceFactory = options.eventSourceFactory ?? ((url) => new EventSource(url));
  }

  public async manifest(signal?: AbortSignal): Promise<PromptKitManifest> {
    const value = await this.#json(this.#manifestPath, withSignal({ method: "GET" }, signal));
    if (!isPromptKitManifest(value)) {
      throw new PromptKitProtocolError("invalid PromptKit manifest");
    }
    return value;
  }

  public async bootstrap(source: PromptKitBootstrapSource, signal?: AbortSignal): Promise<PromptKitSnapshot> {
    const value = await this.#json(source.url, withSignal({ method: "GET" }, signal));
    if (!isPromptKitSnapshot(value)) throw new PromptKitProtocolError("invalid PromptKit bootstrap snapshot");
    return value;
  }

  public async command(input: string, signal?: AbortSignal): Promise<PromptKitCommandResponse> {
    const value = await this.#json(
      this.#commandPath,
      withSignal(
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input }),
        },
        signal,
      ),
    );
    if (!isPromptKitCommandResponse(value)) {
      throw new PromptKitProtocolError("invalid PromptKit command response");
    }
    return value;
  }

  /** Open the manifest event channel. A string remains supported and means SSE. */
  public events(
    source: string | PromptKitEventSource,
    onEvent: (event: PromptKitEvent) => void,
    onError?: (event: Event) => void,
  ): () => void {
    const config: PromptKitEventSource = typeof source === "string" ? { url: source } : source;
    if (config.transport !== undefined && config.transport !== "sse") {
      throw new PromptKitProtocolError(`unsupported PromptKit event transport: ${String(config.transport)}`);
    }

    const eventSource = this.#eventSourceFactory(this.#url(config.url));
    const listener = (message: MessageEvent<string>): void => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(message.data);
      } catch {
        return;
      }
      if (isPromptKitEvent(decoded)) onEvent(decoded);
    };

    eventSource.addEventListener("message", listener as EventListener);
    if (onError) eventSource.addEventListener("error", onError);

    return () => eventSource.close();
  }

  async #json(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.#fetch(this.#url(path), init);
    const value: unknown = await response.json().catch(() => {
      throw new PromptKitProtocolError(`PromptKit endpoint returned non-JSON (${response.status})`);
    });

    if (!response.ok) {
      const detail = extractError(value);
      throw new PromptKitProtocolError(detail ?? `PromptKit endpoint failed with HTTP ${response.status}`);
    }
    return value;
  }

  #url(path: string): string {
    if (/^https?:\/\//u.test(path)) return path;
    if (!this.#baseUrl) return path;
    return `${this.#baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }
}

function withSignal(init: RequestInit, signal: AbortSignal | undefined): RequestInit {
  if (signal) init.signal = signal;
  return init;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).error;
  return typeof candidate === "string" ? candidate : null;
}
