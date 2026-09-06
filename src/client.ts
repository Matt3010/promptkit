import {
  isPromptKitCommandResponse,
  isPromptKitEvent,
  isPromptKitManifest,
  type PromptKitCommandResponse,
  type PromptKitEvent,
  type PromptKitManifest,
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
    const value = await this.#json(this.#manifestPath, { method: "GET", signal });
    if (!isPromptKitManifest(value)) {
      throw new PromptKitProtocolError("invalid PromptKit manifest");
    }
    return value;
  }

  public async command(input: string, signal?: AbortSignal): Promise<PromptKitCommandResponse> {
    const value = await this.#json(this.#commandPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
      signal,
    });
    if (!isPromptKitCommandResponse(value)) {
      throw new PromptKitProtocolError("invalid PromptKit command response");
    }
    return value;
  }

  public events(path: string, onEvent: (event: PromptKitEvent) => void, onError?: (event: Event) => void): () => void {
    const source = this.#eventSourceFactory(this.#url(path));
    const listener = (message: MessageEvent<string>): void => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(message.data);
      } catch {
        return;
      }
      if (isPromptKitEvent(decoded)) onEvent(decoded);
    };

    source.addEventListener("message", listener as EventListener);
    if (onError) source.addEventListener("error", onError);

    return () => source.close();
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

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).error;
  return typeof candidate === "string" ? candidate : null;
}
